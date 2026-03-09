/**
 * SRA Routes — Phase 123: Security Reference Architecture
 *
 * REST endpoints for SRA blueprints, assessments, compliance mappings,
 * and executive summary.
 */

import type { FastifyInstance } from 'fastify';
import type { SraManager } from './sra-manager.js';
import { sendError, toErrorMessage } from '../utils/errors.js';
import { parsePagination } from '../utils/pagination.js';
import type { SecureYeoman } from '../secureyeoman.js';
import { licenseGuard } from '../licensing/license-guard.js';
import {
  SraBlueprintCreateSchema,
  SraBlueprintUpdateSchema,
  SraAssessmentCreateSchema,
  SraAssessmentUpdateSchema,
} from '@secureyeoman/shared';

export interface SraRoutesOptions {
  sraManager: SraManager;
  secureYeoman?: SecureYeoman;
}

export function registerSraRoutes(app: FastifyInstance, opts: SraRoutesOptions): void {
  const { sraManager: mgr, secureYeoman } = opts;
  const featureGuardOpts = licenseGuard('compliance_governance', secureYeoman);

  // ── POST /api/v1/security/sra/blueprints ─────────────────────────────────

  app.post('/api/v1/security/sra/blueprints', featureGuardOpts, async (req, reply) => {
    try {
      const parsed = SraBlueprintCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(reply, 400, parsed.error.issues.map((i) => i.message).join('; '));
      }
      const createdBy = (req as any).authUser?.userId;
      const blueprint = await mgr.createBlueprint(parsed.data, createdBy);
      return reply.code(201).send({ blueprint });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── GET /api/v1/security/sra/blueprints ──────────────────────────────────

  app.get('/api/v1/security/sra/blueprints', async (req, reply) => {
    const query = req.query as {
      provider?: string;
      framework?: string;
      status?: string;
      orgId?: string;
      limit?: string;
      offset?: string;
    };
    try {
      const { limit, offset } = parsePagination(query, { maxLimit: 100 });
      const result = await mgr.listBlueprints({
        provider: query.provider,
        framework: query.framework,
        status: query.status,
        orgId: query.orgId,
        limit,
        offset,
      });
      return reply.send(result);
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── GET /api/v1/security/sra/blueprints/:id ──────────────────────────────

  app.get<{ Params: { id: string } }>('/api/v1/security/sra/blueprints/:id', async (req, reply) => {
    const { id } = req.params;
    try {
      const blueprint = await mgr.getBlueprint(id);
      if (!blueprint) return sendError(reply, 404, 'Blueprint not found');
      return reply.send({ blueprint });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── PUT /api/v1/security/sra/blueprints/:id ──────────────────────────────

  app.put<{ Params: { id: string } }>('/api/v1/security/sra/blueprints/:id', async (req, reply) => {
    const { id } = req.params;
    try {
      const parsed = SraBlueprintUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(reply, 400, parsed.error.issues.map((i) => i.message).join('; '));
      }
      const blueprint = await mgr.updateBlueprint(id, parsed.data);
      if (!blueprint) return sendError(reply, 404, 'Blueprint not found');
      return reply.send({ blueprint });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── DELETE /api/v1/security/sra/blueprints/:id ───────────────────────────

  app.delete<{ Params: { id: string } }>(
    '/api/v1/security/sra/blueprints/:id',
    async (req, reply) => {
      const { id } = req.params;
      try {
        const deleted = await mgr.deleteBlueprint(id);
        if (!deleted) return sendError(reply, 404, 'Blueprint not found');
        return reply.code(204).send();
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── POST /api/v1/security/sra/assessments ────────────────────────────────

  app.post('/api/v1/security/sra/assessments', async (req, reply) => {
    try {
      const parsed = SraAssessmentCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(reply, 400, parsed.error.issues.map((i) => i.message).join('; '));
      }
      const createdBy = (req as any).authUser?.userId;
      const assessment = await mgr.createAssessment(parsed.data, createdBy);
      return reply.code(201).send({ assessment });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── GET /api/v1/security/sra/assessments ─────────────────────────────────

  app.get('/api/v1/security/sra/assessments', async (req, reply) => {
    const query = req.query as {
      blueprintId?: string;
      status?: string;
      orgId?: string;
      limit?: string;
      offset?: string;
    };
    try {
      const { limit, offset } = parsePagination(query, { maxLimit: 100 });
      const result = await mgr.listAssessments({
        blueprintId: query.blueprintId,
        status: query.status,
        orgId: query.orgId,
        limit,
        offset,
      });
      return reply.send(result);
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── GET /api/v1/security/sra/assessments/:id ─────────────────────────────

  app.get<{ Params: { id: string } }>(
    '/api/v1/security/sra/assessments/:id',
    async (req, reply) => {
      const { id } = req.params;
      try {
        const assessment = await mgr.getAssessment(id);
        if (!assessment) return sendError(reply, 404, 'Assessment not found');
        return reply.send({ assessment });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── PUT /api/v1/security/sra/assessments/:id ─────────────────────────────

  app.put<{ Params: { id: string } }>(
    '/api/v1/security/sra/assessments/:id',
    async (req, reply) => {
      const { id } = req.params;
      try {
        const parsed = SraAssessmentUpdateSchema.safeParse(req.body);
        if (!parsed.success) {
          return sendError(reply, 400, parsed.error.issues.map((i) => i.message).join('; '));
        }
        const assessment = await mgr.updateAssessment(id, parsed.data);
        if (!assessment) return sendError(reply, 404, 'Assessment not found');
        return reply.send({ assessment });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── POST /api/v1/security/sra/assessments/:id/generate ───────────────────

  app.post<{ Params: { id: string } }>(
    '/api/v1/security/sra/assessments/:id/generate',
    async (req, reply) => {
      const { id } = req.params;
      try {
        const assessment = await mgr.generateAssessmentSummary(id);
        if (!assessment) return sendError(reply, 404, 'Assessment not found');
        return reply.send({ assessment });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── GET /api/v1/security/sra/compliance-mappings ─────────────────────────

  app.get('/api/v1/security/sra/compliance-mappings', async (req, reply) => {
    const { domain, framework } = req.query as { domain?: string; framework?: string };
    try {
      const mappings = await mgr.getComplianceMappings({ domain, framework });
      return reply.send({ mappings });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── GET /api/v1/security/sra/summary ─────────────────────────────────────

  app.get('/api/v1/security/sra/summary', async (req, reply) => {
    const { orgId } = req.query as { orgId?: string };
    try {
      const summary = await mgr.getSummary(orgId);
      return reply.send({ summary });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });
}
