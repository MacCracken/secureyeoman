/**
 * Swarm Routes — REST API for agent swarm orchestration.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SwarmManager } from './swarm-manager.js';
import { sendError } from '../utils/errors.js';

export function registerSwarmRoutes(
  app: FastifyInstance,
  opts: { swarmManager: SwarmManager }
): void {
  const { swarmManager } = opts;

  // ── Template routes ──────────────────────────────────────────

  app.get(
    '/api/v1/agents/swarms/templates',
    async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>) => {
      const limit = request.query.limit ? Number(request.query.limit) : undefined;
      const offset = request.query.offset ? Number(request.query.offset) : undefined;
      return swarmManager.listTemplates({ limit, offset });
    }
  );

  app.get(
    '/api/v1/agents/swarms/templates/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const template = await swarmManager.getTemplate(request.params.id);
      if (!template) {
        return sendError(reply, 404, 'Template not found');
      }
      return { template };
    }
  );

  app.post(
    '/api/v1/agents/swarms/templates',
    async (
      request: FastifyRequest<{
        Body: {
          name: string;
          description?: string;
          strategy: string;
          roles: { role: string; profileName: string; description?: string }[];
          coordinatorProfile?: string | null;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const template = await swarmManager.createTemplate({
          name: request.body.name,
          description: request.body.description ?? '',
          strategy: request.body.strategy as 'sequential' | 'parallel' | 'dynamic',
          roles: request.body.roles.map((r) => ({
            role: r.role,
            profileName: r.profileName,
            description: r.description ?? '',
          })),
          coordinatorProfile: request.body.coordinatorProfile ?? null,
        });
        return reply.code(201).send({ template });
      } catch (err) {
        return sendError(
          reply,
          400,
          err instanceof Error ? err.message : 'Failed to create template'
        );
      }
    }
  );

  app.delete(
    '/api/v1/agents/swarms/templates/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const existing = await swarmManager.getTemplate(request.params.id);
      if (!existing) {
        return sendError(reply, 404, 'Template not found');
      }
      if (existing.isBuiltin) {
        return sendError(reply, 403, 'Cannot delete built-in templates');
      }
      const deleted = await swarmManager.deleteTemplate(request.params.id);
      if (!deleted) {
        return sendError(reply, 500, 'Failed to delete template');
      }
      return reply.code(204).send();
    }
  );

  // ── Run routes ───────────────────────────────────────────────

  app.post(
    '/api/v1/agents/swarms',
    async (
      request: FastifyRequest<{
        Body: {
          templateId: string;
          task: string;
          context?: string;
          tokenBudget?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const run = await swarmManager.executeSwarm({
          templateId: request.body.templateId,
          task: request.body.task,
          context: request.body.context,
          tokenBudget: request.body.tokenBudget,
        });
        return reply.code(201).send({ run });
      } catch (err) {
        return sendError(reply, 400, err instanceof Error ? err.message : 'Swarm execution failed');
      }
    }
  );

  app.get(
    '/api/v1/agents/swarms',
    async (
      request: FastifyRequest<{
        Querystring: { status?: string; limit?: string; offset?: string };
      }>
    ) => {
      const q = request.query;
      return swarmManager.listSwarmRuns({
        status: q.status,
        limit: q.limit ? Number(q.limit) : undefined,
        offset: q.offset ? Number(q.offset) : undefined,
      });
    }
  );

  app.get(
    '/api/v1/agents/swarms/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const run = await swarmManager.getSwarmRun(request.params.id);
      if (!run) {
        return sendError(reply, 404, 'Swarm run not found');
      }
      return { run };
    }
  );

  app.post(
    '/api/v1/agents/swarms/:id/cancel',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await swarmManager.cancelSwarm(request.params.id);
        return { success: true };
      } catch (err) {
        return sendError(reply, 400, err instanceof Error ? err.message : 'Cancel failed');
      }
    }
  );
}
