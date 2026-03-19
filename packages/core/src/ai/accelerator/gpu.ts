/**
 * GPU family probes — NVIDIA CUDA, AMD ROCm, Intel iGPU, Intel oneAPI, Vulkan.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AcceleratorDevice } from './types.js';

const execFileAsync = promisify(execFile);

/** Probe NVIDIA GPUs via nvidia-smi. */
export async function probeNvidia(): Promise<AcceleratorDevice[]> {
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
          family: 'gpu' as const,
          vramTotalMb: vramTotal,
          vramUsedMb: vramUsed,
          vramFreeMb: vramFree,
          utilizationPercent: parseInt(parts[5] ?? '0', 10),
          temperatureCelsius: parts[6] ? parseInt(parts[6], 10) : null,
          driverVersion: parts[7] ?? 'unknown',
          computeCapability: parts[8] ?? null,
          cudaAvailable: true,
          rocmAvailable: false,
          tpuAvailable: false,
        };
      });
  } catch {
    return [];
  }
}

/** Probe AMD GPUs via /sys/class/drm sysfs (preferred) or rocm-smi fallback. */
export async function probeAmd(): Promise<AcceleratorDevice[]> {
  try {
    const { readdir, readlink, readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');

    const drmPath = '/sys/class/drm';
    let drmEntries: string[];
    try {
      drmEntries = await readdir(drmPath);
    } catch {
      return probeAmdFallback();
    }

    const devices: AcceleratorDevice[] = [];
    for (const entry of drmEntries) {
      if (!entry.startsWith('card') || entry.includes('-')) continue;

      const driverLink = join(drmPath, entry, 'device', 'driver');
      let driverName: string;
      try {
        const target = await readlink(driverLink);
        driverName = target.split('/').pop() ?? '';
      } catch {
        continue;
      }
      if (driverName !== 'amdgpu') continue;

      const deviceDir = join(drmPath, entry, 'device');
      let vramTotal = 0;
      try {
        const totalStr = (await readFile(join(deviceDir, 'mem_info_vram_total'), 'utf-8')).trim();
        vramTotal = Math.round((parseInt(totalStr, 10) || 0) / (1024 * 1024));
      } catch {
        // No VRAM info available
      }

      devices.push({
        index: devices.length,
        name: `AMD GPU ${devices.length}`,
        vendor: 'amd',
        family: 'gpu',
        vramTotalMb: vramTotal,
        vramUsedMb: 0,
        vramFreeMb: vramTotal,
        utilizationPercent: 0,
        temperatureCelsius: null,
        driverVersion: 'amdgpu',
        computeCapability: null,
        cudaAvailable: false,
        rocmAvailable: true,
        tpuAvailable: false,
      });
    }

    return devices.length > 0 ? devices : probeAmdFallback();
  } catch {
    return probeAmdFallback();
  }
}

async function probeAmdFallback(): Promise<AcceleratorDevice[]> {
  try {
    const { stdout } = await execFileAsync(
      'rocm-smi',
      ['--showmeminfo', 'vram', '--showtemp', '--showuse', '--csv'],
      { timeout: 5000 }
    );
    const lines = stdout.trim().split('\n').filter(Boolean);
    if (lines.length < 2) return [];

    const { stdout: idOut } = await execFileAsync('rocm-smi', ['--showid'], { timeout: 5000 });
    const gpuCount = (idOut.match(/GPU\[/g) ?? []).length || 1;
    const devices: AcceleratorDevice[] = [];
    for (let i = 0; i < gpuCount; i++) {
      devices.push({
        index: i,
        name: `AMD GPU ${i}`,
        vendor: 'amd',
        family: 'gpu',
        vramTotalMb: 0,
        vramUsedMb: 0,
        vramFreeMb: 0,
        utilizationPercent: 0,
        temperatureCelsius: null,
        driverVersion: 'rocm',
        computeCapability: null,
        cudaAvailable: false,
        rocmAvailable: true,
        tpuAvailable: false,
      });
    }
    return devices;
  } catch {
    return [];
  }
}

/** Probe Intel iGPUs via /dev/dri + lspci. */
export async function probeIntel(): Promise<AcceleratorDevice[]> {
  try {
    const { readdir } = await import('node:fs/promises');
    let driEntries: string[];
    try {
      driEntries = await readdir('/dev/dri/');
    } catch {
      return [];
    }
    if (!driEntries.some((e) => e.startsWith('render'))) return [];

    const { stdout: lspci } = await execFileAsync('lspci', ['-nn'], { timeout: 5000 });
    const intelGpus = lspci
      .split('\n')
      .filter((line) => line.includes('VGA') && line.toLowerCase().includes('intel'));

    return intelGpus.map((line, i) => ({
      index: i,
      name:
        line.replace(/.*VGA compatible controller:\s*/, '').replace(/\s*\[.*/, '') || 'Intel GPU',
      vendor: 'intel' as const,
      family: 'gpu' as const,
      vramTotalMb: 0,
      vramUsedMb: 0,
      vramFreeMb: 0,
      utilizationPercent: 0,
      temperatureCelsius: null,
      driverVersion: 'i915',
      computeCapability: null,
      cudaAvailable: false,
      rocmAvailable: false,
      tpuAvailable: false,
    }));
  } catch {
    return [];
  }
}

/** Probe Intel oneAPI GPUs (Arc / Data Center Max) via xpu-smi. */
export async function probeOneApi(): Promise<AcceleratorDevice[]> {
  try {
    const { stdout } = await execFileAsync(
      'xpu-smi',
      ['discovery', '--dump', '1,2,18,19'],
      { timeout: 5000 }
    );

    return stdout
      .trim()
      .split('\n')
      .filter((line) => line.trim() && !line.startsWith('DeviceId'))
      .map((line) => {
        const parts = line.split(',').map((s) => s.trim());
        const memTotal = parseInt(parts[2] ?? '0', 10);

        return {
          index: parseInt(parts[0] ?? '0', 10),
          name: parts[1] ?? 'Intel oneAPI GPU',
          vendor: 'intel' as const,
          family: 'gpu' as const,
          vramTotalMb: memTotal,
          vramUsedMb: 0,
          vramFreeMb: memTotal,
          utilizationPercent: 0,
          temperatureCelsius: null,
          driverVersion: 'oneapi',
          computeCapability: null,
          cudaAvailable: false,
          rocmAvailable: false,
          tpuAvailable: false,
        };
      });
  } catch {
    return [];
  }
}

/** Probe Apple Metal GPU via /proc/device-tree. */
export async function probeAppleMetal(): Promise<AcceleratorDevice[]> {
  try {
    const { readFile } = await import('node:fs/promises');
    let compat: string;
    try {
      compat = await readFile('/proc/device-tree/compatible', 'utf-8');
    } catch {
      return [];
    }
    if (!compat.includes('apple')) return [];

    return [
      {
        index: 0,
        name: 'Apple Metal GPU',
        vendor: 'apple',
        family: 'gpu',
        vramTotalMb: 16 * 1024,
        vramUsedMb: 0,
        vramFreeMb: 16 * 1024,
        utilizationPercent: 0,
        temperatureCelsius: null,
        driverVersion: 'metal',
        computeCapability: null,
        cudaAvailable: false,
        rocmAvailable: false,
        tpuAvailable: false,
      },
    ];
  } catch {
    return [];
  }
}
