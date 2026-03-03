/**
 * DepartmentRiskManager Tests — Phase 111
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../storage/pg-pool.js', () => ({ getPool: () => ({ query: mockQuery }) }));
vi.mock('../logging/logger.js', () => ({
  getLogger: () => ({
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  }),
}));

import { DepartmentRiskManager } from './department-risk-manager.js';
import type { DepartmentRiskStorage } from './department-risk-storage.js';

function makeMockStorage(): DepartmentRiskStorage {
  return {
    createDepartment: vi.fn(),
    getDepartment: vi.fn(),
    updateDepartment: vi.fn(),
    deleteDepartment: vi.fn(),
    listDepartments: vi.fn(),
    getDepartmentTree: vi.fn(),
    createRegisterEntry: vi.fn(),
    getRegisterEntry: vi.fn(),
    updateRegisterEntry: vi.fn(),
    deleteRegisterEntry: vi.fn(),
    listRegisterEntries: vi.fn(),
    getRegisterStats: vi.fn(),
    recordDepartmentScore: vi.fn(),
    listDepartmentScores: vi.fn(),
    getLatestScores: vi.fn(),
    getAppetiteBreaches: vi.fn(),
  } as unknown as DepartmentRiskStorage;
}

describe('DepartmentRiskManager', () => {
  let mgr: DepartmentRiskManager;
  let storage: ReturnType<typeof makeMockStorage>;
  let mockAlertManager: { evaluate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    storage = makeMockStorage();
    mockAlertManager = { evaluate: vi.fn().mockResolvedValue(undefined) };
    mgr = new DepartmentRiskManager({
      storage,
      pool: { query: mockQuery } as any,
      getAlertManager: () => mockAlertManager as any,
    });
  });

  // ── Department CRUD ──────────────────────────────────────────

  describe('createDepartment', () => {
    it('delegates to storage', async () => {
      const dept = { id: 'd1', name: 'Eng' };
      (storage.createDepartment as any).mockResolvedValue(dept);
      const result = await mgr.createDepartment({ name: 'Eng' });
      expect(result).toEqual(dept);
      expect(storage.createDepartment).toHaveBeenCalledWith({ name: 'Eng' }, undefined);
    });
  });

  describe('deleteDepartment', () => {
    it('rejects deletion with open entries unless force', async () => {
      (storage.getRegisterStats as any).mockResolvedValue({ open: 3, overdue: 0, critical: 0, total: 5, avgRiskScore: 10 });
      await expect(mgr.deleteDepartment('d1')).rejects.toThrow('open risk entries');
    });

    it('allows deletion with open entries when force=true', async () => {
      (storage.deleteDepartment as any).mockResolvedValue(true);
      const result = await mgr.deleteDepartment('d1', true);
      expect(result).toBe(true);
      expect(storage.getRegisterStats).not.toHaveBeenCalled();
    });

    it('allows deletion when no open entries', async () => {
      (storage.getRegisterStats as any).mockResolvedValue({ open: 0, overdue: 0, critical: 0, total: 2, avgRiskScore: 5 });
      (storage.deleteDepartment as any).mockResolvedValue(true);
      const result = await mgr.deleteDepartment('d1');
      expect(result).toBe(true);
    });
  });

  // ── Register Entry ───────────────────────────────────────────

  describe('closeRegisterEntry', () => {
    it('sets status to closed', async () => {
      const entry = { id: 'e1', status: 'closed' };
      (storage.updateRegisterEntry as any).mockResolvedValue(entry);
      const result = await mgr.closeRegisterEntry('e1');
      expect(result).toEqual(entry);
      expect(storage.updateRegisterEntry).toHaveBeenCalledWith('e1', { status: 'closed' });
    });
  });

  // ── Scoring ──────────────────────────────────────────────────

  describe('snapshotDepartmentScore', () => {
    it('computes and records a score snapshot', async () => {
      (storage.getDepartment as any).mockResolvedValue({
        id: 'd1',
        name: 'Engineering',
        riskAppetite: { security: 50, operational: 50 },
      });
      (storage.getRegisterStats as any).mockResolvedValue({ open: 2, overdue: 1, critical: 0 });
      (storage.listRegisterEntries as any).mockResolvedValue({
        items: [
          { category: 'security', status: 'open', riskScore: 12, likelihood: 3, impact: 4 },
          { category: 'security', status: 'open', riskScore: 8, likelihood: 2, impact: 4 },
        ],
        total: 2,
      });
      (storage.recordDepartmentScore as any).mockImplementation((data: any) => ({
        id: 'score-1',
        ...data,
        scoredAt: '2026-03-02',
        createdAt: 1000,
      }));

      const score = await mgr.snapshotDepartmentScore('d1');
      expect(storage.recordDepartmentScore).toHaveBeenCalledTimes(1);
      expect(score.departmentId).toBe('d1');
      expect(score.openRisks).toBe(2);
    });

    it('throws for missing department', async () => {
      (storage.getDepartment as any).mockResolvedValue(null);
      await expect(mgr.snapshotDepartmentScore('missing')).rejects.toThrow('not found');
    });

    it('fires alert on appetite breach', async () => {
      (storage.getDepartment as any).mockResolvedValue({
        id: 'd1',
        name: 'Engineering',
        riskAppetite: { security: 10 },
      });
      (storage.getRegisterStats as any).mockResolvedValue({ open: 1, overdue: 0, critical: 0 });
      (storage.listRegisterEntries as any).mockResolvedValue({
        items: [
          { category: 'security', status: 'open', riskScore: 20, likelihood: 4, impact: 5 },
        ],
        total: 1,
      });
      (storage.recordDepartmentScore as any).mockImplementation((data: any) => ({
        id: 'score-1',
        ...data,
        scoredAt: '2026-03-02',
        createdAt: 1000,
      }));

      await mgr.snapshotDepartmentScore('d1');
      expect(mockAlertManager.evaluate).toHaveBeenCalledTimes(1);
      const snapshot = mockAlertManager.evaluate.mock.calls[0][0];
      expect(snapshot.risk.appetite_breach.breachCount).toBeGreaterThan(0);
    });
  });

  describe('snapshotAllDepartments', () => {
    it('snapshots all departments and continues on error', async () => {
      (storage.listDepartments as any).mockResolvedValue({
        items: [
          { id: 'd1', name: 'A' },
          { id: 'd2', name: 'B' },
        ],
        total: 2,
      });
      // d1 succeeds
      (storage.getDepartment as any).mockResolvedValueOnce({
        id: 'd1', name: 'A', riskAppetite: {},
      });
      (storage.getRegisterStats as any).mockResolvedValueOnce({ open: 0, overdue: 0, critical: 0 });
      (storage.listRegisterEntries as any).mockResolvedValueOnce({ items: [], total: 0 });
      (storage.recordDepartmentScore as any).mockResolvedValueOnce({
        id: 's1', departmentId: 'd1', overallScore: 0, scoredAt: '2026-03-02', createdAt: 1000,
      });
      // d2 fails
      (storage.getDepartment as any).mockResolvedValueOnce(null);

      const scores = await mgr.snapshotAllDepartments();
      expect(scores).toHaveLength(1);
    });
  });

  // ── Composite views ──────────────────────────────────────────

  describe('getDepartmentScorecard', () => {
    it('returns a scorecard with all fields', async () => {
      (storage.getDepartment as any).mockResolvedValue({
        id: 'd1', name: 'Eng', riskAppetite: {},
      });
      (storage.getRegisterStats as any).mockResolvedValue({
        open: 3, overdue: 1, critical: 1, total: 5, avgRiskScore: 12,
      });
      (storage.listDepartmentScores as any).mockResolvedValue([{
        id: 's1', overallScore: 42, appetiteBreaches: [],
      }]);
      (storage.listRegisterEntries as any).mockResolvedValue({
        items: [{ id: 'e1', title: 'Risk A', severity: 'high' }],
        total: 1,
      });

      const sc = await mgr.getDepartmentScorecard('d1');
      expect(sc.department.name).toBe('Eng');
      expect(sc.openRisks).toBe(3);
      expect(sc.overdueRisks).toBe(1);
      expect(sc.criticalRisks).toBe(1);
      expect(sc.latestScore!.overallScore).toBe(42);
      expect(sc.topRisks).toHaveLength(1);
    });

    it('throws for missing department', async () => {
      (storage.getDepartment as any).mockResolvedValue(null);
      await expect(mgr.getDepartmentScorecard('missing')).rejects.toThrow('not found');
    });
  });

  describe('getHeatmap', () => {
    it('generates heatmap cells from latest scores', async () => {
      (storage.getLatestScores as any).mockResolvedValue([{
        departmentId: 'd1',
        domainScores: { security: 60, operational: 20 },
        appetiteBreaches: [],
      }]);
      (storage.listDepartments as any).mockResolvedValue({
        items: [{ id: 'd1', name: 'Eng', riskAppetite: { security: 50, operational: 50 } }],
        total: 1,
      });

      const cells = await mgr.getHeatmap();
      expect(cells).toHaveLength(2);
      const secCell = cells.find((c) => c.domain === 'security');
      expect(secCell!.breached).toBe(true);
      const opsCell = cells.find((c) => c.domain === 'operational');
      expect(opsCell!.breached).toBe(false);
    });
  });

  describe('getExecutiveSummary', () => {
    it('aggregates across all departments', async () => {
      (storage.listDepartments as any).mockResolvedValue({
        items: [{ id: 'd1', name: 'A' }, { id: 'd2', name: 'B' }],
        total: 2,
      });
      (storage.getLatestScores as any).mockResolvedValue([
        { departmentId: 'd1', overallScore: 40, appetiteBreaches: [] },
        { departmentId: 'd2', overallScore: 60, appetiteBreaches: [{ domain: 'security', score: 60, threshold: 50 }] },
      ]);
      (storage.getRegisterStats as any)
        .mockResolvedValueOnce({ open: 3, overdue: 1, critical: 1 })
        .mockResolvedValueOnce({ open: 2, overdue: 0, critical: 0 });

      const summary = await mgr.getExecutiveSummary();
      expect(summary.totalDepartments).toBe(2);
      expect(summary.totalOpenRisks).toBe(5);
      expect(summary.totalOverdueRisks).toBe(1);
      expect(summary.totalCriticalRisks).toBe(1);
      expect(summary.appetiteBreaches).toBe(1);
      expect(summary.averageScore).toBe(50);
      expect(summary.departments).toHaveLength(2);
    });
  });
});
