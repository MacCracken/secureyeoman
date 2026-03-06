/**
 * DepartmentRiskStorage Tests — Phase 111
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../storage/pg-pool.js', () => ({ getPool: () => ({ query: mockQuery }) }));

import { DepartmentRiskStorage } from './department-risk-storage.js';

describe('DepartmentRiskStorage', () => {
  let storage: DepartmentRiskStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DepartmentRiskStorage();
  });

  // ── Department CRUD ──────────────────────────────────────────

  describe('createDepartment', () => {
    it('inserts a department and returns it', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'dept-1',
            name: 'Engineering',
            description: 'Engineering dept',
            mission: null,
            objectives: [],
            parent_id: null,
            team_id: null,
            risk_appetite: {
              security: 50,
              operational: 50,
              financial: 50,
              compliance: 50,
              reputational: 50,
            },
            compliance_targets: [],
            metadata: {},
            tenant_id: null,
            created_at: 1000,
            updated_at: 1000,
          },
        ],
      });

      const dept = await storage.createDepartment({
        name: 'Engineering',
        description: 'Engineering dept',
      });
      expect(dept.name).toBe('Engineering');
      expect(dept.description).toBe('Engineering dept');
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO risk.departments');
    });
  });

  describe('getDepartment', () => {
    it('returns department by id', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'dept-1',
            name: 'Engineering',
            description: null,
            mission: 'Build stuff',
            objectives: [{ title: 'Ship fast', priority: 'high' }],
            parent_id: null,
            team_id: 'team-1',
            risk_appetite: {
              security: 60,
              operational: 40,
              financial: 50,
              compliance: 50,
              reputational: 50,
            },
            compliance_targets: [],
            metadata: {},
            tenant_id: null,
            created_at: 1000,
            updated_at: 2000,
          },
        ],
      });

      const dept = await storage.getDepartment('dept-1');
      expect(dept).not.toBeNull();
      expect(dept!.name).toBe('Engineering');
      expect(dept!.mission).toBe('Build stuff');
      expect(dept!.teamId).toBe('team-1');
      expect(dept!.riskAppetite.security).toBe(60);
    });

    it('returns null for missing department', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const dept = await storage.getDepartment('not-found');
      expect(dept).toBeNull();
    });

    it('handles null/non-array fields in row conversion', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'd1',
            name: 'Minimal',
            description: null,
            mission: null,
            objectives: 'not-an-array',
            parent_id: null,
            team_id: null,
            risk_appetite: null,
            compliance_targets: 'not-an-array',
            metadata: null,
            tenant_id: null,
            created_at: '1000',
            updated_at: '2000',
          },
        ],
      });
      const dept = await storage.getDepartment('d1');
      expect(dept!.description).toBeUndefined();
      expect(dept!.mission).toBeUndefined();
      expect(dept!.objectives).toEqual([]);
      expect(dept!.parentId).toBeUndefined();
      expect(dept!.teamId).toBeUndefined();
      expect(dept!.complianceTargets).toEqual([]);
      expect(dept!.metadata).toEqual({});
      expect(dept!.tenantId).toBeUndefined();
    });
  });

  describe('updateDepartment', () => {
    const baseDeptRow = {
      id: 'dept-1',
      name: 'New Name',
      description: null,
      mission: null,
      objectives: [],
      parent_id: null,
      team_id: null,
      risk_appetite: {
        security: 50,
        operational: 50,
        financial: 50,
        compliance: 50,
        reputational: 50,
      },
      compliance_targets: [],
      metadata: {},
      tenant_id: null,
      created_at: 1000,
      updated_at: 3000,
    };

    it('updates only provided fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [baseDeptRow] });
      const dept = await storage.updateDepartment('dept-1', { name: 'New Name' });
      expect(dept!.name).toBe('New Name');
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('UPDATE risk.departments');
      expect(sql).toContain('name = $1');
    });

    it('updates all fields simultaneously', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [baseDeptRow] });
      await storage.updateDepartment('dept-1', {
        name: 'Updated',
        description: 'desc',
        mission: 'mission',
        objectives: [{ title: 'obj', priority: 'high' }],
        parentId: 'p2',
        teamId: 't2',
        riskAppetite: {
          security: 90,
          operational: 90,
          financial: 90,
          compliance: 90,
          reputational: 90,
        },
        complianceTargets: ['SOC2'],
        metadata: { key: 'val' },
      });
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('name = $1');
      expect(sql).toContain('description = $2');
      expect(sql).toContain('mission = $3');
      expect(sql).toContain('objectives = $4');
      expect(sql).toContain('parent_id = $5');
      expect(sql).toContain('team_id = $6');
      expect(sql).toContain('risk_appetite = $7');
      expect(sql).toContain('compliance_targets = $8');
      expect(sql).toContain('metadata = $9');
    });

    it('returns null when row not found on update', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const dept = await storage.updateDepartment('missing', { name: 'X' });
      expect(dept).toBeNull();
    });

    it('returns existing department when no fields provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [baseDeptRow] });
      await storage.updateDepartment('dept-1', {});
      expect(mockQuery.mock.calls[0][0]).toContain('SELECT * FROM risk.departments');
    });
  });

  describe('deleteDepartment', () => {
    it('returns true when department is deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      const deleted = await storage.deleteDepartment('dept-1');
      expect(deleted).toBe(true);
    });

    it('returns false when department not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });
      const deleted = await storage.deleteDepartment('not-found');
      expect(deleted).toBe(false);
    });
  });

  describe('listDepartments', () => {
    it('lists with pagination', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] }).mockResolvedValueOnce({
        rows: [
          {
            id: 'd1',
            name: 'A',
            description: null,
            mission: null,
            objectives: [],
            parent_id: null,
            team_id: null,
            risk_appetite: {},
            compliance_targets: [],
            metadata: {},
            tenant_id: null,
            created_at: 1000,
            updated_at: 1000,
          },
          {
            id: 'd2',
            name: 'B',
            description: null,
            mission: null,
            objectives: [],
            parent_id: null,
            team_id: null,
            risk_appetite: {},
            compliance_targets: [],
            metadata: {},
            tenant_id: null,
            created_at: 2000,
            updated_at: 2000,
          },
        ],
      });

      const result = await storage.listDepartments({ limit: 10, offset: 0 });
      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
    });

    it('filters by parentId=null (root departments)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await storage.listDepartments({ parentId: null });
      expect(mockQuery.mock.calls[0][0]).toContain('parent_id IS NULL');
    });

    it('filters by parentId string', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await storage.listDepartments({ parentId: 'p1' });
      expect(mockQuery.mock.calls[0][1]).toContain('p1');
    });

    it('filters by tenantId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await storage.listDepartments({ tenantId: 'tenant-1' });
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('tenant_id');
    });
  });

  describe('getDepartmentTree', () => {
    it('uses recursive CTE', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await storage.getDepartmentTree();
      expect(mockQuery.mock.calls[0][0]).toContain('WITH RECURSIVE tree');
    });

    it('starts from rootId when provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await storage.getDepartmentTree('root-1');
      expect(mockQuery.mock.calls[0][0]).toContain('WHERE id = $1');
      expect(mockQuery.mock.calls[0][1]).toEqual(['root-1']);
    });
  });

  // ── Register Entry CRUD ──────────────────────────────────────

  describe('createRegisterEntry', () => {
    it('inserts a register entry', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'entry-1',
            department_id: 'dept-1',
            title: 'SQL Injection',
            description: 'Found SQL injection',
            category: 'security',
            severity: 'critical',
            likelihood: 4,
            impact: 5,
            risk_score: 20,
            owner: 'alice',
            mitigations: [],
            status: 'open',
            due_date: null,
            source: 'scan',
            source_ref: null,
            evidence_refs: [],
            tenant_id: null,
            created_by: 'bob',
            created_at: 1000,
            updated_at: 1000,
            closed_at: null,
          },
        ],
      });

      const entry = await storage.createRegisterEntry(
        {
          departmentId: 'dept-1',
          title: 'SQL Injection',
          category: 'security',
          severity: 'critical',
          likelihood: 4,
          impact: 5,
        },
        'bob'
      );
      expect(entry.title).toBe('SQL Injection');
      expect(entry.riskScore).toBe(20);
      expect(entry.createdBy).toBe('bob');
    });

    it('inserts with minimal fields (null optionals)', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'entry-2',
            department_id: 'dept-1',
            title: 'Test',
            description: null,
            category: 'operational',
            severity: 'low',
            likelihood: 1,
            impact: 1,
            risk_score: 1,
            owner: null,
            mitigations: [],
            status: 'open',
            due_date: null,
            source: null,
            source_ref: null,
            evidence_refs: [],
            tenant_id: null,
            created_by: null,
            created_at: 1000,
            updated_at: 1000,
            closed_at: null,
          },
        ],
      });
      const entry = await storage.createRegisterEntry({
        departmentId: 'dept-1',
        title: 'Test',
        category: 'operational',
        severity: 'low',
        likelihood: 1,
        impact: 1,
      });
      expect(entry.owner).toBeUndefined();
      expect(entry.createdBy).toBeUndefined();
    });

    it('records score with assessmentId and tenantId', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'score-2',
            department_id: 'dept-1',
            scored_at: '2026-03-02T00:00:00Z',
            overall_score: 50,
            domain_scores: {},
            open_risks: 0,
            overdue_risks: 0,
            appetite_breaches: [],
            assessment_id: 'a1',
            tenant_id: 'tenant-1',
            created_at: 1000,
          },
        ],
      });
      const score = await storage.recordDepartmentScore({
        departmentId: 'dept-1',
        overallScore: 50,
        domainScores: {},
        openRisks: 0,
        overdueRisks: 0,
        appetiteBreaches: [],
        assessmentId: 'a1',
        tenantId: 'tenant-1',
      });
      expect(score.assessmentId).toBe('a1');
      expect(score.tenantId).toBe('tenant-1');
    });
  });

  describe('updateRegisterEntry', () => {
    const baseEntryRow = {
      id: 'entry-1',
      department_id: 'dept-1',
      title: 'Updated',
      description: null,
      category: 'security',
      severity: 'critical',
      likelihood: 4,
      impact: 5,
      risk_score: 20,
      owner: null,
      mitigations: [],
      status: 'open',
      due_date: null,
      source: null,
      source_ref: null,
      evidence_refs: [],
      tenant_id: null,
      created_by: null,
      created_at: 1000,
      updated_at: 2000,
      closed_at: null,
    };

    it('updates all fields simultaneously', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [baseEntryRow] });
      await storage.updateRegisterEntry('entry-1', {
        title: 'Updated',
        description: 'new desc',
        category: 'compliance',
        severity: 'high',
        likelihood: 3,
        impact: 4,
        owner: 'bob',
        mitigations: [{ description: 'Fix', status: 'done' }],
        status: 'mitigated',
        dueDate: '2026-05-01',
        source: 'manual',
        sourceRef: 'REF-002',
        evidenceRefs: ['e1', 'e2'],
      });
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('title = $1');
      expect(sql).toContain('description = $2');
      expect(sql).toContain('evidence_refs = $13');
    });

    it('returns existing entry when no fields provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [baseEntryRow] });
      await storage.updateRegisterEntry('entry-1', {});
      expect(mockQuery.mock.calls[0][0]).toContain('SELECT * FROM risk.register_entries');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await storage.updateRegisterEntry('missing', { title: 'X' });
      expect(result).toBeNull();
    });
  });

  describe('deleteRegisterEntry', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      expect(await storage.deleteRegisterEntry('entry-1')).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });
      expect(await storage.deleteRegisterEntry('missing')).toBe(false);
    });
  });

  describe('getRegisterEntry', () => {
    it('handles null/non-array fields in row conversion', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'e1',
            department_id: 'd1',
            title: 'Test',
            description: null,
            category: 'operational',
            severity: 'low',
            likelihood: '1',
            impact: '1',
            risk_score: '1',
            owner: null,
            mitigations: 'not-an-array',
            status: 'closed',
            due_date: null,
            source: null,
            source_ref: null,
            evidence_refs: 'not-an-array',
            tenant_id: null,
            created_by: null,
            created_at: '1000',
            updated_at: '2000',
            closed_at: '3000',
          },
        ],
      });
      const entry = await storage.getRegisterEntry('e1');
      expect(entry!.description).toBeUndefined();
      expect(entry!.owner).toBeUndefined();
      expect(entry!.mitigations).toEqual([]);
      expect(entry!.dueDate).toBeUndefined();
      expect(entry!.source).toBeUndefined();
      expect(entry!.sourceRef).toBeUndefined();
      expect(entry!.evidenceRefs).toEqual([]);
      expect(entry!.tenantId).toBeUndefined();
      expect(entry!.createdBy).toBeUndefined();
      expect(entry!.closedAt).toBe(3000);
    });
  });

  describe('listRegisterEntries', () => {
    it('filters by departmentId and status', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await storage.listRegisterEntries({ departmentId: 'dept-1', status: 'open' });
      expect(mockQuery.mock.calls[0][0]).toContain('department_id = $1');
      expect(mockQuery.mock.calls[0][0]).toContain('status = $2');
    });

    it('filters overdue entries', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await storage.listRegisterEntries({ overdue: true });
      expect(mockQuery.mock.calls[0][0]).toContain('due_date < now()');
    });

    it('filters by all fields combined', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await storage.listRegisterEntries({
        departmentId: 'dept-1',
        status: 'open',
        category: 'security',
        severity: 'critical',
        owner: 'alice',
        tenantId: 'tenant-1',
        overdue: true,
        limit: 5,
        offset: 10,
      });
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('department_id');
      expect(sql).toContain('status');
      expect(sql).toContain('category');
      expect(sql).toContain('severity');
      expect(sql).toContain('owner');
      expect(sql).toContain('tenant_id');
      expect(sql).toContain('due_date < now()');
    });

    it('lists with no filters', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await storage.listRegisterEntries();
      expect(result.total).toBe(3);
      expect(result.items).toEqual([]);
    });

    it('handles null count', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [undefined] }).mockResolvedValueOnce({ rows: [] });

      const result = await storage.listRegisterEntries();
      expect(result.total).toBe(0);
    });
  });

  describe('getRegisterStats', () => {
    it('returns stats for a department', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '10', open: '6', overdue: '2', critical: '1', avg_score: '12.5' }],
      });

      const stats = await storage.getRegisterStats('dept-1');
      expect(stats.total).toBe(10);
      expect(stats.open).toBe(6);
      expect(stats.overdue).toBe(2);
      expect(stats.critical).toBe(1);
      expect(stats.avgRiskScore).toBe(12.5);
    });
  });

  // ── Department Scores ────────────────────────────────────────

  describe('recordDepartmentScore', () => {
    it('inserts a score snapshot', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'score-1',
            department_id: 'dept-1',
            scored_at: '2026-03-02T00:00:00Z',
            overall_score: 42.5,
            domain_scores: { security: 60, operational: 25 },
            open_risks: 5,
            overdue_risks: 1,
            appetite_breaches: [{ domain: 'security', score: 60, threshold: 50 }],
            assessment_id: null,
            tenant_id: null,
            created_at: 1000,
          },
        ],
      });

      const score = await storage.recordDepartmentScore({
        departmentId: 'dept-1',
        overallScore: 42.5,
        domainScores: { security: 60, operational: 25 },
        openRisks: 5,
        overdueRisks: 1,
        appetiteBreaches: [{ domain: 'security', score: 60, threshold: 50 }],
      });
      expect(score.overallScore).toBe(42.5);
      expect(score.appetiteBreaches).toHaveLength(1);
    });
  });

  describe('listDepartmentScores', () => {
    it('lists with departmentId only', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await storage.listDepartmentScores({ departmentId: 'd1' });
      expect(mockQuery.mock.calls[0][0]).toContain('department_id = $1');
    });

    it('lists with from/to date filters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await storage.listDepartmentScores({
        departmentId: 'd1',
        from: '2026-01-01',
        to: '2026-12-31',
        limit: 50,
      });
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('scored_at >= $2');
      expect(sql).toContain('scored_at <= $3');
    });
  });

  describe('getLatestScores', () => {
    it('uses DISTINCT ON without tenantId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await storage.getLatestScores();
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('DISTINCT ON (department_id)');
      expect(sql).not.toContain('tenant_id');
    });

    it('filters by tenantId when provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await storage.getLatestScores('tenant-1');
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('tenant_id = $1');
    });

    it('handles null/non-array fields in score row conversion', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 's1',
            department_id: 'd1',
            scored_at: '2026-03-01',
            overall_score: '50',
            domain_scores: null,
            open_risks: '0',
            overdue_risks: '0',
            appetite_breaches: 'not-array',
            assessment_id: null,
            tenant_id: null,
            created_at: 1000,
          },
        ],
      });
      const scores = await storage.getLatestScores();
      expect(scores[0].domainScores).toEqual({});
      expect(scores[0].appetiteBreaches).toEqual([]);
      expect(scores[0].assessmentId).toBeUndefined();
      expect(scores[0].tenantId).toBeUndefined();
    });
  });

  describe('getAppetiteBreaches', () => {
    it('filters scores with breaches', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 's1',
            department_id: 'd1',
            scored_at: '2026-03-02',
            overall_score: 60,
            domain_scores: {},
            open_risks: 3,
            overdue_risks: 0,
            appetite_breaches: [{ domain: 'security', score: 60, threshold: 50 }],
            assessment_id: null,
            tenant_id: null,
            created_at: 1000,
          },
          {
            id: 's2',
            department_id: 'd2',
            scored_at: '2026-03-02',
            overall_score: 30,
            domain_scores: {},
            open_risks: 1,
            overdue_risks: 0,
            appetite_breaches: [],
            assessment_id: null,
            tenant_id: null,
            created_at: 1000,
          },
        ],
      });

      const breaches = await storage.getAppetiteBreaches();
      expect(breaches).toHaveLength(1);
      expect(breaches[0].departmentId).toBe('d1');
    });
  });
});
