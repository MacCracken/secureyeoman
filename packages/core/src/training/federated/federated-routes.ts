/**
 * Federated Learning Routes — REST API for federated training sessions.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { FederatedManager } from './federated-manager.js';
import { sendError } from '../../utils/errors.js';
import type { SecureYeoman } from '../../secureyeoman.js';
import { requiresLicense } from '../../licensing/license-guard.js';

export interface FederatedRouteOptions {
  federatedManager: FederatedManager;
  secureYeoman?: SecureYeoman;
}

export function registerFederatedRoutes(app: FastifyInstance, opts: FederatedRouteOptions): void {
  const { federatedManager, secureYeoman } = opts;
  const featureGuardOpts = (
    secureYeoman
      ? {
          preHandler: [
            requiresLicense('adaptive_learning', () => secureYeoman.getLicenseManager()),
          ],
        }
      : {}
  ) as Record<string, unknown>;

  // ── Sessions ───────────────────────────────────────────────────

  app.get(
    '/api/v1/federated/sessions',
    async (
      req: FastifyRequest<{ Querystring: { status?: string; limit?: string; offset?: string } }>,
      reply: FastifyReply
    ) => {
      const q = req.query;
      const result = await federatedManager.listSessions({
        status: q.status,
        limit: q.limit ? parseInt(q.limit, 10) : undefined,
        offset: q.offset ? parseInt(q.offset, 10) : undefined,
      });
      return reply.send(result);
    }
  );

  app.get(
    '/api/v1/federated/sessions/:sessionId',
    async (req: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      const session = await federatedManager.getSession(req.params.sessionId);
      if (!session) return sendError(reply, 404, 'Session not found');
      return reply.send(session);
    }
  );

  app.post(
    '/api/v1/federated/sessions',
    featureGuardOpts,
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const session = await federatedManager.createSession(req.body as any);
        return reply.code(201).send(session);
      } catch (err) {
        return sendError(reply, 400, (err as Error).message);
      }
    }
  );

  app.post(
    '/api/v1/federated/sessions/:sessionId/pause',
    featureGuardOpts,
    async (req: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      try {
        const session = await federatedManager.pauseSession(req.params.sessionId);
        return reply.send(session);
      } catch (err) {
        return sendError(reply, 400, (err as Error).message);
      }
    }
  );

  app.post(
    '/api/v1/federated/sessions/:sessionId/resume',
    featureGuardOpts,
    async (req: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      try {
        const session = await federatedManager.resumeSession(req.params.sessionId);
        return reply.send(session);
      } catch (err) {
        return sendError(reply, 400, (err as Error).message);
      }
    }
  );

  app.post(
    '/api/v1/federated/sessions/:sessionId/cancel',
    featureGuardOpts,
    async (req: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      const cancelled = await federatedManager.cancelSession(req.params.sessionId);
      if (!cancelled) return sendError(reply, 404, 'Session not found');
      return reply.send({ ok: true });
    }
  );

  // ── Participants ───────────────────────────────────────────────

  app.get(
    '/api/v1/federated/participants',
    async (
      req: FastifyRequest<{ Querystring: { status?: string; limit?: string } }>,
      reply: FastifyReply
    ) => {
      const q = req.query;
      const participants = await federatedManager.listParticipants({
        status: q.status,
        limit: q.limit ? parseInt(q.limit, 10) : undefined,
      });
      return reply.send({ items: participants, total: participants.length });
    }
  );

  app.post(
    '/api/v1/federated/participants',
    featureGuardOpts,
    async (req: FastifyRequest, reply: FastifyReply) => {
      const body = req.body as { peerId: string; name: string; datasetSize: number };
      if (!body.peerId || !body.name) {
        return sendError(reply, 400, 'peerId and name are required');
      }
      const participant = await federatedManager.registerParticipant(
        body.peerId,
        body.name,
        body.datasetSize ?? 0
      );
      return reply.code(201).send(participant);
    }
  );

  app.post(
    '/api/v1/federated/participants/:participantId/heartbeat',
    async (req: FastifyRequest<{ Params: { participantId: string } }>, reply: FastifyReply) => {
      const ok = await federatedManager.heartbeat(req.params.participantId);
      if (!ok) return sendError(reply, 404, 'Participant not found');
      return reply.send({ ok: true });
    }
  );

  // ── Rounds ─────────────────────────────────────────────────────

  app.get(
    '/api/v1/federated/sessions/:sessionId/rounds',
    async (
      req: FastifyRequest<{ Params: { sessionId: string }; Querystring: { limit?: string } }>,
      reply: FastifyReply
    ) => {
      const rounds = await federatedManager.listRounds(req.params.sessionId, {
        limit: req.query.limit ? parseInt(req.query.limit, 10) : undefined,
      });
      return reply.send({ items: rounds, total: rounds.length });
    }
  );

  app.post(
    '/api/v1/federated/sessions/:sessionId/rounds',
    featureGuardOpts,
    async (req: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      try {
        const round = await federatedManager.startRound(req.params.sessionId);
        return reply.code(201).send(round);
      } catch (err) {
        return sendError(reply, 400, (err as Error).message);
      }
    }
  );

  app.get(
    '/api/v1/federated/rounds/:roundId',
    async (req: FastifyRequest<{ Params: { roundId: string } }>, reply: FastifyReply) => {
      const round = await federatedManager.getRound(req.params.roundId);
      if (!round) return sendError(reply, 404, 'Round not found');
      return reply.send(round);
    }
  );

  // ── Model Updates ──────────────────────────────────────────────

  app.post(
    '/api/v1/federated/rounds/:roundId/updates',
    featureGuardOpts,
    async (req: FastifyRequest<{ Params: { roundId: string } }>, reply: FastifyReply) => {
      try {
        await federatedManager.submitUpdate(req.params.roundId, req.body as any);
        return reply.code(201).send({ ok: true });
      } catch (err) {
        return sendError(reply, 400, (err as Error).message);
      }
    }
  );

  app.get(
    '/api/v1/federated/rounds/:roundId/updates',
    async (req: FastifyRequest<{ Params: { roundId: string } }>, reply: FastifyReply) => {
      const updates = await federatedManager.getUpdatesForRound(req.params.roundId);
      return reply.send({ items: updates, total: updates.length });
    }
  );

  app.post(
    '/api/v1/federated/rounds/:roundId/aggregate',
    featureGuardOpts,
    async (req: FastifyRequest<{ Params: { roundId: string } }>, reply: FastifyReply) => {
      try {
        const result = await federatedManager.aggregateRound(req.params.roundId);
        return reply.send(result);
      } catch (err) {
        return sendError(reply, 400, (err as Error).message);
      }
    }
  );
}
