/**
 * Proactive Routes — REST API for proactive assistance system.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ProactiveManager } from './manager.js';

export function registerProactiveRoutes(
  app: FastifyInstance,
  deps: { proactiveManager: ProactiveManager },
): void {
  const { proactiveManager } = deps;

  // ── Trigger routes ──────────────────────────────────────────────

  app.get('/api/v1/proactive/triggers', async (
    request: FastifyRequest<{
      Querystring: { type?: string; enabled?: string };
    }>,
  ) => {
    const filter: { type?: string; enabled?: boolean } = {};
    if (request.query.type) filter.type = request.query.type;
    if (request.query.enabled !== undefined) filter.enabled = request.query.enabled === 'true';

    const triggers = await proactiveManager.listTriggers(filter);
    return { triggers };
  });

  app.get('/api/v1/proactive/triggers/builtin', async () => {
    const triggers = proactiveManager.getBuiltinTriggers();
    return { triggers };
  });

  app.get(
    '/api/v1/proactive/triggers/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const trigger = await proactiveManager.getTrigger(request.params.id);
      if (!trigger) return reply.code(404).send({ error: 'Trigger not found' });
      return trigger;
    },
  );

  app.post(
    '/api/v1/proactive/triggers',
    async (
      request: FastifyRequest<{
        Body: {
          name: string;
          description?: string;
          enabled?: boolean;
          type: string;
          condition: Record<string, unknown>;
          action: Record<string, unknown>;
          approvalMode?: string;
          cooldownMs?: number;
          limitPerDay?: number;
        };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const trigger = await proactiveManager.createTrigger(request.body as any);
        return reply.code(201).send(trigger);
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : 'Failed to create trigger',
        });
      }
    },
  );

  app.patch(
    '/api/v1/proactive/triggers/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: Record<string, unknown>;
      }>,
      reply: FastifyReply,
    ) => {
      const trigger = await proactiveManager.updateTrigger(
        request.params.id,
        request.body as any,
      );
      if (!trigger) return reply.code(404).send({ error: 'Trigger not found' });
      return trigger;
    },
  );

  app.delete(
    '/api/v1/proactive/triggers/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const deleted = await proactiveManager.deleteTrigger(request.params.id);
      if (!deleted) return reply.code(404).send({ error: 'Trigger not found' });
      return { success: true };
    },
  );

  app.post(
    '/api/v1/proactive/triggers/:id/enable',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const trigger = await proactiveManager.enableTrigger(request.params.id);
      if (!trigger) return reply.code(404).send({ error: 'Trigger not found' });
      return trigger;
    },
  );

  app.post(
    '/api/v1/proactive/triggers/:id/disable',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const trigger = await proactiveManager.disableTrigger(request.params.id);
      if (!trigger) return reply.code(404).send({ error: 'Trigger not found' });
      return trigger;
    },
  );

  app.post(
    '/api/v1/proactive/triggers/:id/test',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
    ) => {
      return proactiveManager.testTrigger(request.params.id);
    },
  );

  app.post(
    '/api/v1/proactive/triggers/builtin/:id/enable',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const trigger = await proactiveManager.enableBuiltinTrigger(request.params.id);
      if (!trigger) return reply.code(404).send({ error: 'Built-in trigger not found' });
      return trigger;
    },
  );

  // ── Suggestion routes ───────────────────────────────────────────

  app.get(
    '/api/v1/proactive/suggestions',
    async (
      request: FastifyRequest<{
        Querystring: { status?: string; triggerId?: string; limit?: string; offset?: string };
      }>,
    ) => {
      const q = request.query;
      return proactiveManager.listSuggestions({
        status: q.status as any,
        triggerId: q.triggerId,
        limit: q.limit ? Number(q.limit) : undefined,
        offset: q.offset ? Number(q.offset) : undefined,
      });
    },
  );

  app.post(
    '/api/v1/proactive/suggestions/:id/approve',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
    ) => {
      return proactiveManager.approveSuggestion(request.params.id);
    },
  );

  app.post(
    '/api/v1/proactive/suggestions/:id/dismiss',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
    ) => {
      const dismissed = await proactiveManager.dismissSuggestion(request.params.id);
      return { success: dismissed };
    },
  );

  app.delete('/api/v1/proactive/suggestions/expired', async () => {
    const deleted = await proactiveManager.clearExpiredSuggestions();
    return { deleted };
  });

  // ── Pattern routes ──────────────────────────────────────────────

  app.get('/api/v1/proactive/patterns', async () => {
    const patterns = await proactiveManager.detectPatterns();
    return { patterns };
  });

  app.post(
    '/api/v1/proactive/patterns/:id/convert',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const trigger = await proactiveManager.convertPatternToTrigger(request.params.id);
      if (!trigger) return reply.code(404).send({ error: 'Pattern not found' });
      return trigger;
    },
  );

  // ── Status route ────────────────────────────────────────────────

  app.get('/api/v1/proactive/status', async () => {
    return proactiveManager.getStatus();
  });
}
