//! NAPI bindings for sy-sandbox — seccomp, Landlock, cgroup v2 detection.

use napi_derive::napi;

/// Detect all sandbox capabilities. Returns JSON SandboxCapabilities.
#[napi]
pub fn sandbox_detect_capabilities() -> String {
    let caps = sy_sandbox::detect_capabilities();
    serde_json::to_string(&caps).unwrap_or_else(|_| "{}".to_string())
}

/// Check if a syscall is in the seccomp allowlist.
#[napi]
pub fn sandbox_is_syscall_allowed(name: String) -> bool {
    sy_sandbox::seccomp::is_syscall_allowed(&name)
}

/// Get the full seccomp allowlist.
#[napi]
pub fn sandbox_allowed_syscalls() -> Vec<String> {
    sy_sandbox::seccomp::allowed_syscalls()
        .iter()
        .map(|s| s.to_string())
        .collect()
}

/// Get the seccomp blocklist.
#[napi]
pub fn sandbox_blocked_syscalls() -> Vec<String> {
    sy_sandbox::seccomp::blocked_syscalls()
        .iter()
        .map(|s| s.to_string())
        .collect()
}

/// Get the current seccomp mode (disabled, strict, filter, unsupported, unknown).
#[napi]
pub fn sandbox_seccomp_mode() -> String {
    sy_sandbox::seccomp::current_mode()
}

/// Check if Landlock LSM is available.
#[napi]
pub fn sandbox_landlock_available() -> bool {
    sy_sandbox::landlock::is_available()
}

/// Get the Landlock ABI version (0 if unavailable).
#[napi]
pub fn sandbox_landlock_abi() -> u32 {
    sy_sandbox::landlock::abi_version()
}

/// Check if cgroup v2 is active.
#[napi]
pub fn sandbox_cgroup_v2() -> bool {
    sy_sandbox::cgroup::is_v2()
}

/// Get cgroup memory limit in bytes (null if unavailable).
#[napi]
pub fn sandbox_cgroup_memory_limit() -> Option<f64> {
    sy_sandbox::cgroup::memory_limit().map(|v| v as f64)
}

/// Get current cgroup memory usage in bytes (null if unavailable).
#[napi]
pub fn sandbox_cgroup_memory_current() -> Option<f64> {
    sy_sandbox::cgroup::memory_current().map(|v| v as f64)
}
