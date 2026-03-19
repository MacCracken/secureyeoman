//! SecureYeoman Hardware Accelerator Detection
//!
//! Pure Rust probes for GPU, TPU, NPU, and AI ASIC families.
//! Uses direct sysfs reads and CLI tool parsing — no NVML binding yet
//! (planned for future iteration with `nvml-wrapper` crate).
//!
//! Detection strategy per family:
//! - NVIDIA: `nvidia-smi` CSV output parsing
//! - AMD: `/sys/class/drm` sysfs with `amdgpu` driver check, `rocm-smi` fallback
//! - Intel iGPU: `/dev/dri/renderD*` + `lspci`
//! - Intel oneAPI: `xpu-smi` CSV
//! - Apple Metal: `/proc/device-tree/compatible`
//! - TPU: `/sys/class/accel` with `tpu_version` / `chip_count` sysfs
//! - Intel NPU: `/sys/class/misc/intel_npu` presence
//! - AMD XDNA: `/sys/class/accel` with `amdxdna` driver
//! - Apple ANE: `/proc/device-tree/compatible`
//! - Intel Gaudi: `hl-smi` CSV
//! - AWS Neuron: `neuron-ls --json-output` or `/dev/neuron*`
//! - Qualcomm AI 100: `/sys/class/qaic` or `/dev/qaic_*`

pub mod types;

mod nvidia;
mod amd;
mod intel;
mod tpu;
mod npu;
mod asic;

use types::AcceleratorDevice;

/// Run all hardware probes in sequence (not async — sysfs reads are fast).
/// Returns all detected accelerator devices across all families.
pub fn probe_all() -> Vec<AcceleratorDevice> {
    let mut devices = Vec::new();

    devices.extend(nvidia::probe());
    devices.extend(amd::probe());
    devices.extend(intel::probe_igpu());
    devices.extend(intel::probe_oneapi());
    devices.extend(intel::probe_metal());
    devices.extend(tpu::probe());
    devices.extend(npu::probe_intel());
    devices.extend(npu::probe_amd_xdna());
    devices.extend(npu::probe_apple());
    devices.extend(asic::probe_gaudi());
    devices.extend(asic::probe_neuron());
    devices.extend(asic::probe_qualcomm());

    // Re-index devices sequentially
    for (i, dev) in devices.iter_mut().enumerate() {
        dev.index = i as u32;
    }

    devices
}

/// Probe only devices matching a specific family.
pub fn probe_family(family: &str) -> Vec<AcceleratorDevice> {
    let mut devices = match family {
        "gpu" => {
            let mut d = Vec::new();
            d.extend(nvidia::probe());
            d.extend(amd::probe());
            d.extend(intel::probe_igpu());
            d.extend(intel::probe_oneapi());
            d.extend(intel::probe_metal());
            d
        }
        "tpu" => tpu::probe(),
        "npu" => {
            let mut d = Vec::new();
            d.extend(npu::probe_intel());
            d.extend(npu::probe_amd_xdna());
            d.extend(npu::probe_apple());
            d
        }
        "ai_asic" => {
            let mut d = Vec::new();
            d.extend(asic::probe_gaudi());
            d.extend(asic::probe_neuron());
            d.extend(asic::probe_qualcomm());
            d
        }
        _ => Vec::new(),
    };

    for (i, dev) in devices.iter_mut().enumerate() {
        dev.index = i as u32;
    }

    devices
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn probe_all_does_not_panic() {
        // On CI/dev machines without accelerators, returns empty vec
        let devices = probe_all();
        for dev in &devices {
            assert!(!dev.name.is_empty());
            assert!(!dev.vendor.is_empty());
            assert!(!dev.family.is_empty());
        }
    }

    #[test]
    fn probe_family_gpu() {
        let _ = probe_family("gpu");
    }

    #[test]
    fn probe_family_unknown_returns_empty() {
        assert!(probe_family("quantum").is_empty());
    }

    #[test]
    fn probe_all_devices_indexed_sequentially() {
        let devices = probe_all();
        for (i, dev) in devices.iter().enumerate() {
            assert_eq!(dev.index, i as u32, "Device at position {i} has wrong index");
        }
    }

    #[test]
    fn probe_family_tpu() {
        let _ = probe_family("tpu");
    }

    #[test]
    fn probe_family_npu() {
        let _ = probe_family("npu");
    }

    #[test]
    fn probe_family_ai_asic() {
        let _ = probe_family("ai_asic");
    }

    #[test]
    fn probe_family_devices_indexed() {
        for family in ["gpu", "tpu", "npu", "ai_asic"] {
            let devices = probe_family(family);
            for (i, dev) in devices.iter().enumerate() {
                assert_eq!(dev.index, i as u32);
                assert_eq!(dev.family, family);
            }
        }
    }

    #[test]
    fn accelerator_device_new_defaults() {
        let dev = types::AcceleratorDevice::new("Test GPU", "nvidia", "gpu");
        assert_eq!(dev.name, "Test GPU");
        assert_eq!(dev.vendor, "nvidia");
        assert_eq!(dev.family, "gpu");
        assert_eq!(dev.index, 0);
        assert_eq!(dev.vram_total_mb, 0);
        assert_eq!(dev.vram_used_mb, 0);
        assert_eq!(dev.vram_free_mb, 0);
        assert_eq!(dev.utilization_percent, 0);
        assert!(dev.temperature_celsius.is_none());
        assert_eq!(dev.driver_version, "unknown");
        assert!(dev.compute_capability.is_none());
        assert!(!dev.cuda_available);
        assert!(!dev.rocm_available);
        assert!(!dev.tpu_available);
    }

    #[test]
    fn accelerator_device_serialization() {
        let dev = types::AcceleratorDevice::new("RTX 4090", "nvidia", "gpu");
        let json = serde_json::to_string(&dev).unwrap();
        assert!(json.contains("\"name\":\"RTX 4090\""));
        assert!(json.contains("\"vendor\":\"nvidia\""));
        // Verify camelCase serialization
        assert!(json.contains("vramTotalMb"));
        assert!(json.contains("cudaAvailable"));

        // Roundtrip
        let parsed: types::AcceleratorDevice = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.name, "RTX 4090");
        assert_eq!(parsed.vendor, "nvidia");
    }
}
