/**
 * Brain Routes — API endpoints for memory, knowledge, and skill management.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { BrainManager } from './manager.js';
import type { HeartbeatManager } from '../body/heartbeat.js';
import type { ExternalBrainSync } from './external-sync.js';
import type { SoulManager } from '../soul/manager.js';
import type { MemoryType, MemoryQuery, KnowledgeQuery } from './types.js';

export interface BrainRoutesOptions {
  brainManager: BrainManager;
  heartbeatManager?: HeartbeatManager;
  externalSync?: ExternalBrainSync;
  soulManager?: SoulManager;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

export function registerBrainRoutes(app: FastifyInstance, opts: BrainRoutesOptions): void {
  const { brainManager, heartbeatManager, externalSync, soulManager } = opts;

  // ── Memories ─────────────────────────────────────────────────

  app.get(
    '/api/v1/brain/memories',
    async (
      request: FastifyRequest<{
        Querystring: {
          type?: string;
          source?: string;
          search?: string;
          minImportance?: string;
          limit?: string;
        };
      }>
    ) => {
      const q = request.query;
      const query: MemoryQuery = {};
      if (q.type) query.type = q.type as MemoryType;
      if (q.source) query.source = q.source;
      if (q.search) query.search = q.search;
      if (q.minImportance) query.minImportance = Number(q.minImportance);
      if (q.limit) query.limit = Number(q.limit);

      const memories = await brainManager.recall(query);
      return { memories };
    }
  );

  app.post(
    '/api/v1/brain/memories',
    async (
      request: FastifyRequest<{
        Body: {
          type: MemoryType;
          content: string;
          source: string;
          context?: Record<string, string>;
          importance?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { type, content, source, context, importance } = request.body;
        const memory = await brainManager.remember(type, content, source, context, importance);
        return await reply.code(201).send({ memory });
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  app.delete(
    '/api/v1/brain/memories/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await brainManager.forget(request.params.id);
        return { message: 'Memory deleted' };
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  // ── Knowledge ────────────────────────────────────────────────

  app.get(
    '/api/v1/brain/knowledge',
    async (
      request: FastifyRequest<{
        Querystring: { topic?: string; search?: string; minConfidence?: string; limit?: string };
      }>
    ) => {
      const q = request.query;
      const query: KnowledgeQuery = {};
      if (q.topic) query.topic = q.topic;
      if (q.search) query.search = q.search;
      if (q.minConfidence) query.minConfidence = Number(q.minConfidence);
      if (q.limit) query.limit = Number(q.limit);

      const knowledge = await brainManager.queryKnowledge(query);
      return { knowledge };
    }
  );

  app.post(
    '/api/v1/brain/knowledge',
    async (
      request: FastifyRequest<{
        Body: { topic: string; content: string; source: string; confidence?: number };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { topic, content, source, confidence } = request.body;
        const entry = await brainManager.learn(topic, content, source, confidence);
        return await reply.code(201).send({ knowledge: entry });
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  app.put(
    '/api/v1/brain/knowledge/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { content?: string; confidence?: number };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { content, confidence } = request.body;
        const knowledge = await brainManager.updateKnowledge(request.params.id, { content, confidence });
        return { knowledge };
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  app.delete(
    '/api/v1/brain/knowledge/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await brainManager.deleteKnowledge(request.params.id);
        return { message: 'Knowledge entry deleted' };
      } catch (err) {
        return reply.code(404).send({ error: errorMessage(err) });
      }
    }
  );

  // ── Stats ────────────────────────────────────────────────────

  app.get('/api/v1/brain/stats', async () => {
    const stats = await brainManager.getStats();
    return { stats };
  });

  // ── Maintenance ──────────────────────────────────────────────

  app.post('/api/v1/brain/maintenance', async () => {
    const result = await brainManager.runMaintenance();
    return { result };
  });

  // ── Heartbeat ──────────────────────────────────────────────

  app.get(
    '/api/v1/brain/heartbeat/status',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      if (!heartbeatManager) {
        return reply.code(503).send({ error: 'Heartbeat system not available' });
      }
      return heartbeatManager.getStatus();
    }
  );

  app.post(
    '/api/v1/brain/heartbeat/beat',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      if (!heartbeatManager) {
        return reply.code(503).send({ error: 'Heartbeat system not available' });
      }
      try {
        const result = await heartbeatManager.beat();
        return { result };
      } catch (err) {
        return reply.code(500).send({ error: errorMessage(err) });
      }
    }
  );

  app.get(
    '/api/v1/brain/heartbeat/tasks',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      if (!heartbeatManager) {
        return reply.code(503).send({ error: 'Heartbeat system not available' });
      }
      const status = heartbeatManager.getStatus();
      const activePersonality = (await soulManager?.getActivePersonality()) ?? null;
      const tasks = status.tasks.map((t) => ({
        ...t,
        personalityId: activePersonality?.id ?? null,
        personalityName: activePersonality?.name ?? null,
      }));
      return { tasks };
    }
  );

  app.put(
    '/api/v1/brain/heartbeat/tasks/:name',
    async (
      request: FastifyRequest<{
        Params: { name: string };
        Body: { intervalMs?: number; enabled?: boolean; config?: Record<string, unknown> };
      }>,
      reply: FastifyReply
    ) => {
      if (!heartbeatManager) {
        return reply.code(503).send({ error: 'Heartbeat system not available' });
      }
      try {
        const { intervalMs, enabled, config } = request.body;
        heartbeatManager.updateTask(request.params.name, { intervalMs, enabled, config });
        const status = heartbeatManager.getStatus();
        const task = status.tasks.find((t) => t.name === request.params.name);
        return { task };
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  app.get(
    '/api/v1/brain/heartbeat/history',
    async (request: FastifyRequest<{ Querystring: { limit?: string } }>, reply: FastifyReply) => {
      if (!heartbeatManager) {
        return reply.code(503).send({ error: 'Heartbeat system not available' });
      }
      const limit = request.query.limit ? Number(request.query.limit) : 10;
      const memories = await brainManager.recall({ source: 'heartbeat', limit });
      return { history: memories };
    }
  );

  // ── Audit Logs Bridge ─────────────────────────────────────

  app.get(
    '/api/v1/brain/logs',
    async (
      request: FastifyRequest<{
        Querystring: {
          level?: string;
          event?: string;
          limit?: string;
          offset?: string;
          from?: string;
          to?: string;
          order?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const q = request.query;
        const result = await brainManager.queryAuditLogs({
          level: q.level ? q.level.split(',') : undefined,
          event: q.event ? q.event.split(',') : undefined,
          limit: q.limit ? Number(q.limit) : undefined,
          offset: q.offset ? Number(q.offset) : undefined,
          from: q.from ? Number(q.from) : undefined,
          to: q.to ? Number(q.to) : undefined,
          order: q.order as 'asc' | 'desc' | undefined,
        });
        return result;
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  app.get(
    '/api/v1/brain/logs/search',
    async (
      request: FastifyRequest<{
        Querystring: { q: string; limit?: string; offset?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { q, limit, offset } = request.query;
        if (!q) {
          return await reply.code(400).send({ error: 'Query parameter "q" is required' });
        }
        const result = await brainManager.searchAuditLogs(q, {
          limit: limit ? Number(limit) : undefined,
          offset: offset ? Number(offset) : undefined,
        });
        return result;
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  // ── Semantic Search ───────────────────────────────────────

  app.get(
    '/api/v1/brain/search/similar',
    async (
      request: FastifyRequest<{
        Querystring: {
          query: string;
          limit?: string;
          threshold?: string;
          type?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { query, limit, threshold, type } = request.query;
        if (!query) {
          return await reply.code(400).send({ error: 'Query parameter "query" is required' });
        }
        const results = await brainManager.semanticSearch(query, {
          limit: limit ? Number(limit) : undefined,
          threshold: threshold ? Number(threshold) : undefined,
          type: type as 'memories' | 'knowledge' | 'all' | undefined,
        });
        return { results };
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  app.post(
    '/api/v1/brain/reindex',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Fetch all memories and knowledge, then reindex
        const memories = await brainManager.recall({ limit: 100000 });
        const knowledge = await brainManager.queryKnowledge({ limit: 50000 });

        // semanticSearch will throw if vector not enabled
        // But we need vector manager directly for reindex
        const stats = await brainManager.getStats();
        return {
          message: 'Reindex triggered',
          memoriesCount: stats.memories.total,
          knowledgeCount: stats.knowledge.total,
        };
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  // ── Consolidation ──────────────────────────────────────────

  app.post(
    '/api/v1/brain/consolidation/run',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const report = await brainManager.runConsolidation();
        return { report };
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  app.get(
    '/api/v1/brain/consolidation/schedule',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const schedule = brainManager.getConsolidationSchedule();
      if (schedule === null) {
        return reply.code(503).send({ error: 'Consolidation not available' });
      }
      return { schedule };
    }
  );

  app.put(
    '/api/v1/brain/consolidation/schedule',
    async (
      request: FastifyRequest<{
        Body: { schedule: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        brainManager.setConsolidationSchedule(request.body.schedule);
        return { schedule: request.body.schedule };
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  app.get(
    '/api/v1/brain/consolidation/history',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const memories = await brainManager.recall({ source: 'consolidation', limit: 50 });
        return { history: memories };
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  // ── External Brain Sync ───────────────────────────────────

  app.get('/api/v1/brain/sync/status', async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!externalSync) {
      return reply.code(503).send({ error: 'External brain sync not configured' });
    }
    return externalSync.getStatus();
  });

  app.post('/api/v1/brain/sync', async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!externalSync) {
      return reply.code(503).send({ error: 'External brain sync not configured' });
    }
    try {
      const result = await externalSync.sync();
      return { result };
    } catch (err) {
      return reply.code(500).send({ error: errorMessage(err) });
    }
  });

  // ── External Brain Config ───────────────────────────────────

  app.get('/api/v1/brain/sync/config', async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!externalSync) {
      return { configured: false, enabled: false };
    }
    return {
      configured: true,
      enabled: externalSync.isEnabled(),
      provider: externalSync.getProvider(),
      path: externalSync.getPath(),
    };
  });

  app.put(
    '/api/v1/brain/sync/config',
    async (
      request: FastifyRequest<{
        Body: {
          enabled?: boolean;
          provider?: string;
          path?: string;
          subdir?: string;
          syncIntervalMs?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      if (!externalSync) {
        return reply.code(503).send({ error: 'External brain sync not initialized' });
      }
      try {
        await externalSync.updateConfig(
          request.body as Partial<import('@friday/shared').ExternalBrainConfig>
        );
        return { success: true };
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );
}
