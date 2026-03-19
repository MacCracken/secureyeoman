/**
 * Shared types for accelerator detection and routing.
 *
 * These types are used across all hardware family probes and the ai-hwaccel
 * integration. They mirror the ai-hwaccel crate's type system where applicable.
 */

// ── Vendor & Family Classification ──────────────────────────────────────────

/** Hardware vendor identifier. */
export type AcceleratorVendor =
  | 'nvidia'
  | 'amd'
  | 'intel'
  | 'google'
  | 'apple'
  | 'aws'
  | 'qualcomm'
  | 'habana'
  | 'vulkan'
  | 'unknown';

/** Broad accelerator family (matches ai-hwaccel AcceleratorFamily). */
export type AcceleratorFamily = 'cpu' | 'gpu' | 'npu' | 'tpu' | 'ai_asic';

// ── Device & Probe Result ───────────────────────────────────────────────────

/** A detected hardware accelerator device. */
export interface AcceleratorDevice {
  index: number;
  name: string;
  vendor: AcceleratorVendor;
  family: AcceleratorFamily;
  /** Total device memory in MB (VRAM for GPUs, HBM for TPUs/ASICs). */
  vramTotalMb: number;
  vramUsedMb: number;
  vramFreeMb: number;
  utilizationPercent: number;
  temperatureCelsius: number | null;
  driverVersion: string;
  computeCapability: string | null;
  cudaAvailable: boolean;
  rocmAvailable: boolean;
  tpuAvailable: boolean;
}

/** Result of a full accelerator probe. */
export interface AcceleratorProbeResult {
  available: boolean;
  devices: AcceleratorDevice[];
  totalVramMb: number;
  totalFreeVramMb: number;
  bestDevice: AcceleratorDevice | null;
  /** Whether any device has >= 4 GB free for local inference. */
  localInferenceViable: boolean;
  /** Number of TPU devices detected. */
  tpuCount: number;
  /** Whether any TPU is available. */
  tpuAvailable: boolean;
  /** Whether results came from native Rust probe, ai-hwaccel binary, or built-in TS probes. */
  source: 'native' | 'ai-hwaccel' | 'builtin';
  probedAt: string;
}

// ── Backward-compatible aliases ─────────────────────────────────────────────

/** @deprecated Use AcceleratorDevice. Kept for backward compatibility. */
export type GpuDevice = AcceleratorDevice;
/** @deprecated Use AcceleratorProbeResult. Kept for backward compatibility. */
export type GpuProbeResult = AcceleratorProbeResult;
