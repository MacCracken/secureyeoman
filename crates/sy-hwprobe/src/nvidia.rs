//! NVIDIA GPU detection via `nvidia-smi` CSV output.

use crate::types::AcceleratorDevice;
use std::process::Command;

pub fn probe() -> Vec<AcceleratorDevice> {
    let output = match Command::new("nvidia-smi")
        .args([
            "--query-gpu=index,name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu,driver_version,compute_cap",
            "--format=csv,noheader,nounits",
        ])
        .output()
    {
        Ok(o) if o.status.success() => o,
        _ => return Vec::new(),
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .trim()
        .lines()
        .filter(|l| !l.is_empty())
        .map(|line| {
            let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
            let vram_total = parts.get(2).and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
            let vram_used = parts.get(3).and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
            let vram_free = parts.get(4).and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
            let util = parts.get(5).and_then(|s| s.parse::<u32>().ok()).unwrap_or(0);
            let temp = parts.get(6).and_then(|s| s.parse::<i32>().ok());

            AcceleratorDevice {
                index: parts.first().and_then(|s| s.parse().ok()).unwrap_or(0),
                name: parts.get(1).unwrap_or(&"Unknown NVIDIA GPU").to_string(),
                vendor: "nvidia".into(),
                family: "gpu".into(),
                vram_total_mb: vram_total,
                vram_used_mb: vram_used,
                vram_free_mb: vram_free,
                utilization_percent: util,
                temperature_celsius: temp,
                driver_version: parts.get(7).unwrap_or(&"unknown").to_string(),
                compute_capability: parts.get(8).map(|s| s.to_string()),
                cuda_available: true,
                rocm_available: false,
                tpu_available: false,
            }
        })
        .collect()
}
