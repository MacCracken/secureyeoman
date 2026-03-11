import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerQuotaRoutes } from './quota-routes.js';

/* ------------------------------------------------------------------ */
/*  Mock manager factory                                               */
/* ------------------------------------------------------------------ */

const MOCK_LIMITS = {
  tenantId: 'tenant-001',
  requestsPerMinute: 60,
  requestsPerHour: 1000,
  tokensPerDay: 1_000_000,
  tokensPerMonth: 30_000_000,
  maxConcurrentRequests: 10,
  customLimits: {},
  createdAt: 1000,
  updatedAt: 2000,
};

const MOCK_SUMMARY = {
  requests: {
    minute: { current: 10, limit: 60 },
    hour: { current: 100, limit: 1000 },
  },
  tokens: {
    day: { current: 50_000, limit: 1_000_000 },
    month: { current: 500_000, limit: 30_000_000 },
  },
  limits: MOCK_LIMITS,
};

const MOCK_TOKEN_SUMMARY = {
  totalInputTokens: 1000,
  totalOutputTokens: 500,
  totalTokens: 1500,
  recordCount: 3,
};

function makeMockManager() {
  return {
    getLimits: vi.fn().mockResolvedValue(MOCK_LIMITS),
    setLimits: vi.fn().mockResolvedValue(MOCK_LIMITS),
    deleteLimits: vi.fn().mockResolvedValue(true),
    getUsageSummary: vi.fn().mockResolvedValue(MOCK_SUMMARY),
    resetCounters: vi.fn().mockResolvedValue(undefined),
    getTokenUsage: vi.fn().mockResolvedValue([]),
    getTokenUsageSummary: vi.fn().mockResolvedValue(MOCK_TOKEN_SUMMARY),
  };
}

async function buildApp(mgr: ReturnType<typeof makeMockManager>) {
  const app = Fastify({ logger: false });
  registerQuotaRoutes(app, { quotaManager: mgr as any });
  await app.ready();
  return app;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('Quota Routes', () => {
  let manager: ReturnType<typeof makeMockManager>;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    manager = makeMockManager();
    app = await buildApp(manager);
  });

  /* ---------- GET /quotas ----------------------------------------- */

  it('GET /api/v1/tenants/:tenantId/quotas returns limits and usage', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tenants/tenant-001/quotas',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.limits.tenantId).toBe('tenant-001');
    expect(body.usage.requests).toBeDefined();
  });

  /* ---------- PUT /quotas ----------------------------------------- */

  it('PUT /api/v1/tenants/:tenantId/quotas sets limits', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/tenants/tenant-001/quotas',
      payload: { requestsPerMinute: 120 },
    });
    expect(res.statusCode).toBe(200);
    expect(manager.setLimits).toHaveBeenCalledWith('tenant-001', { requestsPerMinute: 120 });
  });

  it('PUT /api/v1/tenants/:tenantId/quotas returns 400 on error', async () => {
    manager.setLimits.mockRejectedValue(new Error('Invalid limit'));
    app = await buildApp(manager);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/tenants/tenant-001/quotas',
      payload: { requestsPerMinute: -1 },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.message).toBe('Invalid limit');
  });

  /* ---------- DELETE /quotas -------------------------------------- */

  it('DELETE /api/v1/tenants/:tenantId/quotas removes limits', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/tenants/tenant-001/quotas',
    });
    expect(res.statusCode).toBe(204);
    expect(manager.deleteLimits).toHaveBeenCalledWith('tenant-001');
  });

  /* ---------- GET /usage ------------------------------------------ */

  it('GET /api/v1/tenants/:tenantId/usage returns summary', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tenants/tenant-001/usage',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.summary.requests.minute.current).toBe(10);
  });

  it('GET /api/v1/tenants/:tenantId/usage passes query params', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tenants/tenant-001/usage?from=1000&to=2000&model=gpt-4',
    });
    expect(res.statusCode).toBe(200);
    expect(manager.getUsageSummary).toHaveBeenCalledWith('tenant-001', {
      from: 1000,
      to: 2000,
      model: 'gpt-4',
    });
  });

  /* ---------- POST /usage/reset ----------------------------------- */

  it('POST /api/v1/tenants/:tenantId/usage/reset resets counters', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tenants/tenant-001/usage/reset',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(manager.resetCounters).toHaveBeenCalledWith('tenant-001');
  });

  /* ---------- GET /usage/tokens ----------------------------------- */

  it('GET /api/v1/tenants/:tenantId/usage/tokens returns records and summary', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tenants/tenant-001/usage/tokens',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.records).toEqual([]);
    expect(body.summary.totalTokens).toBe(1500);
  });

  it('GET /api/v1/tenants/:tenantId/usage/tokens passes query params', async () => {
    await app.inject({
      method: 'GET',
      url: '/api/v1/tenants/tenant-001/usage/tokens?model=gpt-4&from=5000',
    });
    expect(manager.getTokenUsage).toHaveBeenCalledWith('tenant-001', {
      from: 5000,
      model: 'gpt-4',
    });
    expect(manager.getTokenUsageSummary).toHaveBeenCalledWith('tenant-001', {
      from: 5000,
      model: 'gpt-4',
    });
  });

  /* ---------- Error handling -------------------------------------- */

  it('GET /api/v1/tenants/:tenantId/quotas returns 500 on error', async () => {
    manager.getLimits.mockRejectedValue(new Error('DB down'));
    app = await buildApp(manager);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tenants/tenant-001/quotas',
    });
    expect(res.statusCode).toBe(500);
  });
});
