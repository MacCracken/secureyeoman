/**
 * AthiRoutes Tests — Phase 107-F
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerAthiRoutes } from './athi-routes.js';
import type { AthiManager } from './athi-manager.js';

const SAMPLE = {
  id: 'athi-1',
  title: 'Prompt Injection Attack',
  actor: 'cybercriminal',
  techniques: ['prompt_injection'],
  harms: ['data_breach'],
  impacts: ['regulatory_penalty'],
  likelihood: 4,
  severity: 5,
  riskScore: 20,
  mitigations: [],
  linkedEventIds: [],
  status: 'identified',
  createdAt: 1000,
  updatedAt: 1000,
};

function makeMockManager(): AthiManager {
  return {
    createScenario: vi.fn(),
    getScenario: vi.fn(),
    updateScenario: vi.fn(),
    deleteScenario: vi.fn(),
    listScenarios: vi.fn(),
    getRiskMatrix: vi.fn(),
    getTopRisks: vi.fn(),
    generateExecutiveSummary: vi.fn(),
    linkEvents: vi.fn(),
    findScenariosForTechnique: vi.fn(),
    getScenariosWithLinkedEvents: vi.fn(),
  } as unknown as AthiManager;
}

describe('AthiRoutes', () => {
  let app: FastifyInstance;
  let mgr: ReturnType<typeof makeMockManager>;

  beforeAll(async () => {
    app = Fastify();
    mgr = makeMockManager();
    registerAthiRoutes(app, { athiManager: mgr });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── POST /api/v1/security/athi/scenarios ───────────────────────

  describe('POST /api/v1/security/athi/scenarios', () => {
    it('creates a scenario (201)', async () => {
      (mgr.createScenario as any).mockResolvedValue(SAMPLE);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/athi/scenarios',
        payload: {
          title: 'Prompt Injection Attack',
          actor: 'cybercriminal',
          techniques: ['prompt_injection'],
          harms: ['data_breach'],
          impacts: ['regulatory_penalty'],
          likelihood: 4,
          severity: 5,
        },
      });

      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).scenario.id).toBe('athi-1');
    });

    it('returns 400 for invalid body', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/athi/scenarios',
        payload: { title: '' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when techniques are missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/athi/scenarios',
        payload: {
          title: 'Test',
          actor: 'insider',
          techniques: [],
          harms: ['data_breach'],
          impacts: ['ip_theft'],
          likelihood: 3,
          severity: 3,
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ── GET /api/v1/security/athi/scenarios ────────────────────────

  describe('GET /api/v1/security/athi/scenarios', () => {
    it('lists scenarios', async () => {
      (mgr.listScenarios as any).mockResolvedValue({
        items: [SAMPLE],
        total: 1,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/athi/scenarios',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.items).toHaveLength(1);
      expect(body.total).toBe(1);
    });

    it('passes query filters', async () => {
      (mgr.listScenarios as any).mockResolvedValue({ items: [], total: 0 });

      await app.inject({
        method: 'GET',
        url: '/api/v1/security/athi/scenarios?actor=insider&status=mitigated&limit=10',
      });

      expect(mgr.listScenarios).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: 'insider',
          status: 'mitigated',
          limit: 10,
        })
      );
    });
  });

  // ── GET /api/v1/security/athi/scenarios/:id ───────────────────

  describe('GET /api/v1/security/athi/scenarios/:id', () => {
    it('returns a scenario', async () => {
      (mgr.getScenario as any).mockResolvedValue(SAMPLE);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/athi/scenarios/athi-1',
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).scenario.id).toBe('athi-1');
    });

    it('returns 404 when not found', async () => {
      (mgr.getScenario as any).mockResolvedValue(null);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/athi/scenarios/missing',
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ── PUT /api/v1/security/athi/scenarios/:id ───────────────────

  describe('PUT /api/v1/security/athi/scenarios/:id', () => {
    it('updates a scenario', async () => {
      (mgr.updateScenario as any).mockResolvedValue({
        ...SAMPLE,
        status: 'assessed',
      });

      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/security/athi/scenarios/athi-1',
        payload: { status: 'assessed' },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).scenario.status).toBe('assessed');
    });

    it('returns 404 when not found', async () => {
      (mgr.updateScenario as any).mockResolvedValue(null);

      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/security/athi/scenarios/missing',
        payload: { title: 'Updated' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 400 for invalid update body', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/security/athi/scenarios/athi-1',
        payload: { likelihood: 99 },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ── DELETE /api/v1/security/athi/scenarios/:id ────────────────

  describe('DELETE /api/v1/security/athi/scenarios/:id', () => {
    it('deletes a scenario (204)', async () => {
      (mgr.deleteScenario as any).mockResolvedValue(true);

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/security/athi/scenarios/athi-1',
      });

      expect(res.statusCode).toBe(204);
    });

    it('returns 404 when not found', async () => {
      (mgr.deleteScenario as any).mockResolvedValue(false);

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/security/athi/scenarios/missing',
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ── GET /api/v1/security/athi/matrix ──────────────────────────

  describe('GET /api/v1/security/athi/matrix', () => {
    it('returns the risk matrix', async () => {
      (mgr.getRiskMatrix as any).mockResolvedValue([
        { actor: 'cybercriminal', technique: 'prompt_injection', count: 2, avgRiskScore: 15 },
      ]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/athi/matrix',
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).matrix).toHaveLength(1);
    });
  });

  // ── GET /api/v1/security/athi/top-risks ───────────────────────

  describe('GET /api/v1/security/athi/top-risks', () => {
    it('returns top risks', async () => {
      (mgr.getTopRisks as any).mockResolvedValue([SAMPLE]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/athi/top-risks',
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).topRisks).toHaveLength(1);
    });

    it('respects limit parameter', async () => {
      (mgr.getTopRisks as any).mockResolvedValue([]);

      await app.inject({
        method: 'GET',
        url: '/api/v1/security/athi/top-risks?limit=5',
      });

      expect(mgr.getTopRisks).toHaveBeenCalledWith(5, undefined);
    });
  });

  // ── GET /api/v1/security/athi/summary ─────────────────────────

  describe('GET /api/v1/security/athi/summary', () => {
    it('returns executive summary', async () => {
      (mgr.generateExecutiveSummary as any).mockResolvedValue({
        totalScenarios: 10,
        byStatus: { identified: 5 },
        byActor: { cybercriminal: 3 },
        topRisks: [SAMPLE],
        averageRiskScore: 12.5,
        mitigationCoverage: 60,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/athi/summary',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.summary.totalScenarios).toBe(10);
      expect(body.summary.mitigationCoverage).toBe(60);
    });
  });

  // ── POST /api/v1/security/athi/scenarios/:id/link-events ──────

  describe('POST /api/v1/security/athi/scenarios/:id/link-events', () => {
    it('links events and returns updated scenario', async () => {
      const linked = { ...SAMPLE, linkedEventIds: ['evt-1', 'evt-2'] };
      (mgr.linkEvents as ReturnType<typeof vi.fn>).mockResolvedValue(linked);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/athi/scenarios/athi-1/link-events',
        payload: { eventIds: ['evt-1', 'evt-2'] },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.scenario.linkedEventIds).toEqual(['evt-1', 'evt-2']);
    });

    it('returns 400 for empty eventIds', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/athi/scenarios/athi-1/link-events',
        payload: { eventIds: [] },
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 404 when scenario not found', async () => {
      (mgr.linkEvents as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/athi/scenarios/missing/link-events',
        payload: { eventIds: ['evt-1'] },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ── GET /api/v1/security/athi/scenarios/by-technique/:technique ──

  describe('GET /api/v1/security/athi/scenarios/by-technique/:technique', () => {
    it('returns scenarios matching a technique', async () => {
      (mgr.findScenariosForTechnique as ReturnType<typeof vi.fn>).mockResolvedValue([SAMPLE]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/athi/scenarios/by-technique/prompt_injection',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.scenarios).toHaveLength(1);
      expect(body.scenarios[0].id).toBe('athi-1');
    });
  });
});
