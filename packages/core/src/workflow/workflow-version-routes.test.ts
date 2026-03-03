/**
 * Workflow version route tests (Phase 114)
 *
 * Tests the 7 workflow versioning endpoints using Fastify injection
 * with a mocked WorkflowVersionManager.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerWorkflowRoutes } from './workflow-routes.js';
import type { WorkflowManager } from './workflow-manager.js';
import type { WorkflowVersionManager } from './workflow-version-manager.js';

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

const VERSION = {
  id: 'wv-1',
  workflowId: 'wf-1',
  versionTag: null,
  snapshot: { name: 'Test Workflow', steps: [] },
  diffSummary: null,
  changedFields: [],
  author: 'system',
  createdAt: NOW,
};

const DRIFT = {
  lastTaggedVersion: '2026.3.2',
  lastTaggedAt: NOW,
  uncommittedChanges: 1,
  changedFields: ['name'],
  diffSummary: '--- tagged\n+++ current',
};

function makeMockWorkflowManager(): WorkflowManager {
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
  } as unknown as WorkflowManager;
}

function makeMockVersionManager(overrides: Partial<WorkflowVersionManager> = {}): WorkflowVersionManager {
  return {
    recordVersion: vi.fn().mockResolvedValue(VERSION),
    tagRelease: vi.fn().mockResolvedValue({ ...VERSION, versionTag: '2026.3.3' }),
    listVersions: vi.fn().mockResolvedValue({ versions: [VERSION], total: 1 }),
    getVersion: vi.fn().mockResolvedValue(VERSION),
    diffVersions: vi.fn().mockResolvedValue('--- a\n+++ b'),
    rollback: vi.fn().mockResolvedValue(VERSION),
    getDrift: vi.fn().mockResolvedValue(DRIFT),
    ...overrides,
  } as unknown as WorkflowVersionManager;
}

function buildApp(versionOverrides: Partial<WorkflowVersionManager> = {}) {
  const app = Fastify({ logger: false });
  registerWorkflowRoutes(app, {
    workflowManager: makeMockWorkflowManager(),
    workflowVersionManager: makeMockVersionManager(versionOverrides),
  });
  return app;
}

describe('Workflow version routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── List versions ──────────────────────────────────────────────────

  describe('GET /api/v1/workflows/:id/versions', () => {
    it('returns paginated versions (200)', async () => {
      const res = await buildApp().inject({
        method: 'GET',
        url: '/api/v1/workflows/wf-1/versions?limit=10&offset=0',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.versions).toHaveLength(1);
      expect(body.total).toBe(1);
    });

    it('uses default pagination when no query params', async () => {
      const vMgr = makeMockVersionManager();
      const app = Fastify({ logger: false });
      registerWorkflowRoutes(app, {
        workflowManager: makeMockWorkflowManager(),
        workflowVersionManager: vMgr,
      });

      await app.inject({ method: 'GET', url: '/api/v1/workflows/wf-1/versions' });
      expect(vMgr.listVersions).toHaveBeenCalledWith('wf-1', { limit: 50, offset: 0 });
    });
  });

  // ── Get version by ID or tag ───────────────────────────────────────

  describe('GET /api/v1/workflows/:id/versions/:idOrTag', () => {
    it('returns version when found (200)', async () => {
      const res = await buildApp().inject({
        method: 'GET',
        url: '/api/v1/workflows/wf-1/versions/wv-1',
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).id).toBe('wv-1');
    });

    it('returns 404 when version not found', async () => {
      const res = await buildApp({
        getVersion: vi.fn().mockResolvedValue(null),
      }).inject({
        method: 'GET',
        url: '/api/v1/workflows/wf-1/versions/missing',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Tag release ────────────────────────────────────────────────────

  describe('POST /api/v1/workflows/:id/versions/tag', () => {
    it('tags a release and returns it (201)', async () => {
      const res = await buildApp().inject({
        method: 'POST',
        url: '/api/v1/workflows/wf-1/versions/tag',
        payload: {},
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).versionTag).toBe('2026.3.3');
    });

    it('passes custom tag from body', async () => {
      const vMgr = makeMockVersionManager();
      const app = Fastify({ logger: false });
      registerWorkflowRoutes(app, {
        workflowManager: makeMockWorkflowManager(),
        workflowVersionManager: vMgr,
      });

      await app.inject({
        method: 'POST',
        url: '/api/v1/workflows/wf-1/versions/tag',
        payload: { tag: 'v2.0' },
      });
      expect(vMgr.tagRelease).toHaveBeenCalledWith('wf-1', 'v2.0');
    });
  });

  // ── Rollback ───────────────────────────────────────────────────────

  describe('POST /api/v1/workflows/:id/versions/:vId/rollback', () => {
    it('rolls back and returns new version (200)', async () => {
      const res = await buildApp().inject({
        method: 'POST',
        url: '/api/v1/workflows/wf-1/versions/wv-old/rollback',
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).id).toBeDefined();
    });

    it('returns 400 when rollback fails', async () => {
      const res = await buildApp({
        rollback: vi.fn().mockRejectedValue(new Error('Version not found')),
      }).inject({
        method: 'POST',
        url: '/api/v1/workflows/wf-1/versions/missing/rollback',
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Drift ──────────────────────────────────────────────────────────

  describe('GET /api/v1/workflows/:id/drift', () => {
    it('returns drift summary (200)', async () => {
      const res = await buildApp().inject({
        method: 'GET',
        url: '/api/v1/workflows/wf-1/drift',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.lastTaggedVersion).toBe('2026.3.2');
      expect(body.uncommittedChanges).toBe(1);
    });
  });

  // ── Diff ───────────────────────────────────────────────────────────

  describe('GET /api/v1/workflows/:id/versions/:a/diff/:b', () => {
    it('returns diff text (200)', async () => {
      const res = await buildApp().inject({
        method: 'GET',
        url: '/api/v1/workflows/wf-1/versions/wv-a/diff/wv-b',
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).diff).toContain('---');
    });

    it('returns 500 when diff fails', async () => {
      const res = await buildApp({
        diffVersions: vi.fn().mockRejectedValue(new Error('Version not found')),
      }).inject({
        method: 'GET',
        url: '/api/v1/workflows/wf-1/versions/wv-a/diff/missing',
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // ── Export by version ──────────────────────────────────────────────

  describe('GET /api/v1/workflows/:id/versions/:vId/export', () => {
    it('returns version snapshot as export (200)', async () => {
      const res = await buildApp().inject({
        method: 'GET',
        url: '/api/v1/workflows/wf-1/versions/wv-1/export',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.workflow).toBeDefined();
      expect(body.exportedAt).toBeDefined();
    });

    it('returns 404 when version not found for export', async () => {
      const res = await buildApp({
        getVersion: vi.fn().mockResolvedValue(null),
      }).inject({
        method: 'GET',
        url: '/api/v1/workflows/wf-1/versions/missing/export',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── 501 when versioning not available ──────────────────────────────

  describe('501 when versioning not available', () => {
    function buildAppNoVersioning() {
      const app = Fastify({ logger: false });
      registerWorkflowRoutes(app, { workflowManager: makeMockWorkflowManager() });
      return app;
    }

    it('GET versions returns 501', async () => {
      const res = await buildAppNoVersioning().inject({
        method: 'GET',
        url: '/api/v1/workflows/wf-1/versions',
      });
      expect(res.statusCode).toBe(501);
    });

    it('POST tag returns 501', async () => {
      const res = await buildAppNoVersioning().inject({
        method: 'POST',
        url: '/api/v1/workflows/wf-1/versions/tag',
        payload: {},
      });
      expect(res.statusCode).toBe(501);
    });

    it('GET drift returns 501', async () => {
      const res = await buildAppNoVersioning().inject({
        method: 'GET',
        url: '/api/v1/workflows/wf-1/drift',
      });
      expect(res.statusCode).toBe(501);
    });
  });
});
