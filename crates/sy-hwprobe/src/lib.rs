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
}
