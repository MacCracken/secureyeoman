/**
 * Guardrail Pipeline Routes — Phase 143
 *
 * Admin endpoints for managing filters and viewing metrics.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { GuardrailPipeline } from './guardrail-pipeline.js';
import { sendError } from '../utils/errors.js';
import type { SecureYeoman } from '../secureyeoman.js';
import { requiresLicense } from '../licensing/license-guard.js';

export interface GuardrailPipelineRouteOptions {
  pipeline: GuardrailPipeline;
  secureYeoman?: SecureYeoman;
}

export function registerGuardrailPipelineRoutes(
  app: FastifyInstance,
  opts: GuardrailPipelineRouteOptions
): void {
  const { pipeline, secureYeoman } = opts;
  const featureGuardOpts = (
    secureYeoman
      ? {
          preHandler: [
            requiresLicense('compliance_governance', () => secureYeoman.getLicenseManager()),
          ],
        }
      : {}
  ) as Record<string, unknown>;

  // ── List registered filters ────────────────────────────────────────

  app.get(
    '/api/v1/security/guardrail-pipeline/filters',
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const filters = pipeline.listFilters().map((f) => ({
        id: f.id,
        name: f.name,
        priority: f.priority,
        enabled: f.enabled,
        hasInputHook: !!f.onInput,
        hasOutputHook: !!f.onOutput,
      }));
      return reply.send({ filters });
    }
  );

  // ── Toggle filter enabled/disabled ─────────────────────────────────

  app.put(
    '/api/v1/security/guardrail-pipeline/filters/:filterId/toggle',
    async (
      req: FastifyRequest<{ Params: { filterId: string }; Body: { enabled: boolean } }>,
      reply: FastifyReply
    ) => {
      const { filterId } = req.params;
      const { enabled } = req.body ?? {};
      const filter = pipeline.getFilter(filterId);
      if (!filter) {
        return sendError(reply, 404, `Filter not found: ${filterId}`);
      }
      if (typeof enabled !== 'boolean') {
        return sendError(reply, 400, 'enabled must be a boolean');
      }
      filter.enabled = enabled;
      return reply.send({ id: filter.id, enabled: filter.enabled });
    }
  );

  // ── Get pipeline metrics ───────────────────────────────────────────

  app.get(
    '/api/v1/security/guardrail-pipeline/metrics',
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const snapshot = pipeline.metrics.getSnapshot();
      return reply.send(snapshot);
    }
  );

  // ── Reset metrics ──────────────────────────────────────────────────

  app.post(
    '/api/v1/security/guardrail-pipeline/metrics/reset',
    featureGuardOpts,
    async (_req: FastifyRequest, reply: FastifyReply) => {
      pipeline.metrics.reset();
      return reply.send({ ok: true });
    }
  );

  // ── Dry-run test endpoint ──────────────────────────────────────────

  app.post(
    '/api/v1/security/guardrail-pipeline/test',
    async (
      req: FastifyRequest<{
        Body: { text: string; direction?: 'input' | 'output'; personalityId?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { text, direction = 'output', personalityId } = req.body ?? {};
      if (!text || typeof text !== 'string') {
        return sendError(reply, 400, 'text is required');
      }

      const result =
        direction === 'input'
          ? await pipeline.runInput(
              text,
              { source: 'test', personalityId },
              { dryRun: true, disabledFilters: [] }
            )
          : await pipeline.runOutput(
              text,
              { source: 'test', personalityId },
              { dryRun: true, disabledFilters: [] }
            );

      return reply.send({
        passed: result.passed,
        text: result.text,
        findings: result.findings,
        filterMetrics: result.filterMetrics,
      });
    }
  );
}
