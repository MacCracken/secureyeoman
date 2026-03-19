//! Intel GPU detection — iGPU via sysfs/lspci, oneAPI via xpu-smi, Metal stub.

use crate::types::AcceleratorDevice;
use std::fs;
use std::process::Command;

/// Probe Intel iGPUs via `/dev/dri/renderD*` + `lspci`.
pub fn probe_igpu() -> Vec<AcceleratorDevice> {
    let dri_entries = match fs::read_dir("/dev/dri/") {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };

    let has_render = dri_entries
        .flatten()
        .any(|e| e.file_name().to_string_lossy().starts_with("render"));
    if !has_render {
        return Vec::new();
    }

    let lspci = match Command::new("lspci").arg("-nn").output() {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
        _ => return Vec::new(),
    };

    lspci
        .lines()
        .filter(|l| l.contains("VGA") && l.to_lowercase().contains("intel"))
        .enumerate()
        .map(|(i, line)| {
            let name = line
                .split("VGA compatible controller:")
                .nth(1)
                .map(|s| s.split('[').next().unwrap_or(s).trim())
                .unwrap_or("Intel GPU")
                .to_string();

            let mut dev = AcceleratorDevice::new(&name, "intel", "gpu");
            dev.index = i as u32;
            dev.driver_version = "i915".into();
            dev
        })
        .collect()
}

/// Probe Intel oneAPI GPUs (Arc / Data Center Max) via `xpu-smi`.
pub fn probe_oneapi() -> Vec<AcceleratorDevice> {
    let output = match Command::new("xpu-smi")
        .args(["discovery", "--dump", "1,2,18,19"])
        .output()
    {
        Ok(o) if o.status.success() => o,
        _ => return Vec::new(),
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .trim()
        .lines()
        .filter(|l| !l.is_empty() && !l.starts_with("DeviceId"))
        .map(|line| {
            let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
            let mem_total = parts.get(2).and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);

            let mut dev = AcceleratorDevice::new(
                parts.get(1).unwrap_or(&"Intel oneAPI GPU"),
                "intel",
                "gpu",
            );
            dev.index = parts.first().and_then(|s| s.parse().ok()).unwrap_or(0);
            dev.vram_total_mb = mem_total;
            dev.vram_free_mb = mem_total;
            dev.driver_version = "oneapi".into();
            dev
        })
        .collect()
}

/// Probe Apple Metal GPU via `/proc/device-tree/compatible`.
pub fn probe_metal() -> Vec<AcceleratorDevice> {
    let compat = match fs::read_to_string("/proc/device-tree/compatible") {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };

    if !compat.contains("apple") {
        return Vec::new();
    }

    let mut dev = AcceleratorDevice::new("Apple Metal GPU", "apple", "gpu");
    dev.vram_total_mb = 16 * 1024;
    dev.vram_free_mb = 16 * 1024;
    dev.driver_version = "metal".into();
    vec![dev]
}
