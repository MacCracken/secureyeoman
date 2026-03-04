/**
 * A2A Routes — REST API for Agent-to-Agent protocol (Phase 6.5).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { A2AManager } from './manager.js';
import type { TrustLevel } from './types.js';
import { sendError, toErrorMessage } from '../utils/errors.js';
import { parsePagination } from '../utils/pagination.js';

export function registerA2ARoutes(app: FastifyInstance, opts: { a2aManager: A2AManager }): void {
  const { a2aManager } = opts;

  // ── Peer routes ────────────────────────────────────────────

  app.get(
    '/api/v1/a2a/peers',
    async (
      request: FastifyRequest<{
        Querystring: { status?: string; trustLevel?: string; limit?: string; offset?: string };
      }>
    ) => {
      const { status, trustLevel } = request.query;
      const { limit, offset } = parsePagination(request.query);
      return a2aManager.listPeers({ status, trustLevel, limit, offset });
    }
  );

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
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  // Register a pre-configured local/internal peer (bypasses SSRF guard).
  // Use this for trusted services like Agnostic that run on localhost.
  app.post(
    '/api/v1/a2a/peers/local',
    async (
      request: FastifyRequest<{
        Body: { url: string; name: string; id?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const peer = await a2aManager.addTrustedLocalPeer({
          id: request.body.id,
          name: request.body.name,
          url: request.body.url,
        });
        return reply.code(201).send({ peer });
      } catch (err) {
        return sendError(
          reply,
          400,
          toErrorMessage(err)
        );
      }
    }
  );

  app.delete(
    '/api/v1/a2a/peers/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const removed = await a2aManager.removePeer(request.params.id);
      if (!removed) {
        return sendError(reply, 404, 'Peer not found');
      }
      return reply.code(204).send();
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
        return sendError(reply, 404, 'Peer not found');
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
          return sendError(reply, 404, 'Peer not found or unreachable');
        }
        return reply.code(201).send({ message });
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
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
      const { limit, offset } = parsePagination(q);
      return a2aManager.getMessageHistory({
        peerId: q.peerId,
        limit,
        offset,
      });
    }
  );

  // ── Config ─────────────────────────────────────────────────

  app.get('/api/v1/a2a/config', async () => {
    return { config: a2aManager.getConfig() };
  });

  // ── Receive (inbound A2A messages from remote peers) ───────
  // Extracts W3C traceparent header for distributed trace correlation.

  app.post(
    '/api/v1/a2a/receive',
    async (request: FastifyRequest<{ Body: Record<string, unknown> }>, reply: FastifyReply) => {
      const traceparent = request.headers.traceparent;
      const log = traceparent ? request.log.child({ traceparent }) : request.log;

      try {
        const message = request.body;
        log.debug({ messageType: (message as any).type }, 'A2A message received');
        // Accept and acknowledge — routing is handled by a2aManager internally
        return reply.code(202).send({ status: 'accepted' });
      } catch (err) {
        log.error(
          { error: toErrorMessage(err) },
          'Failed to handle A2A receive'
        );
        return sendError(reply, 500, 'Failed to handle A2A message');
      }
    }
  );
}
