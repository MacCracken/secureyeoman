/**
 * Workflow Routes — REST API for the workflow engine.
 *
 * NOTE: /api/v1/workflows/runs/:runId is registered BEFORE /api/v1/workflows/:id
 * to avoid route parameter collision in Fastify. Similarly, /export and /import
 * are registered before /:id for the same reason.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { WorkflowManager } from './workflow-manager.js';
import { sendError } from '../utils/errors.js';
import type { WorkflowExport } from '@secureyeoman/shared';

/** Known integration keywords to detect from step config strings. */
const INTEGRATION_KEYWORDS = [
  'github', 'gmail', 'slack', 'discord', 'telegram', 'notion',
  'jira', 'stripe', 'twitter', 'youtube', 'spotify', 'linear',
  'airtable', 'figma', 'gitlab', 'azure', 'aws',
] as const;

export function registerWorkflowRoutes(
  app: FastifyInstance,
  opts: { workflowManager: WorkflowManager }
): void {
  const { workflowManager } = opts;

  // ── Run detail (registered before /:id to avoid collision) ───

  app.get(
    '/api/v1/workflows/runs/:runId',
    async (request: FastifyRequest<{ Params: { runId: string } }>, reply: FastifyReply) => {
      const run = await workflowManager.getRun(request.params.runId);
      if (!run) return sendError(reply, 404, 'Run not found');
      return { run };
    }
  );

  app.delete(
    '/api/v1/workflows/runs/:runId',
    async (request: FastifyRequest<{ Params: { runId: string } }>, reply: FastifyReply) => {
      const run = await workflowManager.cancelRun(request.params.runId);
      if (!run) return sendError(reply, 404, 'Run not found');
      return { run };
    }
  );

  // ── Definition CRUD ───────────────────────────────────────────

  app.get(
    '/api/v1/workflows',
    async (
      request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>,
      _reply: FastifyReply
    ) => {
      const limit = request.query.limit ? Number(request.query.limit) : undefined;
      const offset = request.query.offset ? Number(request.query.offset) : undefined;
      return workflowManager.listDefinitions({ limit, offset });
    }
  );

  app.post(
    '/api/v1/workflows',
    async (
      request: FastifyRequest<{
        Body: {
          name: string;
          description?: string;
          steps?: unknown[];
          edges?: unknown[];
          triggers?: unknown[];
          isEnabled?: boolean;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const definition = await workflowManager.createDefinition({
          name: request.body.name,
          description: request.body.description,
          steps: (request.body.steps ?? []) as any,
          edges: (request.body.edges ?? []) as any,
          triggers: (request.body.triggers ?? []) as any,
          isEnabled: request.body.isEnabled ?? true,
          version: 1,
          createdBy: 'system',
          autonomyLevel: 'L2',
        });
        return reply.code(201).send({ definition });
      } catch (err) {
        return sendError(
          reply,
          400,
          err instanceof Error ? err.message : 'Failed to create workflow'
        );
      }
    }
  );

  // ── Export a workflow definition ──────────────────────────────

  app.get(
    '/api/v1/workflows/:id/export',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const definition = await workflowManager.getDefinition(request.params.id);
      if (!definition) return sendError(reply, 404, 'Workflow not found');

      // Infer required tools from step config toolName fields
      const tools: string[] = [];
      const integrations: string[] = [];

      for (const step of definition.steps ?? []) {
        const cfg = (step as any).config ?? {};
        if (typeof cfg.toolName === 'string' && !tools.includes(cfg.toolName)) {
          tools.push(cfg.toolName);
        }
        // Scan all string values in the step for integration keywords
        const cfgStr = JSON.stringify(cfg).toLowerCase();
        for (const kw of INTEGRATION_KEYWORDS) {
          if (cfgStr.includes(kw) && !integrations.includes(kw)) {
            integrations.push(kw);
          }
        }
      }

      const exportPayload: WorkflowExport = {
        exportedAt: Date.now(),
        requires: {
          ...(tools.length > 0 && { tools }),
          ...(integrations.length > 0 && { integrations }),
        },
        workflow: definition,
      };

      return reply.code(200).send(exportPayload);
    }
  );

  // ── Import a workflow definition ──────────────────────────────

  app.post(
    '/api/v1/workflows/import',
    async (
      request: FastifyRequest<{ Body: { workflow: WorkflowExport; overwrite?: boolean } }>,
      reply: FastifyReply
    ) => {
      const { workflow: payload } = request.body ?? {};
      if (!payload?.workflow?.name) {
        return sendError(reply, 400, 'Invalid export: missing workflow.name');
      }
      if (!Array.isArray(payload.workflow.steps)) {
        return sendError(reply, 400, 'Invalid export: workflow.steps must be an array');
      }

      const requires = payload.requires ?? {};
      const compatibility = { compatible: true, gaps: {} as Record<string, string[]> };
      // Warn about missing integrations (informational — we don't block import)
      if (requires.integrations?.length) {
        compatibility.gaps.integrations = requires.integrations;
      }
      if (requires.tools?.length) {
        compatibility.gaps.tools = requires.tools;
      }
      compatibility.compatible =
        Object.keys(compatibility.gaps).length === 0;

      try {
        const definition = await workflowManager.createDefinition({
          name: payload.workflow.name,
          description: payload.workflow.description ?? '',
          steps: (payload.workflow.steps ?? []) as any,
          edges: (payload.workflow.edges ?? []) as any,
          triggers: (payload.workflow.triggers ?? []) as any,
          isEnabled: true,
          version: 1,
          createdBy: 'imported',
          autonomyLevel: payload.workflow.autonomyLevel ?? 'L2',
        } as any);
        return reply.code(201).send({ definition, compatibility });
      } catch (err) {
        return sendError(reply, 400, err instanceof Error ? err.message : 'Import failed');
      }
    }
  );

  // ── Get a single workflow ─────────────────────────────────────

  app.get(
    '/api/v1/workflows/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const definition = await workflowManager.getDefinition(request.params.id);
      if (!definition) return sendError(reply, 404, 'Workflow not found');
      return { definition };
    }
  );

  app.put(
    '/api/v1/workflows/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: Record<string, unknown>;
      }>,
      reply: FastifyReply
    ) => {
      // Capture previous level for escalation detection
      let prevLevel: string | undefined;
      try {
        const prev = await workflowManager.getDefinition(request.params.id);
        prevLevel = prev?.autonomyLevel;
      } catch {
        /* best-effort */
      }

      const definition = await workflowManager.updateDefinition(
        request.params.id,
        request.body as any
      );
      if (!definition) return sendError(reply, 404, 'Workflow not found');

      const warnings: string[] = [];
      const newLevel = (request.body as any).autonomyLevel;
      if (prevLevel && newLevel && newLevel !== prevLevel) {
        const levelNum = (l: string) => Number(l.replace('L', ''));
        if (levelNum(newLevel) > levelNum(prevLevel)) {
          warnings.push(
            `Autonomy escalated from ${prevLevel} to ${newLevel} — confirm this changes the human oversight level`
          );
        }
      }

      const response: { definition: typeof definition; warnings?: string[] } = { definition };
      if (warnings.length > 0) response.warnings = warnings;
      return response;
    }
  );

  app.delete(
    '/api/v1/workflows/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const deleted = await workflowManager.deleteDefinition(request.params.id);
      if (!deleted) return sendError(reply, 404, 'Workflow not found');
      return reply.code(204).send();
    }
  );

  // ── Trigger a run ─────────────────────────────────────────────

  app.post(
    '/api/v1/workflows/:id/run',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { input?: Record<string, unknown>; triggeredBy?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const run = await workflowManager.triggerRun(
          request.params.id,
          request.body?.input,
          request.body?.triggeredBy ?? 'manual'
        );
        return reply.code(202).send({ run });
      } catch (err) {
        return sendError(
          reply,
          400,
          err instanceof Error ? err.message : 'Failed to trigger workflow'
        );
      }
    }
  );

  // ── List runs for a workflow ──────────────────────────────────

  app.get(
    '/api/v1/workflows/:id/runs',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { limit?: string; offset?: string };
      }>,
      _reply: FastifyReply
    ) => {
      const limit = request.query.limit ? Number(request.query.limit) : undefined;
      const offset = request.query.offset ? Number(request.query.offset) : undefined;
      return workflowManager.listRuns(request.params.id, { limit, offset });
    }
  );
}
