/**
 * AI ASIC family probes — Intel Gaudi (Habana), AWS Neuron (Inferentia/Trainium),
 * Qualcomm Cloud AI 100.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AcceleratorDevice } from './types.js';

const execFileAsync = promisify(execFile);

/** Probe Intel Gaudi (Habana Labs HPU) via hl-smi. */
export async function probeGaudi(): Promise<AcceleratorDevice[]> {
  try {
    const { stdout } = await execFileAsync(
      'hl-smi',
      ['--query-aip=index,name,memory.total,memory.free', '--format=csv,noheader,nounits'],
      { timeout: 5000 }
    );

    return stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(',').map((s) => s.trim());
        const memTotal = parseInt(parts[2] ?? '0', 10);
        const memFree = parseInt(parts[3] ?? '0', 10);
        const name = parts[1] ?? 'Gaudi';
        const isGaudi3 =
          name.toLowerCase().includes('gaudi3') || name.toLowerCase().includes('hl-325');

        return {
          index: parseInt(parts[0] ?? '0', 10),
          name: `Intel ${isGaudi3 ? 'Gaudi3' : 'Gaudi2'}`,
          vendor: 'habana' as const,
          family: 'ai_asic' as const,
          vramTotalMb: memTotal,
          vramUsedMb: memTotal - memFree,
          vramFreeMb: memFree,
          utilizationPercent: 0,
          temperatureCelsius: null,
          driverVersion: 'habana',
          computeCapability: isGaudi3 ? 'Gaudi3' : 'Gaudi2',
          cudaAvailable: false,
          rocmAvailable: false,
          tpuAvailable: false,
        };
      });
  } catch {
    return [];
  }
}

/** Probe AWS Inferentia/Trainium via neuron-ls or /dev/neuron*. */
export async function probeNeuron(): Promise<AcceleratorDevice[]> {
  // Try neuron-ls --json-output first
  try {
    const { stdout } = await execFileAsync('neuron-ls', ['--json-output'], { timeout: 5000 });
    const devices = JSON.parse(stdout.trim()) as {
      model?: string;
      nc_count?: number;
      memory_per_nc_mb?: number;
    }[];
    if (!Array.isArray(devices)) return [];

    return devices.map((dev, i) => {
      const ncCount = dev.nc_count ?? 2;
      const memPerNc = dev.memory_per_nc_mb ?? 8192;
      const totalMb = ncCount * memPerNc;
      const model = dev.model ?? 'Neuron Device';
      const isTrainium = model.includes('trn') || model.includes('Trainium');

      return {
        index: i,
        name: `AWS ${isTrainium ? 'Trainium' : 'Inferentia'} (${ncCount} cores)`,
        vendor: 'aws' as const,
        family: 'ai_asic' as const,
        vramTotalMb: totalMb,
        vramUsedMb: 0,
        vramFreeMb: totalMb,
        utilizationPercent: 0,
        temperatureCelsius: null,
        driverVersion: 'neuron',
        computeCapability: isTrainium ? 'Trainium' : 'Inferentia',
        cudaAvailable: false,
        rocmAvailable: false,
        tpuAvailable: false,
      };
    });
  } catch {
    // Fall through to /dev/neuron* probe
  }

  // Fallback: check /dev/neuron* devices
  try {
    const { readdir, readFile } = await import('node:fs/promises');
    const devEntries = await readdir('/dev');
    const neuronDevices = devEntries.filter((e) => e.startsWith('neuron') && /^neuron\d+$/.test(e));
    if (neuronDevices.length === 0) return [];

    let isTrainium = false;
    try {
      const dmi = await readFile('/sys/devices/virtual/dmi/id/product_name', 'utf-8');
      isTrainium = dmi.includes('trn');
    } catch {
      // Assume Inferentia
    }

    const hbmPerCoreMb = isTrainium ? 32 * 1024 : 16 * 1024;
    const coreCount = 2;
    const totalMb = hbmPerCoreMb * coreCount;

    return neuronDevices.map((_, i) => ({
      index: i,
      name: `AWS ${isTrainium ? 'Trainium' : 'Inferentia'} (${coreCount} cores)`,
      vendor: 'aws' as const,
      family: 'ai_asic' as const,
      vramTotalMb: totalMb,
      vramUsedMb: 0,
      vramFreeMb: totalMb,
      utilizationPercent: 0,
      temperatureCelsius: null,
      driverVersion: 'neuron',
      computeCapability: isTrainium ? 'Trainium' : 'Inferentia',
      cudaAvailable: false,
      rocmAvailable: false,
      tpuAvailable: false,
    }));
  } catch {
    return [];
  }
}

/** Probe Qualcomm Cloud AI 100 via /sys/class/qaic or /dev/qaic_*. */
export async function probeQualcomm(): Promise<AcceleratorDevice[]> {
  try {
    const { existsSync } = await import('node:fs');
    const { readdir } = await import('node:fs/promises');

    if (existsSync('/sys/class/qaic')) {
      return [makeQualcommDevice()];
    }

    // Fallback: /dev/qaic_*
    const devEntries = await readdir('/dev');
    if (devEntries.some((e) => e.startsWith('qaic_'))) {
      return [makeQualcommDevice()];
    }

    return [];
  } catch {
    return [];
  }
}

function makeQualcommDevice(): AcceleratorDevice {
  return {
    index: 0,
    name: 'Qualcomm Cloud AI 100',
    vendor: 'qualcomm',
    family: 'ai_asic',
    vramTotalMb: 32 * 1024,
    vramUsedMb: 0,
    vramFreeMb: 32 * 1024,
    utilizationPercent: 0,
    temperatureCelsius: null,
    driverVersion: 'qaic',
    computeCapability: 'AI 100',
    cudaAvailable: false,
    rocmAvailable: false,
    tpuAvailable: false,
  };
}
