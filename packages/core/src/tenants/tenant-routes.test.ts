import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerTenantRoutes } from './tenant-routes.js';
import type { TenantRecord } from './tenant-storage.js';

const MOCK_TENANT: TenantRecord = {
  id: 'tenant-001',
  name: 'Acme Corp',
  slug: 'acme',
  plan: 'pro',
  metadata: {},
  createdAt: 1000,
  updatedAt: 2000,
};

function makeMockManager() {
  return {
    create: vi.fn().mockResolvedValue(MOCK_TENANT),
    list: vi.fn().mockResolvedValue({ records: [MOCK_TENANT], total: 1 }),
    getById: vi.fn().mockResolvedValue(MOCK_TENANT),
    update: vi.fn().mockResolvedValue(MOCK_TENANT),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

async function buildApp(mgr: ReturnType<typeof makeMockManager>) {
  const app = Fastify({ logger: false });
  registerTenantRoutes(app, { tenantManager: mgr as any });
  await app.ready();
  return app;
}

describe('Tenant Routes', () => {
  let manager: ReturnType<typeof makeMockManager>;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    manager = makeMockManager();
    app = await buildApp(manager);
  });

  it('GET /api/v1/admin/tenants lists tenants', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/tenants' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.tenants).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('POST /api/v1/admin/tenants creates a tenant', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/tenants',
      payload: { name: 'Acme Corp', slug: 'acme', plan: 'pro' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.tenant.id).toBe('tenant-001');
  });

  it('POST /api/v1/admin/tenants returns 400 without name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/tenants',
      payload: { slug: 'acme' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/v1/admin/tenants/:id gets a tenant', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/tenants/tenant-001' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.tenant.slug).toBe('acme');
  });

  it('GET /api/v1/admin/tenants/:id returns 404', async () => {
    manager.getById.mockResolvedValue(null);
    app = await buildApp(manager);
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/tenants/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  it('PUT /api/v1/admin/tenants/:id updates a tenant', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/tenants/tenant-001',
      payload: { name: 'New Name' },
    });
    expect(res.statusCode).toBe(200);
    expect(manager.update).toHaveBeenCalledWith('tenant-001', { name: 'New Name' });
  });

  it('DELETE /api/v1/admin/tenants/:id deletes a tenant', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/admin/tenants/tenant-001' });
    expect(res.statusCode).toBe(204);
    expect(manager.delete).toHaveBeenCalledWith('tenant-001');
  });

  it('DELETE /api/v1/admin/tenants/:id returns 400 for default tenant', async () => {
    manager.delete.mockRejectedValue(new Error('Cannot delete the default tenant'));
    app = await buildApp(manager);
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/admin/tenants/default' });
    expect(res.statusCode).toBe(400);
  });
});
