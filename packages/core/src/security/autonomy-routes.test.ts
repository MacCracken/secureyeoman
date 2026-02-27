/**
 * Autonomy Routes Tests
 *
 * Route tests for the autonomy audit REST API (Phase 49).
 * No DB required — AutonomyAuditManager is fully mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerAutonomyRoutes } from './autonomy-routes.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeManager(overrides: Record<string, unknown> = {}) {
  return {
    getOverview: vi.fn().mockResolvedValue({ byLevel: {} }),
    listAuditRuns: vi.fn().mockResolvedValue([]),
    createAuditRun: vi.fn().mockResolvedValue({ id: 'run-1', name: 'Test Run', items: [] }),
    getAuditRun: vi.fn().mockResolvedValue({ id: 'run-1', name: 'Test Run', items: [] }),
    updateAuditItem: vi
      .fn()
      .mockResolvedValue({ id: 'run-1', items: [{ id: 'item-1', status: 'pass' }] }),
    finalizeRun: vi.fn().mockResolvedValue({ id: 'run-1', finalizedAt: Date.now() }),
    emergencyStop: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function buildApp(
  managerOverrides: Record<string, unknown> = {},
  authUser?: Record<string, unknown>
) {
  const app = Fastify({ logger: false });
  const manager = makeManager(managerOverrides);

  // Inject authUser onto request if provided (simulate auth middleware)
  if (authUser) {
    app.addHook('preHandler', async (req) => {
      (req as any).authUser = authUser;
    });
  }

  registerAutonomyRoutes(app, { autonomyAuditManager: manager as any });
  return { app, manager };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/v1/autonomy/overview', () => {
  it('returns overview on success', async () => {
    const { app } = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/autonomy/overview' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('overview');
  });

  it('returns 500 on manager error', async () => {
    const { app } = buildApp({ getOverview: vi.fn().mockRejectedValue(new Error('DB error')) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/autonomy/overview' });
    expect(res.statusCode).toBe(500);
  });
});

describe('GET /api/v1/autonomy/audits', () => {
  it('returns list of audit runs', async () => {
    const { app } = buildApp({ listAuditRuns: vi.fn().mockResolvedValue([{ id: 'run-1' }]) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/autonomy/audits' });
    expect(res.statusCode).toBe(200);
    expect(res.json().runs).toHaveLength(1);
  });

  it('returns 500 on manager error', async () => {
    const { app } = buildApp({ listAuditRuns: vi.fn().mockRejectedValue(new Error('fail')) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/autonomy/audits' });
    expect(res.statusCode).toBe(500);
  });
});

describe('POST /api/v1/autonomy/audits', () => {
  it('creates an audit run and returns 201', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/autonomy/audits',
      payload: { name: 'My Audit' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().run.id).toBe('run-1');
  });

  it('returns 400 when name missing', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/autonomy/audits',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('name is required');
  });

  it('returns 500 on manager error', async () => {
    const { app } = buildApp({ createAuditRun: vi.fn().mockRejectedValue(new Error('fail')) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/autonomy/audits',
      payload: { name: 'Bad Audit' },
    });
    expect(res.statusCode).toBe(500);
  });
});

describe('GET /api/v1/autonomy/audits/:id', () => {
  it('returns the audit run by id', async () => {
    const { app } = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/autonomy/audits/run-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().run.id).toBe('run-1');
  });

  it('returns 404 when run not found', async () => {
    const { app } = buildApp({ getAuditRun: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/autonomy/audits/missing' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on manager error', async () => {
    const { app } = buildApp({ getAuditRun: vi.fn().mockRejectedValue(new Error('fail')) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/autonomy/audits/run-1' });
    expect(res.statusCode).toBe(500);
  });
});

describe('PUT /api/v1/autonomy/audits/:id/items/:itemId', () => {
  it('updates audit item status and returns run', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/autonomy/audits/run-1/items/item-1',
      payload: { status: 'pass', note: 'All good' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().run.items[0].status).toBe('pass');
  });

  it('returns 400 when status missing', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/autonomy/audits/run-1/items/item-1',
      payload: { note: 'no status' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('status is required');
  });

  it('returns 400 for invalid status value', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/autonomy/audits/run-1/items/item-1',
      payload: { status: 'invalid' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('status must be one of');
  });

  it('returns 404 when run or item not found', async () => {
    const { app } = buildApp({ updateAuditItem: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/autonomy/audits/run-1/items/item-1',
      payload: { status: 'pass' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('accepts all valid status values', async () => {
    for (const status of ['pending', 'pass', 'fail', 'deferred']) {
      const { app } = buildApp();
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/autonomy/audits/run-1/items/item-1',
        payload: { status },
      });
      expect(res.statusCode).toBe(200);
    }
  });

  it('returns 500 on manager error', async () => {
    const { app } = buildApp({ updateAuditItem: vi.fn().mockRejectedValue(new Error('fail')) });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/autonomy/audits/run-1/items/item-1',
      payload: { status: 'pass' },
    });
    expect(res.statusCode).toBe(500);
  });
});

describe('POST /api/v1/autonomy/audits/:id/finalize', () => {
  it('finalizes an audit run', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/autonomy/audits/run-1/finalize',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().run.id).toBe('run-1');
  });

  it('returns 404 when run not found', async () => {
    const { app } = buildApp({ finalizeRun: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/autonomy/audits/missing/finalize',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on manager error', async () => {
    const { app } = buildApp({ finalizeRun: vi.fn().mockRejectedValue(new Error('fail')) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/autonomy/audits/run-1/finalize',
    });
    expect(res.statusCode).toBe(500);
  });
});

describe('POST /api/v1/autonomy/emergency-stop/:type/:id', () => {
  it('triggers emergency stop for a skill when admin', async () => {
    const { app, manager } = buildApp({}, { userId: 'admin-1', role: 'admin' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/autonomy/emergency-stop/skill/skill-1',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(manager.emergencyStop).toHaveBeenCalledWith('skill', 'skill-1', 'admin-1');
  });

  it('triggers emergency stop for a workflow when admin', async () => {
    const { app } = buildApp({}, { userId: 'admin-1', role: 'admin' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/autonomy/emergency-stop/workflow/wf-1',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().type).toBe('workflow');
  });

  it('returns 403 when no authUser', async () => {
    const { app } = buildApp({});
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/autonomy/emergency-stop/skill/skill-1',
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 403 when not admin role', async () => {
    const { app } = buildApp({}, { userId: 'user-1', role: 'operator' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/autonomy/emergency-stop/skill/skill-1',
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 for invalid type', async () => {
    const { app } = buildApp({}, { userId: 'admin-1', role: 'admin' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/autonomy/emergency-stop/invalid/item-1',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('type must be skill or workflow');
  });

  it('returns 400 on manager error', async () => {
    const { app } = buildApp(
      { emergencyStop: vi.fn().mockRejectedValue(new Error('skill not found')) },
      { userId: 'admin-1', role: 'admin' }
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/autonomy/emergency-stop/skill/bad-id',
    });
    expect(res.statusCode).toBe(400);
  });
});
