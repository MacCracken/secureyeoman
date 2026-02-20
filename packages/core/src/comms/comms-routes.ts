/**
 * Comms Routes — API endpoints for agent-to-agent communication.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AgentComms } from './agent-comms.js';
import type { AgentIdentity, EncryptedMessage, MessagePayload } from './types.js';
import { toErrorMessage } from '../utils/errors.js';

export interface CommsRoutesOptions {
  agentComms: AgentComms;
}

export function registerCommsRoutes(app: FastifyInstance, opts: CommsRoutesOptions): void {
  const { agentComms } = opts;

  // ── Identity ─────────────────────────────────────────────────

  app.get('/api/v1/comms/identity', async () => {
    return agentComms.getIdentity();
  });

  // ── Peers ────────────────────────────────────────────────────

  app.get('/api/v1/comms/peers', async () => {
    const peers = await agentComms.listPeers();
    return { peers };
  });

  app.post(
    '/api/v1/comms/peers',
    async (request: FastifyRequest<{ Body: AgentIdentity }>, reply: FastifyReply) => {
      try {
        await agentComms.addPeer(request.body);
        return reply.code(201).send({ message: 'Peer added' });
      } catch (err) {
        return reply.code(400).send({ error: toErrorMessage(err) });
      }
    }
  );

  app.delete(
    '/api/v1/comms/peers/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const removed = await agentComms.removePeer(request.params.id);
      if (!removed) {
        return reply.code(404).send({ error: 'Peer not found' });
      }
      return reply.code(204).send();
    }
  );

  // ── Messages ─────────────────────────────────────────────────

  app.post(
    '/api/v1/comms/message',
    async (request: FastifyRequest<{ Body: EncryptedMessage }>, reply: FastifyReply) => {
      try {
        const payload = await agentComms.decryptMessage(request.body);
        return { acknowledged: true, type: payload.type };
      } catch (err) {
        return reply.code(400).send({ error: toErrorMessage(err) });
      }
    }
  );

  app.post(
    '/api/v1/comms/send',
    async (
      request: FastifyRequest<{
        Body: { toAgentId: string; payload: MessagePayload };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { toAgentId, payload } = request.body;
        const encrypted = await agentComms.encryptMessage(toAgentId, payload);
        return reply.code(201).send({ message: encrypted });
      } catch (err) {
        return reply.code(400).send({ error: toErrorMessage(err) });
      }
    }
  );

  // ── Message Log ──────────────────────────────────────────────

  app.get(
    '/api/v1/comms/log',
    async (
      request: FastifyRequest<{
        Querystring: { peerId?: string; type?: string; limit?: string };
      }>
    ) => {
      const q = request.query;
      const log = await agentComms.getMessageLog({
        peerId: q.peerId,
        type: q.type as import('./types.js').MessageType | undefined,
        limit: q.limit ? Number(q.limit) : undefined,
      });
      return { log };
    }
  );
}
