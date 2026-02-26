/**
 * Risk Assessment Routes — Phase 53: Risk Assessment & Reporting System
 *
 * REST endpoints for assessments, external feeds, and external findings.
 */

import type { FastifyInstance } from 'fastify';
import type { RiskAssessmentManager } from './risk-assessment-manager.js';
import { sendError, toErrorMessage } from '../utils/errors.js';

export interface RiskAssessmentRoutesOptions {
  riskAssessmentManager: RiskAssessmentManager;
}

const VALID_FORMATS = ['json', 'html', 'markdown', 'csv'] as const;
type ReportFormat = (typeof VALID_FORMATS)[number];

const FORMAT_CONTENT_TYPE: Record<ReportFormat, string> = {
  json: 'application/json',
  html: 'text/html',
  markdown: 'text/markdown',
  csv: 'text/csv; charset=utf-8',
};

export function registerRiskAssessmentRoutes(
  app: FastifyInstance,
  opts: RiskAssessmentRoutesOptions
): void {
  const { riskAssessmentManager: mgr } = opts;

  // ── POST /api/v1/risk/assessments ─────────────────────────────────────────

  app.post('/api/v1/risk/assessments', async (req, reply) => {
    const body = req.body as {
      name?: string;
      assessmentTypes?: string[];
      windowDays?: number;
      options?: Record<string, unknown>;
    };

    if (!body?.name) {
      return sendError(reply, 400, 'name is required');
    }

    const createdBy = (req as any).authUser?.userId;

    try {
      const assessment = await mgr.runAssessment(
        {
          name: body.name,
          assessmentTypes: (body.assessmentTypes as any) ?? [
            'security',
            'autonomy',
            'governance',
            'infrastructure',
            'external',
          ],
          windowDays: body.windowDays ?? 7,
          options: body.options,
        },
        createdBy
      );
      return reply.code(201).send({ assessment });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── GET /api/v1/risk/assessments ──────────────────────────────────────────

  app.get('/api/v1/risk/assessments', async (req, reply) => {
    const query = req.query as { limit?: string; offset?: string; status?: string };
    const limit = Math.min(Number(query.limit ?? 50), 100);
    const offset = Math.max(Number(query.offset ?? 0), 0);

    try {
      const result = await mgr.listAssessments({
        limit,
        offset,
        status: query.status,
      });
      return reply.send(result);
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── GET /api/v1/risk/assessments/:id ──────────────────────────────────────

  app.get('/api/v1/risk/assessments/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const assessment = await mgr.getAssessment(id);
      if (!assessment) return sendError(reply, 404, 'Assessment not found');
      return reply.send({ assessment });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── GET /api/v1/risk/assessments/:id/report/:fmt ──────────────────────────

  app.get('/api/v1/risk/assessments/:id/report/:fmt', async (req, reply) => {
    const { id, fmt } = req.params as { id: string; fmt: string };

    if (!VALID_FORMATS.includes(fmt as ReportFormat)) {
      return sendError(reply, 400, `format must be one of: ${VALID_FORMATS.join(', ')}`);
    }

    try {
      const assessment = await mgr.getAssessment(id);
      if (!assessment) return sendError(reply, 404, 'Assessment not found');
      if (assessment.status !== 'completed') {
        return sendError(reply, 409, 'Assessment is not yet completed');
      }

      const content = await mgr.generateReport(assessment, fmt as ReportFormat);
      const contentType = FORMAT_CONTENT_TYPE[fmt as ReportFormat];

      void reply.header('Content-Type', contentType);
      if (fmt === 'csv') {
        void reply.header('Content-Disposition', `attachment; filename="risk-report-${id}.csv"`);
      }
      return reply.send(content);
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── GET /api/v1/risk/feeds ────────────────────────────────────────────────

  app.get('/api/v1/risk/feeds', async (_req, reply) => {
    try {
      const feeds = await mgr.listFeeds();
      return reply.send({ feeds });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── POST /api/v1/risk/feeds ───────────────────────────────────────────────

  app.post('/api/v1/risk/feeds', async (req, reply) => {
    const body = req.body as {
      name?: string;
      description?: string;
      sourceType?: string;
      category?: string;
      enabled?: boolean;
      config?: Record<string, unknown>;
    };

    if (!body?.name) return sendError(reply, 400, 'name is required');
    if (!body?.sourceType) return sendError(reply, 400, 'sourceType is required');
    if (!body?.category) return sendError(reply, 400, 'category is required');

    try {
      const feed = await mgr.createFeed({
        name: body.name,
        description: body.description,
        sourceType: body.sourceType as any,
        category: body.category as any,
        enabled: body.enabled ?? true,
        config: body.config,
      });
      return reply.code(201).send({ feed });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── DELETE /api/v1/risk/feeds/:feedId ─────────────────────────────────────

  app.delete('/api/v1/risk/feeds/:feedId', async (req, reply) => {
    const { feedId } = req.params as { feedId: string };
    try {
      await mgr.deleteFeed(feedId);
      return reply.code(204).send();
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── POST /api/v1/risk/feeds/:feedId/ingest ────────────────────────────────

  app.post('/api/v1/risk/feeds/:feedId/ingest', async (req, reply) => {
    const { feedId } = req.params as { feedId: string };
    const body = req.body as unknown;

    if (!Array.isArray(body)) {
      return sendError(reply, 400, 'Request body must be a JSON array of findings');
    }

    try {
      const result = await mgr.ingestFindings(feedId, body as any[]);
      return reply.send(result);
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── GET /api/v1/risk/findings ─────────────────────────────────────────────

  app.get('/api/v1/risk/findings', async (req, reply) => {
    const query = req.query as {
      feedId?: string;
      status?: string;
      severity?: string;
      limit?: string;
      offset?: string;
    };
    const limit = Math.min(Number(query.limit ?? 50), 200);
    const offset = Math.max(Number(query.offset ?? 0), 0);

    try {
      const result = await mgr.listFindings({
        feedId: query.feedId,
        status: query.status,
        severity: query.severity,
        limit,
        offset,
      });
      return reply.send(result);
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── POST /api/v1/risk/findings ────────────────────────────────────────────

  app.post('/api/v1/risk/findings', async (req, reply) => {
    const body = req.body as {
      feedId?: string;
      sourceRef?: string;
      category?: string;
      severity?: string;
      title?: string;
      description?: string;
      affectedResource?: string;
      recommendation?: string;
      evidence?: Record<string, unknown>;
      sourceDate?: number;
    };

    if (!body?.category) return sendError(reply, 400, 'category is required');
    if (!body?.severity) return sendError(reply, 400, 'severity is required');
    if (!body?.title) return sendError(reply, 400, 'title is required');

    try {
      const finding = await mgr.createFinding({
        feedId: body.feedId,
        sourceRef: body.sourceRef,
        category: body.category as any,
        severity: body.severity as any,
        title: body.title,
        description: body.description,
        affectedResource: body.affectedResource,
        recommendation: body.recommendation,
        evidence: body.evidence,
        sourceDate: body.sourceDate,
      });
      return reply.code(201).send({ finding });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── PATCH /api/v1/risk/findings/:id/acknowledge ───────────────────────────

  app.patch('/api/v1/risk/findings/:id/acknowledge', async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId = (req as any).authUser?.userId;

    try {
      const finding = await mgr.acknowledgeFinding(id, userId);
      if (!finding) return sendError(reply, 404, 'Finding not found');
      return reply.send({ finding });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── PATCH /api/v1/risk/findings/:id/resolve ───────────────────────────────

  app.patch('/api/v1/risk/findings/:id/resolve', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const finding = await mgr.resolveFinding(id);
      if (!finding) return sendError(reply, 404, 'Finding not found');
      return reply.send({ finding });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });
}
