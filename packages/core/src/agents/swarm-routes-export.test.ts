/**
 * Swarm Routes — Export / Import endpoint tests (Phase 89)
 *
 * Unit tests with mocked SwarmManager — no database required.
 */
import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerSwarmRoutes } from './swarm-routes.js';
import type { SwarmManager } from './swarm-manager.js';

const TEMPLATE = {
  id: 'tmpl-1',
  name: 'Security Audit Team',
  description: 'A security audit swarm',
  strategy: 'sequential',
  roles: [
    {
      role: 'researcher',
      profileName: 'security-researcher',
      description: 'Researches vulnerabilities',
    },
    {
      role: 'hacker',
      profileName: 'ethical-whitehat-hacker',
      description: 'Probes for weaknesses',
    },
    { role: 'writer', profileName: 'technical-writer', description: 'Documents findings' },
  ],
  coordinatorProfile: null,
  isBuiltin: false,
  createdAt: 1000,
};

function makeMockManager(overrides?: Partial<SwarmManager>): SwarmManager {
  return {
    listTemplates: vi.fn().mockResolvedValue({ templates: [TEMPLATE], total: 1 }),
    getTemplate: vi.fn().mockResolvedValue(TEMPLATE),
    createTemplate: vi.fn().mockResolvedValue(TEMPLATE),
    updateTemplate: vi.fn().mockResolvedValue({ ...TEMPLATE, name: 'updated' }),
    deleteTemplate: vi.fn().mockResolvedValue(true),
    executeSwarm: vi.fn().mockResolvedValue({}),
    listSwarmRuns: vi.fn().mockResolvedValue({ runs: [], total: 0 }),
    getSwarmRun: vi.fn().mockResolvedValue({}),
    cancelSwarm: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as SwarmManager;
}

function buildApp(overrides?: Partial<SwarmManager>) {
  const app = Fastify({ logger: false });
  registerSwarmRoutes(app, { swarmManager: makeMockManager(overrides) });
  return app;
}

// ── Export ────────────────────────────────────────────────────────────────────

describe('GET /api/v1/agents/swarms/templates/:id/export', () => {
  it('returns export envelope with exportedAt, requires, and template', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/agents/swarms/templates/tmpl-1/export',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.exportedAt).toBeDefined();
    expect(body.template).toMatchObject({ id: 'tmpl-1', name: 'Security Audit Team' });
    expect(body.requires).toBeDefined();
  });

  it('infers profileRoles from template roles', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/agents/swarms/templates/tmpl-1/export',
    });
    const body = res.json();
    expect(body.requires.profileRoles).toContain('security-researcher');
    expect(body.requires.profileRoles).toContain('ethical-whitehat-hacker');
    expect(body.requires.profileRoles).toContain('technical-writer');
  });

  it('returns 404 when template not found', async () => {
    const app = buildApp({ getTemplate: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/agents/swarms/templates/missing/export',
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── Import ────────────────────────────────────────────────────────────────────

describe('POST /api/v1/agents/swarms/templates/import', () => {
  it('creates template from export envelope and returns 201', async () => {
    const createMock = vi.fn().mockResolvedValue(TEMPLATE);
    const app = buildApp({ createTemplate: createMock });

    const payload = {
      template: {
        exportedAt: Date.now(),
        requires: { profileRoles: ['security-researcher', 'ethical-whitehat-hacker'] },
        template: TEMPLATE,
      },
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/swarms/templates/import',
      headers: { 'content-type': 'application/json' },
      payload,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.template).toBeDefined();
    expect(body.compatibility).toBeDefined();
    expect(createMock).toHaveBeenCalled();
  });

  it('reports profile role gaps in compatibility', async () => {
    const app = buildApp();
    const payload = {
      template: {
        exportedAt: Date.now(),
        requires: { profileRoles: ['analyst', 'coder'] },
        template: TEMPLATE,
      },
    };
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/swarms/templates/import',
      headers: { 'content-type': 'application/json' },
      payload,
    });
    const body = res.json();
    expect(body.compatibility.compatible).toBe(false);
    expect(body.compatibility.gaps.profileRoles).toContain('analyst');
    expect(body.compatibility.gaps.profileRoles).toContain('coder');
  });

  it('returns 400 when template.name is missing', async () => {
    const app = buildApp();
    const payload = {
      template: {
        exportedAt: Date.now(),
        requires: {},
        template: { roles: [{ role: 'r', profileName: 'p' }] },
      },
    };
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/swarms/templates/import',
      headers: { 'content-type': 'application/json' },
      payload,
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when roles is empty', async () => {
    const app = buildApp();
    const payload = {
      template: {
        exportedAt: Date.now(),
        requires: {},
        template: { name: 'Empty', roles: [] },
      },
    };
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/swarms/templates/import',
      headers: { 'content-type': 'application/json' },
      payload,
    });
    expect(res.statusCode).toBe(400);
  });
});
