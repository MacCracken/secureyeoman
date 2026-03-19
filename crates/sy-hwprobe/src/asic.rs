//! AI ASIC detection — Intel Gaudi (Habana), AWS Neuron, Qualcomm Cloud AI 100.

use crate::types::AcceleratorDevice;
use std::fs;
use std::path::Path;
use std::process::Command;

/// Probe Intel Gaudi (Habana Labs HPU) via `hl-smi`.
pub fn probe_gaudi() -> Vec<AcceleratorDevice> {
    let output = match Command::new("hl-smi")
        .args([
            "--query-aip=index,name,memory.total,memory.free",
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
            let mem_total = parts.get(2).and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
            let mem_free = parts.get(3).and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
            let name_str = parts.get(1).unwrap_or(&"Gaudi");
            let lower = name_str.to_lowercase();
            let is_gaudi3 = lower.contains("gaudi3") || lower.contains("hl-325");
            let gen = if is_gaudi3 { "Gaudi3" } else { "Gaudi2" };

            let mut dev = AcceleratorDevice::new(&format!("Intel {gen}"), "habana", "ai_asic");
            dev.index = parts.first().and_then(|s| s.parse().ok()).unwrap_or(0);
            dev.vram_total_mb = mem_total;
            dev.vram_used_mb = mem_total.saturating_sub(mem_free);
            dev.vram_free_mb = mem_free;
            dev.driver_version = "habana".into();
            dev.compute_capability = Some(gen.to_string());
            dev
        })
        .collect()
}

/// Probe AWS Inferentia/Trainium via `neuron-ls` or `/dev/neuron*`.
pub fn probe_neuron() -> Vec<AcceleratorDevice> {
    // Try neuron-ls --json-output first
    if let Ok(output) = Command::new("neuron-ls")
        .arg("--json-output")
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Ok(devices) = serde_json::from_str::<Vec<NeuronDevice>>(&stdout) {
                return devices
                    .iter()
                    .enumerate()
                    .map(|(i, dev)| {
                        let nc_count = dev.nc_count.unwrap_or(2);
                        let mem_per_nc = dev.memory_per_nc_mb.unwrap_or(8192);
                        let total_mb = (nc_count as u64) * (mem_per_nc as u64);
                        let model = dev.model.as_deref().unwrap_or("Neuron Device");
                        let is_trainium =
                            model.contains("trn") || model.contains("Trainium");
                        let chip = if is_trainium { "Trainium" } else { "Inferentia" };

                        let mut d = AcceleratorDevice::new(
                            &format!("AWS {chip} ({nc_count} cores)"),
                            "aws",
                            "ai_asic",
                        );
                        d.index = i as u32;
                        d.vram_total_mb = total_mb;
                        d.vram_free_mb = total_mb;
                        d.driver_version = "neuron".into();
                        d.compute_capability = Some(chip.to_string());
                        d
                    })
                    .collect();
            }
        }
    }

    // Fallback: /dev/neuron* device nodes
    let dev_entries = match fs::read_dir("/dev") {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };

    let neuron_devs: Vec<_> = dev_entries
        .flatten()
        .filter(|e| {
            let n = e.file_name();
            let s = n.to_string_lossy();
            s.starts_with("neuron") && s[6..].chars().all(|c| c.is_ascii_digit()) && s.len() > 6
        })
        .collect();

    if neuron_devs.is_empty() {
        return Vec::new();
    }

    let is_trainium = fs::read_to_string("/sys/devices/virtual/dmi/id/product_name")
        .map(|s| s.contains("trn"))
        .unwrap_or(false);

    let core_count: u64 = 2;
    let hbm_per_core_mb: u64 = if is_trainium { 32 * 1024 } else { 16 * 1024 };
    let total_mb = hbm_per_core_mb * core_count;
    let chip = if is_trainium { "Trainium" } else { "Inferentia" };

    neuron_devs
        .iter()
        .enumerate()
        .map(|(i, _)| {
            let mut dev = AcceleratorDevice::new(
                &format!("AWS {chip} ({core_count} cores)"),
                "aws",
                "ai_asic",
            );
            dev.index = i as u32;
            dev.vram_total_mb = total_mb;
            dev.vram_free_mb = total_mb;
            dev.driver_version = "neuron".into();
            dev.compute_capability = Some(chip.to_string());
            dev
        })
        .collect()
}

