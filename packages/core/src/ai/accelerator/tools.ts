/**
 * Accelerator MCP Tools — High-level tools + family-specific drill-down.
 *
 * Tools:
 * - accelerator_status:  All detected accelerators (ai-hwaccel or fallback)
 * - gpu_status:          GPU family only (NVIDIA, AMD, Intel, oneAPI, Metal, Vulkan)
 * - tpu_status:          TPU family only (Google TPU v4/v5e/v5p)
 * - npu_status:          NPU family only (Intel NPU, AMD XDNA, Apple ANE)
 * - asic_status:         AI ASIC family only (Gaudi, Neuron, Qualcomm)
 * - local_models_list:   Locally available AI models
 * - privacy_route_check: Privacy-aware inference routing decision
 */

import type { McpToolDef } from '@secureyeoman/shared';
import type { SecureLogger } from '../../logging/logger.js';
import type { ClassificationEngine } from '../../security/dlp/classification-engine.js';
import type { AcceleratorFamily } from './types.js';

export const ACCELERATOR_TOOL_DEFINITIONS: McpToolDef[] = [
  {
    name: 'accelerator_status',
    description:
      'Query all detected AI accelerators on the host. Uses ai-hwaccel binary when available (13 families: NVIDIA CUDA, AMD ROCm, Intel iGPU, Intel oneAPI, Apple Metal, Vulkan, Google TPU, Intel NPU, AMD XDNA NPU, Apple ANE, Intel Gaudi, AWS Inferentia/Trainium, Qualcomm AI 100). Returns devices with VRAM/HBM, family classification, and local inference viability.',
    inputSchema: {
      type: 'object',
      properties: {
        refresh: {
          type: 'boolean',
          description: 'Force a fresh probe instead of using cached results (default: false)',
        },
      },
    },
    serverId: 'secureyeoman-builtin',
    serverName: 'SecureYeoman',
  },
  {
    name: 'gpu_status',
    description:
      'Query GPU accelerators only (NVIDIA CUDA, AMD ROCm, Intel iGPU, Intel oneAPI, Apple Metal, Vulkan). Returns VRAM total/used/free, utilization, temperature, and driver info.',
    inputSchema: {
      type: 'object',
      properties: {
        refresh: {
          type: 'boolean',
          description: 'Force a fresh probe instead of using cached results (default: false)',
        },
      },
    },
    serverId: 'secureyeoman-builtin',
    serverName: 'SecureYeoman',
  },
  {
    name: 'tpu_status',
    description:
      'Query Google TPU accelerators only (v4, v5e, v5p). Returns HBM per chip, chip count, and TPU version.',
    inputSchema: {
      type: 'object',
      properties: {
        refresh: {
          type: 'boolean',
          description: 'Force a fresh probe instead of using cached results (default: false)',
        },
      },
    },
    serverId: 'secureyeoman-builtin',
    serverName: 'SecureYeoman',
  },
  {
    name: 'npu_status',
    description:
      'Query NPU accelerators only (Intel NPU, AMD XDNA / Ryzen AI, Apple Neural Engine).',
    inputSchema: {
      type: 'object',
      properties: {
        refresh: {
          type: 'boolean',
          description: 'Force a fresh probe instead of using cached results (default: false)',
        },
      },
    },
    serverId: 'secureyeoman-builtin',
    serverName: 'SecureYeoman',
  },
  {
    name: 'asic_status',
    description:
      'Query AI ASIC accelerators only (Intel Gaudi/Habana, AWS Inferentia/Trainium, Qualcomm Cloud AI 100).',
    inputSchema: {
      type: 'object',
      properties: {
        refresh: {
          type: 'boolean',
          description: 'Force a fresh probe instead of using cached results (default: false)',
        },
      },
    },
    serverId: 'secureyeoman-builtin',
    serverName: 'SecureYeoman',
  },
  {
    name: 'local_models_list',
    description:
      'List locally available AI models from Ollama, LM Studio, and LocalAI. Returns model names, capabilities (chat, vision, code, reasoning), VRAM requirements, and provider info.',
    inputSchema: {
      type: 'object',
      properties: {
        refresh: {
          type: 'boolean',
          description: 'Force a fresh scan instead of using cached results (default: false)',
        },
        capability: {
          type: 'string',
          description:
            'Filter models by required capability (chat, vision, code, reasoning, tool_use)',
        },
      },
    },
    serverId: 'secureyeoman-builtin',
    serverName: 'SecureYeoman',
  },
  {
    name: 'privacy_route_check',
    description:
      'Evaluate content for privacy-aware routing. Classifies content sensitivity via DLP, checks accelerator availability, and recommends whether to route to a local model or cloud provider.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The content to evaluate for routing',
        },
        policy: {
          type: 'string',
          enum: ['auto', 'local-preferred', 'local-only', 'cloud-only'],
          description: 'Routing policy override (default: auto)',
        },
      },
      required: ['content'],
    },
    serverId: 'secureyeoman-builtin',
    serverName: 'SecureYeoman',
  },
];

