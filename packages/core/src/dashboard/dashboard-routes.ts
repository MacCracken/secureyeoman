/**
 * Dashboard Routes — REST API for custom dashboard CRUD
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DashboardManager } from './manager.js';
import { toErrorMessage, sendError } from '../utils/errors.js';

export interface DashboardRoutesOptions {
  dashboardManager: DashboardManager;
}

export function registerDashboardRoutes(app: FastifyInstance, opts: DashboardRoutesOptions): void {
  const { dashboardManager } = opts;

  app.get(
    '/api/v1/dashboards',
    async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>) => {
      const limit = request.query.limit ? Number(request.query.limit) : undefined;
      const offset = request.query.offset ? Number(request.query.offset) : undefined;
      return dashboardManager.list({ limit, offset });
    }
  );

  app.post(
    '/api/v1/dashboards',
    async (
      request: FastifyRequest<{
        Body: { name: string; description?: string; widgets?: unknown[]; isDefault?: boolean };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const dashboard = await dashboardManager.create(request.body as any);
        return reply.code(201).send({ dashboard });
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  app.get(
    '/api/v1/dashboards/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const dashboard = await dashboardManager.get(request.params.id);
      if (!dashboard) return sendError(reply, 404, 'Dashboard not found');
      return { dashboard };
    }
  );

  app.put(
    '/api/v1/dashboards/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { name?: string; description?: string; widgets?: unknown[]; isDefault?: boolean };
      }>,
      reply: FastifyReply
    ) => {
      const dashboard = await dashboardManager.update(request.params.id, request.body as any);
      if (!dashboard) return sendError(reply, 404, 'Dashboard not found');
      return { dashboard };
    }
  );

  app.delete(
    '/api/v1/dashboards/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!dashboardManager.delete(request.params.id)) {
        return sendError(reply, 404, 'Dashboard not found');
      }
      return reply.code(204).send();
    }
  );
}
