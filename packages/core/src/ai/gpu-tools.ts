/**
 * GPU MCP Tools — Expose GPU status, local models, and privacy routing to agents.
 *
 * Tools:
 * - gpu_status: Query available GPU devices and VRAM
 * - local_models_list: List locally available models with capabilities
 * - privacy_route_check: Evaluate content for local vs cloud routing
 */

import type { McpToolDef } from '@secureyeoman/shared';
import type { SecureLogger } from '../logging/logger.js';
import type { ClassificationEngine } from '../security/dlp/classification-engine.js';

export const GPU_TOOL_DEFINITIONS: McpToolDef[] = [
  {
    name: 'gpu_status',
    description:
      'Query available GPU devices on the host. Returns NVIDIA, AMD, and Intel GPU info including VRAM total/used/free, utilization, temperature, driver version, and whether local inference is viable.',
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
          description: 'Filter models by required capability (chat, vision, code, reasoning, tool_use)',
        },
      },
    },
    serverId: 'secureyeoman-builtin',
    serverName: 'SecureYeoman',
  },
  {
    name: 'privacy_route_check',
    description:
      'Evaluate content for privacy-aware routing. Classifies content sensitivity via DLP, checks GPU availability, and recommends whether to route to a local model or cloud provider. Returns routing decision with confidence score and reason.',
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

export interface GpuToolHandlerDeps {
  logger: SecureLogger;
  classificationEngine?: ClassificationEngine;
}

export async function handleGpuToolCall(
  toolName: string,
  args: Record<string, unknown>,
  deps: GpuToolHandlerDeps
): Promise<unknown> {
  switch (toolName) {
    case 'gpu_status': {
      const { probeGpu } = await import('./gpu-probe.js');
      return probeGpu(args.refresh === true);
    }

    case 'local_models_list': {
      const { refreshLocalModels, findLocalModelsWithCapabilities } =
        await import('./local-model-registry.js');
      const state = await refreshLocalModels(args.refresh === true);

      if (typeof args.capability === 'string') {
        const filtered = findLocalModelsWithCapabilities(state.models, [args.capability as any]);
        return { ...state, models: filtered };
      }

      return state;
    }

    case 'privacy_route_check': {
      const content = args.content;
      if (typeof content !== 'string' || content.length === 0) {
        return { error: 'content field is required and must be non-empty' };
      }

      const { probeGpu } = await import('./gpu-probe.js');
      const { refreshLocalModels } = await import('./local-model-registry.js');
      const { routeWithPrivacy } = await import('./privacy-router.js');

      let classificationLevel: 'public' | 'internal' | 'confidential' | 'restricted' = 'public';
      let piiFound: string[] = [];

      if (deps.classificationEngine) {
        const classification = deps.classificationEngine.classify(content);
        classificationLevel = classification.level;
        piiFound = classification.piiFound;
      }

      const [gpu, localModels] = await Promise.all([probeGpu(), refreshLocalModels()]);

      return routeWithPrivacy(
        classificationLevel,
        piiFound,
        gpu,
        localModels,
        [],
        typeof args.policy === 'string' ? { policy: args.policy as any } : {}
      );
    }

    default:
      deps.logger.warn({ toolName }, 'Unknown GPU tool');
      return { error: `Unknown tool: ${toolName}` };
  }
}
