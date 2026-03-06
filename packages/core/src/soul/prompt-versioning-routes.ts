/**
 * Prompt Versioning Routes — Phase 142
 *
 * REST endpoints for prompt A/B testing, template variables,
 * prompt linting, and changelog.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PromptAbTestManager, PromptAbTestCreate } from './prompt-ab-test.js';
import type { PromptTemplateEngine, TemplateVariable } from './prompt-template.js';
import type { PromptLinter } from './prompt-linter.js';
import type { PromptChangelog, ChangeCategory } from './prompt-changelog.js';
import { toErrorMessage, sendError } from '../utils/errors.js';

export interface PromptVersioningRoutesOptions {
  abTestManager?: PromptAbTestManager;
  templateEngine?: PromptTemplateEngine;
  linter?: PromptLinter;
  changelog?: PromptChangelog;
}

export async function registerPromptVersioningRoutes(
  app: FastifyInstance,
  opts: PromptVersioningRoutesOptions
): Promise<void> {
  const { abTestManager, templateEngine, linter, changelog } = opts;

  // ── A/B Testing ──────────────────────────────────────────

  app.post(
    '/api/v1/soul/prompt-tests',
    async (request: FastifyRequest<{ Body: PromptAbTestCreate }>, reply: FastifyReply) => {
      if (!abTestManager) return sendError(reply, 503, 'Prompt A/B testing not available');

      try {
        const test = abTestManager.create(request.body);
        return abTestManager.serialize(test);
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  app.get(
    '/api/v1/soul/prompt-tests',
    async (
      request: FastifyRequest<{ Querystring: { personalityId?: string } }>,
      _reply: FastifyReply
    ) => {
      if (!abTestManager) return { tests: [] };

      const tests = abTestManager.list(request.query.personalityId);
      return { tests: tests.map((t) => abTestManager.serialize(t)) };
    }
  );

  app.get(
    '/api/v1/soul/prompt-tests/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!abTestManager) return sendError(reply, 503, 'Prompt A/B testing not available');

      const test = abTestManager.get(request.params.id);
      if (!test) return sendError(reply, 404, 'Test not found');
      return abTestManager.serialize(test);
    }
  );

  app.post(
    '/api/v1/soul/prompt-tests/:id/evaluate',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!abTestManager) return sendError(reply, 503, 'Prompt A/B testing not available');

      try {
        const result = abTestManager.evaluate(request.params.id);
        return result;
      } catch (err) {
        return sendError(reply, 404, toErrorMessage(err));
      }
    }
  );

  app.post(
    '/api/v1/soul/prompt-tests/:id/complete',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { winnerVariantId: string } }>,
      reply: FastifyReply
    ) => {
      if (!abTestManager) return sendError(reply, 503, 'Prompt A/B testing not available');

      const test = abTestManager.complete(request.params.id, request.body.winnerVariantId);
      if (!test) return sendError(reply, 404, 'Test not found or not running');
      return abTestManager.serialize(test);
    }
  );

  app.post(
    '/api/v1/soul/prompt-tests/:id/score',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { conversationId: string; score: number };
      }>,
      reply: FastifyReply
    ) => {
      if (!abTestManager) return sendError(reply, 503, 'Prompt A/B testing not available');

      const { conversationId, score } = request.body;
      if (!conversationId || typeof score !== 'number') {
        return sendError(reply, 400, 'conversationId and score are required');
      }

      abTestManager.recordScore(request.params.id, conversationId, score);
      return { ok: true };
    }
  );

  // ── Template Variables ──────────────────────────────────

  app.get(
    '/api/v1/soul/template-variables',
    async (_request: FastifyRequest, _reply: FastifyReply) => {
      if (!templateEngine) return { variables: [] };
      return { variables: templateEngine.getVariables() };
    }
  );

  app.post(
    '/api/v1/soul/template-variables',
    async (request: FastifyRequest<{ Body: TemplateVariable }>, reply: FastifyReply) => {
      if (!templateEngine) return sendError(reply, 503, 'Template engine not available');

      const { name, value, source, description } = request.body;
      if (!name || value == null) {
        return sendError(reply, 400, 'name and value are required');
      }

      templateEngine.register({ name, value, source: source ?? 'user', description });
      return { ok: true };
    }
  );

  app.delete(
    '/api/v1/soul/template-variables/:name',
    async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
      if (!templateEngine) return sendError(reply, 503, 'Template engine not available');

      const removed = templateEngine.unregister(request.params.name);
      if (!removed) return sendError(reply, 404, 'Variable not found');
      return { ok: true };
    }
  );

  app.post(
    '/api/v1/soul/template-expand',
    async (
      request: FastifyRequest<{ Body: { text: string; context?: Record<string, string> } }>,
      reply: FastifyReply
    ) => {
      if (!templateEngine) return sendError(reply, 503, 'Template engine not available');

      const { text, context } = request.body;
      if (!text) return sendError(reply, 400, 'text is required');

      const result = templateEngine.expand(text, context);
      return result;
    }
  );

  // ── Prompt Linting ──────────────────────────────────────

  app.post(
    '/api/v1/soul/lint',
    async (
      request: FastifyRequest<{ Body: { prompt: string } }>,
      reply: FastifyReply
    ) => {
      if (!linter) return sendError(reply, 503, 'Prompt linter not available');

      const { prompt } = request.body;
      if (!prompt && prompt !== '') return sendError(reply, 400, 'prompt is required');

      const results = linter.lint(prompt);
      return {
        results,
        errorCount: results.filter((r) => r.severity === 'error').length,
        warningCount: results.filter((r) => r.severity === 'warning').length,
        infoCount: results.filter((r) => r.severity === 'info').length,
      };
    }
  );

  // ── Changelog ──────────────────────────────────────────

  app.get(
    '/api/v1/soul/prompt-changelog',
    async (
      request: FastifyRequest<{
        Querystring: { personalityId?: string; limit?: string };
      }>,
      _reply: FastifyReply
    ) => {
      if (!changelog) return { entries: [] };

      const { personalityId, limit } = request.query;
      const entries = changelog.getEntries(personalityId, limit ? Number(limit) : undefined);
      return { entries };
    }
  );

  app.post(
    '/api/v1/soul/prompt-changelog',
    async (
      request: FastifyRequest<{
        Body: {
          personalityId: string;
          author: string;
          category: ChangeCategory;
          rationale: string;
          changedFields: string[];
          currentPrompt: string;
          previousPrompt?: string;
          diffSummary?: string;
          versionTag?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      if (!changelog) return sendError(reply, 503, 'Prompt changelog not available');

      const { personalityId, author, category, rationale, changedFields, currentPrompt } =
        request.body;

      if (!personalityId || !author || !rationale || !currentPrompt) {
        return sendError(reply, 400, 'personalityId, author, rationale, and currentPrompt are required');
      }

      const entry = changelog.addEntry({
        personalityId,
        author,
        category: category ?? 'other',
        rationale,
        changedFields: changedFields ?? [],
        currentPrompt,
        previousPrompt: request.body.previousPrompt ?? null,
        diffSummary: request.body.diffSummary ?? null,
        versionTag: request.body.versionTag ?? null,
      });

      return entry;
    }
  );

  app.get(
    '/api/v1/soul/prompt-changelog/export',
    async (
      request: FastifyRequest<{
        Querystring: {
          format?: string;
          personalityId?: string;
          fromDate?: string;
          toDate?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      if (!changelog) return sendError(reply, 503, 'Prompt changelog not available');

      const format = (request.query.format === 'csv' ? 'csv' : 'json') as 'json' | 'csv';
      const exported = changelog.export({
        format,
        personalityId: request.query.personalityId,
        fromDate: request.query.fromDate ? Number(request.query.fromDate) : undefined,
        toDate: request.query.toDate ? Number(request.query.toDate) : undefined,
      });

      if (format === 'csv') {
        void reply.header('Content-Type', 'text/csv');
        void reply.header('Content-Disposition', 'attachment; filename="prompt-changelog.csv"');
      }

      return exported;
    }
  );
}