/// Probe Qualcomm Cloud AI 100 via `/sys/class/qaic` or `/dev/qaic_*`.
pub fn probe_qualcomm() -> Vec<AcceleratorDevice> {
    if Path::new("/sys/class/qaic").exists() {
        return vec![make_qualcomm()];
    }

    if let Ok(entries) = fs::read_dir("/dev") {
        if entries
            .flatten()
            .any(|e| e.file_name().to_string_lossy().starts_with("qaic_"))
        {
            return vec![make_qualcomm()];
        }
    }

    Vec::new()
}

/// Parse hl-smi CSV output for testing.
pub fn parse_hl_smi_output(stdout: &str) -> Vec<AcceleratorDevice> {
    stdout
        .trim()
        .lines()
        .filter(|l| !l.is_empty())
        .map(|line| {
            let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
            let mem_total = parts.get(2).and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
            let mem_free = parts.get(3).and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
            let name_str = parts.get(1).unwrap_or(&"Gaudi");
            let lower = name_str.to_lowercase();
            let is_gaudi3 = lower.contains("gaudi3") || lower.contains("hl-325");
            let gen = if is_gaudi3 { "Gaudi3" } else { "Gaudi2" };

            let mut dev = AcceleratorDevice::new(&format!("Intel {gen}"), "habana", "ai_asic");
            dev.index = parts.first().and_then(|s| s.parse().ok()).unwrap_or(0);
            dev.vram_total_mb = mem_total;
            dev.vram_used_mb = mem_total.saturating_sub(mem_free);
            dev.vram_free_mb = mem_free;
            dev.driver_version = "habana".into();
            dev.compute_capability = Some(gen.to_string());
            dev
        })
        .collect()
}

fn make_qualcomm() -> AcceleratorDevice {
    let mut dev = AcceleratorDevice::new("Qualcomm Cloud AI 100", "qualcomm", "ai_asic");
    dev.vram_total_mb = 32 * 1024;
    dev.vram_free_mb = 32 * 1024;
    dev.driver_version = "qaic".into();
    dev.compute_capability = Some("AI 100".to_string());
    dev
}

#[derive(serde::Deserialize)]
struct NeuronDevice {
    model: Option<String>,
    nc_count: Option<u32>,
    memory_per_nc_mb: Option<u32>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_gaudi2() {
        let output = "0, HL-225B, 98304, 90000\n";
        let devs = parse_hl_smi_output(output);
        assert_eq!(devs.len(), 1);
        assert_eq!(devs[0].name, "Intel Gaudi2");
        assert_eq!(devs[0].vram_total_mb, 98304);
        assert_eq!(devs[0].vram_free_mb, 90000);
        assert_eq!(devs[0].vram_used_mb, 8304);
        assert_eq!(devs[0].compute_capability, Some("Gaudi2".into()));
    }

    #[test]
    fn parse_gaudi3() {
        let output = "0, HL-325L Gaudi3, 131072, 120000\n";
        let devs = parse_hl_smi_output(output);
        assert_eq!(devs[0].name, "Intel Gaudi3");
        assert_eq!(devs[0].compute_capability, Some("Gaudi3".into()));
    }

    #[test]
    fn parse_multiple_gaudi() {
        let output = "0, HL-225, 98304, 80000\n1, HL-225, 98304, 95000\n";
        let devs = parse_hl_smi_output(output);
        assert_eq!(devs.len(), 2);
        assert_eq!(devs[0].index, 0);
        assert_eq!(devs[1].index, 1);
    }

    #[test]
    fn parse_empty_hl_smi() {
        assert!(parse_hl_smi_output("").is_empty());
    }

    #[test]
    fn qualcomm_device_fields() {
        let dev = make_qualcomm();
        assert_eq!(dev.vendor, "qualcomm");
        assert_eq!(dev.family, "ai_asic");
        assert_eq!(dev.vram_total_mb, 32 * 1024);
        assert_eq!(dev.compute_capability, Some("AI 100".into()));
    }

    #[test]
    fn neuron_device_deserialization() {
        let json = r#"[{"model":"trn1","nc_count":2,"memory_per_nc_mb":16384}]"#;
        let devices: Vec<NeuronDevice> = serde_json::from_str(json).unwrap();
        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].model, Some("trn1".into()));
        assert_eq!(devices[0].nc_count, Some(2));
    }

    #[test]
    fn neuron_device_missing_fields() {
        let json = r#"[{}]"#;
        let devices: Vec<NeuronDevice> = serde_json::from_str(json).unwrap();
        assert!(devices[0].model.is_none());
        assert!(devices[0].nc_count.is_none());
    }
}
