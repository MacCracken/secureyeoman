/**
 * Accelerator probe orchestrator.
 *
 * Primary path: delegates to ai-hwaccel binary (all 13 families in one call).
 * Fallback path: runs family-specific probes in parallel.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  AcceleratorDevice,
  AcceleratorProbeResult,
  AcceleratorVendor,
  AcceleratorFamily,
} from './types.js';
import { native } from '../../native/index.js';

const execFileAsync = promisify(execFile);

// ── ai-hwaccel binary integration ────────────────────────────────────────────

interface HwAccelRegistry {
  profiles: HwAccelProfile[];
}

interface HwAccelProfile {
  accelerator: string | Record<string, unknown>;
  available: boolean;
  memory_bytes: number;
  compute_capability: string | null;
  driver_version: string | null;
}

/**
 * Try to run ai-hwaccel binary and parse its JSON output.
 * Returns null if the binary is not available or fails.
 */
async function probeViaHwAccel(): Promise<AcceleratorDevice[] | null> {
  try {
    const { stdout } = await execFileAsync('ai-hwaccel', [], { timeout: 10_000 });
    const registry: HwAccelRegistry = JSON.parse(stdout.trim());
    return registry.profiles
      .filter((p) => p.available)
      .filter((p) => p.accelerator !== 'Cpu')
      .map((p, i) => hwaccelProfileToDevice(p, i));
  } catch {
    return null;
  }
}

function hwaccelProfileToDevice(profile: HwAccelProfile, index: number): AcceleratorDevice {
  const memMb = Math.round(profile.memory_bytes / (1024 * 1024));
  const { vendor, family, name, isCuda, isRocm, isTpu } = classifyAccelerator(profile.accelerator);

  return {
    index,
    name,
    vendor,
    family,
    vramTotalMb: memMb,
    vramUsedMb: 0,
    vramFreeMb: memMb,
    utilizationPercent: 0,
    temperatureCelsius: null,
    driverVersion: profile.driver_version ?? 'unknown',
    computeCapability: profile.compute_capability,
    cudaAvailable: isCuda,
    rocmAvailable: isRocm,
    tpuAvailable: isTpu,
  };
}

function classifyAccelerator(accel: string | Record<string, unknown>): {
  vendor: AcceleratorVendor;
  family: AcceleratorFamily;
  name: string;
  isCuda: boolean;
  isRocm: boolean;
  isTpu: boolean;
} {
  if (typeof accel === 'string') {
    switch (accel) {
      case 'MetalGpu':
        return {
          vendor: 'apple',
          family: 'gpu',
          name: 'Apple Metal GPU',
          isCuda: false,
          isRocm: false,
          isTpu: false,
        };
      case 'IntelNpu':
        return {
          vendor: 'intel',
          family: 'npu',
          name: 'Intel NPU',
          isCuda: false,
          isRocm: false,
          isTpu: false,
        };
      case 'AppleNpu':
        return {
          vendor: 'apple',
          family: 'npu',
          name: 'Apple Neural Engine',
          isCuda: false,
          isRocm: false,
          isTpu: false,
        };
      default:
        return {
          vendor: 'unknown',
          family: 'gpu',
          name: accel,
          isCuda: false,
          isRocm: false,
          isTpu: false,
        };
    }
  }

  const key = Object.keys(accel)[0] ?? '';
  const data = (accel[key] ?? {}) as Record<string, unknown>;

  switch (key) {
    case 'CudaGpu':
      return {
        vendor: 'nvidia',
        family: 'gpu',
        name: `NVIDIA CUDA GPU ${data.device_id ?? 0}`,
        isCuda: true,
        isRocm: false,
        isTpu: false,
      };
    case 'RocmGpu':
      return {
        vendor: 'amd',
        family: 'gpu',
        name: `AMD ROCm GPU ${data.device_id ?? 0}`,
        isCuda: false,
        isRocm: true,
        isTpu: false,
      };
    case 'VulkanGpu':
      return {
        vendor: 'vulkan',
        family: 'gpu',
        name: (data.device_name as string) ?? 'Vulkan GPU',
        isCuda: false,
        isRocm: false,
        isTpu: false,
      };
    case 'AmdXdnaNpu':
      return {
        vendor: 'amd',
        family: 'npu',
        name: `AMD XDNA NPU ${data.device_id ?? 0}`,
        isCuda: false,
        isRocm: false,
        isTpu: false,
      };
    case 'Tpu': {
      const ver = (data.version as string) ?? '';
      const chips = (data.chip_count as number) ?? 1;
      return {
        vendor: 'google',
        family: 'tpu',
        name: `Google TPU ${ver} (${chips} chips)`,
        isCuda: false,
        isRocm: false,
        isTpu: true,
      };
    }
    case 'Gaudi': {
      const gen = (data.generation as string) ?? 'Gaudi2';
      return {
        vendor: 'habana',
        family: 'ai_asic',
        name: `Intel ${gen}`,
        isCuda: false,
        isRocm: false,
        isTpu: false,
      };
    }
    case 'AwsNeuron': {
      const chipType = (data.chip_type as string) ?? 'Inferentia';
      const cores = (data.core_count as number) ?? 2;
      return {
        vendor: 'aws',
        family: 'ai_asic',
        name: `AWS ${chipType} (${cores} cores)`,
        isCuda: false,
        isRocm: false,
        isTpu: false,
      };
    }
    case 'QualcommAi100':
      return {
        vendor: 'qualcomm',
        family: 'ai_asic',
        name: 'Qualcomm Cloud AI 100',
        isCuda: false,
        isRocm: false,
        isTpu: false,
      };
    case 'IntelOneApi':
      return {
        vendor: 'intel',
        family: 'gpu',
        name: `Intel oneAPI GPU ${data.device_id ?? 0}`,
        isCuda: false,
        isRocm: false,
        isTpu: false,
      };
    default:
      return {
        vendor: 'unknown',
        family: 'gpu',
        name: key,
        isCuda: false,
        isRocm: false,
        isTpu: false,
      };
  }
}

