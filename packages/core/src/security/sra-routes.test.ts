/**
 * SraRoutes Tests — Phase 123
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerSraRoutes } from './sra-routes.js';
import type { SraManager } from './sra-manager.js';

const SAMPLE_BLUEPRINT = {
  id: 'bp-1',
  name: 'AWS SRA Foundation',
  provider: 'aws',
  framework: 'aws_sra',
  controls: [],
  status: 'active',
  isBuiltin: true,
  metadata: {},
  createdAt: 1000,
  updatedAt: 1000,
};

const SAMPLE_ASSESSMENT = {
  id: 'assess-1',
  blueprintId: 'bp-1',
  name: 'Q1 Assessment',
  controlResults: [],
  status: 'in_progress',
  createdAt: 2000,
  updatedAt: 2000,
};

function makeMockManager(): SraManager {
  return {
    createBlueprint: vi.fn(),
    getBlueprint: vi.fn(),
    updateBlueprint: vi.fn(),
    deleteBlueprint: vi.fn(),
    listBlueprints: vi.fn(),
    createAssessment: vi.fn(),
    getAssessment: vi.fn(),
    updateAssessment: vi.fn(),
    listAssessments: vi.fn(),
    generateAssessmentSummary: vi.fn(),
    getComplianceMappings: vi.fn(),
    getSummary: vi.fn(),
  } as unknown as SraManager;
}

describe('SraRoutes', () => {
  let app: FastifyInstance;
  let mgr: ReturnType<typeof makeMockManager>;

  beforeAll(async () => {
    app = Fastify();
    mgr = makeMockManager();
    registerSraRoutes(app, { sraManager: mgr });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Blueprint routes ───────────────────────────────────────────

  describe('POST /api/v1/security/sra/blueprints', () => {
    it('creates a blueprint (201)', async () => {
      (mgr.createBlueprint as any).mockResolvedValue(SAMPLE_BLUEPRINT);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/sra/blueprints',
        payload: {
          name: 'AWS SRA Foundation',
          provider: 'aws',
          framework: 'aws_sra',
        },
      });

      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).blueprint.id).toBe('bp-1');
    });

    it('returns 400 for invalid body', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/sra/blueprints',
        payload: { name: '' },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/security/sra/blueprints', () => {
    it('lists blueprints', async () => {
      (mgr.listBlueprints as any).mockResolvedValue({
        items: [SAMPLE_BLUEPRINT],
        total: 1,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/sra/blueprints',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.items).toHaveLength(1);
      expect(body.total).toBe(1);
    });

    it('passes query filters', async () => {
      (mgr.listBlueprints as any).mockResolvedValue({ items: [], total: 0 });

      await app.inject({
        method: 'GET',
        url: '/api/v1/security/sra/blueprints?provider=aws&framework=aws_sra&limit=10',
      });

      expect(mgr.listBlueprints).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'aws',
          framework: 'aws_sra',
          limit: 10,
        })
      );
    });
  });

  describe('GET /api/v1/security/sra/blueprints/:id', () => {
    it('returns a blueprint', async () => {
      (mgr.getBlueprint as any).mockResolvedValue(SAMPLE_BLUEPRINT);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/sra/blueprints/bp-1',
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).blueprint.id).toBe('bp-1');
    });

    it('returns 404 when not found', async () => {
      (mgr.getBlueprint as any).mockResolvedValue(null);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/sra/blueprints/missing',
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /api/v1/security/sra/blueprints/:id', () => {
    it('updates a blueprint', async () => {
      (mgr.updateBlueprint as any).mockResolvedValue({
        ...SAMPLE_BLUEPRINT,
        status: 'archived',
      });

      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/security/sra/blueprints/bp-1',
        payload: { status: 'archived' },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).blueprint.status).toBe('archived');
    });

    it('returns 404 when not found', async () => {
      (mgr.updateBlueprint as any).mockResolvedValue(null);

      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/security/sra/blueprints/missing',
        payload: { name: 'Updated' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 400 for invalid update body', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/security/sra/blueprints/bp-1',
        payload: { provider: 'invalid_provider' },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/v1/security/sra/blueprints/:id', () => {
    it('deletes a blueprint (204)', async () => {
      (mgr.deleteBlueprint as any).mockResolvedValue(true);

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/security/sra/blueprints/bp-1',
      });

      expect(res.statusCode).toBe(204);
    });

    it('returns 404 when not found', async () => {
      (mgr.deleteBlueprint as any).mockResolvedValue(false);

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/security/sra/blueprints/missing',
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ── Assessment routes ──────────────────────────────────────────

  describe('POST /api/v1/security/sra/assessments', () => {
    it('creates an assessment (201)', async () => {
      (mgr.createAssessment as any).mockResolvedValue(SAMPLE_ASSESSMENT);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/sra/assessments',
        payload: {
          blueprintId: 'bp-1',
          name: 'Q1 Assessment',
        },
      });

      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).assessment.id).toBe('assess-1');
    });

    it('returns 400 for missing blueprintId', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/sra/assessments',
        payload: { name: 'Test' },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/security/sra/assessments', () => {
    it('lists assessments', async () => {
      (mgr.listAssessments as any).mockResolvedValue({
        items: [SAMPLE_ASSESSMENT],
        total: 1,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/sra/assessments',
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).items).toHaveLength(1);
    });

    it('passes blueprintId filter', async () => {
      (mgr.listAssessments as any).mockResolvedValue({ items: [], total: 0 });

      await app.inject({
        method: 'GET',
        url: '/api/v1/security/sra/assessments?blueprintId=bp-1',
      });

      expect(mgr.listAssessments).toHaveBeenCalledWith(
        expect.objectContaining({ blueprintId: 'bp-1' })
      );
    });
  });

  describe('GET /api/v1/security/sra/assessments/:id', () => {
    it('returns an assessment', async () => {
      (mgr.getAssessment as any).mockResolvedValue(SAMPLE_ASSESSMENT);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/sra/assessments/assess-1',
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).assessment.id).toBe('assess-1');
    });

    it('returns 404 when not found', async () => {
      (mgr.getAssessment as any).mockResolvedValue(null);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/sra/assessments/missing',
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /api/v1/security/sra/assessments/:id', () => {
    it('updates an assessment', async () => {
      (mgr.updateAssessment as any).mockResolvedValue({
        ...SAMPLE_ASSESSMENT,
        status: 'completed',
      });

      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/security/sra/assessments/assess-1',
        payload: { status: 'completed' },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).assessment.status).toBe('completed');
    });

    it('returns 404 when not found', async () => {
      (mgr.updateAssessment as any).mockResolvedValue(null);

      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/security/sra/assessments/missing',
        payload: { name: 'Updated' },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ── Generate endpoint ──────────────────────────────────────────

  describe('POST /api/v1/security/sra/assessments/:id/generate', () => {
    it('generates assessment summary', async () => {
      const withSummary = {
        ...SAMPLE_ASSESSMENT,
        summary: { complianceScore: 85, totalControls: 10, implemented: 8, partial: 1, notImplemented: 1, notApplicable: 0, topGaps: [], domainScores: {} },
        status: 'completed',
      };
      (mgr.generateAssessmentSummary as any).mockResolvedValue(withSummary);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/sra/assessments/assess-1/generate',
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).assessment.summary.complianceScore).toBe(85);
    });

    it('returns 404 when not found', async () => {
      (mgr.generateAssessmentSummary as any).mockResolvedValue(null);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/sra/assessments/missing/generate',
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ── Compliance mappings ────────────────────────────────────────

  describe('GET /api/v1/security/sra/compliance-mappings', () => {
    it('returns compliance mappings', async () => {
      (mgr.getComplianceMappings as any).mockResolvedValue([
        { domain: 'identity_access', framework: 'NIST CSF', controlId: 'PR.AC', controlTitle: 'Access Control', description: 'desc' },
      ]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/sra/compliance-mappings',
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).mappings).toHaveLength(1);
    });

    it('passes domain and framework filters', async () => {
      (mgr.getComplianceMappings as any).mockResolvedValue([]);

      await app.inject({
        method: 'GET',
        url: '/api/v1/security/sra/compliance-mappings?domain=identity_access&framework=NIST%20CSF',
      });

      expect(mgr.getComplianceMappings).toHaveBeenCalledWith({
        domain: 'identity_access',
        framework: 'NIST CSF',
      });
    });
  });

  // ── Summary ────────────────────────────────────────────────────

  describe('GET /api/v1/security/sra/summary', () => {
    it('returns executive summary', async () => {
      (mgr.getSummary as any).mockResolvedValue({
        totalBlueprints: 3,
        totalAssessments: 5,
        avgComplianceScore: 72.5,
        byProvider: { aws: 1 },
        byFramework: { aws_sra: 1 },
        topGaps: ['MFA not enabled'],
        recentAssessments: [],
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/sra/summary',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.summary.totalBlueprints).toBe(3);
      expect(body.summary.avgComplianceScore).toBe(72.5);
    });
  });
});
