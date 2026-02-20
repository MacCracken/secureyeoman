import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerDashboardRoutes } from './dashboard-routes.js';
import type { DashboardManager } from './manager.js';

const DASHBOARD = { id: 'dash-1', name: 'My Dashboard', widgets: [], isDefault: false };

function makeMockManager(overrides?: Partial<DashboardManager>): DashboardManager {
  return {
    list: vi.fn().mockResolvedValue({ dashboards: [DASHBOARD], total: 1 }),
    create: vi.fn().mockResolvedValue(DASHBOARD),
    get: vi.fn().mockResolvedValue(DASHBOARD),
    update: vi.fn().mockResolvedValue(DASHBOARD),
    delete: vi.fn().mockReturnValue(true),
    ...overrides,
  } as unknown as DashboardManager;
}

function buildApp(overrides?: Partial<DashboardManager>) {
  const app = Fastify();
  registerDashboardRoutes(app, { dashboardManager: makeMockManager(overrides) });
  return app;
}

describe('GET /api/v1/dashboards', () => {
  it('returns dashboards list', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/dashboards' });
    expect(res.statusCode).toBe(200);
    expect(res.json().dashboards).toHaveLength(1);
  });

  it('passes limit/offset params', async () => {
    const listMock = vi.fn().mockResolvedValue({ dashboards: [], total: 0 });
    const app = buildApp({ list: listMock });
    await app.inject({ method: 'GET', url: '/api/v1/dashboards?limit=5&offset=10' });
    expect(listMock).toHaveBeenCalledWith({ limit: 5, offset: 10 });
  });
});

describe('POST /api/v1/dashboards', () => {
  it('creates dashboard and returns 201', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/dashboards',
      payload: { name: 'New Dashboard', widgets: [] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().dashboard.id).toBe('dash-1');
  });

  it('returns 400 on error', async () => {
    const app = buildApp({ create: vi.fn().mockRejectedValue(new Error('conflict')) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/dashboards',
      payload: { name: 'Dup' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/v1/dashboards/:id', () => {
  it('returns a dashboard', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/dashboards/dash-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().dashboard.id).toBe('dash-1');
  });

  it('returns 404 when not found', async () => {
    const app = buildApp({ get: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/dashboards/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('PUT /api/v1/dashboards/:id', () => {
  it('updates a dashboard', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/dashboards/dash-1',
      payload: { name: 'Updated' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().dashboard.id).toBe('dash-1');
  });

  it('returns 404 when not found', async () => {
    const app = buildApp({ update: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/dashboards/missing',
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/v1/dashboards/:id', () => {
  it('deletes dashboard and returns 204', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/dashboards/dash-1' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when not found', async () => {
    const app = buildApp({ delete: vi.fn().mockReturnValue(false) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/dashboards/missing' });
    expect(res.statusCode).toBe(404);
  });
});
