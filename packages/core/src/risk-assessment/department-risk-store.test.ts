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
  });

  describe('updateDepartment', () => {
    it('updates only provided fields', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
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
          },
        ],
      });

      const dept = await storage.updateDepartment('dept-1', { name: 'New Name' });
      expect(dept!.name).toBe('New Name');
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('UPDATE risk.departments');
      expect(sql).toContain('name = $1');
    });

    it('returns existing department when no fields provided', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'dept-1',
            name: 'Engineering',
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
            updated_at: 1000,
          },
        ],
      });

      await storage.updateDepartment('dept-1', {});
      // Should call getDepartment, not UPDATE
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

  describe('getLatestScores', () => {
    it('uses DISTINCT ON for latest per department', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await storage.getLatestScores();
      expect(mockQuery.mock.calls[0][0]).toContain('DISTINCT ON (department_id)');
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