// ── Probe orchestration ──────────────────────────────────────────────────────

let _cached: AcceleratorProbeResult | null = null;
let _cachedAt = 0;
const CACHE_TTL_MS = 30_000;

/**
 * Probe for all available accelerator devices. Results are cached for 30 seconds.
 *
 * Tries ai-hwaccel binary first (all 13 families). Falls back to built-in probes.
 */
export async function probeAccelerators(forceRefresh = false): Promise<AcceleratorProbeResult> {
  if (!forceRefresh && _cached && Date.now() - _cachedAt < CACHE_TTL_MS) {
    return _cached;
  }

  // Primary: native Rust probe (in-process, no child process overhead)
  if (native) {
    try {
      const json = native.probeAccelerators();
      const devices = JSON.parse(json) as AcceleratorDevice[];
      const result = buildResult(devices, 'native');
      _cached = result;
      _cachedAt = Date.now();
      return result;
    } catch {
      // Fall through to ai-hwaccel binary
    }
  }

  // Secondary: ai-hwaccel binary
  const hwaccelDevices = await probeViaHwAccel();
  if (hwaccelDevices !== null) {
    const result = buildResult(hwaccelDevices, 'ai-hwaccel');
    _cached = result;
    _cachedAt = Date.now();
    return result;
  }

  // Fallback: run all family probes in parallel
  const { probeNvidia, probeAmd, probeIntel, probeOneApi, probeAppleMetal } =
    await import('./gpu.js');
  const { probeTpu } = await import('./tpu.js');
  const { probeIntelNpu, probeAmdXdna, probeAppleNpu } = await import('./npu.js');
  const { probeGaudi, probeNeuron, probeQualcomm } = await import('./asic.js');

  const [
    nvidia,
    amd,
    intel,
    oneapi,
    appleMetal,
    tpu,
    intelNpu,
    amdXdna,
    appleNpu,
    gaudi,
    neuron,
    qualcomm,
  ] = await Promise.all([
    probeNvidia(),
    probeAmd(),
    probeIntel(),
    probeOneApi(),
    probeAppleMetal(),
    probeTpu(),
    probeIntelNpu(),
    probeAmdXdna(),
    probeAppleNpu(),
    probeGaudi(),
    probeNeuron(),
    probeQualcomm(),
  ]);

  const devices = [
    ...nvidia,
    ...amd,
    ...intel,
    ...oneapi,
    ...appleMetal,
    ...tpu,
    ...intelNpu,
    ...amdXdna,
    ...appleNpu,
    ...gaudi,
    ...neuron,
    ...qualcomm,
  ];

  const result = buildResult(devices, 'builtin');
  _cached = result;
  _cachedAt = Date.now();
  return result;
}

function buildResult(
  devices: AcceleratorDevice[],
  source: 'native' | 'ai-hwaccel' | 'builtin'
): AcceleratorProbeResult {
  const totalVramMb = devices.reduce((sum, d) => sum + d.vramTotalMb, 0);
  const totalFreeVramMb = devices.reduce((sum, d) => sum + d.vramFreeMb, 0);
  const bestDevice =
    devices.length > 0
      ? devices.reduce((best, d) => (d.vramFreeMb > best.vramFreeMb ? d : best))
      : null;
  const localInferenceViable = devices.some((d) => d.vramFreeMb >= 4096);
  const tpuDevices = devices.filter((d) => d.tpuAvailable);

  return {
    available: devices.length > 0,
    devices,
    totalVramMb,
    totalFreeVramMb,
    bestDevice,
    localInferenceViable,
    tpuCount: tpuDevices.length,
    tpuAvailable: tpuDevices.length > 0,
    source,
    probedAt: new Date().toISOString(),
  };
}

/** @internal — Reset cache for testing. */
export function _resetProbeCache(): void {
  _cached = null;
  _cachedAt = 0;
}

/**
 * Estimate minimum VRAM (MB) needed for a model based on parameter count heuristics.
 */
export function estimateVramRequirement(modelName: string): number {
  const lower = modelName.toLowerCase();

  if (/\b70b\b/.test(lower)) return 40_000;
  if (/\b34b\b/.test(lower)) return 20_000;
  if (/\b13b\b/.test(lower)) return 10_000;
  if (/\b8b\b/.test(lower)) return 6_000;
  if (/\b7b\b/.test(lower)) return 5_000;
  if (/\b3b\b/.test(lower)) return 3_000;
  if (/\b1\.?5b\b/.test(lower)) return 2_000;
  if (/\bsmall\b/.test(lower)) return 2_000;
  if (/\btiny\b/.test(lower)) return 1_000;

  return 6_000;
}
