/**
 * ATHI Routes — Phase 107-F: ATHI Threat Governance Framework
 *
 * REST endpoints for ATHI threat scenarios, risk matrix, and executive summary.
 */

import type { FastifyInstance } from 'fastify';
import type { AthiManager } from './athi-manager.js';
import { sendError, toErrorMessage } from '../utils/errors.js';
import { AthiScenarioCreateSchema, AthiScenarioUpdateSchema } from '@secureyeoman/shared';

export interface AthiRoutesOptions {
  athiManager: AthiManager;
}

export function registerAthiRoutes(app: FastifyInstance, opts: AthiRoutesOptions): void {
  const { athiManager: mgr } = opts;

  // ── POST /api/v1/security/athi/scenarios ─────────────────────────────────

  app.post('/api/v1/security/athi/scenarios', async (req, reply) => {
    try {
      const parsed = AthiScenarioCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(reply, 400, parsed.error.issues.map((i) => i.message).join('; '));
      }
      const createdBy = (req as any).authUser?.userId;
      const scenario = await mgr.createScenario(parsed.data, createdBy);
      return reply.code(201).send({ scenario });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── GET /api/v1/security/athi/scenarios ──────────────────────────────────

  app.get('/api/v1/security/athi/scenarios', async (req, reply) => {
    const query = req.query as {
      actor?: string;
      status?: string;
      orgId?: string;
      limit?: string;
      offset?: string;
    };
    try {
      const result = await mgr.listScenarios({
        actor: query.actor,
        status: query.status,
        orgId: query.orgId,
        limit: query.limit ? Math.min(Number(query.limit), 100) : undefined,
        offset: query.offset ? Math.max(Number(query.offset), 0) : undefined,
      });
      return reply.send(result);
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── GET /api/v1/security/athi/scenarios/:id ──────────────────────────────

  app.get('/api/v1/security/athi/scenarios/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const scenario = await mgr.getScenario(id);
      if (!scenario) return sendError(reply, 404, 'Scenario not found');
      return reply.send({ scenario });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── PUT /api/v1/security/athi/scenarios/:id ──────────────────────────────

  app.put('/api/v1/security/athi/scenarios/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const parsed = AthiScenarioUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(reply, 400, parsed.error.issues.map((i) => i.message).join('; '));
      }
      const scenario = await mgr.updateScenario(id, parsed.data);
      if (!scenario) return sendError(reply, 404, 'Scenario not found');
      return reply.send({ scenario });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── DELETE /api/v1/security/athi/scenarios/:id ───────────────────────────

  app.delete('/api/v1/security/athi/scenarios/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const deleted = await mgr.deleteScenario(id);
      if (!deleted) return sendError(reply, 404, 'Scenario not found');
      return reply.code(204).send();
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── POST /api/v1/security/athi/scenarios/:id/link-events ─────────────────

  app.post('/api/v1/security/athi/scenarios/:id/link-events', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const body = req.body as { eventIds?: string[] };
      if (!Array.isArray(body?.eventIds) || body.eventIds.length === 0) {
        return sendError(reply, 400, 'eventIds must be a non-empty array of strings');
      }
      const scenario = await mgr.linkEvents(id, body.eventIds);
      if (!scenario) return sendError(reply, 404, 'Scenario not found');
      return reply.send({ scenario });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── GET /api/v1/security/athi/scenarios/by-technique/:technique ────────

  app.get('/api/v1/security/athi/scenarios/by-technique/:technique', async (req, reply) => {
    const { technique } = req.params as { technique: string };
    try {
      const scenarios = await mgr.findScenariosForTechnique(technique);
      return reply.send({ scenarios });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── GET /api/v1/security/athi/matrix ─────────────────────────────────────

  app.get('/api/v1/security/athi/matrix', async (req, reply) => {
    const { orgId } = req.query as { orgId?: string };
    try {
      const matrix = await mgr.getRiskMatrix(orgId);
      return reply.send({ matrix });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── GET /api/v1/security/athi/top-risks ──────────────────────────────────

  app.get('/api/v1/security/athi/top-risks', async (req, reply) => {
    const { limit, orgId } = req.query as { limit?: string; orgId?: string };
    try {
      const topRisks = await mgr.getTopRisks(
        limit ? Math.min(Number(limit), 50) : 10,
        orgId
      );
      return reply.send({ topRisks });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── GET /api/v1/security/athi/summary ────────────────────────────────────

  app.get('/api/v1/security/athi/summary', async (req, reply) => {
    const { orgId } = req.query as { orgId?: string };
    try {
      const summary = await mgr.generateExecutiveSummary(orgId);
      return reply.send({ summary });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });
}
