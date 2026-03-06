/**
 * Batch Inference Routes — REST endpoints for batch inference jobs,
 * semantic cache management, and KV cache warmup.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SecureYeoman } from '../secureyeoman.js';
import { sendError, toErrorMessage } from '../utils/errors.js';
import { requiresLicense } from '../licensing/license-guard.js';

export interface BatchInferenceRoutesOptions {
  secureYeoman: SecureYeoman;
}

export function registerBatchInferenceRoutes(
  app: FastifyInstance,
  opts: BatchInferenceRoutesOptions
): void {
  const { secureYeoman } = opts;

  const batchGuardOpts = {
    preHandler: [requiresLicense('batch_inference', () => secureYeoman.getLicenseManager())],
  } as Record<string, unknown>;

  // ── Batch Inference ──────────────────────────────────────────────────

  app.post(
    '/api/v1/ai/batch',
    batchGuardOpts,
    async (
      request: FastifyRequest<{
        Body: {
          name?: string;
          prompts: { id: string; prompt: string; systemPrompt?: string }[];
          concurrency?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      const batchManager = secureYeoman.getBatchInferenceManager?.();
      if (!batchManager) return sendError(reply, 503, 'Batch inference not available');

      const body = request.body;
      if (!body?.prompts?.length) return sendError(reply, 400, 'prompts array is required');
      if (body.prompts.length > 10_000)
        return sendError(reply, 400, 'Maximum 10,000 prompts per batch');

      try {
        const job = await batchManager.createJob({
          name: body.name,
          prompts: body.prompts,
          concurrency: body.concurrency,
          createdBy: (request as unknown as Record<string, unknown>).userId as string | undefined,
        });

        // Execute in background
        batchManager.executeJob(job.id).catch((err: unknown) => {
          // Error already recorded in DB
          void err;
        });

        return reply.code(202).send(job);
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  app.get(
    '/api/v1/ai/batch/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const batchManager = secureYeoman.getBatchInferenceManager?.();
      if (!batchManager) return sendError(reply, 503, 'Batch inference not available');

      const job = await batchManager.getJob(request.params.id);
      if (!job) return sendError(reply, 404, 'Batch job not found');
      return job;
    }
  );

  app.get('/api/v1/ai/batch', async (_request: FastifyRequest, reply: FastifyReply) => {
    const batchManager = secureYeoman.getBatchInferenceManager?.();
    if (!batchManager) return sendError(reply, 503, 'Batch inference not available');

    return batchManager.listJobs();
  });

  app.delete(
    '/api/v1/ai/batch/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const batchManager = secureYeoman.getBatchInferenceManager?.();
      if (!batchManager) return sendError(reply, 503, 'Batch inference not available');

      const cancelled = await batchManager.cancelJob(request.params.id);
      if (!cancelled) return sendError(reply, 404, 'Batch job not found or already completed');
      return { ok: true };
    }
  );

  // ── Cache Stats & Clear ──────────────────────────────────────────────

  app.get('/api/v1/ai/cache/stats', async (_request: FastifyRequest, reply: FastifyReply) => {
    const semanticCache = secureYeoman.getSemanticCache?.();
    const aiClient = secureYeoman.getAIClient?.();

    const lruStats = aiClient?.getCacheStats?.() ?? null;
    const semanticStats = semanticCache ? await semanticCache.getStats() : null;

    return { lru: lruStats, semantic: semanticStats };
  });

  app.post('/api/v1/ai/cache/clear', async (_request: FastifyRequest, reply: FastifyReply) => {
    const semanticCache = secureYeoman.getSemanticCache?.();
    if (!semanticCache) return sendError(reply, 503, 'Semantic cache not available');

    const deleted = await semanticCache.clear();
    return { deleted };
  });

  // ── KV Cache Warmup ──────────────────────────────────────────────────

  app.post(
    '/api/v1/ai/warmup',
    async (
      request: FastifyRequest<{ Body: { model?: string; systemPrompt?: string } }>,
      reply: FastifyReply
    ) => {
      const warmer = secureYeoman.getKvCacheWarmer?.();
      if (!warmer) return sendError(reply, 503, 'KV cache warmer not available');

      const model = request.body?.model;
      if (!model?.trim()) return sendError(reply, 400, 'model is required');

      const success = await warmer.warmup(model, request.body?.systemPrompt);
      return { model, warmed: success };
    }
  );
}
