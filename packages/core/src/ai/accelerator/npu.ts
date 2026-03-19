/**
 * NPU family probes — Intel NPU, AMD XDNA (Ryzen AI), Apple Neural Engine.
 */

import type { AcceleratorDevice } from './types.js';

/** Probe Intel NPU (Meteor Lake+) via /sys/class/misc/intel_npu. */
export async function probeIntelNpu(): Promise<AcceleratorDevice[]> {
  try {
    const { existsSync } = await import('node:fs');
    if (!existsSync('/sys/class/misc/intel_npu')) return [];

    return [
      {
        index: 0,
        name: 'Intel NPU',
        vendor: 'intel',
        family: 'npu',
        vramTotalMb: 2048,
        vramUsedMb: 0,
        vramFreeMb: 2048,
        utilizationPercent: 0,
        temperatureCelsius: null,
        driverVersion: 'intel_npu',
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

/** Probe AMD XDNA / Ryzen AI NPU via /sys/class/accel + amdxdna driver check. */
export async function probeAmdXdna(): Promise<AcceleratorDevice[]> {
  try {
    const { readdir, readlink } = await import('node:fs/promises');
    const { join } = await import('node:path');

    const accelDir = '/sys/class/accel';
    let entries: string[];
    try {
      entries = await readdir(accelDir);
    } catch {
      return [];
    }

    const devices: AcceleratorDevice[] = [];
    for (const entry of entries) {
      const driverLink = join(accelDir, entry, 'device', 'driver');
      try {
        const target = await readlink(driverLink);
        if (!target.includes('amdxdna')) continue;
      } catch {
        continue;
      }

      const deviceId = parseInt(entry.replace('accel', ''), 10) || 0;
      devices.push({
        index: deviceId,
        name: `AMD XDNA NPU ${deviceId}`,
        vendor: 'amd',
        family: 'npu',
        vramTotalMb: 2048,
        vramUsedMb: 0,
        vramFreeMb: 2048,
        utilizationPercent: 0,
        temperatureCelsius: null,
        driverVersion: 'amdxdna',
        computeCapability: null,
        cudaAvailable: false,
        rocmAvailable: false,
        tpuAvailable: false,
      });
    }

    return devices;
  } catch {
    return [];
  }
}

/** Probe Apple Neural Engine via /proc/device-tree. */
export async function probeAppleNpu(): Promise<AcceleratorDevice[]> {
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
        name: 'Apple Neural Engine',
        vendor: 'apple',
        family: 'npu',
        vramTotalMb: 4096,
        vramUsedMb: 0,
        vramFreeMb: 4096,
        utilizationPercent: 0,
        temperatureCelsius: null,
        driverVersion: 'ane',
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
