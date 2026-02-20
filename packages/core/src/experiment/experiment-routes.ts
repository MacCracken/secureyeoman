/**
 * Experiment Routes — REST API for A/B testing
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ExperimentManager } from './manager.js';
import { toErrorMessage, sendError } from '../utils/errors.js';

export interface ExperimentRoutesOptions {
  experimentManager: ExperimentManager;
}

export function registerExperimentRoutes(
  app: FastifyInstance,
  opts: ExperimentRoutesOptions
): void {
  const { experimentManager } = opts;

  app.get(
    '/api/v1/experiments',
    async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>) => {
      const limit = request.query.limit ? Number(request.query.limit) : undefined;
      const offset = request.query.offset ? Number(request.query.offset) : undefined;
      return experimentManager.list({ limit, offset });
    }
  );

  app.post(
    '/api/v1/experiments',
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
