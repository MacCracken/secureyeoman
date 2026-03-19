//! cgroup v2 detection and resource limit helpers.

use std::fs;
use std::path::Path;

/// Check if cgroup v2 (unified hierarchy) is active.
pub fn is_v2() -> bool {
    // cgroup v2 unified hierarchy is mounted at /sys/fs/cgroup with cgroup2 type
    if let Ok(mounts) = fs::read_to_string("/proc/mounts") {
        return mounts.lines().any(|line| {
            line.contains("cgroup2") && line.contains("/sys/fs/cgroup")
        });
    }
    // Fallback: check for cgroup.controllers file (only present in v2)
    Path::new("/sys/fs/cgroup/cgroup.controllers").exists()
}

/// Read the current memory limit for this process's cgroup (bytes).
pub fn memory_limit() -> Option<u64> {
    fs::read_to_string("/sys/fs/cgroup/memory.max")
        .ok()
        .and_then(|s| {
            let trimmed = s.trim();
            if trimmed == "max" {
                None // unlimited
            } else {
                trimmed.parse().ok()
            }
        })
}

/// Read current memory usage for this process's cgroup (bytes).
pub fn memory_current() -> Option<u64> {
    fs::read_to_string("/sys/fs/cgroup/memory.current")
        .ok()
        .and_then(|s| s.trim().parse().ok())
}
