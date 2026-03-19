/**
 * Alert Routes (Phase 83 — Observability)
 *
 * REST CRUD + test-fire for alert rules.
 *
 * GET    /api/v1/alerts/rules            — list rules
 * POST   /api/v1/alerts/rules            — create rule (201)
 * GET    /api/v1/alerts/rules/:id        — get rule
 * PATCH  /api/v1/alerts/rules/:id        — update rule
 * DELETE /api/v1/alerts/rules/:id        — delete rule (204)
 * POST   /api/v1/alerts/rules/:id/test   — test-fire → { fired, value }
 *
 * Auth: notifications/write for CRUD; notifications/read for GET.
 * (Defined in ROUTE_PERMISSIONS in auth-middleware.ts)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AlertManager } from './alert-manager.js';
import type { CreateAlertRuleData, AlertRule } from './alert-storage.js';
import { sendError, toErrorMessage } from '../utils/errors.js';
import type { SecureYeoman } from '../secureyeoman.js';
import { licenseGuard } from '../licensing/license-guard.js';

export interface AlertRoutesOptions {
  alertManager: AlertManager;
  secureYeoman?: SecureYeoman;
}

export function registerAlertRoutes(app: FastifyInstance, opts: AlertRoutesOptions): void {
  const { alertManager, secureYeoman } = opts;
  const alertGuardOpts = licenseGuard('advanced_observability', secureYeoman);

  // GET /api/v1/alerts/rules
  app.get(
    '/api/v1/alerts/rules',
    async (
      request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const limit = request.query.limit ? parseInt(request.query.limit, 10) : undefined;
        const offset = request.query.offset ? parseInt(request.query.offset, 10) : undefined;
        const result = await alertManager.listRules({ limit, offset });
        return reply.send(result);
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // POST /api/v1/alerts/rules
  app.post(
    '/api/v1/alerts/rules',
    alertGuardOpts,
    async (request: FastifyRequest<{ Body: CreateAlertRuleData }>, reply: FastifyReply) => {
      try {
        const rule = await alertManager.createRule(request.body);
        return reply.code(201).send({ rule });
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  // GET /api/v1/alerts/rules/:id
  app.get(
    '/api/v1/alerts/rules/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const rule = await alertManager.getRule(request.params.id);
        if (!rule) return sendError(reply, 404, 'Alert rule not found');
        return reply.send({ rule });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // PATCH /api/v1/alerts/rules/:id
  app.patch(
    '/api/v1/alerts/rules/:id',
    alertGuardOpts,
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: Partial<AlertRule> }>,
      reply: FastifyReply
    ) => {
      try {
        const rule = await alertManager.updateRule(request.params.id, request.body);
        if (!rule) return sendError(reply, 404, 'Alert rule not found');
        return reply.send({ rule });
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  // DELETE /api/v1/alerts/rules/:id
  app.delete(
    '/api/v1/alerts/rules/:id',
    alertGuardOpts,
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const deleted = await alertManager.deleteRule(request.params.id);
        if (!deleted) return sendError(reply, 404, 'Alert rule not found');
        return reply.code(204).send();
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // POST /api/v1/alerts/rules/:id/test
  app.post(
    '/api/v1/alerts/rules/:id/test',
    alertGuardOpts,
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        // Use an empty snapshot — in production callers can POST a body snapshot,
        // but AlertManager.testRule handles missing paths gracefully.
        const body = request.body as Record<string, unknown> | undefined;
        const snapshot = body && typeof body === 'object' ? body : {};
        const result = await alertManager.testRule(request.params.id, snapshot);
        return reply.send(result);
      } catch (err) {
        const msg = toErrorMessage(err);
        if (msg === 'Alert rule not found') return sendError(reply, 404, msg);
        return sendError(reply, 500, msg);
      }
    }
  );
}
