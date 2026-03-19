/**
 * GPU Probe — Backward-compatible re-export from accelerator module.
 *
 * @deprecated Import from './accelerator/index.js' instead.
 * All detection logic now lives in packages/core/src/ai/accelerator/.
 */

export type {
  AcceleratorVendor,
  AcceleratorFamily,
  AcceleratorDevice,
  AcceleratorProbeResult,
  GpuDevice,
  GpuProbeResult,
} from './accelerator/types.js';

export { estimateVramRequirement, _resetProbeCache as _resetGpuCache } from './accelerator/probe.js';

import { probeAccelerators } from './accelerator/probe.js';

/** @deprecated Use probeAccelerators() from './accelerator/index.js'. */
export const probeGpu = probeAccelerators;
