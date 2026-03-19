//! Landlock detection and ABI version probing (Linux 5.13+).

use std::fs;
use std::path::Path;

/// Check if Landlock is available on this kernel.
pub fn is_available() -> bool {
    Path::new("/proc/sys/kernel/landlock_restrict_self").exists() || kernel_supports_landlock()
}

/// Get the Landlock ABI version (0 if unavailable).
pub fn abi_version() -> u32 {
    // Try reading the restrict_self proc entry
    if let Ok(content) = fs::read_to_string("/proc/sys/kernel/landlock_restrict_self") {
        let val: u32 = content.trim().parse().unwrap_or(0);
        if val > 0 {
            return val;
        }
    }

    // Fallback: check kernel version >= 5.13
    if kernel_supports_landlock() {
        1 // ABI v1 minimum
    } else {
        0
    }
}

fn kernel_supports_landlock() -> bool {
    if let Ok(release) = fs::read_to_string("/proc/sys/kernel/osrelease") {
        let parts: Vec<u32> = release
            .trim()
            .split('.')
            .take(2)
            .filter_map(|s| {
                // Handle versions like "6.12.71-1-lts"
                s.split('-').next().and_then(|n| n.parse().ok())
            })
            .collect();

        if parts.len() >= 2 {
            return (parts[0] > 5) || (parts[0] == 5 && parts[1] >= 13);
        }
    }
    false
}
