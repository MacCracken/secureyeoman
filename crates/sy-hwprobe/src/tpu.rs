//! Google TPU detection via `/sys/class/accel` sysfs.

use crate::types::AcceleratorDevice;
use std::fs;
use std::path::Path;

/// HBM per chip in GB by TPU version.
fn hbm_gb(version: &str) -> u64 {
    match version {
        "v4" => 32,
        "v5e" => 16,
        "v5p" => 95,
        _ => 16,
    }
}

pub fn probe() -> Vec<AcceleratorDevice> {
    let accel_dir = Path::new("/sys/class/accel");
    if !accel_dir.exists() {
        return Vec::new();
    }

    let entries = match fs::read_dir(accel_dir) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };

    let mut devices = Vec::new();

    for entry in entries.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if !name_str.starts_with("accel") {
            continue;
        }

        let device_path = accel_dir.join(&*name_str).join("device");

        // Skip AMD XDNA devices (handled in npu module)
        if let Ok(target) = fs::read_link(device_path.join("driver")) {
            if target.to_string_lossy().contains("amdxdna") {
                continue;
            }
        }

        // Read TPU version
        let version = fs::read_to_string(device_path.join("tpu_version"))
            .ok()
            .map(|s| {
                let s = s.trim().to_lowercase();
                if s.contains("v5p") {
                    "v5p"
                } else if s.contains("v5e") || s.contains("v5litepod") {
                    "v5e"
                } else if s.contains("v4") {
                    "v4"
                } else {
                    "v5e"
                }
            })
            .unwrap_or("v5e")
            .to_string();

        // Read chip count
        let chip_count: u64 = fs::read_to_string(device_path.join("chip_count"))
            .ok()
            .and_then(|s| s.trim().parse().ok())
            .unwrap_or(1);

        let total_mb = hbm_gb(&version) * chip_count * 1024;
        let idx = devices.len() as u32;

        let mut dev = AcceleratorDevice::new(
            &format!("Google TPU {version} ({chip_count} chips)"),
            "google",
            "tpu",
        );
        dev.index = idx;
        dev.vram_total_mb = total_mb;
        dev.vram_free_mb = total_mb;
        dev.driver_version = "libtpu".into();
        dev.compute_capability = Some(format!("TPU {version}"));
        dev.tpu_available = true;
        devices.push(dev);
    }

    devices
}
