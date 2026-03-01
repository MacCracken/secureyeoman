/**
 * Workflow Routes — Export / Import endpoint tests (Phase 89)
 *
 * Unit tests with mocked WorkflowManager — no database required.
 */
import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerWorkflowRoutes } from './workflow-routes.js';
import type { WorkflowManager } from './workflow-manager.js';

const NOW = 1_700_000_000_000;

const DEFINITION = {
  id: 'wf-export-1',
  name: 'Exported Workflow',
  description: 'A workflow for export tests',
  steps: [
    { id: 'step-1', type: 'agent', config: { toolName: 'github_list_issues', prompt: 'Check github issues' } },
  ],
  edges: [],
  triggers: [{ type: 'manual', config: {} }],
  isEnabled: true,
  version: 1,
  createdBy: 'user',
  autonomyLevel: 'L2',
  createdAt: NOW,
  updatedAt: NOW,
};

function makeMockManager(overrides: Partial<WorkflowManager> = {}): WorkflowManager {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    createDefinition: vi.fn().mockResolvedValue(DEFINITION),
    getDefinition: vi.fn().mockResolvedValue(DEFINITION),
    listDefinitions: vi.fn().mockResolvedValue({ definitions: [DEFINITION], total: 1 }),
    updateDefinition: vi.fn().mockResolvedValue(DEFINITION),
    deleteDefinition: vi.fn().mockResolvedValue(true),
    triggerRun: vi.fn().mockResolvedValue({}),
    getRun: vi.fn().mockResolvedValue({}),
    listRuns: vi.fn().mockResolvedValue({ runs: [], total: 0 }),
    cancelRun: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as WorkflowManager;
}

function buildApp(overrides: Partial<WorkflowManager> = {}) {
  const app = Fastify({ logger: false });
  registerWorkflowRoutes(app, { workflowManager: makeMockManager(overrides) });
  return app;
}

// ── Export ────────────────────────────────────────────────────────────────────

describe('GET /api/v1/workflows/:id/export', () => {
  it('returns an export envelope with exportedAt, requires, and workflow', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/workflows/wf-export-1/export' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.exportedAt).toBeDefined();
    expect(body.workflow).toMatchObject({ id: 'wf-export-1', name: 'Exported Workflow' });
    expect(body.requires).toBeDefined();
  });

  it('infers tool name from step config', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/workflows/wf-export-1/export' });
    const body = res.json();
    expect(body.requires.tools).toContain('github_list_issues');
  });

  it('infers integration keyword from step config', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/workflows/wf-export-1/export' });
    const body = res.json();
    // The prompt contains 'github', so integration should be detected
    expect(body.requires.integrations).toContain('github');
  });

  it('returns 404 when workflow not found', async () => {
    const app = buildApp({ getDefinition: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/workflows/missing/export' });
    expect(res.statusCode).toBe(404);
  });
});

// ── Import ────────────────────────────────────────────────────────────────────

describe('POST /api/v1/workflows/import', () => {
  it('creates workflow from export envelope and returns 201', async () => {
    const createMock = vi.fn().mockResolvedValue(DEFINITION);
    const app = buildApp({ createDefinition: createMock });

    const payload = {
      workflow: {
        exportedAt: Date.now(),
        requires: {},
        workflow: { ...DEFINITION, id: undefined },
      },
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/workflows/import',
      headers: { 'content-type': 'application/json' },
      payload,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.definition).toBeDefined();
    expect(body.compatibility).toBeDefined();
    expect(createMock).toHaveBeenCalled();
  });

  it('marks compatible=true when requires is empty', async () => {
    const app = buildApp();
    const payload = {
      workflow: {
        exportedAt: Date.now(),
        requires: {},
        workflow: DEFINITION,
      },
    };
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/workflows/import',
      headers: { 'content-type': 'application/json' },
      payload,
    });
    const body = res.json();
    expect(body.compatibility.compatible).toBe(true);
  });

  it('records gaps when requires.integrations is non-empty', async () => {
    const app = buildApp();
    const payload = {
      workflow: {
        exportedAt: Date.now(),
        requires: { integrations: ['gmail'] },
        workflow: DEFINITION,
      },
    };
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/workflows/import',
      headers: { 'content-type': 'application/json' },
      payload,
    });
    const body = res.json();
    expect(body.compatibility.compatible).toBe(false);
    expect(body.compatibility.gaps.integrations).toContain('gmail');
  });

  it('returns 400 when name is missing', async () => {
    const app = buildApp();
    const payload = {
      workflow: {
        exportedAt: Date.now(),
        requires: {},
        workflow: { steps: [] },
      },
    };
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/workflows/import',
      headers: { 'content-type': 'application/json' },
      payload,
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when steps is not an array', async () => {
    const app = buildApp();
    const payload = {
      workflow: {
        exportedAt: Date.now(),
        requires: {},
        workflow: { name: 'Bad', steps: 'not-array' },
      },
    };
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/workflows/import',
      headers: { 'content-type': 'application/json' },
      payload,
    });
    expect(res.statusCode).toBe(400);
  });
});
