/**
 * Memory Audit Routes — API endpoints for audit management.
 *
 * Phase 118: Memory Audits, Compression & Reorganization.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { MemoryAuditScheduler } from './scheduler.js';
import type { MemoryAuditStorage } from './audit-store.js';
import type { MemoryAuditScope, MemoryAuditStatus } from '@secureyeoman/shared';
import { toErrorMessage, sendError } from '../../utils/errors.js';
import { parsePagination } from '../../utils/pagination.js';

export interface AuditRoutesOptions {
  auditScheduler: MemoryAuditScheduler;
  auditStorage: MemoryAuditStorage;
}

/** Rate limit tracking for audit endpoints. */
const MAX_RATE_LIMIT_ENTRIES = 10_000;
export const rateLimitWindows = new Map<string, { count: number; resetAt: number }>();

const _rateLimitCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitWindows) {
    if (now >= entry.resetAt) rateLimitWindows.delete(key);
  }
}, 60_000);
_rateLimitCleanupTimer.unref?.();

function checkAuditRateLimit(key: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const entry = rateLimitWindows.get(key);

  if (!entry || now >= entry.resetAt) {
    if (rateLimitWindows.size >= MAX_RATE_LIMIT_ENTRIES && !rateLimitWindows.has(key)) {
      const oldest = rateLimitWindows.keys().next().value;
      if (oldest !== undefined) rateLimitWindows.delete(oldest);
    }
    rateLimitWindows.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }

  if (entry.count >= maxPerMinute) return false;
  entry.count++;
  return true;
}

export function registerAuditRoutes(app: FastifyInstance, opts: AuditRoutesOptions): void {
  const { auditScheduler, auditStorage } = opts;

  // ── POST /api/v1/brain/audit/run — Trigger manual audit ────

  app.post(
    '/api/v1/brain/audit/run',
    async (
      request: FastifyRequest<{
        Body: { scope?: string; personalityId?: string };
      }>,
      reply: FastifyReply
    ) => {
      if (!checkAuditRateLimit('audit:run', 3)) {
        return sendError(reply, 429, 'Rate limit exceeded for audit runs');
      }

      const body = request.body ?? {};
      const scope = (body.scope ?? 'daily') as MemoryAuditScope;
      if (!['daily', 'weekly', 'monthly'].includes(scope)) {
        return sendError(reply, 400, 'Scope must be daily, weekly, or monthly');
      }

      try {
        const report = await auditScheduler.runManualAudit(scope, body.personalityId);
        return { report };
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── GET /api/v1/brain/audit/reports — List reports ─────────

  app.get(
    '/api/v1/brain/audit/reports',
    async (
      request: FastifyRequest<{
        Querystring: {
          scope?: string;
          personalityId?: string;
          status?: string;
          limit?: string;
          offset?: string;
        };
      }>
    ) => {
      const q = request.query;
      const { limit, offset } = parsePagination(q, { maxLimit: 200, defaultLimit: 50 });
      const reports = await auditStorage.listReports({
        scope: q.scope as MemoryAuditScope | undefined,
        personalityId: q.personalityId,
        status: q.status as MemoryAuditStatus | undefined,
        limit,
        offset,
      });
      return { reports };
    }
  );

  // ── GET /api/v1/brain/audit/reports/:id — Report detail ────

  app.get(
    '/api/v1/brain/audit/reports/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const report = await auditStorage.getReport(request.params.id);
      if (!report) {
        return sendError(reply, 404, 'Audit report not found');
      }
      return { report };
    }
  );

  // ── POST /api/v1/brain/audit/reports/:id/approve — Approve ─

  app.post(
    '/api/v1/brain/audit/reports/:id/approve',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { approvedBy?: string };
      }>,
      reply: FastifyReply
    ) => {
      const body = request.body ?? {};
      const approvedBy = body.approvedBy ?? 'admin';

      const report = await auditStorage.approveReport(request.params.id, approvedBy);
      if (!report) {
        return sendError(reply, 404, 'Report not found or not pending approval');
      }
      return { report };
    }
  );

  // ── GET /api/v1/brain/audit/schedule — Get schedules ───────

  app.get('/api/v1/brain/audit/schedule', async () => {
    return { schedules: auditScheduler.getSchedules() };
  });

  // ── PUT /api/v1/brain/audit/schedule — Update schedule ─────

  app.put(
    '/api/v1/brain/audit/schedule',
    async (
      request: FastifyRequest<{
        Body: { scope: string; schedule: string };
      }>,
      reply: FastifyReply
    ) => {
      const body = request.body ?? {};
      const scope = body.scope as MemoryAuditScope;
      if (!['daily', 'weekly', 'monthly'].includes(scope)) {
        return sendError(reply, 400, 'Scope must be daily, weekly, or monthly');
      }
      if (!body.schedule || typeof body.schedule !== 'string') {
        return sendError(reply, 400, 'Schedule cron expression is required');
      }

      await auditScheduler.setSchedule(scope, body.schedule);
      return { schedules: auditScheduler.getSchedules() };
    }
  );

  // ── GET /api/v1/brain/audit/health — Health score ──────────

  app.get(
    '/api/v1/brain/audit/health',
    async (
      request: FastifyRequest<{
        Querystring: { personalityId?: string };
      }>
    ) => {
      const health = await auditStorage.getHealthMetrics(request.query.personalityId);
      return { health };
    }
  );
}
