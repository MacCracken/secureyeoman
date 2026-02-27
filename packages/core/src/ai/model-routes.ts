/**
 * Model Routes — View current model config and switch models at runtime.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SecureYeoman } from '../secureyeoman.js';
import { getAvailableModelsAsync } from './cost-calculator.js';
import { ModelRouter, profileTask } from './model-router.js';
import { sendError } from '../utils/errors.js';
import { getSecret } from '../config/loader.js';

const LOCAL_PROVIDERS = new Set(['ollama', 'lmstudio', 'localai']);

async function pingLocalProvider(
  provider: string,
  baseUrl: string
): Promise<{ reachable: boolean; latencyMs: number }> {
  const healthUrl =
    provider === 'ollama' ? `${baseUrl}/api/tags` : `${baseUrl}/v1/models`;
  const start = Date.now();
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
    const latencyMs = Date.now() - start;
    return { reachable: res.ok, latencyMs };
  } catch {
    return { reachable: false, latencyMs: Date.now() - start };
  }
}

export interface ModelRoutesOptions {
  secureYeoman: SecureYeoman;
}

interface SwitchModelBody {
  provider: string;
  model: string;
}

export function registerModelRoutes(app: FastifyInstance, opts: ModelRoutesOptions): void {
  const { secureYeoman } = opts;

  app.get('/api/v1/model/info', async (_request, reply: FastifyReply) => {
    try {
      const config = secureYeoman.getConfig();
      const modelConfig = config.model;

      return {
        current: {
          provider: modelConfig.provider,
          model: modelConfig.model,
          maxTokens: modelConfig.maxTokens,
          temperature: modelConfig.temperature,
        },
        available: await getAvailableModelsAsync(true),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return sendError(reply, 500, message);
    }
  });

  app.post(
    '/api/v1/model/switch',
    async (request: FastifyRequest<{ Body: SwitchModelBody }>, reply: FastifyReply) => {
      const { provider, model } = request.body;

      if (!provider || !model) {
        return sendError(reply, 400, 'provider and model are required');
      }

      const validProviders = [
        'anthropic',
        'openai',
        'gemini',
        'ollama',
        'opencode',
        'lmstudio',
        'localai',
        'deepseek',
        'mistral',
        'grok',
        'letta',
      ];
      if (!validProviders.includes(provider)) {
        return sendError(
          reply,
          400,
          `Invalid provider. Must be one of: ${validProviders.join(', ')}`
        );
      }

      try {
        secureYeoman.switchModel(provider, model);
        return { success: true, model: `${provider}/${model}` };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return sendError(reply, 500, `Failed to switch model: ${message}`);
      }
    }
  );

  // ── Persistent model default ────────────────────────────────────────

  app.get('/api/v1/model/default', async (_request, reply: FastifyReply) => {
    try {
      const def = secureYeoman.getModelDefault();
      return { provider: def?.provider ?? null, model: def?.model ?? null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return sendError(reply, 500, message);
    }
  });

  app.post(
    '/api/v1/model/default',
    async (request: FastifyRequest<{ Body: SwitchModelBody }>, reply: FastifyReply) => {
      const { provider, model } = request.body;

      if (!provider || !model) {
        return sendError(reply, 400, 'provider and model are required');
      }

      try {
        await secureYeoman.setModelDefault(provider, model);
        return { success: true, provider, model };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message.startsWith('Invalid provider')) {
          return sendError(reply, 400, message);
        }
        return sendError(reply, 500, `Failed to set model default: ${message}`);
      }
    }
  );

  app.delete('/api/v1/model/default', async (_request, reply: FastifyReply) => {
    try {
      await secureYeoman.clearModelDefault();
      return reply.code(204).send();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return sendError(reply, 500, message);
    }
  });

  // Cost optimization recommendations
  app.get('/api/v1/model/cost-recommendations', async (_request, reply: FastifyReply) => {
    try {
      const costOptimizer = secureYeoman.getCostOptimizer();
      if (!costOptimizer) {
        return sendError(reply, 503, 'Cost optimizer not available (AI client not initialized)');
      }
      return costOptimizer.analyze();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return sendError(reply, 500, message);
    }
  });

  // ── Cost estimation (pre-execution) ─────────────────────────────────────────

  app.post(
    '/api/v1/model/estimate-cost',
    async (
      request: FastifyRequest<{
        Body: {
          task: string;
          context?: string;
          tokenBudget?: number;
          roleCount?: number;
          allowedModels?: string[];
        };
      }>,
      reply: FastifyReply
    ) => {
      const {
        task,
        context,
        tokenBudget = 50000,
        roleCount = 1,
        allowedModels = [],
      } = request.body;

      if (!task || typeof task !== 'string') {
        return sendError(reply, 400, 'task is required and must be a string');
      }

      try {
        const costOptimizer = secureYeoman.getCostOptimizer();
        if (!costOptimizer) {
          return sendError(reply, 503, 'Cost calculator not available');
        }

        const costCalculator = secureYeoman.getCostCalculator();
        if (!costCalculator) {
          return sendError(reply, 503, 'Cost calculator not available');
        }

        const router = new ModelRouter(costCalculator);
        const decision = router.route(task, {
          allowedModels,
          tokenBudget,
          context,
        });

        const taskProfile = profileTask(task, context);
        const perRoleCost = decision.estimatedCostUsd;
        const totalEstimatedCost = perRoleCost * roleCount;

        return {
          task: { type: taskProfile.taskType, complexity: taskProfile.complexity },
          selectedModel: decision.selectedModel,
          selectedProvider: decision.selectedProvider,
          tier: decision.tier,
          confidence: decision.confidence,
          estimatedCostUsd: totalEstimatedCost,
          estimatedCostPerRoleUsd: perRoleCost,
          roleCount,
          cheaperAlternative: decision.cheaperAlternative
            ? {
                ...decision.cheaperAlternative,
                estimatedTotalCostUsd: decision.cheaperAlternative.estimatedCostUsd * roleCount,
              }
            : null,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return sendError(reply, 500, message);
      }
    }
  );

  // ── AI Provider Health ───────────────────────────────────────────────────
  // Pings the active provider to check reachability.
  // Local providers (ollama, lmstudio, localai) are pinged via HTTP.
  // Cloud providers return 'configured' / 'missing_key' status without a live ping.

  app.get('/api/v1/ai/health', async (_request, reply: FastifyReply) => {
    try {
      const config = secureYeoman.getConfig();
      const { provider, model, baseUrl, apiKeyEnv } = config.model;
      const isLocal = LOCAL_PROVIDERS.has(provider);

      if (isLocal) {
        const providerBaseUrl =
          baseUrl ??
          (provider === 'ollama'
            ? 'http://localhost:11434'
            : provider === 'lmstudio'
              ? 'http://localhost:1234'
              : 'http://localhost:8080');
        const { reachable, latencyMs } = await pingLocalProvider(provider, providerBaseUrl);
        return {
          status: reachable ? 'reachable' : 'unreachable',
          provider,
          model,
          local: true,
          baseUrl: providerBaseUrl,
          latencyMs: reachable ? latencyMs : undefined,
        };
      }

      // Cloud providers — check API key presence
      const key = getSecret(apiKeyEnv);
      return {
        status: key ? 'configured' : 'missing_key',
        provider,
        model,
        local: false,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return sendError(reply, 500, message);
    }
  });
}
