/**
 * Dashboard Routes — REST API for custom dashboard CRUD
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DashboardManager } from './manager.js';

export interface DashboardRoutesOptions {
  dashboardManager: DashboardManager;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

export function registerDashboardRoutes(app: FastifyInstance, opts: DashboardRoutesOptions): void {
  const { dashboardManager } = opts;

  app.get('/api/v1/dashboards', async () => {
    const dashboards = await dashboardManager.list();
    return { dashboards, total: dashboards.length };
  });

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
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  app.get(
    '/api/v1/dashboards/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const dashboard = await dashboardManager.get(request.params.id);
      if (!dashboard) return reply.code(404).send({ error: 'Dashboard not found' });
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
      if (!dashboard) return reply.code(404).send({ error: 'Dashboard not found' });
      return { dashboard };
    }
  );

  app.delete(
    '/api/v1/dashboards/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!dashboardManager.delete(request.params.id)) {
        return reply.code(404).send({ error: 'Dashboard not found' });
      }
      return reply.code(204).send();
    }
  );
}
