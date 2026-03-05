/**
 * Confidential GPU Detection — detect NVIDIA Confidential Computing mode.
 *
 * Uses nvidia-smi to query GPU capabilities and CC (Confidential Computing)
 * mode status. Provides helpers to enforce CC mode when required.
 */

import { execFileSync } from 'node:child_process';

export interface GpuConfidentialInfo {
  available: boolean;
  confidential: boolean;
  gpuName?: string;
  driverVersion?: string;
  ccMode?: string;
}

/**
 * Detect if NVIDIA GPUs are available and in Confidential Computing mode.
 */
export function detectConfidentialGpu(): GpuConfidentialInfo {
  try {
    const output = execFileSync(
      'nvidia-smi',
      ['--query-gpu=gpu_name,driver_version,cc_mode', '--format=csv,noheader,nounits'],
      {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    const line = output.trim().split('\n')[0];
    if (!line) {
      return { available: true, confidential: false };
    }

    const parts = line.split(',').map((s) => s.trim());
    const gpuName = parts[0] || undefined;
    const driverVersion = parts[1] || undefined;
    const ccMode = parts[2] || undefined;

    // NVIDIA CC mode values: 'On', 'Off', 'N/A'
    const confidential = ccMode?.toLowerCase() === 'on';

    return {
      available: true,
      confidential,
      gpuName,
      driverVersion,
      ccMode,
    };
  } catch {
    return { available: false, confidential: false };
  }
}

/**
 * Check if GPU is in Confidential Computing mode.
 */
export function isGpuConfidential(): boolean {
  return detectConfidentialGpu().confidential;
}

/**
 * Throw if GPU is available but NOT in Confidential Computing mode.
 * No-op if no GPU is detected.
 */
export function blockNonConfidentialGpu(): void {
  const info = detectConfidentialGpu();
  if (info.available && !info.confidential) {
    throw new Error(
      `GPU detected (${info.gpuName ?? 'unknown'}) but Confidential Computing mode is not enabled` +
        (info.ccMode ? ` (cc_mode=${info.ccMode})` : '')
    );
  }
}
