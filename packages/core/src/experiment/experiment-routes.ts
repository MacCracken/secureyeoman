/**
 * Experiment Routes — REST API for A/B testing
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ExperimentManager } from './manager.js';
import { toErrorMessage, sendError } from '../utils/errors.js';
import { parsePagination } from '../utils/pagination.js';
import { requiresLicense } from '../licensing/license-guard.js';
import type { SecureYeoman } from '../secureyeoman.js';

export interface ExperimentRoutesOptions {
  experimentManager: ExperimentManager;
  secureYeoman?: SecureYeoman;
}

export function registerExperimentRoutes(
  app: FastifyInstance,
  opts: ExperimentRoutesOptions
): void {
  const { experimentManager, secureYeoman } = opts;

  const featureGuardOpts = (
    secureYeoman
      ? { preHandler: [requiresLicense('prompt_engineering', () => secureYeoman.getLicenseManager())] }
      : {}
  ) as Record<string, unknown>;

  app.get(
    '/api/v1/experiments',
    async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>) => {
      const { limit, offset } = parsePagination(request.query);
      return experimentManager.list({ limit, offset });
    }
  );

  app.post(
    '/api/v1/experiments',
    featureGuardOpts,
    async (
      request: FastifyRequest<{
        Body: { name: string; description?: string; variants: unknown[] };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const exp = await experimentManager.create(request.body as any);
        return reply.code(201).send({ experiment: exp });
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  app.get(
    '/api/v1/experiments/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const exp = await experimentManager.get(request.params.id);
      if (!exp) return sendError(reply, 404, 'Experiment not found');
      return { experiment: exp };
    }
  );

  app.post(
    '/api/v1/experiments/:id/start',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const exp = await experimentManager.start(request.params.id);
      if (!exp) return sendError(reply, 404, 'Experiment not found');
      return { experiment: exp };
    }
  );

  app.post(
    '/api/v1/experiments/:id/stop',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const exp = await experimentManager.stop(request.params.id);
      if (!exp) return sendError(reply, 404, 'Experiment not found');
      return { experiment: exp };
    }
  );

  app.delete(
    '/api/v1/experiments/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!(await experimentManager.delete(request.params.id)))
        return sendError(reply, 404, 'Experiment not found');
      return reply.code(204).send();
    }
  );
}
