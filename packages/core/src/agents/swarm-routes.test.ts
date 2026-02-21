import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerSwarmRoutes } from './swarm-routes.js';
import type { SwarmManager } from './swarm-manager.js';

// ── Mock data ────────────────────────────────────────────────────────

const TEMPLATE = {
  id: 'research-and-code',
  name: 'research-and-code',
  description: 'Sequential pipeline',
  strategy: 'sequential',
  roles: [
    { role: 'researcher', profileName: 'researcher', description: 'Gather info' },
    { role: 'coder', profileName: 'coder', description: 'Implement' },
  ],
  coordinatorProfile: null,
  isBuiltin: true,
  createdAt: 1000,
};

const SWARM_RUN = {
  id: 'run-1',
  templateId: 'research-and-code',
  task: 'Build a feature',
  status: 'completed',
  results: [],
  totalTokensUsed: 200,
  createdAt: 1000,
  completedAt: 2000,
};

function makeMockManager(overrides?: Partial<SwarmManager>): SwarmManager {
  return {
    listTemplates: vi.fn().mockResolvedValue({ templates: [TEMPLATE], total: 1 }),
    getTemplate: vi.fn().mockResolvedValue(TEMPLATE),
    createTemplate: vi.fn().mockResolvedValue(TEMPLATE),
    deleteTemplate: vi.fn().mockResolvedValue(true),
    executeSwarm: vi.fn().mockResolvedValue(SWARM_RUN),
    listSwarmRuns: vi.fn().mockResolvedValue({ runs: [SWARM_RUN], total: 1 }),
    getSwarmRun: vi.fn().mockResolvedValue(SWARM_RUN),
    cancelSwarm: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as SwarmManager;
}

function buildApp(overrides?: Partial<SwarmManager>) {
  const app = Fastify();
  registerSwarmRoutes(app, { swarmManager: makeMockManager(overrides) });
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('GET /api/v1/agents/swarms/templates', () => {
  it('returns templates', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/agents/swarms/templates' });
    expect(res.statusCode).toBe(200);
    expect(res.json().templates).toHaveLength(1);
  });
});

describe('GET /api/v1/agents/swarms/templates/:id', () => {
  it('returns template by ID', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/agents/swarms/templates/research-and-code',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().template.name).toBe('research-and-code');
  });

  it('returns 404 when template not found', async () => {
    const app = buildApp({ getTemplate: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/agents/swarms/templates/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/v1/agents/swarms/templates', () => {
  it('creates template and returns 201', async () => {
    const customTemplate = { ...TEMPLATE, isBuiltin: false };
    const app = buildApp({ createTemplate: vi.fn().mockResolvedValue(customTemplate) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/swarms/templates',
      payload: {
        name: 'custom-pipeline',
        strategy: 'sequential',
        roles: [{ role: 'researcher', profileName: 'researcher' }],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().template.name).toBe('research-and-code');
  });

  it('returns 400 on error', async () => {
    const app = buildApp({ createTemplate: vi.fn().mockRejectedValue(new Error('duplicate')) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/swarms/templates',
      payload: { name: 'dup', strategy: 'sequential', roles: [] },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /api/v1/agents/swarms/templates/:id', () => {
  it('deletes non-builtin template and returns 204', async () => {
    const customTemplate = { ...TEMPLATE, isBuiltin: false };
    const app = buildApp({ getTemplate: vi.fn().mockResolvedValue(customTemplate) });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/agents/swarms/templates/custom',
    });
    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when template not found', async () => {
    const app = buildApp({ getTemplate: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/agents/swarms/templates/missing',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when trying to delete a builtin template', async () => {
    const app = buildApp(); // TEMPLATE.isBuiltin = true
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/agents/swarms/templates/research-and-code',
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /api/v1/agents/swarms', () => {
  it('executes swarm and returns 201', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/swarms',
      payload: { templateId: 'research-and-code', task: 'Build feature' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().run.id).toBe('run-1');
  });

  it('returns 400 on execution error', async () => {
    const app = buildApp({
      executeSwarm: vi.fn().mockRejectedValue(new Error('profile not found')),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/swarms',
      payload: { templateId: 'bad-template', task: 'Task' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/v1/agents/swarms', () => {
  it('lists swarm runs', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/agents/swarms' });
    expect(res.statusCode).toBe(200);
    expect(res.json().runs).toHaveLength(1);
  });
});

describe('GET /api/v1/agents/swarms/:id', () => {
  it('returns swarm run by ID', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/agents/swarms/run-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().run.id).toBe('run-1');
  });

  it('returns 404 when run not found', async () => {
    const app = buildApp({ getSwarmRun: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/agents/swarms/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/v1/agents/swarms/:id/cancel', () => {
  it('cancels swarm', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/agents/swarms/run-1/cancel' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 400 on cancel error', async () => {
    const app = buildApp({ cancelSwarm: vi.fn().mockRejectedValue(new Error('not cancellable')) });
    const res = await app.inject({ method: 'POST', url: '/api/v1/agents/swarms/run-1/cancel' });
    expect(res.statusCode).toBe(400);
  });
});
