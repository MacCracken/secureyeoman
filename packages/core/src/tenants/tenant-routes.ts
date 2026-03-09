/**
 * Tenant Management Routes (admin-only)
 *
 * GET    /api/v1/admin/tenants       — list tenants
 * POST   /api/v1/admin/tenants       — create tenant
 * GET    /api/v1/admin/tenants/:id   — get tenant
 * PUT    /api/v1/admin/tenants/:id   — update tenant
 * DELETE /api/v1/admin/tenants/:id   — delete tenant (fails for 'default')
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { TenantManager } from './tenant-manager.js';
import { sendError, toErrorMessage } from '../utils/errors.js';
import { parsePagination } from '../utils/pagination.js';
import type { SecureYeoman } from '../secureyeoman.js';
import { licenseGuard } from '../licensing/license-guard.js';

export interface TenantRoutesOptions {
  tenantManager: TenantManager;
  secureYeoman?: SecureYeoman;
}

export function registerTenantRoutes(app: FastifyInstance, opts: TenantRoutesOptions): void {
  const { tenantManager, secureYeoman } = opts;
  const tenantGuardOpts = licenseGuard('multi_tenancy', secureYeoman);

  app.get(
    '/api/v1/admin/tenants',
    tenantGuardOpts,
    async (
      request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { limit, offset } = parsePagination(request.query, {
          maxLimit: 200,
          defaultLimit: 50,
        });
        const result = await tenantManager.list(limit, offset);
        return reply.send({ tenants: result.records, total: result.total, limit, offset });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  app.post(
    '/api/v1/admin/tenants',
    tenantGuardOpts,
    async (
      request: FastifyRequest<{ Body: { name: string; slug: string; plan?: string } }>,
      reply: FastifyReply
    ) => {
      const { name, slug, plan } = request.body ?? {};
      if (!name || !slug) return sendError(reply, 400, 'name and slug are required');
      try {
        const tenant = await tenantManager.create({ name, slug, plan });
        return reply.code(201).send({ tenant });
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  app.get(
    '/api/v1/admin/tenants/:id',
    tenantGuardOpts,
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenant = await tenantManager.getById(request.params.id);
      if (!tenant) return sendError(reply, 404, 'Tenant not found');
      return reply.send({ tenant });
    }
  );

  app.put(
    '/api/v1/admin/tenants/:id',
    tenantGuardOpts,
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { name?: string; plan?: string; metadata?: Record<string, unknown> };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const tenant = await tenantManager.update(request.params.id, request.body ?? {});
        if (!tenant) return sendError(reply, 404, 'Tenant not found');
        return reply.send({ tenant });
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  app.delete(
    '/api/v1/admin/tenants/:id',
    tenantGuardOpts,
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await tenantManager.delete(request.params.id);
        return reply.code(204).send();
      } catch (err) {
        const msg = toErrorMessage(err);
        if (msg.includes('default')) return sendError(reply, 400, msg);
        if (msg.includes('not found')) return sendError(reply, 404, msg);
        return sendError(reply, 500, msg);
      }
    }
  );
}
