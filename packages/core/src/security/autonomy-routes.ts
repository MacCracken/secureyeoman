/**
 * Autonomy Audit Routes — Phase 49
 *
 * REST endpoints for L1–L5 autonomy level overview, audit run management,
 * and emergency stop registry.
 */

import type { FastifyInstance } from 'fastify';
import type { AutonomyAuditManager } from './autonomy-audit.js';
import type { AuditItemStatus } from './autonomy-audit.js';
import type { AuditChain } from '../logging/audit-chain.js';
import { sendError, toErrorMessage } from '../utils/errors.js';

export interface AutonomyRoutesOptions {
  autonomyAuditManager: AutonomyAuditManager;
  auditChain?: AuditChain | null;
  /** Returns whether workflow orchestration is currently enabled. */
  getAllowWorkflows?: () => boolean;
}

export function registerAutonomyRoutes(app: FastifyInstance, opts: AutonomyRoutesOptions): void {
  const { autonomyAuditManager, getAllowWorkflows } = opts;

  // ── GET /api/v1/autonomy/overview ─────────────────────────────────────────
  app.get('/api/v1/autonomy/overview', async (_req, reply) => {
    try {
      const includeWorkflows = getAllowWorkflows ? getAllowWorkflows() : true;
      const overview = await autonomyAuditManager.getOverview({ includeWorkflows });
      return reply.send({ overview });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── GET /api/v1/autonomy/audits ────────────────────────────────────────────
  app.get('/api/v1/autonomy/audits', async (_req, reply) => {
    try {
      const runs = await autonomyAuditManager.listAuditRuns();
      return reply.send({ runs });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── POST /api/v1/autonomy/audits ───────────────────────────────────────────
  app.post('/api/v1/autonomy/audits', async (req, reply) => {
    const body = req.body as { name?: string };
    if (!body?.name) {
      return sendError(reply, 400, 'name is required');
    }
    try {
      const createdBy = (req as any).authUser?.userId;
      const run = await autonomyAuditManager.createAuditRun(body.name, createdBy);
      return reply.code(201).send({ run });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── GET /api/v1/autonomy/audits/:id ───────────────────────────────────────
  app.get<{ Params: { id: string } }>('/api/v1/autonomy/audits/:id', async (req, reply) => {
    const { id } = req.params;
    try {
      const run = await autonomyAuditManager.getAuditRun(id);
      if (!run) return sendError(reply, 404, 'Audit run not found');
      return reply.send({ run });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── PUT /api/v1/autonomy/audits/:id/items/:itemId ─────────────────────────
  app.put<{ Params: { id: string; itemId: string } }>('/api/v1/autonomy/audits/:id/items/:itemId', async (req, reply) => {
    const { id, itemId } = req.params;
    const body = req.body as { status?: string; note?: string };
    if (!body?.status) {
      return sendError(reply, 400, 'status is required');
    }
    const validStatuses: AuditItemStatus[] = ['pending', 'pass', 'fail', 'deferred'];
    if (!validStatuses.includes(body.status as AuditItemStatus)) {
      return sendError(reply, 400, `status must be one of: ${validStatuses.join(', ')}`);
    }
    try {
      const run = await autonomyAuditManager.updateAuditItem(id, itemId, {
        status: body.status as AuditItemStatus,
        note: body.note ?? '',
      });
      if (!run) return sendError(reply, 404, 'Audit run or item not found');
      return reply.send({ run });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── POST /api/v1/autonomy/audits/:id/finalize ─────────────────────────────
  app.post<{ Params: { id: string } }>('/api/v1/autonomy/audits/:id/finalize', async (req, reply) => {
    const { id } = req.params;
    try {
      const run = await autonomyAuditManager.finalizeRun(id);
      if (!run) return sendError(reply, 404, 'Audit run not found');
      return reply.send({ run });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── POST /api/v1/autonomy/emergency-stop/:type/:id ────────────────────────
  app.post<{ Params: { type: string; id: string } }>('/api/v1/autonomy/emergency-stop/:type/:id', async (req, reply) => {
    const { type, id } = req.params;
    const authUser = (req as any).authUser;

    // Admin role required
    if (authUser?.role !== 'admin') {
      return sendError(reply, 403, 'Admin role required for emergency stop');
    }

    if (type !== 'skill' && type !== 'workflow') {
      return sendError(reply, 400, 'type must be skill or workflow');
    }

    try {
      await autonomyAuditManager.emergencyStop(type, id, authUser?.userId);
      return reply.send({ success: true, type, id });
    } catch (err) {
      return sendError(reply, 400, toErrorMessage(err));
    }
  });
}
