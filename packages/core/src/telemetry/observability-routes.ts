/**
 * Observability Routes (Phase 139)
 *
 * GET  /api/v1/observability/cost-attribution      — cost breakdown
 * GET  /api/v1/observability/cost-attribution/csv   — CSV export
 * GET  /api/v1/observability/budgets                — budget status
 * POST /api/v1/observability/budgets                — create budget
 * DELETE /api/v1/observability/budgets/:id           — remove budget
 * GET  /api/v1/observability/slos                   — SLO status
 * POST /api/v1/observability/slos                   — define SLO
 * DELETE /api/v1/observability/slos/:id              — remove SLO
 * GET  /api/v1/observability/siem/status            — SIEM forwarder health
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { CostAttributionTracker, CostBudget } from './cost-attribution.js';
import type { SloMonitor, SloDefinition } from './slo-monitor.js';
import type { SiemForwarder } from './siem/siem-forwarder.js';
import type { SecureYeoman } from '../secureyeoman.js';
import { sendError, toErrorMessage } from '../utils/errors.js';
import { licenseGuard } from '../licensing/license-guard.js';

export interface ObservabilityRoutesOptions {
  costTracker: CostAttributionTracker;
  sloMonitor: SloMonitor;
  siemForwarder?: SiemForwarder;
  secureYeoman?: SecureYeoman;
}

export function registerObservabilityRoutes(
  app: FastifyInstance,
  opts: ObservabilityRoutesOptions
): void {
  const { costTracker, sloMonitor, siemForwarder, secureYeoman } = opts;
  const guardOpts = licenseGuard('advanced_observability', secureYeoman);

  // ── Cost Attribution ─────────────────────────────────────────────

  app.get(
    '/api/v1/observability/cost-attribution',
    guardOpts,
    async (
      request: FastifyRequest<{
        Querystring: { tenantId?: string; startMs?: string; endMs?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { tenantId, startMs, endMs } = request.query as Record<string, string | undefined>;
        const tenant = tenantId ?? 'default';
        const now = Date.now();
        const start = startMs ? Number(startMs) : now - 86_400_000;
        const end = endMs ? Number(endMs) : now;
        const summary = costTracker.getSummary(tenant, start, end);
        return reply.send({ summary });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  app.get(
    '/api/v1/observability/cost-attribution/csv',
    guardOpts,
    async (
      request: FastifyRequest<{
        Querystring: { tenantId?: string; startMs?: string; endMs?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { tenantId, startMs, endMs } = request.query as Record<string, string | undefined>;
        const csv = costTracker.exportCsv(
          tenantId,
          startMs ? Number(startMs) : undefined,
          endMs ? Number(endMs) : undefined
        );
        return reply
          .header('Content-Type', 'text/csv')
          .header('Content-Disposition', 'attachment; filename="cost-attribution.csv"')
          .send(csv);
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── Budgets ──────────────────────────────────────────────────────

  app.get(
    '/api/v1/observability/budgets',
    guardOpts,
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const statuses = costTracker.checkBudgets();
        return reply.send({ budgets: statuses });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  app.post(
    '/api/v1/observability/budgets',
    guardOpts,
    async (request: FastifyRequest<{ Body: CostBudget }>, reply: FastifyReply) => {
      try {
        costTracker.setBudget(request.body);
        return reply.code(201).send({ ok: true });
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  app.delete(
    '/api/v1/observability/budgets/:id',
    guardOpts,
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const removed = costTracker.removeBudget(request.params.id);
        if (!removed) return sendError(reply, 404, 'Budget not found');
        return reply.code(204).send();
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── SLOs ─────────────────────────────────────────────────────────

  app.get(
    '/api/v1/observability/slos',
    guardOpts,
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const statuses = sloMonitor.evaluate();
        return reply.send({ slos: statuses });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  app.post(
    '/api/v1/observability/slos',
    guardOpts,
    async (request: FastifyRequest<{ Body: SloDefinition }>, reply: FastifyReply) => {
      try {
        sloMonitor.addDefinition(request.body);
        return reply.code(201).send({ ok: true });
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  app.delete(
    '/api/v1/observability/slos/:id',
    guardOpts,
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const removed = sloMonitor.removeDefinition(request.params.id);
        if (!removed) return sendError(reply, 404, 'SLO not found');
        return reply.code(204).send();
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── SIEM Status ──────────────────────────────────────────────────

  app.get(
    '/api/v1/observability/siem/status',
    guardOpts,
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!siemForwarder) {
          return reply.send({ enabled: false });
        }
        return reply.send({ enabled: true, stats: siemForwarder.stats });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );
}