export interface AcceleratorToolHandlerDeps {
  logger: SecureLogger;
  classificationEngine?: ClassificationEngine;
}

const FAMILY_TOOL_MAP: Record<string, AcceleratorFamily> = {
  gpu_status: 'gpu',
  tpu_status: 'tpu',
  npu_status: 'npu',
  asic_status: 'ai_asic',
};

export async function handleAcceleratorToolCall(
  toolName: string,
  args: Record<string, unknown>,
  deps: AcceleratorToolHandlerDeps
): Promise<unknown> {
  // High-level: all accelerators
  if (toolName === 'accelerator_status') {
    const { probeAccelerators } = await import('./probe.js');
    return probeAccelerators(args.refresh === true);
  }

  // Family-specific status tools
  if (toolName in FAMILY_TOOL_MAP) {
    const { probeAccelerators } = await import('./probe.js');
    const result = await probeAccelerators(args.refresh === true);
    const family = FAMILY_TOOL_MAP[toolName]!;
    const filtered = result.devices.filter((d) => d.family === family);
    return {
      ...result,
      devices: filtered,
      available: filtered.length > 0,
      totalVramMb: filtered.reduce((sum, d) => sum + d.vramTotalMb, 0),
      totalFreeVramMb: filtered.reduce((sum, d) => sum + d.vramFreeMb, 0),
      bestDevice:
        filtered.length > 0
          ? filtered.reduce((best, d) => (d.vramFreeMb > best.vramFreeMb ? d : best))
          : null,
    };
  }

  // Local models
  if (toolName === 'local_models_list') {
    const { refreshLocalModels, findLocalModelsWithCapabilities } =
      await import('../local-model-registry.js');
    const state = await refreshLocalModels(args.refresh === true);

    if (typeof args.capability === 'string') {
      const filtered = findLocalModelsWithCapabilities(state.models, [args.capability as any]);
      return { ...state, models: filtered };
    }

    return state;
  }

  // Privacy routing
  if (toolName === 'privacy_route_check') {
    const content = args.content;
    if (typeof content !== 'string' || content.length === 0) {
      return { error: 'content field is required and must be non-empty' };
    }

    const { probeAccelerators } = await import('./probe.js');
    const { refreshLocalModels } = await import('../local-model-registry.js');
    const { routeWithPrivacy } = await import('../privacy-router.js');

    let classificationLevel: 'public' | 'internal' | 'confidential' | 'restricted' = 'public';
    let piiFound: string[] = [];

    if (deps.classificationEngine) {
      const classification = deps.classificationEngine.classify(content);
      classificationLevel = classification.level;
      piiFound = classification.piiFound;
    }

    const [accel, localModels] = await Promise.all([probeAccelerators(), refreshLocalModels()]);

    return routeWithPrivacy(
      classificationLevel,
      piiFound,
      accel,
      localModels,
      [],
      typeof args.policy === 'string' ? { policy: args.policy as any } : {}
    );
  }

  deps.logger.warn({ toolName }, 'Unknown accelerator tool');
  return { error: `Unknown tool: ${toolName}` };
}
