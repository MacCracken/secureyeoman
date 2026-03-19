//! AMD GPU detection via `/sys/class/drm` sysfs with `rocm-smi` fallback.

use crate::types::AcceleratorDevice;
use std::fs;
use std::path::Path;
use std::process::Command;

pub fn probe() -> Vec<AcceleratorDevice> {
    let devices = probe_sysfs();
    if !devices.is_empty() {
        return devices;
    }
    probe_rocm_smi()
}

fn probe_sysfs() -> Vec<AcceleratorDevice> {
    let drm_path = Path::new("/sys/class/drm");
    let entries = match fs::read_dir(drm_path) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };

    let mut devices = Vec::new();

    for entry in entries.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if !name_str.starts_with("card") || name_str.contains('-') {
            continue;
        }

        let driver_link = drm_path.join(&*name_str).join("device/driver");
        let driver_name = match fs::read_link(&driver_link) {
            Ok(target) => target
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_default(),
            Err(_) => continue,
        };
        if driver_name != "amdgpu" {
            continue;
        }

        let device_dir = drm_path.join(&*name_str).join("device");
        let vram_total = fs::read_to_string(device_dir.join("mem_info_vram_total"))
            .ok()
            .and_then(|s| s.trim().parse::<u64>().ok())
            .map(|b| b / (1024 * 1024))
            .unwrap_or(0);

        let idx = devices.len() as u32;
        let mut dev = AcceleratorDevice::new(&format!("AMD GPU {idx}"), "amd", "gpu");
        dev.vram_total_mb = vram_total;
        dev.vram_free_mb = vram_total;
        dev.driver_version = "amdgpu".into();
        dev.rocm_available = true;
        devices.push(dev);
    }

    devices
}

fn probe_rocm_smi() -> Vec<AcceleratorDevice> {
    let id_output = match Command::new("rocm-smi").arg("--showid").output() {
        Ok(o) if o.status.success() => o,
        _ => return Vec::new(),
    };

    let id_str = String::from_utf8_lossy(&id_output.stdout);
    let gpu_count = id_str.matches("GPU[").count().max(1);

    (0..gpu_count)
        .map(|i| {
            let mut dev = AcceleratorDevice::new(&format!("AMD GPU {i}"), "amd", "gpu");
            dev.driver_version = "rocm".into();
            dev.rocm_available = true;
            dev
        })
        .collect()
}
