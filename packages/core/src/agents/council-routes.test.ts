import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerCouncilRoutes } from './council-routes.js';
import type { CouncilManager } from './council-manager.js';

// ─── Fixtures ──────────────────────────────────────────────────────

const TEMPLATE = {
  id: 'tmpl-1',
  name: 'Board of Directors',
  description: 'Strategic review',
  members: [
    { role: 'CFO', profileName: 'analyst', description: 'Finance', weight: 1, perspective: 'Financial' },
  ],
  facilitatorProfile: 'summarizer',
  deliberationStrategy: 'rounds',
  maxRounds: 3,
  votingStrategy: 'facilitator_judgment',
  isBuiltin: false,
  createdAt: 1000,
};

const COUNCIL_RUN = {
  id: 'run-1',
  templateId: 'tmpl-1',
  templateName: 'Board of Directors',
  topic: 'Should we expand?',
  context: null,
  status: 'completed',
  deliberationStrategy: 'rounds',
  maxRounds: 3,
  completedRounds: 3,
  decision: 'Support expansion',
  consensus: 'majority',
  dissents: [],
  reasoning: 'Majority favored expansion',
  confidence: 0.85,
  tokenBudget: 500000,
  tokensUsed: 3000,
  createdAt: 1000,
  startedAt: 1001,
  completedAt: 1002,
  initiatedBy: null,
  positions: [],
};

const CATALOG = [
  { name: 'Board of Directors', description: 'Strategic review', members: [], facilitatorProfile: 'summarizer' },
  { name: 'Architecture Review Board', description: 'Tech review', members: [], facilitatorProfile: 'summarizer' },
];

// ─── Mock factory ──────────────────────────────────────────────────

function makeMockManager(overrides?: Partial<CouncilManager>): CouncilManager {
  return {
    getCatalog: vi.fn().mockReturnValue(CATALOG),
    installFromCatalog: vi.fn().mockResolvedValue(TEMPLATE),
    listTemplates: vi.fn().mockResolvedValue({ templates: [TEMPLATE], total: 1 }),
    getTemplate: vi.fn().mockResolvedValue(TEMPLATE),
    createTemplate: vi.fn().mockResolvedValue(TEMPLATE),
    updateTemplate: vi.fn().mockResolvedValue(TEMPLATE),
    deleteTemplate: vi.fn().mockResolvedValue(true),
    convene: vi.fn().mockResolvedValue(COUNCIL_RUN),
    listRuns: vi.fn().mockResolvedValue({ runs: [COUNCIL_RUN], total: 1 }),
    getRun: vi.fn().mockResolvedValue(COUNCIL_RUN),
    cancelRun: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as CouncilManager;
}

function buildApp(overrides?: Partial<CouncilManager>) {
  const app = Fastify();
  registerCouncilRoutes(app, { councilManager: makeMockManager(overrides) });
  return app;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Council Routes', () => {
  // ── Catalog ───────────────────────────────────────────────────

  describe('GET /api/v1/agents/councils/catalog', () => {
    it('returns catalog entries', async () => {
      const app = buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v1/agents/councils/catalog' });
      expect(res.statusCode).toBe(200);
      expect(res.json().templates).toHaveLength(2);
    });
  });

  describe('POST /api/v1/agents/councils/catalog/:name/install', () => {
    it('installs a template from catalog', async () => {
      const app = buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/councils/catalog/Board%20of%20Directors/install',
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().template.name).toBe('Board of Directors');
    });

    it('returns 409 when already installed', async () => {
      const app = buildApp({
        installFromCatalog: vi.fn().mockRejectedValue(new Error('Template already installed: x')),
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/councils/catalog/x/install',
      });
      expect(res.statusCode).toBe(409);
    });

    it('returns 404 when catalog entry not found', async () => {
      const app = buildApp({
        installFromCatalog: vi.fn().mockRejectedValue(new Error('Catalog template not found: x')),
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/councils/catalog/x/install',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Templates ─────────────────────────────────────────────────

  describe('GET /api/v1/agents/councils/templates', () => {
    it('returns templates', async () => {
      const app = buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v1/agents/councils/templates' });
      expect(res.statusCode).toBe(200);
      expect(res.json().templates).toHaveLength(1);
    });
  });

  describe('GET /api/v1/agents/councils/templates/:id', () => {
    it('returns template', async () => {
      const app = buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/agents/councils/templates/tmpl-1',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().template.name).toBe('Board of Directors');
    });

    it('returns 404 when not found', async () => {
      const app = buildApp({ getTemplate: vi.fn().mockResolvedValue(null) });
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/agents/councils/templates/missing',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/agents/councils/templates', () => {
    it('creates a template', async () => {
      const app = buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/councils/templates',
        payload: {
          name: 'Custom Council',
          members: [{ role: 'Lead', profileName: 'analyst' }],
          facilitatorProfile: 'summarizer',
        },
      });
      expect(res.statusCode).toBe(201);
    });

    it('returns 400 on error', async () => {
      const app = buildApp({
        createTemplate: vi.fn().mockRejectedValue(new Error('duplicate')),
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/councils/templates',
        payload: { name: 'dup', members: [], facilitatorProfile: 'summarizer' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('PUT /api/v1/agents/councils/templates/:id', () => {
    it('updates a template', async () => {
      const app = buildApp();
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/agents/councils/templates/tmpl-1',
        payload: { name: 'Updated' },
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns 404 when not found', async () => {
      const app = buildApp({ updateTemplate: vi.fn().mockResolvedValue(null) });
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/agents/councils/templates/missing',
        payload: { name: 'x' },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v1/agents/councils/templates/:id', () => {
    it('deletes a template', async () => {
      const app = buildApp();
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/agents/councils/templates/tmpl-1',
      });
      expect(res.statusCode).toBe(204);
    });

    it('returns 404 when not found', async () => {
      const app = buildApp({ getTemplate: vi.fn().mockResolvedValue(null) });
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/agents/councils/templates/missing',
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 403 for builtin', async () => {
      const app = buildApp({
        getTemplate: vi.fn().mockResolvedValue({ ...TEMPLATE, isBuiltin: true }),
      });
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/agents/councils/templates/tmpl-1',
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ── Runs ──────────────────────────────────────────────────────

  describe('POST /api/v1/agents/councils', () => {
    it('convenes a council', async () => {
      const app = buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/councils',
        payload: { templateId: 'tmpl-1', topic: 'Should we expand?' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().run.decision).toBe('Support expansion');
    });

    it('returns 400 on convene failure', async () => {
      const app = buildApp({
        convene: vi.fn().mockRejectedValue(new Error('Template not found')),
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/councils',
        payload: { templateId: 'bad', topic: 'test' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/agents/councils/runs', () => {
    it('lists runs', async () => {
      const app = buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v1/agents/councils/runs' });
      expect(res.statusCode).toBe(200);
      expect(res.json().runs).toHaveLength(1);
    });
  });

  describe('GET /api/v1/agents/councils/runs/:id', () => {
    it('returns a run', async () => {
      const app = buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/agents/councils/runs/run-1',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().run.topic).toBe('Should we expand?');
    });

    it('returns 404 when not found', async () => {
      const app = buildApp({ getRun: vi.fn().mockResolvedValue(null) });
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/agents/councils/runs/missing',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/agents/councils/runs/:id/cancel', () => {
    it('cancels a run', async () => {
      const app = buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/councils/runs/run-1/cancel',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });

    it('returns 400 on cancel failure', async () => {
      const app = buildApp({
        cancelRun: vi.fn().mockRejectedValue(new Error('Cannot cancel')),
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/councils/runs/run-1/cancel',
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
