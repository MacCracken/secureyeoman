/**
 * Cognitive ML Routes — Phase 140 & 141
 *
 * REST endpoints for RAG evaluation, reconsolidation, schema clustering,
 * retrieval optimizer, and working memory.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { BrainManager } from './manager.js';
import type { RagEvalEngine } from './rag-eval.js';
import type { SchemaClusteringManager } from './schema-clustering.js';
import { toErrorMessage, sendError } from '../utils/errors.js';
import { licenseGuard } from '../licensing/license-guard.js';
import type { SecureYeoman } from '../secureyeoman.js';

export interface CognitiveRoutesOptions {
  brainManager: BrainManager;
  ragEvalEngine?: RagEvalEngine;
  schemaClusteringManager?: SchemaClusteringManager;
  secureYeoman?: SecureYeoman;
}

export async function registerCognitiveRoutes(
  app: FastifyInstance,
  opts: CognitiveRoutesOptions
): Promise<void> {
  const { brainManager, ragEvalEngine, schemaClusteringManager, secureYeoman } = opts;

  const featureGuardOpts = licenseGuard('advanced_brain', secureYeoman);

  // ── RAG Evaluation ──────────────────────────────────────────

  app.post(
    '/api/v1/brain/rag-eval',
    featureGuardOpts,
    async (
      request: FastifyRequest<{
        Body: {
          query: string;
          answer: string;
          contexts: string[];
          referenceAnswer?: string;
          retrievalLatencyMs?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      if (!ragEvalEngine) {
        return sendError(reply, 503, 'RAG evaluation engine not available');
      }

      try {
        const { query, answer, contexts, referenceAnswer, retrievalLatencyMs } = request.body;

        if (!query || !answer || !Array.isArray(contexts)) {
          return sendError(reply, 400, 'query, answer, and contexts are required');
        }

        const result = await ragEvalEngine.evaluate({
          query,
          answer,
          contexts,
          referenceAnswer,
          retrievalLatencyMs,
        });

        return { result };
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  app.get(
    '/api/v1/brain/rag-eval/latency',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      if (!ragEvalEngine) {
        return sendError(reply, 503, 'RAG evaluation engine not available');
      }

      return { latency: ragEvalEngine.getLatencyPercentiles() };
    }
  );

  app.get(
    '/api/v1/brain/rag-eval/summary',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      if (!ragEvalEngine) {
        return sendError(reply, 503, 'RAG evaluation engine not available');
      }

      return ragEvalEngine.getSummary();
    }
  );

  // ── Schema Clustering ──────────────────────────────────────

  app.post(
    '/api/v1/brain/schemas/cluster',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      if (!schemaClusteringManager) {
        return sendError(reply, 503, 'Schema clustering not available');
      }

      try {
        const schemas = await schemaClusteringManager.runClustering();
        return { schemas, count: schemas.length };
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  app.get('/api/v1/brain/schemas', async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!schemaClusteringManager) {
      return sendError(reply, 503, 'Schema clustering not available');
    }

    return { schemas: schemaClusteringManager.getSchemas() };
  });

  // ── Retrieval Optimizer ──────────────────────────────────────

  app.get(
    '/api/v1/brain/retrieval-optimizer/stats',
    async (_request: FastifyRequest, _reply: FastifyReply) => {
      const stats = brainManager.getOptimizerStats();
      return { stats: stats ?? [] };
    }
  );

  app.post(
    '/api/v1/brain/retrieval-optimizer/feedback',
    async (request: FastifyRequest<{ Body: { positive: boolean } }>, reply: FastifyReply) => {
      const { positive } = request.body;
      if (typeof positive !== 'boolean') {
        return sendError(reply, 400, 'positive (boolean) is required');
      }

      brainManager.recordRetrievalFeedback(positive);
      return { ok: true };
    }
  );

  // ── Reconsolidation ──────────────────────────────────────────

  app.get(
    '/api/v1/brain/reconsolidation/stats',
    async (_request: FastifyRequest, _reply: FastifyReply) => {
      const stats = brainManager.getReconsolidationStats();
      return { stats: stats ?? { evaluated: 0, kept: 0, updated: 0, split: 0, errors: 0 } };
    }
  );

  // ── Working Memory ──────────────────────────────────────────

  app.get(
    '/api/v1/brain/working-memory',
    async (_request: FastifyRequest, _reply: FastifyReply) => {
      return {
        items: brainManager.getWorkingMemoryItems(),
        stats: brainManager.getWorkingMemoryStats(),
      };
    }
  );
}
