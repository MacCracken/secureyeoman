/**
 * Workflow Routes — REST API for the workflow engine.
 *
 * NOTE: /api/v1/workflows/runs/:runId is registered BEFORE /api/v1/workflows/:id
 * to avoid route parameter collision in Fastify.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { WorkflowManager } from './workflow-manager.js';
import { sendError } from '../utils/errors.js';

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
        });
        return reply.code(201).send({ definition });
      } catch (err) {
        return sendError(reply, 400, err instanceof Error ? err.message : 'Failed to create workflow');
      }
    }
  );

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
      const definition = await workflowManager.updateDefinition(request.params.id, request.body as any);
      if (!definition) return sendError(reply, 404, 'Workflow not found');
      return { definition };
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
        return sendError(reply, 400, err instanceof Error ? err.message : 'Failed to trigger workflow');
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
