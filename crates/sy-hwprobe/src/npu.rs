//! NPU detection — Intel NPU, AMD XDNA (Ryzen AI), Apple Neural Engine.

use crate::types::AcceleratorDevice;
use std::fs;
use std::path::Path;

/// Probe Intel NPU (Meteor Lake+) via `/sys/class/misc/intel_npu`.
pub fn probe_intel() -> Vec<AcceleratorDevice> {
    if !Path::new("/sys/class/misc/intel_npu").exists() {
        return Vec::new();
    }

    let mut dev = AcceleratorDevice::new("Intel NPU", "intel", "npu");
    dev.vram_total_mb = 2048;
    dev.vram_free_mb = 2048;
    dev.driver_version = "intel_npu".into();
    vec![dev]
}

/// Probe AMD XDNA / Ryzen AI NPU via `/sys/class/accel` + amdxdna driver.
pub fn probe_amd_xdna() -> Vec<AcceleratorDevice> {
    let accel_dir = Path::new("/sys/class/accel");
    let entries = match fs::read_dir(accel_dir) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };

    let mut devices = Vec::new();

    for entry in entries.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        let driver_link = accel_dir.join(&*name_str).join("device/driver");

        let is_xdna = fs::read_link(&driver_link)
            .map(|t| t.to_string_lossy().contains("amdxdna"))
            .unwrap_or(false);

        if !is_xdna {
            continue;
        }

        let device_id: u32 = name_str
            .strip_prefix("accel")
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);

        let mut dev = AcceleratorDevice::new(
            &format!("AMD XDNA NPU {device_id}"),
            "amd",
            "npu",
        );
        dev.index = device_id;
        dev.vram_total_mb = 2048;
        dev.vram_free_mb = 2048;
        dev.driver_version = "amdxdna".into();
        devices.push(dev);
    }

    devices
}

/// Probe Apple Neural Engine via `/proc/device-tree/compatible`.
pub fn probe_apple() -> Vec<AcceleratorDevice> {
    let compat = match fs::read_to_string("/proc/device-tree/compatible") {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };

    if !compat.contains("apple") {
        return Vec::new();
    }

    let mut dev = AcceleratorDevice::new("Apple Neural Engine", "apple", "npu");
    dev.vram_total_mb = 4096;
    dev.vram_free_mb = 4096;
    dev.driver_version = "ane".into();
    vec![dev]
}
