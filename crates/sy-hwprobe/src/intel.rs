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

/// Parse xpu-smi discovery CSV output. Exposed for testing.
pub fn parse_xpu_smi_output(stdout: &str) -> Vec<AcceleratorDevice> {
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

/// Parse lspci output for Intel VGA devices. Exposed for testing.
pub fn parse_lspci_intel(lspci_output: &str) -> Vec<AcceleratorDevice> {
    lspci_output
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_xpu_smi_single() {
        let output = "DeviceId, DeviceName, MemTotal, MemFree\n0, Intel Arc A770, 16384, 16000\n";
        let devs = parse_xpu_smi_output(output);
        assert_eq!(devs.len(), 1);
        assert_eq!(devs[0].name, "Intel Arc A770");
        assert_eq!(devs[0].vram_total_mb, 16384);
        assert_eq!(devs[0].driver_version, "oneapi");
    }

    #[test]
    fn parse_xpu_smi_multiple() {
        let output = "DeviceId,Name,Mem,Free\n0,Arc A770,16384,15000\n1,Max 1550,49152,48000\n";
        let devs = parse_xpu_smi_output(output);
        assert_eq!(devs.len(), 2);
    }

    #[test]
    fn parse_xpu_smi_empty() {
        assert!(parse_xpu_smi_output("").is_empty());
        assert!(parse_xpu_smi_output("DeviceId, Name, Mem\n").is_empty());
    }

    #[test]
    fn parse_lspci_intel_gpu() {
        let output = "\
00:02.0 VGA compatible controller: Intel Corporation UHD Graphics 770\n\
01:00.0 VGA compatible controller: NVIDIA GeForce RTX 4090\n";
        let devs = parse_lspci_intel(output);
        assert_eq!(devs.len(), 1);
        assert!(devs[0].name.contains("Intel"));
        assert!(!devs[0].name.contains("NVIDIA"));
    }

    #[test]
    fn parse_lspci_no_intel() {
        let output = "01:00.0 VGA compatible controller: NVIDIA GeForce RTX 4090\n";
        assert!(parse_lspci_intel(output).is_empty());
    }

    #[test]
    fn parse_lspci_multiple_intel() {
        let output = "\
00:02.0 VGA compatible controller: Intel Corporation UHD Graphics 770\n\
00:03.0 VGA compatible controller: Intel Corporation Iris Xe\n";
        let devs = parse_lspci_intel(output);
        assert_eq!(devs.len(), 2);
        assert_eq!(devs[0].index, 0);
        assert_eq!(devs[1].index, 1);
    }
}
