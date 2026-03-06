/**
 * Council Routes — REST API for council of AIs deliberation engine.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { CouncilManager } from './council-manager.js';
import { sendError, toErrorMessage } from '../utils/errors.js';
import { parsePagination } from '../utils/pagination.js';
import type { SecureYeoman } from '../secureyeoman.js';
import { requiresLicense } from '../licensing/license-guard.js';

export function registerCouncilRoutes(
  app: FastifyInstance,
  opts: { councilManager: CouncilManager; secureYeoman?: SecureYeoman }
): void {
  const { councilManager, secureYeoman } = opts;
  const featureGuardOpts = (
    secureYeoman
      ? { preHandler: [requiresLicense('swarm_orchestration', () => secureYeoman.getLicenseManager())] }
      : {}
  ) as Record<string, unknown>;

  // ── Catalog routes ─────────────────────────────────────────────

  app.get('/api/v1/agents/councils/catalog', async () => {
    return { templates: councilManager.getCatalog() };
  });

  app.post(
    '/api/v1/agents/councils/catalog/:name/install',
    featureGuardOpts,
    async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
      try {
        const template = await councilManager.installFromCatalog(request.params.name);
        return reply.code(201).send({ template });
      } catch (err) {
        const msg = toErrorMessage(err);
        const status = msg.includes('already installed')
          ? 409
          : msg.includes('not found')
            ? 404
            : 400;
        return sendError(reply, status, msg);
      }
    }
  );

  // ── Template routes ────────────────────────────────────────────

  app.get(
    '/api/v1/agents/councils/templates',
    async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>) => {
      const { limit, offset } = parsePagination(request.query);
      return councilManager.listTemplates({ limit, offset });
    }
  );

  app.get(
    '/api/v1/agents/councils/templates/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const template = await councilManager.getTemplate(request.params.id);
      if (!template) {
        return sendError(reply, 404, 'Template not found');
      }
      return { template };
    }
  );

  app.post(
    '/api/v1/agents/councils/templates',
    async (
      request: FastifyRequest<{
        Body: {
          name: string;
          description?: string;
          members: {
            role: string;
            profileName: string;
            description?: string;
            weight?: number;
            perspective?: string;
          }[];
          facilitatorProfile: string;
          deliberationStrategy?: string;
          maxRounds?: number;
          votingStrategy?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const b = request.body;
        const template = await councilManager.createTemplate({
          name: b.name,
          description: b.description ?? '',
          members: b.members.map((m) => ({
            role: m.role,
            profileName: m.profileName,
            description: m.description ?? '',
            weight: m.weight ?? 1,
            perspective: m.perspective,
          })),
          facilitatorProfile: b.facilitatorProfile,
          deliberationStrategy: (b.deliberationStrategy as any) ?? 'rounds',
          maxRounds: b.maxRounds ?? 3,
          votingStrategy: (b.votingStrategy as any) ?? 'facilitator_judgment',
        });
        return reply.code(201).send({ template });
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  app.put(
    '/api/v1/agents/councils/templates/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          name?: string;
          description?: string;
          members?: {
            role: string;
            profileName: string;
            description?: string;
            weight?: number;
            perspective?: string;
          }[];
          facilitatorProfile?: string;
          deliberationStrategy?: string;
          maxRounds?: number;
          votingStrategy?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const b = request.body;
        const updated = await councilManager.updateTemplate(request.params.id, {
          ...(b.name !== undefined && { name: b.name }),
          ...(b.description !== undefined && { description: b.description }),
          ...(b.members !== undefined && {
            members: b.members.map((m) => ({
              role: m.role,
              profileName: m.profileName,
              description: m.description ?? '',
              weight: m.weight ?? 1,
              perspective: m.perspective,
            })),
          }),
          ...(b.facilitatorProfile !== undefined && { facilitatorProfile: b.facilitatorProfile }),
          ...(b.deliberationStrategy !== undefined && {
            deliberationStrategy: b.deliberationStrategy as any,
          }),
          ...(b.maxRounds !== undefined && { maxRounds: b.maxRounds }),
          ...(b.votingStrategy !== undefined && { votingStrategy: b.votingStrategy as any }),
        });
        if (!updated) return sendError(reply, 404, 'Template not found');
        return { template: updated };
      } catch (err) {
        const msg = toErrorMessage(err);
        return sendError(reply, msg.includes('built-in') ? 403 : 400, msg);
      }
    }
  );

  app.delete(
    '/api/v1/agents/councils/templates/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const existing = await councilManager.getTemplate(request.params.id);
      if (!existing) {
        return sendError(reply, 404, 'Template not found');
      }
      if (existing.isBuiltin) {
        return sendError(reply, 403, 'Cannot delete built-in templates');
      }
      const deleted = await councilManager.deleteTemplate(request.params.id);
      if (!deleted) {
        return sendError(reply, 500, 'Failed to delete template');
      }
      return reply.code(204).send();
    }
  );

  // ── Run routes ─────────────────────────────────────────────────

  app.post(
    '/api/v1/agents/councils',
    async (
      request: FastifyRequest<{
        Body: {
          templateId: string;
          topic: string;
          context?: string;
          tokenBudget?: number;
          maxRounds?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const run = await councilManager.convene({
          templateId: request.body.templateId,
          topic: request.body.topic,
          context: request.body.context,
          tokenBudget: request.body.tokenBudget,
          maxRounds: request.body.maxRounds,
        });
        return reply.code(201).send({ run });
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  app.get(
    '/api/v1/agents/councils/runs',
    async (
      request: FastifyRequest<{
        Querystring: { status?: string; limit?: string; offset?: string };
      }>
    ) => {
      const q = request.query;
      const { limit, offset } = parsePagination(q);
      return councilManager.listRuns({
        status: q.status,
        limit,
        offset,
      });
    }
  );

  app.get(
    '/api/v1/agents/councils/runs/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const run = await councilManager.getRun(request.params.id);
      if (!run) {
        return sendError(reply, 404, 'Council run not found');
      }
      return { run };
    }
  );

  app.post(
    '/api/v1/agents/councils/runs/:id/cancel',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await councilManager.cancelRun(request.params.id);
        return { success: true };
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );
}
