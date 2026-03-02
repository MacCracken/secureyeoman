# ADR 017: Sandboxed Execution for Capture Operations

## Status

Proposed

## Context

Screen capture requires elevated privileges to access display buffers and window contents. However, the code that performs capture is complex, interacts with native APIs, and processes untrusted user input (window selection, region coordinates). This creates a **high-risk attack surface**.

If the capture code is compromised:
- Without sandboxing: Full system access (screen, files, network)
- With sandboxing: Limited to capture scope (screen only, no persistence, no network)

OpenClaw runs capture on companion devices (iOS/macOS/Android) with Docker sandboxing for non-main sessions. SecureYeoman needs native sandboxing on the host system.

## Decision

Execute all capture operations in **platform-native sandboxes** with minimal privileges, resource limits, and no network access.

### Sandbox Architecture

```
SecureYeoman Main Process
├── Consent Manager
├── Audit Logger
└── Encrypted IPC Channel
         │
         │ spawn + sandbox
         ▼
    Capture Sandbox Process
    ├── Seccomp/seccomp-bpf Filter
    ├── Landlock Filesystem Rules
    ├── Resource Limits (rlimit)
    └── Capture Engine (native)
```

### Linux Sandbox (namespaces + seccomp + Landlock)

**Namespaces**:
- PID namespace: Isolated process tree
- Mount namespace: Custom filesystem view
- Network namespace: No network access (loopback only)
- IPC namespace: Isolated shared memory

**Seccomp Filter** (allowlist approach):
- ALLOW: read, write, open, close, mmap, munmap, mprotect
- ALLOW: ioctl (for display access)
- ALLOW: gettimeofday, clock_gettime
- ALLOW: exit, exit_group
- ALLOW: shmget, shmat, shmctl (frame buffers)
- ALLOW: poll, epoll_wait, select
- DENY: socket, connect, accept (network)
- DENY: execve, fork, vfork (process creation)
- DENY: ptrace (debugging)
- DENY: openat, unlink, rmdir (filesystem)
- DEFAULT: KILL (terminate on violation)

**Landlock Rules**:
- Read-only: /usr, /lib, /lib64, /System/Library
- Read-write: /tmp/capture-{uuid}/* (temp only)
- Blocked: /etc/passwd, /etc/shadow, ~/.ssh, ~/.gnupg

**Resource Limits**:
- Memory: 512 MB max
- CPU: 50% max
- Duration: 300 seconds max (configurable)
- File descriptors: 64 max
- Processes: 4 max

### macOS Sandbox (Seatbelt)

Seatbelt Profile denies default, allows read-only system access, temp directory read-write, blocks sensitive paths, denies network, allows display access.

### Encrypted IPC

All communication between main process and sandbox uses AES-256-GCM with ephemeral keys generated per session.

### Process Lifecycle

1. **Spawn**: Fork child process with sandbox pre-initialized
2. **Initialize**: Apply seccomp/Landlock/seatbelt before any user code runs
3. **Execute**: Run capture with scope constraints
4. **Monitor**: Watch resource usage every 1 second
5. **Terminate**: Graceful shutdown on completion, SIGKILL if needed
6. **Cleanup**: Remove temp files, close IPC, audit log

### Escape Detection

Continuously verify sandbox integrity with checks for namespace isolation, seccomp enforcement, filesystem isolation, network isolation, and process isolation.

## Consequences

- **Latency**: Sandbox initialization adds 50-100ms to capture start
- **Complexity**: Platform-specific code for Linux/macOS/Windows
- **Resource overhead**: ~50 MB memory per sandbox process
- **Debugging difficulty**: Harder to debug sandboxed processes

### Positive

- Limits blast radius of capture vulnerabilities
- Prevents data exfiltration (no network)
- Contains resource exhaustion attacks
- Platform-native security (seccomp, seatbelt)
- Defense in depth with multiple layers

### Negative

- Increased implementation complexity
- Performance overhead for each capture
- Platform-specific maintenance burden
- Harder to troubleshoot capture failures
- Requires native module development

## References

- `/docs/planning/screen-capture/NEXT_STEP_05_Sandboxing.md`
- Linux namespaces: https://man7.org/linux/man-pages/man7/namespaces.7.html
- Seccomp: https://www.kernel.org/doc/html/latest/userspace-api/seccomp_filter.html
- Landlock: https://docs.kernel.org/userspace-api/landlock.html
- macOS Seatbelt: https://reverse.put.as/wp-content/uploads/2011/09/Apple-Sandbox-Guide-v1.0.pdf
