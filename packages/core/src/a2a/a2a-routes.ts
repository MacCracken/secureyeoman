/**
 * A2A Routes — REST API for Agent-to-Agent protocol (Phase 6.5).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { A2AManager } from './manager.js';
import type { TrustLevel } from './types.js';

export function registerA2ARoutes(app: FastifyInstance, deps: { a2aManager: A2AManager }): void {
  const { a2aManager } = deps;

  // ── Peer routes ────────────────────────────────────────────

  app.get('/api/v1/a2a/peers', async () => {
    const peers = await a2aManager.listPeers();
    return { peers };
  });

  app.post(
    '/api/v1/a2a/peers',
    async (
      request: FastifyRequest<{
        Body: {
          url: string;
          name?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const peer = await a2aManager.addPeer(request.body.url, request.body.name);
        return reply.code(201).send({ peer });
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : 'Failed to add peer',
        });
      }
    }
  );

  app.delete(
    '/api/v1/a2a/peers/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const removed = await a2aManager.removePeer(request.params.id);
      if (!removed) {
        return reply.code(404).send({ error: 'Peer not found' });
      }
      return { success: true };
    }
  );

  app.put(
    '/api/v1/a2a/peers/:id/trust',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { trustLevel: TrustLevel };
      }>,
      reply: FastifyReply
    ) => {
      const updated = await a2aManager.updateTrust(request.params.id, request.body.trustLevel);
      if (!updated) {
        return reply.code(404).send({ error: 'Peer not found' });
      }
      return { peer: updated };
    }
  );

  // ── Discovery ──────────────────────────────────────────────

  app.post('/api/v1/a2a/discover', async () => {
    const peers = await a2aManager.discover();
    return { discovered: peers };
  });

  // ── Capabilities ───────────────────────────────────────────

  app.get('/api/v1/a2a/capabilities', async () => {
    const capabilities = a2aManager.getLocalCapabilities();
    return { capabilities };
  });

  // ── Delegation ─────────────────────────────────────────────

  app.post(
    '/api/v1/a2a/delegate',
    async (
      request: FastifyRequest<{
        Body: {
          peerId: string;
          task: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const message = await a2aManager.delegate(request.body.peerId, request.body.task);
        if (!message) {
          return reply.code(404).send({ error: 'Peer not found or unreachable' });
        }
        return reply.code(201).send({ message });
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : 'Delegation failed',
        });
      }
    }
  );

  // ── Message history ────────────────────────────────────────

  app.get(
    '/api/v1/a2a/messages',
    async (
      request: FastifyRequest<{
        Querystring: {
          peerId?: string;
          limit?: string;
          offset?: string;
        };
      }>
    ) => {
      const q = request.query;
      return a2aManager.getMessageHistory({
        peerId: q.peerId,
        limit: q.limit ? Number(q.limit) : undefined,
        offset: q.offset ? Number(q.offset) : undefined,
      });
    }
  );

  // ── Config ─────────────────────────────────────────────────

  app.get('/api/v1/a2a/config', async () => {
    return { config: a2aManager.getConfig() };
  });
}
