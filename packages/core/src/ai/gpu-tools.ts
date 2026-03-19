/**
 * GPU Tools — Backward-compatible re-export from accelerator module.
 *
 * @deprecated Import from './accelerator/index.js' instead.
 */

import {
  ACCELERATOR_TOOL_DEFINITIONS,
  handleAcceleratorToolCall,
  type AcceleratorToolHandlerDeps,
} from './accelerator/tools.js';

/** @deprecated Use ACCELERATOR_TOOL_DEFINITIONS. */
export const GPU_TOOL_DEFINITIONS = ACCELERATOR_TOOL_DEFINITIONS;

/** @deprecated Use AcceleratorToolHandlerDeps. */
export type GpuToolHandlerDeps = AcceleratorToolHandlerDeps;

/** @deprecated Use handleAcceleratorToolCall. */
export const handleGpuToolCall = handleAcceleratorToolCall;
