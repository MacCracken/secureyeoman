/**
 * GPU Capability Probe — Detect available GPU resources for inference routing.
 *
 * Detects NVIDIA (nvidia-smi), AMD (rocm-smi), and Intel GPUs.
 * Returns structured GPU info including VRAM, driver version, and compute capability.
 *
 * Inspired by NVIDIA NemoClaw's compute-aware routing (GTC 2026).
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// ── Types ────────────────────────────────────────────────────────────────────

export interface GpuDevice {
  index: number;
  name: string;
  vendor: 'nvidia' | 'amd' | 'intel' | 'unknown';
  vramTotalMb: number;
  vramUsedMb: number;
  vramFreeMb: number;
  utilizationPercent: number;
  temperatureCelsius: number | null;
  driverVersion: string;
  computeCapability: string | null;
  cudaAvailable: boolean;
  rocmAvailable: boolean;
}

export interface GpuProbeResult {
  available: boolean;
  devices: GpuDevice[];
  totalVramMb: number;
  totalFreeVramMb: number;
  bestDevice: GpuDevice | null;
  /** Whether any GPU has enough free VRAM for local inference (>= 4 GB). */
  localInferenceViable: boolean;
  probedAt: string;
}

// ── Detection ────────────────────────────────────────────────────────────────

async function probeNvidia(): Promise<GpuDevice[]> {
  try {
    const { stdout } = await execFileAsync(
      'nvidia-smi',
      [
        '--query-gpu=index,name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu,driver_version,compute_cap',
        '--format=csv,noheader,nounits',
      ],
      { timeout: 5000 }
    );

    return stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(',').map((s) => s.trim());
        const vramTotal = parseInt(parts[2] ?? '0', 10);
        const vramUsed = parseInt(parts[3] ?? '0', 10);
        const vramFree = parseInt(parts[4] ?? '0', 10);

        return {
          index: parseInt(parts[0] ?? '0', 10),
          name: parts[1] ?? 'Unknown NVIDIA GPU',
          vendor: 'nvidia' as const,
          vramTotalMb: vramTotal,
          vramUsedMb: vramUsed,
          vramFreeMb: vramFree,
          utilizationPercent: parseInt(parts[5] ?? '0', 10),
          temperatureCelsius: parts[6] ? parseInt(parts[6], 10) : null,
          driverVersion: parts[7] ?? 'unknown',
          computeCapability: parts[8] ?? null,
          cudaAvailable: true,
          rocmAvailable: false,
        };
      });
  } catch {
    return [];
  }
}

async function probeAmd(): Promise<GpuDevice[]> {
  try {
    const { stdout } = await execFileAsync(
      'rocm-smi',
      ['--showmeminfo', 'vram', '--showtemp', '--showuse', '--csv'],
      { timeout: 5000 }
    );

    // rocm-smi CSV output varies by version; parse what we can
    const lines = stdout.trim().split('\n').filter(Boolean);
    if (lines.length < 2) return [];

    const devices: GpuDevice[] = [];
    // Simple fallback: detect that rocm-smi exists = AMD GPU present
    const { stdout: idOut } = await execFileAsync('rocm-smi', ['--showid'], { timeout: 5000 });
    const gpuCount = (idOut.match(/GPU\[/g) ?? []).length || 1;

    for (let i = 0; i < gpuCount; i++) {
      devices.push({
        index: i,
        name: `AMD GPU ${i}`,
        vendor: 'amd',
        vramTotalMb: 0,
        vramUsedMb: 0,
        vramFreeMb: 0,
        utilizationPercent: 0,
        temperatureCelsius: null,
        driverVersion: 'rocm',
        computeCapability: null,
        cudaAvailable: false,
        rocmAvailable: true,
      });
    }

    return devices;
  } catch {
    return [];
  }
}

async function probeIntel(): Promise<GpuDevice[]> {
  try {
    // Check for Intel GPU via sysfs (use readdir instead of shelling out to ls)
    const { readdir } = await import('node:fs/promises');
    let driEntries: string[];
    try {
      driEntries = await readdir('/dev/dri/');
    } catch {
      return [];
    }
    if (!driEntries.some((e) => e.startsWith('render'))) return [];

    // Check if it's Intel via lspci (hardcoded binary + args, no user input)
    const { stdout: lspci } = await execFileAsync('lspci', ['-nn'], { timeout: 5000 });
    const intelGpus = lspci
      .split('\n')
      .filter((line) => line.includes('VGA') && line.toLowerCase().includes('intel'));

    return intelGpus.map((line, i) => ({
      index: i,
      name:
        line.replace(/.*VGA compatible controller:\s*/, '').replace(/\s*\[.*/, '') || 'Intel GPU',
      vendor: 'intel' as const,
      vramTotalMb: 0, // Intel iGPUs share system RAM
      vramUsedMb: 0,
      vramFreeMb: 0,
      utilizationPercent: 0,
      temperatureCelsius: null,
      driverVersion: 'i915',
      computeCapability: null,
      cudaAvailable: false,
      rocmAvailable: false,
    }));
  } catch {
    return [];
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

let _cached: GpuProbeResult | null = null;
let _cachedAt = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Probe for available GPU devices. Results are cached for 30 seconds.
 */
export async function probeGpu(forceRefresh = false): Promise<GpuProbeResult> {
  if (!forceRefresh && _cached && Date.now() - _cachedAt < CACHE_TTL_MS) {
    return _cached;
  }

  const [nvidia, amd, intel] = await Promise.all([probeNvidia(), probeAmd(), probeIntel()]);

  const devices = [...nvidia, ...amd, ...intel];
  const totalVramMb = devices.reduce((sum, d) => sum + d.vramTotalMb, 0);
  const totalFreeVramMb = devices.reduce((sum, d) => sum + d.vramFreeMb, 0);

  // Best device = most free VRAM
  const bestDevice =
    devices.length > 0
      ? devices.reduce((best, d) => (d.vramFreeMb > best.vramFreeMb ? d : best))
      : null;

  // Local inference viable if any device has >= 4 GB free VRAM
  const localInferenceViable = devices.some((d) => d.vramFreeMb >= 4096);

  const result: GpuProbeResult = {
    available: devices.length > 0,
    devices,
    totalVramMb,
    totalFreeVramMb,
    bestDevice,
    localInferenceViable,
    probedAt: new Date().toISOString(),
  };

  _cached = result;
  _cachedAt = Date.now();

  return result;
}

/**
 * Estimate minimum VRAM (MB) needed for a model based on parameter count heuristics.
 * Uses rough 2 bytes/param for fp16 plus overhead.
 */
export function estimateVramRequirement(modelName: string): number {
  const lower = modelName.toLowerCase();

  // Match common model size patterns
  if (/\b70b\b/.test(lower)) return 40_000;
  if (/\b34b\b/.test(lower)) return 20_000;
  if (/\b13b\b/.test(lower)) return 10_000;
  if (/\b8b\b/.test(lower)) return 6_000;
  if (/\b7b\b/.test(lower)) return 5_000;
  if (/\b3b\b/.test(lower)) return 3_000;
  if (/\b1\.?5b\b/.test(lower)) return 2_000;
  if (/\bsmall\b/.test(lower)) return 2_000;
  if (/\btiny\b/.test(lower)) return 1_000;

  // Default: assume ~6 GB for unknown models
  return 6_000;
}

/** @internal — Reset cache for testing. */
export function _resetGpuCache(): void {
  _cached = null;
  _cachedAt = 0;
}
