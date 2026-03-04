/**
 * SraStorage Tests — Phase 123
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../storage/pg-pool.js', () => ({ getPool: () => ({ query: mockQuery }) }));

import { SraStorage } from './sra-storage.js';

const SAMPLE_BLUEPRINT_ROW = {
  id: 'bp-1',
  org_id: null,
  name: 'AWS SRA Foundation',
  description: 'AWS reference architecture',
  provider: 'aws',
  framework: 'aws_sra',
  controls: [{ id: 'c1', domain: 'identity_access', title: 'MFA', description: 'Enable MFA', priority: 'critical' }],
  status: 'active',
  is_builtin: true,
  metadata: { version: '2026.3.4' },
  created_by: 'system',
  created_at: 1000,
  updated_at: 1000,
};

const SAMPLE_ASSESSMENT_ROW = {
  id: 'assess-1',
  org_id: null,
  blueprint_id: 'bp-1',
  name: 'Q1 Assessment',
  infrastructure_description: 'Production AWS environment',
  control_results: [{ controlId: 'c1', status: 'fully_implemented' }],
  summary: { complianceScore: 85, totalControls: 1, implemented: 1, partial: 0, notImplemented: 0, notApplicable: 0, topGaps: [], domainScores: {} },
  status: 'completed',
  linked_risk_assessment_id: null,
  created_by: 'user-1',
  created_at: 2000,
  updated_at: 2000,
};

describe('SraStorage', () => {
  let storage: SraStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new SraStorage();
  });

  // ── Blueprints ─────────────────────────────────────────────────

  describe('createBlueprint', () => {
    it('inserts a blueprint and returns it', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_BLUEPRINT_ROW] });

      const bp = await storage.createBlueprint({
        name: 'AWS SRA Foundation',
        provider: 'aws',
        framework: 'aws_sra',
      });

      expect(bp.name).toBe('AWS SRA Foundation');
      expect(bp.provider).toBe('aws');
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO security.sra_blueprints');
    });

    it('passes orgId when provided', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...SAMPLE_BLUEPRINT_ROW, org_id: 'org-1' }],
      });

      const bp = await storage.createBlueprint(
        { name: 'Test', provider: 'azure', framework: 'mcra' },
        'user-1',
        'org-1'
      );

      expect(bp.orgId).toBe('org-1');
    });
  });

  describe('getBlueprint', () => {
    it('returns blueprint by id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_BLUEPRINT_ROW] });
      const bp = await storage.getBlueprint('bp-1');
      expect(bp?.id).toBe('bp-1');
      expect(bp?.isBuiltin).toBe(true);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const bp = await storage.getBlueprint('missing');
      expect(bp).toBeNull();
    });
  });

  describe('updateBlueprint', () => {
    it('updates fields and returns updated blueprint', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...SAMPLE_BLUEPRINT_ROW, status: 'archived' }],
      });

      const bp = await storage.updateBlueprint('bp-1', { status: 'archived' });
      expect(bp?.status).toBe('archived');
      expect(mockQuery.mock.calls[0][0]).toContain('UPDATE security.sra_blueprints');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await storage.updateBlueprint('missing', { name: 'New' });
      expect(result).toBeNull();
    });

    it('falls back to getBlueprint when no fields to update', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_BLUEPRINT_ROW] });
      const result = await storage.updateBlueprint('bp-1', {});
      expect(result?.id).toBe('bp-1');
      expect(mockQuery.mock.calls[0][0]).toContain('SELECT');
    });
  });

  describe('deleteBlueprint', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      const deleted = await storage.deleteBlueprint('bp-1');
      expect(deleted).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });
      const deleted = await storage.deleteBlueprint('missing');
      expect(deleted).toBe(false);
    });
  });

  describe('listBlueprints', () => {
    it('lists blueprints with pagination', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [SAMPLE_BLUEPRINT_ROW] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await storage.listBlueprints({ limit: 10, offset: 0 });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('applies provider filter', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await storage.listBlueprints({ provider: 'aws' });
      expect(mockQuery.mock.calls[0][0]).toContain('provider = $1');
    });

    it('applies framework filter', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await storage.listBlueprints({ framework: 'aws_sra' });
      expect(mockQuery.mock.calls[0][0]).toContain('framework = $1');
    });

    it('applies status filter', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await storage.listBlueprints({ status: 'active' });
      expect(mockQuery.mock.calls[0][0]).toContain('status = $1');
    });
  });

  describe('createBuiltinBlueprint', () => {
    it('upserts a builtin blueprint', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_BLUEPRINT_ROW] });

      const bp = await storage.createBuiltinBlueprint({
        id: 'sra-builtin-aws',
        name: 'AWS SRA',
        provider: 'aws',
        framework: 'aws_sra',
      });

      expect(bp.isBuiltin).toBe(true);
      expect(mockQuery.mock.calls[0][0]).toContain('ON CONFLICT');
    });
  });

  // ── Assessments ────────────────────────────────────────────────

  describe('createAssessment', () => {
    it('inserts an assessment and returns it', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_ASSESSMENT_ROW] });

      const a = await storage.createAssessment({
        blueprintId: 'bp-1',
        name: 'Q1 Assessment',
      });

      expect(a.name).toBe('Q1 Assessment');
      expect(a.blueprintId).toBe('bp-1');
      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO security.sra_assessments');
    });
  });

  describe('getAssessment', () => {
    it('returns assessment by id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_ASSESSMENT_ROW] });
      const a = await storage.getAssessment('assess-1');
      expect(a?.id).toBe('assess-1');
      expect(a?.summary?.complianceScore).toBe(85);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const a = await storage.getAssessment('missing');
      expect(a).toBeNull();
    });
  });

  describe('updateAssessment', () => {
    it('updates fields and returns updated assessment', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...SAMPLE_ASSESSMENT_ROW, status: 'archived' }],
      });

      const a = await storage.updateAssessment('assess-1', { status: 'archived' });
      expect(a?.status).toBe('archived');
    });

    it('falls back to getAssessment when no fields to update', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_ASSESSMENT_ROW] });
      const result = await storage.updateAssessment('assess-1', {});
      expect(result?.id).toBe('assess-1');
    });
  });

  describe('listAssessments', () => {
    it('lists assessments with pagination', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [SAMPLE_ASSESSMENT_ROW] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await storage.listAssessments({ limit: 10, offset: 0 });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('applies blueprintId filter', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await storage.listAssessments({ blueprintId: 'bp-1' });
      expect(mockQuery.mock.calls[0][0]).toContain('blueprint_id = $1');
    });
  });

  // ── Compliance mappings ────────────────────────────────────────

  describe('getComplianceMappings', () => {
    it('returns all mappings when no filters', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { domain: 'identity_access', framework: 'NIST CSF', control_id: 'PR.AC', control_title: 'Access Control', description: 'desc' },
        ],
      });

      const mappings = await storage.getComplianceMappings();
      expect(mappings).toHaveLength(1);
      expect(mappings[0].domain).toBe('identity_access');
      expect(mappings[0].controlId).toBe('PR.AC');
    });

    it('applies domain filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await storage.getComplianceMappings({ domain: 'identity_access' });
      expect(mockQuery.mock.calls[0][0]).toContain('domain = $1');
    });

    it('applies framework filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await storage.getComplianceMappings({ framework: 'NIST CSF' });
      expect(mockQuery.mock.calls[0][0]).toContain('framework = $1');
    });
  });

  describe('seedComplianceMappings', () => {
    it('upserts mappings', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await storage.seedComplianceMappings([
        { domain: 'identity_access', framework: 'NIST CSF', controlId: 'PR.AC', controlTitle: 'Access Control', description: 'desc' },
      ]);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][0]).toContain('ON CONFLICT');
    });
  });

  // ── Summary ────────────────────────────────────────────────────

  describe('getBlueprintCounts', () => {
    it('returns blueprint count aggregations', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ provider: 'aws', count: '2' }] })
        .mockResolvedValueOnce({ rows: [{ framework: 'aws_sra', count: '2' }] })
        .mockResolvedValueOnce({ rows: [{ count: '3' }] });

      const counts = await storage.getBlueprintCounts();
      expect(counts.total).toBe(3);
      expect(counts.byProvider.aws).toBe(2);
      expect(counts.byFramework.aws_sra).toBe(2);
    });
  });

  describe('getAssessmentStats', () => {
    it('returns assessment statistics', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [{ avg: '72.5' }] })
        .mockResolvedValueOnce({ rows: [SAMPLE_ASSESSMENT_ROW] });

      const stats = await storage.getAssessmentStats();
      expect(stats.total).toBe(5);
      expect(stats.avgComplianceScore).toBe(72.5);
      expect(stats.recent).toHaveLength(1);
    });
  });
});
