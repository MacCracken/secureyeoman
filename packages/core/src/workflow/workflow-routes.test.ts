/**
 * WorkflowRoutes integration tests
 *
 * Tests all REST endpoints using a Fastify test instance with a mocked
 * WorkflowManager — no database required.
 */
import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerWorkflowRoutes } from './workflow-routes.js';
import type { WorkflowManager } from './workflow-manager.js';

const NOW = 1_700_000_000_000;

const DEFINITION = {
  id: 'wf-1',
  name: 'Test Workflow',
  description: 'A test',
  steps: [],
  edges: [],
  triggers: [],
  isEnabled: true,
  version: 1,
  createdBy: 'system',
  createdAt: NOW,
  updatedAt: NOW,
};

const RUN = {
  id: 'run-1',
  workflowId: 'wf-1',
  workflowName: 'Test Workflow',
  status: 'pending',
  input: null,
  output: null,
  error: null,
  triggeredBy: 'manual',
  createdAt: NOW,
  startedAt: null,
  completedAt: null,
  stepRuns: [],
};

function makeMockManager(overrides: Partial<WorkflowManager> = {}): WorkflowManager {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    createDefinition: vi.fn().mockResolvedValue(DEFINITION),
    getDefinition: vi.fn().mockResolvedValue(DEFINITION),
    listDefinitions: vi.fn().mockResolvedValue({ definitions: [DEFINITION], total: 1 }),
    updateDefinition: vi.fn().mockResolvedValue(DEFINITION),
    deleteDefinition: vi.fn().mockResolvedValue(true),
    triggerRun: vi.fn().mockResolvedValue(RUN),
    getRun: vi.fn().mockResolvedValue(RUN),
    listRuns: vi.fn().mockResolvedValue({ runs: [RUN], total: 1 }),
    cancelRun: vi.fn().mockResolvedValue(RUN),
    ...overrides,
  } as unknown as WorkflowManager;
}

function buildApp(overrides: Partial<WorkflowManager> = {}) {
  const app = Fastify({ logger: false });
  registerWorkflowRoutes(app, { workflowManager: makeMockManager(overrides) });
  return app;
}

// ── Run detail ────────────────────────────────────────────────────────────────

