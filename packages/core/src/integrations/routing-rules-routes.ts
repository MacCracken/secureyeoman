/**
 * Routing Rules Routes — REST API for cross-integration routing rule management.
 *
 * GET    /api/v1/routing-rules
 * GET    /api/v1/routing-rules/:id
 * POST   /api/v1/routing-rules
 * PUT    /api/v1/routing-rules/:id
 * DELETE /api/v1/routing-rules/:id
 * POST   /api/v1/routing-rules/:id/test
 *
 * ADR 087
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { RoutingRulesStorage } from './routing-rules-storage.js';
import type { RoutingRulesManager } from './routing-rules-manager.js';
import type { RoutingRuleCreate, RoutingRuleUpdate, RoutingRuleDryRun } from '@secureyeoman/shared';
import { sendError } from '../utils/errors.js';

export interface RoutingRulesRoutesOptions {
  storage: RoutingRulesStorage;
  manager: RoutingRulesManager;
}

export function registerRoutingRulesRoutes(
  app: FastifyInstance,
  opts: RoutingRulesRoutesOptions
): void {
  const { storage, manager } = opts;

  // ── List ──────────────────────────────────────────────────────────────────

  app.get(
    '/api/v1/routing-rules',
    async (
      request: FastifyRequest<{
        Querystring: { enabled?: string; limit?: string; offset?: string };
      }>
    ) => {
      const { enabled, limit, offset } = request.query;
      return storage.list({
        enabled: enabled !== undefined ? enabled === 'true' : undefined,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      });
    }
  );

  // ── Get single ────────────────────────────────────────────────────────────

  app.get(
    '/api/v1/routing-rules/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const rule = await storage.get(request.params.id);
      if (!rule) return sendError(reply, 404, `Routing rule not found: ${request.params.id}`);
      return rule;
    }
  );

  // ── Create ────────────────────────────────────────────────────────────────

  app.post(
    '/api/v1/routing-rules',
    async (request: FastifyRequest<{ Body: RoutingRuleCreate }>, reply: FastifyReply) => {
      const data = request.body;
      if (!data?.actionType) {
        return sendError(reply, 400, 'actionType is required');
      }
      if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
        return sendError(reply, 400, 'name is required');
      }
      const rule = await storage.create(data);
      return reply.code(201).send(rule);
    }
  );

  // ── Update ────────────────────────────────────────────────────────────────

  app.put(
    '/api/v1/routing-rules/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: RoutingRuleUpdate }>,
      reply: FastifyReply
    ) => {
      const updated = await storage.update(request.params.id, request.body ?? {});
      if (!updated) return sendError(reply, 404, `Routing rule not found: ${request.params.id}`);
      return updated;
    }
  );

  // ── Delete ────────────────────────────────────────────────────────────────

  app.delete(
    '/api/v1/routing-rules/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const deleted = await storage.delete(request.params.id);
      if (!deleted) return sendError(reply, 404, `Routing rule not found: ${request.params.id}`);
      return reply.code(204).send();
    }
  );

  // ── Dry-run / test ────────────────────────────────────────────────────────

  app.post(
    '/api/v1/routing-rules/:id/test',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: RoutingRuleDryRun }>,
      reply: FastifyReply
    ) => {
      const rule = await storage.get(request.params.id);
      if (!rule) return sendError(reply, 404, `Routing rule not found: ${request.params.id}`);

      const params: RoutingRuleDryRun = {
        platform: request.body?.platform ?? '',
        integrationId: request.body?.integrationId,
        chatId: request.body?.chatId,
        senderId: request.body?.senderId,
        text: request.body?.text ?? '',
        direction: request.body?.direction ?? 'inbound',
      };

      if (!params.platform) {
        return sendError(reply, 400, 'platform is required for dry-run');
      }

      return manager.testRule(rule, params);
    }
  );
}
