/**
 * TPU family probes — Google TPU v4/v5e/v5p.
 *
 * Detection via /dev/accel* + /sys/class/accel sysfs, matching ai-hwaccel
 * and Ifran detection approaches.
 */

import type { AcceleratorDevice } from './types.js';

/** HBM per chip in GB by TPU version (matching ai-hwaccel TpuVersion::hbm_per_chip_bytes). */
const TPU_HBM_GB: Record<string, number> = {
  v4: 32,
  v5e: 16,
  v5p: 95,
};

/** Probe Google TPU via /sys/class/accel sysfs. */
export async function probeTpu(): Promise<AcceleratorDevice[]> {
  try {
    const { readdir, readFile, readlink } = await import('node:fs/promises');
    const { existsSync } = await import('node:fs');
    const { join } = await import('node:path');

    if (!existsSync('/sys/class/accel')) return [];

    let accelEntries: string[];
    try {
      accelEntries = await readdir('/sys/class/accel');
    } catch {
      return [];
    }

    const devices: AcceleratorDevice[] = [];

    for (const entry of accelEntries) {
      if (!entry.startsWith('accel')) continue;
      const devicePath = join('/sys/class/accel', entry, 'device');

      // Skip AMD XDNA devices (handled in npu.ts)
      try {
        const driverTarget = await readlink(join(devicePath, 'driver'));
        if (driverTarget.includes('amdxdna')) continue;
      } catch {
        // No driver link — may still be TPU
      }

      // Read TPU version from sysfs
      let version = 'v5e';
      try {
        const verStr = (await readFile(join(devicePath, 'tpu_version'), 'utf-8')).trim();
        if (verStr.includes('v5p')) version = 'v5p';
        else if (verStr.includes('v5e') || verStr.includes('v5litepod')) version = 'v5e';
        else if (verStr.includes('v4')) version = 'v4';
      } catch {
        // Default to v5e
      }

      // Read chip count
      let chipCount = 1;
      try {
        const countStr = (await readFile(join(devicePath, 'chip_count'), 'utf-8')).trim();
        chipCount = parseInt(countStr, 10) || 1;
      } catch {
        // Default to 1
      }

      const totalMb = (TPU_HBM_GB[version] ?? 16) * chipCount * 1024;

      devices.push({
        index: devices.length,
        name: `Google TPU ${version} (${chipCount} chips)`,
        vendor: 'google',
        family: 'tpu',
        vramTotalMb: totalMb,
        vramUsedMb: 0,
        vramFreeMb: totalMb,
        utilizationPercent: 0,
        temperatureCelsius: null,
        driverVersion: 'libtpu',
        computeCapability: `TPU ${version}`,
        cudaAvailable: false,
        rocmAvailable: false,
        tpuAvailable: true,
      });
    }

    return devices;
  } catch {
    return [];
  }
}
