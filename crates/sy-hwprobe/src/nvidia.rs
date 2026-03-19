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
    parse_nvidia_smi_output(&stdout)
}

/// Parse nvidia-smi CSV output into AcceleratorDevice list.
/// Exposed for testing without requiring nvidia-smi binary.
pub fn parse_nvidia_smi_output(stdout: &str) -> Vec<AcceleratorDevice> {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_single_gpu() {
        let output = "0, NVIDIA GeForce RTX 4090, 24564, 1200, 23364, 15, 42, 550.127, 8.9\n";
        let devices = parse_nvidia_smi_output(output);
        assert_eq!(devices.len(), 1);
        let d = &devices[0];
        assert_eq!(d.index, 0);
        assert_eq!(d.name, "NVIDIA GeForce RTX 4090");
        assert_eq!(d.vram_total_mb, 24564);
        assert_eq!(d.vram_used_mb, 1200);
        assert_eq!(d.vram_free_mb, 23364);
        assert_eq!(d.utilization_percent, 15);
        assert_eq!(d.temperature_celsius, Some(42));
        assert_eq!(d.driver_version, "550.127");
        assert_eq!(d.compute_capability, Some("8.9".into()));
        assert!(d.cuda_available);
        assert!(!d.rocm_available);
    }

    #[test]
    fn parse_multiple_gpus() {
        let output = "\
0, GPU A, 8192, 6000, 2192, 80, 70, 550.0, 8.0
1, GPU B, 16384, 2000, 14384, 20, 45, 550.0, 8.0
";
        let devices = parse_nvidia_smi_output(output);
        assert_eq!(devices.len(), 2);
        assert_eq!(devices[0].name, "GPU A");
        assert_eq!(devices[1].name, "GPU B");
        assert_eq!(devices[1].vram_free_mb, 14384);
    }

    #[test]
    fn parse_empty_output() {
        assert!(parse_nvidia_smi_output("").is_empty());
        assert!(parse_nvidia_smi_output("\n").is_empty());
        assert!(parse_nvidia_smi_output("  \n  \n").is_empty());
    }

    #[test]
    fn parse_partial_fields() {
        // Missing some fields — should still parse with defaults
        let output = "0, Some GPU\n";
        let devices = parse_nvidia_smi_output(output);
        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].name, "Some GPU");
        assert_eq!(devices[0].vram_total_mb, 0); // missing = default 0
        assert_eq!(devices[0].temperature_celsius, None);
    }

    #[test]
    fn parse_non_numeric_values() {
        let output = "abc, GPU X, N/A, N/A, N/A, N/A, N/A, 550.0, 8.0\n";
        let devices = parse_nvidia_smi_output(output);
        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].index, 0); // "abc" fails parse -> default 0
        assert_eq!(devices[0].vram_total_mb, 0);
    }

    #[test]
    fn parse_low_vram_gpu() {
        let output = "0, NVIDIA GT 710, 2048, 1800, 248, 5, 35, 470.42, 3.5\n";
        let devices = parse_nvidia_smi_output(output);
        assert_eq!(devices[0].vram_free_mb, 248);
        assert_eq!(devices[0].compute_capability, Some("3.5".into()));
    }
}