describe('GET /api/v1/workflows/runs/:runId', () => {
  it('returns run when found', async () => {
    const res = await buildApp().inject({ method: 'GET', url: '/api/v1/workflows/runs/run-1' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).run.id).toBe('run-1');
  });

  it('returns 404 when run not found', async () => {
    const res = await buildApp({ getRun: vi.fn().mockResolvedValue(null) }).inject({
      method: 'GET',
      url: '/api/v1/workflows/runs/missing',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/v1/workflows/runs/:runId', () => {
  it('cancels run and returns it', async () => {
    const res = await buildApp().inject({
      method: 'DELETE',
      url: '/api/v1/workflows/runs/run-1',
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).run.id).toBe('run-1');
  });

  it('returns 404 when run not found', async () => {
    const res = await buildApp({ cancelRun: vi.fn().mockResolvedValue(null) }).inject({
      method: 'DELETE',
      url: '/api/v1/workflows/runs/missing',
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── Definition list ───────────────────────────────────────────────────────────

describe('GET /api/v1/workflows', () => {
  it('returns definitions and total', async () => {
    const res = await buildApp().inject({ method: 'GET', url: '/api/v1/workflows' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.definitions).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('passes limit and offset as numbers to manager', async () => {
    const mgr = makeMockManager();
    const app = Fastify({ logger: false });
    registerWorkflowRoutes(app, { workflowManager: mgr });
    await app.inject({ method: 'GET', url: '/api/v1/workflows?limit=10&offset=20' });
    expect(mgr.listDefinitions).toHaveBeenCalledWith({ limit: 10, offset: 20 });
  });

  it('omits limit/offset when not provided in query', async () => {
    const mgr = makeMockManager();
    const app = Fastify({ logger: false });
    registerWorkflowRoutes(app, { workflowManager: mgr });
    await app.inject({ method: 'GET', url: '/api/v1/workflows' });
    expect(mgr.listDefinitions).toHaveBeenCalledWith({ limit: undefined, offset: undefined });
  });
});

// ── Definition create ─────────────────────────────────────────────────────────

describe('POST /api/v1/workflows', () => {
  it('creates a workflow and returns 201 with definition', async () => {
    const res = await buildApp().inject({
      method: 'POST',
      url: '/api/v1/workflows',
      payload: { name: 'My Workflow' },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).definition.name).toBe('Test Workflow');
  });

  it('returns 400 with error message when creation fails', async () => {
    const res = await buildApp({
      createDefinition: vi.fn().mockRejectedValue(new Error('Duplicate name')),
    }).inject({
      method: 'POST',
      url: '/api/v1/workflows',
      payload: { name: 'My Workflow' },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Duplicate name');
  });
});

// ── Definition get ────────────────────────────────────────────────────────────

describe('GET /api/v1/workflows/:id', () => {
  it('returns definition when found', async () => {
    const res = await buildApp().inject({ method: 'GET', url: '/api/v1/workflows/wf-1' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).definition.id).toBe('wf-1');
  });

  it('returns 404 when not found', async () => {
    const res = await buildApp({ getDefinition: vi.fn().mockResolvedValue(null) }).inject({
      method: 'GET',
      url: '/api/v1/workflows/missing',
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── Definition update ─────────────────────────────────────────────────────────

describe('PUT /api/v1/workflows/:id', () => {
  it('updates and returns definition', async () => {
    const res = await buildApp().inject({
      method: 'PUT',
      url: '/api/v1/workflows/wf-1',
      payload: { name: 'Updated' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).definition).toBeDefined();
  });

  it('returns 404 when definition not found', async () => {
    const res = await buildApp({ updateDefinition: vi.fn().mockResolvedValue(null) }).inject({
      method: 'PUT',
      url: '/api/v1/workflows/missing',
      payload: { name: 'x' },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── Definition delete ─────────────────────────────────────────────────────────

describe('DELETE /api/v1/workflows/:id', () => {
  it('deletes definition and returns 204', async () => {
    const res = await buildApp().inject({ method: 'DELETE', url: '/api/v1/workflows/wf-1' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when definition not found', async () => {
    const res = await buildApp({ deleteDefinition: vi.fn().mockResolvedValue(false) }).inject({
      method: 'DELETE',
      url: '/api/v1/workflows/missing',
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── Trigger run ───────────────────────────────────────────────────────────────

describe('POST /api/v1/workflows/:id/run', () => {
  it('triggers run and returns 202 with run object', async () => {
    const res = await buildApp().inject({
      method: 'POST',
      url: '/api/v1/workflows/wf-1/run',
      payload: { input: { key: 'val' }, triggeredBy: 'api' },
    });
    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body).run.id).toBe('run-1');
  });

  it('returns 400 when trigger fails (e.g. workflow not found)', async () => {
    const res = await buildApp({
      triggerRun: vi.fn().mockRejectedValue(new Error('Workflow not found: wf-x')),
    }).inject({
      method: 'POST',
      url: '/api/v1/workflows/wf-x/run',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Workflow not found');
  });

  it('defaults triggeredBy to "manual" when not provided', async () => {
    const mgr = makeMockManager();
    const app = Fastify({ logger: false });
    registerWorkflowRoutes(app, { workflowManager: mgr });
    await app.inject({ method: 'POST', url: '/api/v1/workflows/wf-1/run', payload: {} });
    expect(mgr.triggerRun).toHaveBeenCalledWith('wf-1', undefined, 'manual');
  });
});

// ── List runs ─────────────────────────────────────────────────────────────────

describe('GET /api/v1/workflows/:id/runs', () => {
  it('lists runs for a workflow', async () => {
    const res = await buildApp().inject({
      method: 'GET',
      url: '/api/v1/workflows/wf-1/runs',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.runs).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('passes pagination params to manager', async () => {
    const mgr = makeMockManager();
    const app = Fastify({ logger: false });
    registerWorkflowRoutes(app, { workflowManager: mgr });
    await app.inject({ method: 'GET', url: '/api/v1/workflows/wf-1/runs?limit=5&offset=10' });
    expect(mgr.listRuns).toHaveBeenCalledWith('wf-1', { limit: 5, offset: 10 });
  });
});
