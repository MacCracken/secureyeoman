/**
 * Model Routes — View current model config and switch models at runtime.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SecureYeoman } from '../secureyeoman.js';
import { getAvailableModelsAsync } from './cost-calculator.js';
import { sendError } from '../utils/errors.js';

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
      ];
      if (!validProviders.includes(provider)) {
        return sendError(reply, 400, `Invalid provider. Must be one of: ${validProviders.join(', ')}`);
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
}
