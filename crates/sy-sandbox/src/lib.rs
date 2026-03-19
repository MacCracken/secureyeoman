//! Sandbox enforcement — seccomp-bpf detection, cgroup v2, Landlock policy.
//!
//! Runs as subprocess for privilege isolation. Direct kernel interaction
//! via sysfs reads (no libseccomp dependency yet — planned for future with `libseccomp-sys`).

pub mod seccomp;
pub mod landlock;
pub mod cgroup;

use serde::{Deserialize, Serialize};

/// Overall sandbox capabilities detected on this system.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxCapabilities {
    pub seccomp_available: bool,
    pub seccomp_mode: String,
    pub landlock_available: bool,
    pub landlock_abi: u32,
    pub cgroup_v2: bool,
    pub namespaces_available: bool,
}

/// Detect all sandbox capabilities.
pub fn detect_capabilities() -> SandboxCapabilities {
    SandboxCapabilities {
        seccomp_available: seccomp::is_available(),
        seccomp_mode: seccomp::current_mode(),
        landlock_available: landlock::is_available(),
        landlock_abi: landlock::abi_version(),
        cgroup_v2: cgroup::is_v2(),
        namespaces_available: check_namespaces(),
    }
}

fn check_namespaces() -> bool {
    std::path::Path::new("/proc/self/ns/user").exists()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_does_not_panic() {
        let caps = detect_capabilities();
        // On any Linux system these should be deterministic
        assert!(!caps.seccomp_mode.is_empty());
    }
}
