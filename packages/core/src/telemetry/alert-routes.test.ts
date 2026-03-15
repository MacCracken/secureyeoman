/**
 * Alert Routes Tests (Phase 83)
 *
 * Fastify inject tests with mocked AlertManager. No DB required.
 */

import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerAlertRoutes } from './alert-routes.js';
import type { AlertRule } from './alert-storage.js';

const NOW = 1_700_000_000_000;

function makeRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 'rule-1',
    name: 'Test Rule',
    metricPath: 'security.rateLimitHitsTotal',
    operator: 'gt',
    threshold: 10,
    channels: [],
    enabled: true,
    cooldownSeconds: 300,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeManager(overrides: Record<string, unknown> = {}) {
  return {
    listRules: vi.fn().mockResolvedValue([makeRule()]),
    createRule: vi.fn().mockResolvedValue(makeRule()),
    getRule: vi.fn().mockResolvedValue(makeRule()),
    updateRule: vi.fn().mockResolvedValue(makeRule()),
    deleteRule: vi.fn().mockResolvedValue(true),
    testRule: vi.fn().mockResolvedValue({ fired: true, value: 42 }),
    ...overrides,
  };
}

function buildApp(managerOverrides: Record<string, unknown> = {}) {
  const app = Fastify({ logger: false });
  const mgr = makeManager(managerOverrides);
  registerAlertRoutes(app, { alertManager: mgr as any });
  return { app, mgr };
}

// ── GET /api/v1/alerts/rules ────────────────────────────────────────────────

describe('GET /api/v1/alerts/rules', () => {
  it('returns rules array', async () => {
    const { app } = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/alerts/rules' });
    expect(res.statusCode).toBe(200);
    expect(res.json().rules).toHaveLength(1);
  });

  it('returns 500 on manager error', async () => {
    const { app } = buildApp({ listRules: vi.fn().mockRejectedValue(new Error('DB error')) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/alerts/rules' });
    expect(res.statusCode).toBe(500);
  });
});

// ── POST /api/v1/alerts/rules ───────────────────────────────────────────────

describe('POST /api/v1/alerts/rules', () => {
  it('creates a rule and returns 201', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/alerts/rules',
      payload: {
        name: 'Test',
        metricPath: 'security.rateLimitHitsTotal',
        operator: 'gt',
        threshold: 50,
        channels: [],
        enabled: true,
        cooldownSeconds: 300,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().rule).toBeDefined();
  });
});

// ── GET /api/v1/alerts/rules/:id ────────────────────────────────────────────

describe('GET /api/v1/alerts/rules/:id', () => {
  it('returns the rule', async () => {
    const { app } = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/alerts/rules/rule-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().rule.id).toBe('rule-1');
  });

  it('returns 404 when rule not found', async () => {
    const { app } = buildApp({ getRule: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/alerts/rules/nonexistent' });
    expect(res.statusCode).toBe(404);
  });
});

// ── PATCH /api/v1/alerts/rules/:id ─────────────────────────────────────────

describe('PATCH /api/v1/alerts/rules/:id', () => {
  it('updates and returns the rule', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/alerts/rules/rule-1',
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().rule).toBeDefined();
  });

  it('returns 404 when rule not found', async () => {
    const { app } = buildApp({ updateRule: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/alerts/rules/nonexistent',
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── DELETE /api/v1/alerts/rules/:id ────────────────────────────────────────

describe('DELETE /api/v1/alerts/rules/:id', () => {
  it('returns 204 on success', async () => {
    const { app } = buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/alerts/rules/rule-1' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when rule not found', async () => {
    const { app } = buildApp({ deleteRule: vi.fn().mockResolvedValue(false) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/alerts/rules/nonexistent' });
    expect(res.statusCode).toBe(404);
  });
});

// ── POST /api/v1/alerts/rules/:id/test ─────────────────────────────────────

describe('POST /api/v1/alerts/rules/:id/test', () => {
  it('returns fired and value', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/alerts/rules/rule-1/test',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.fired).toBe(true);
    expect(body.value).toBe(42);
  });

  it('returns 404 when rule not found', async () => {
    const { app } = buildApp({
      testRule: vi.fn().mockRejectedValue(new Error('Alert rule not found')),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/alerts/rules/nonexistent/test',
    });
    expect(res.statusCode).toBe(404);
  });
});
