/**
 * Responsible AI Routes — Phase 130
 *
 * REST endpoints for cohort error analysis, fairness metrics,
 * SHAP explainability, data provenance, and model cards.
 */

import type { FastifyInstance } from 'fastify';
import type { SecureYeoman } from '../secureyeoman.js';
import { sendError, toErrorMessage } from '../utils/errors.js';
import type {
  CohortAnalysisCreate,
  FairnessReportCreate,
  ShapExplanationCreate,
  ProvenanceQuery,
  ModelCardCreate,
} from '@secureyeoman/shared';

export interface ResponsibleAiRoutesOptions {
  secureYeoman: SecureYeoman;
}

export function registerResponsibleAiRoutes(
  app: FastifyInstance,
  opts: ResponsibleAiRoutesOptions
): void {
  const { secureYeoman } = opts;

  function getManager() {
    const mgr = secureYeoman.getResponsibleAiManager();
    if (!mgr) throw new Error('Responsible AI module not initialized');
    return mgr;
  }

  // ── Cohort Error Analysis ─────────────────────────────────────

  app.post('/api/v1/responsible-ai/cohort-analysis', async (request, reply) => {
    try {
      const body = request.body as CohortAnalysisCreate;
      const result = await getManager().runCohortAnalysis(body);
      return reply.send(result);
    } catch (err) {
      return sendError(reply, 400, toErrorMessage(err));
    }
  });

  app.get('/api/v1/responsible-ai/cohort-analysis/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const result = await getManager().getCohortAnalysis(id);
      if (!result) return sendError(reply, 404, 'Cohort analysis not found');
      return reply.send(result);
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  app.get('/api/v1/responsible-ai/cohort-analysis', async (request, reply) => {
    try {
      const { evalRunId } = request.query as { evalRunId: string };
      if (!evalRunId) return sendError(reply, 400, 'evalRunId query parameter required');
      const results = await getManager().listCohortAnalyses(evalRunId);
      return reply.send({ items: results });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── Fairness Metrics ──────────────────────────────────────────

  app.post('/api/v1/responsible-ai/fairness', async (request, reply) => {
    try {
      const body = request.body as FairnessReportCreate;
      const result = await getManager().computeFairnessReport(body);
      return reply.send(result);
    } catch (err) {
      return sendError(reply, 400, toErrorMessage(err));
    }
  });

  app.get('/api/v1/responsible-ai/fairness/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const result = await getManager().getFairnessReport(id);
      if (!result) return sendError(reply, 404, 'Fairness report not found');
      return reply.send(result);
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  app.get('/api/v1/responsible-ai/fairness', async (request, reply) => {
    try {
      const { evalRunId } = request.query as { evalRunId: string };
      if (!evalRunId) return sendError(reply, 400, 'evalRunId query parameter required');
      const results = await getManager().listFairnessReports(evalRunId);
      return reply.send({ items: results });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── SHAP Explainability ───────────────────────────────────────

  app.post('/api/v1/responsible-ai/shap', async (request, reply) => {
    try {
      const body = request.body as ShapExplanationCreate;
      const result = await getManager().computeShapExplanation(body);
      return reply.send(result);
    } catch (err) {
      return sendError(reply, 400, toErrorMessage(err));
    }
  });

  app.get('/api/v1/responsible-ai/shap/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const result = await getManager().getShapExplanation(id);
      if (!result) return sendError(reply, 404, 'SHAP explanation not found');
      return reply.send(result);
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  app.get('/api/v1/responsible-ai/shap', async (request, reply) => {
    try {
      const q = request.query as { evalRunId?: string; modelName?: string; limit?: string };
      const results = await getManager().listShapExplanations({
        evalRunId: q.evalRunId,
        modelName: q.modelName,
        limit: q.limit ? parseInt(q.limit, 10) : undefined,
      });
      return reply.send({ items: results });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── Data Provenance ───────────────────────────────────────────

  app.get('/api/v1/responsible-ai/provenance', async (request, reply) => {
    try {
      const q = request.query as Record<string, string | undefined>;
      const results = await getManager().queryProvenance({
        datasetId: q.datasetId,
        conversationId: q.conversationId,
        userId: q.userId,
        status: q.status as ProvenanceQuery['status'],
        limit: q.limit ? Number(q.limit) : 100,
        offset: q.offset ? Number(q.offset) : 0,
      });
      return reply.send({ items: results });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  app.get('/api/v1/responsible-ai/provenance/summary/:datasetId', async (request, reply) => {
    try {
      const { datasetId } = request.params as { datasetId: string };
      const summary = await getManager().getProvenanceSummary(datasetId);
      return reply.send(summary);
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  app.get('/api/v1/responsible-ai/provenance/user/:userId', async (request, reply) => {
    try {
      const { userId } = request.params as { userId: string };
      const entries = await getManager().findUserProvenance(userId);
      return reply.send({ items: entries });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  app.post('/api/v1/responsible-ai/provenance/redact/:userId', async (request, reply) => {
    try {
      const { userId } = request.params as { userId: string };
      const count = await getManager().redactUserData(userId);
      return reply.send({ redacted: count });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── Model Cards ───────────────────────────────────────────────

  app.post('/api/v1/responsible-ai/model-cards', async (request, reply) => {
    try {
      const body = request.body as ModelCardCreate;
      const card = await getManager().generateModelCard(body);
      return reply.code(201).send(card);
    } catch (err) {
      return sendError(reply, 400, toErrorMessage(err));
    }
  });

  app.get('/api/v1/responsible-ai/model-cards/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const card = await getManager().getModelCard(id);
      if (!card) return sendError(reply, 404, 'Model card not found');
      return reply.send(card);
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  app.get('/api/v1/responsible-ai/model-cards', async (request, reply) => {
    try {
      const q = request.query as { personalityId?: string; limit?: string };
      const cards = await getManager().listModelCards({
        personalityId: q.personalityId,
        limit: q.limit ? parseInt(q.limit, 10) : undefined,
      });
      return reply.send({ items: cards });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  app.get('/api/v1/responsible-ai/model-cards/:id/markdown', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const card = await getManager().getModelCard(id);
      if (!card) return sendError(reply, 404, 'Model card not found');
      const markdown = getManager().renderModelCardMarkdown(card);
      return reply.type('text/markdown').send(markdown);
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  app.get(
    '/api/v1/responsible-ai/model-cards/by-personality/:personalityId',
    async (request, reply) => {
      try {
        const { personalityId } = request.params as { personalityId: string };
        const card = await getManager().getModelCardByPersonality(personalityId);
        if (!card) return sendError(reply, 404, 'No model card found for personality');
        return reply.send(card);
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );
}
