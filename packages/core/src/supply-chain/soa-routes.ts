/**
 * Statement of Applicability (SoA) Routes
 *
 * REST endpoints for generating and retrieving compliance SoA documents.
 * All routes are gated by the `compliance_governance` enterprise license feature.
 *
 * GET  /api/v1/compliance/soa                  — JSON SoA for all frameworks
 * GET  /api/v1/compliance/soa/markdown         — Markdown SoA for all frameworks
 * GET  /api/v1/compliance/soa/summary          — Framework coverage statistics
 * GET  /api/v1/compliance/soa/:framework       — JSON SoA for one framework
 * GET  /api/v1/compliance/soa/:framework/markdown — Markdown SoA for one framework
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SecureYeoman } from '../secureyeoman.js';
import { licenseGuard } from '../licensing/license-guard.js';
import { sendError } from '../utils/errors.js';
import { ALL_FRAMEWORKS, type ComplianceFramework } from './compliance-mapping.js';
import { generateSoAJson, generateSoAMarkdown } from './soa-generator.js';
import { getAllFrameworkSummaries, getFrameworkSummary } from './compliance-mapping.js';

export interface SoaRoutesOptions {
  secureYeoman: SecureYeoman;
}

export function registerSoaRoutes(app: FastifyInstance, opts: SoaRoutesOptions): void {
  const { secureYeoman } = opts;
  const guardOpts = licenseGuard('compliance_governance', secureYeoman);

  // ── GET /api/v1/compliance/soa ──────────────────────────────────────────────
  // Returns the full SoA for all frameworks as JSON.

  app.get(
    '/api/v1/compliance/soa',
    guardOpts,
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const doc = generateSoAJson();
        return reply.send(doc);
      } catch (err) {
        return sendError(reply, 500, err instanceof Error ? err.message : 'Failed to generate SoA');
      }
    }
  );

  // ── GET /api/v1/compliance/soa/markdown ────────────────────────────────────
  // Returns the full SoA for all frameworks as Markdown.
  // Must be registered before /:framework to avoid the literal "markdown" being
  // consumed as a framework parameter.

  app.get(
    '/api/v1/compliance/soa/markdown',
    guardOpts,
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const md = generateSoAMarkdown();
        return reply.header('Content-Type', 'text/markdown; charset=utf-8').send(md);
      } catch (err) {
        return sendError(
          reply,
          500,
          err instanceof Error ? err.message : 'Failed to generate Markdown SoA'
        );
      }
    }
  );

  // ── GET /api/v1/compliance/soa/summary ─────────────────────────────────────
  // Returns per-framework coverage statistics.

  app.get(
    '/api/v1/compliance/soa/summary',
    guardOpts,
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const summaries = getAllFrameworkSummaries();
        return reply.send({ summaries });
      } catch (err) {
        return sendError(
          reply,
          500,
          err instanceof Error ? err.message : 'Failed to generate SoA summary'
        );
      }
    }
  );

  // ── GET /api/v1/compliance/soa/:framework ──────────────────────────────────
  // Returns the SoA for a single framework as JSON.

  app.get(
    '/api/v1/compliance/soa/:framework',
    guardOpts,
    async (request: FastifyRequest<{ Params: { framework: string } }>, reply: FastifyReply) => {
      const { framework } = request.params;
      if (!(ALL_FRAMEWORKS as readonly string[]).includes(framework)) {
        return sendError(
          reply,
          400,
          `Unknown framework: "${framework}". Valid frameworks: ${ALL_FRAMEWORKS.join(', ')}`
        );
      }
      try {
        const doc = generateSoAJson(framework as ComplianceFramework);
        return reply.send(doc);
      } catch (err) {
        return sendError(reply, 500, err instanceof Error ? err.message : 'Failed to generate SoA');
      }
    }
  );

  // ── GET /api/v1/compliance/soa/:framework/markdown ─────────────────────────
  // Returns the SoA for a single framework as Markdown.

  app.get(
    '/api/v1/compliance/soa/:framework/markdown',
    guardOpts,
    async (request: FastifyRequest<{ Params: { framework: string } }>, reply: FastifyReply) => {
      const { framework } = request.params;
      if (!(ALL_FRAMEWORKS as readonly string[]).includes(framework)) {
        return sendError(
          reply,
          400,
          `Unknown framework: "${framework}". Valid frameworks: ${ALL_FRAMEWORKS.join(', ')}`
        );
      }
      try {
        const md = generateSoAMarkdown(framework as ComplianceFramework);
        return reply.header('Content-Type', 'text/markdown; charset=utf-8').send(md);
      } catch (err) {
        return sendError(
          reply,
          500,
          err instanceof Error ? err.message : 'Failed to generate Markdown SoA'
        );
      }
    }
  );

  // ── GET /api/v1/compliance/soa/:framework/summary ──────────────────────────
  // Returns coverage statistics for a single framework.

  app.get(
    '/api/v1/compliance/soa/:framework/summary',
    guardOpts,
    async (request: FastifyRequest<{ Params: { framework: string } }>, reply: FastifyReply) => {
      const { framework } = request.params;
      if (!(ALL_FRAMEWORKS as readonly string[]).includes(framework)) {
        return sendError(
          reply,
          400,
          `Unknown framework: "${framework}". Valid frameworks: ${ALL_FRAMEWORKS.join(', ')}`
        );
      }
      try {
        const summary = getFrameworkSummary(framework as ComplianceFramework);
        return reply.send({ summary });
      } catch (err) {
        return sendError(
          reply,
          500,
          err instanceof Error ? err.message : 'Failed to generate framework summary'
        );
      }
    }
  );
}
