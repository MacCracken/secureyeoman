/**
 * Quota Routes — Per-Tenant Rate Limiting & Token Budgets (enterprise-gated)
 *
 * GET    /api/v1/tenants/:tenantId/quotas       — get tenant limits and current usage
 * PUT    /api/v1/tenants/:tenantId/quotas       — set/update tenant limits
 * DELETE /api/v1/tenants/:tenantId/quotas       — remove custom limits (revert to defaults)
 * GET    /api/v1/tenants/:tenantId/usage        — get usage summary
 * POST   /api/v1/tenants/:tenantId/usage/reset  — reset counters
 * GET    /api/v1/tenants/:tenantId/usage/tokens — get token usage details
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SecureYeoman } from '../secureyeoman.js';
import type { TenantQuotaManager } from './quota-manager.js';
import { licenseGuard } from '../licensing/license-guard.js';
import { sendError, toErrorMessage } from '../utils/errors.js';

export interface QuotaRoutesOptions {
  quotaManager: TenantQuotaManager;
  secureYeoman?: SecureYeoman;
}

export function registerQuotaRoutes(app: FastifyInstance, opts: QuotaRoutesOptions): void {
  const { quotaManager, secureYeoman } = opts;
  const guardOpts = licenseGuard('multi_tenancy', secureYeoman);

  // GET /api/v1/tenants/:tenantId/quotas — get tenant limits and current usage
  app.get(
    '/api/v1/tenants/:tenantId/quotas',
    guardOpts,
    async (request: FastifyRequest<{ Params: { tenantId: string } }>, reply: FastifyReply) => {
      try {
        const { tenantId } = request.params;
        const [limits, summary] = await Promise.all([
          quotaManager.getLimits(tenantId),
          quotaManager.getUsageSummary(tenantId),
        ]);
        return reply.send({ limits, usage: summary });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // PUT /api/v1/tenants/:tenantId/quotas — set/update tenant limits
  app.put(
    '/api/v1/tenants/:tenantId/quotas',
    guardOpts as Record<string, unknown>,
    async (
      request: FastifyRequest<{
        Params: { tenantId: string };
        Body: {
          requestsPerMinute?: number;
          requestsPerHour?: number;
          tokensPerDay?: number;
          tokensPerMonth?: number;
          maxConcurrentRequests?: number;
          customLimits?: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { tenantId } = request.params;
        const body = request.body ?? {};
        const limits = await quotaManager.setLimits(tenantId, body);
        return reply.send({ limits });
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  // DELETE /api/v1/tenants/:tenantId/quotas — remove custom limits
  app.delete(
    '/api/v1/tenants/:tenantId/quotas',
    guardOpts,
    async (request: FastifyRequest<{ Params: { tenantId: string } }>, reply: FastifyReply) => {
      try {
        const { tenantId } = request.params;
        await quotaManager.deleteLimits(tenantId);
        return reply.code(204).send();
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // GET /api/v1/tenants/:tenantId/usage — get usage summary
  app.get(
    '/api/v1/tenants/:tenantId/usage',
    guardOpts,
    async (
      request: FastifyRequest<{
        Params: { tenantId: string };
        Querystring: { from?: string; to?: string; model?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { tenantId } = request.params;
        const { from, to, model } = request.query;
        const opts = {
          ...(from ? { from: Number(from) } : {}),
          ...(to ? { to: Number(to) } : {}),
          ...(model ? { model } : {}),
        };
        const summary = await quotaManager.getUsageSummary(tenantId, opts);
        return reply.send({ summary });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // POST /api/v1/tenants/:tenantId/usage/reset — reset counters
  app.post(
    '/api/v1/tenants/:tenantId/usage/reset',
    guardOpts as Record<string, unknown>,
    async (request: FastifyRequest<{ Params: { tenantId: string } }>, reply: FastifyReply) => {
      try {
        const { tenantId } = request.params;
        await quotaManager.resetCounters(tenantId);
        return reply.send({ ok: true });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // GET /api/v1/tenants/:tenantId/usage/tokens — get token usage details
  app.get(
    '/api/v1/tenants/:tenantId/usage/tokens',
    guardOpts,
    async (
      request: FastifyRequest<{
        Params: { tenantId: string };
        Querystring: { from?: string; to?: string; model?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { tenantId } = request.params;
        const { from, to, model } = request.query;
        const opts = {
          ...(from ? { from: Number(from) } : {}),
          ...(to ? { to: Number(to) } : {}),
          ...(model ? { model } : {}),
        };
        const [records, summary] = await Promise.all([
          quotaManager.getTokenUsage(tenantId, opts),
          quotaManager.getTokenUsageSummary(tenantId, opts),
        ]);
        return reply.send({ records, summary });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );
}
