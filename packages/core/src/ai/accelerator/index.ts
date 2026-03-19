/**
 * Accelerator module — unified AI hardware detection and routing.
 *
 * Architecture:
 * - types.ts   — Shared types (AcceleratorDevice, AcceleratorProbeResult, families)
 * - probe.ts   — Orchestrator: ai-hwaccel first, then family probes
 * - gpu.ts     — GPU probes (NVIDIA, AMD, Intel, oneAPI, Metal)
 * - tpu.ts     — TPU probes (Google TPU v4/v5e/v5p)
 * - npu.ts     — NPU probes (Intel NPU, AMD XDNA, Apple ANE)
 * - asic.ts    — AI ASIC probes (Gaudi, Neuron, Qualcomm)
 * - tools.ts   — MCP tool definitions and handler
 */

// Types
export type {
  AcceleratorVendor,
  AcceleratorFamily,
  AcceleratorDevice,
  AcceleratorProbeResult,
  GpuDevice,
  GpuProbeResult,
} from './types.js';

// Probe orchestrator
export { probeAccelerators, estimateVramRequirement, _resetProbeCache } from './probe.js';

// MCP tools
export {
  ACCELERATOR_TOOL_DEFINITIONS,
  handleAcceleratorToolCall,
  type AcceleratorToolHandlerDeps,
} from './tools.js';

// Family probes (for direct use when needed)
export { probeNvidia, probeAmd, probeIntel, probeOneApi, probeAppleMetal } from './gpu.js';
export { probeTpu } from './tpu.js';
export { probeIntelNpu, probeAmdXdna, probeAppleNpu } from './npu.js';
export { probeGaudi, probeNeuron, probeQualcomm } from './asic.js';
