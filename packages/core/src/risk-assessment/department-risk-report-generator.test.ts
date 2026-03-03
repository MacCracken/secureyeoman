/**
 * DepartmentRiskReportGenerator Tests — Phase 111-D
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DepartmentRiskReportGenerator } from './department-risk-report-generator.js';

function makeMockManager() {
  return {
    getDepartmentScorecard: vi.fn().mockResolvedValue({
      department: { id: 'd1', name: 'Engineering', description: 'Dev team' },
      latestScore: {
        overallScore: 42,
        domainScores: { security: 60, operational: 30 },
        appetiteBreaches: [{ domain: 'security', score: 60, threshold: 50 }],
      },
      openRisks: 5,
      overdueRisks: 1,
      criticalRisks: 2,
      appetiteBreaches: [{ domain: 'security', score: 60, threshold: 50 }],
      topRisks: [
        {
          id: 'r1',
          title: 'SQL Injection',
          severity: 'high',
          likelihood: 4,
          impact: 5,
          riskScore: 20,
          departmentId: 'd1',
          category: 'security',
          status: 'open',
          mitigations: [],
          evidenceRefs: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    }),
    getTrend: vi.fn().mockResolvedValue([
      { date: '2026-02-01', overallScore: 35, openRisks: 4, overdueRisks: 0 },
      { date: '2026-03-01', overallScore: 42, openRisks: 5, overdueRisks: 1 },
    ]),
    getExecutiveSummary: vi.fn().mockResolvedValue({
      totalDepartments: 3,
      totalOpenRisks: 12,
      totalOverdueRisks: 2,
      totalCriticalRisks: 4,
      appetiteBreaches: 1,
      averageScore: 38,
      departments: [
        { id: 'd1', name: 'Engineering', overallScore: 42, openRisks: 5, breached: true },
        { id: 'd2', name: 'Finance', overallScore: 30, openRisks: 4, breached: false },
        { id: 'd3', name: 'Legal', overallScore: 41, openRisks: 3, breached: false },
      ],
    }),
    getHeatmap: vi.fn().mockResolvedValue([
      {
        departmentId: 'd1',
        departmentName: 'Engineering',
        domain: 'security',
        score: 60,
        threshold: 50,
        breached: true,
      },
      {
        departmentId: 'd1',
        departmentName: 'Engineering',
        domain: 'operational',
        score: 30,
        threshold: 50,
        breached: false,
      },
      {
        departmentId: 'd2',
        departmentName: 'Finance',
        domain: 'security',
        score: 25,
        threshold: 50,
        breached: false,
      },
    ]),
    listRegisterEntries: vi.fn().mockResolvedValue({
      items: [
        {
          id: 'r1',
          departmentId: 'd1',
          title: 'SQL Injection',
          category: 'security',
          severity: 'high',
          likelihood: 4,
          impact: 5,
          riskScore: 20,
          status: 'open',
          owner: 'alice',
          dueDate: '2026-04-01',
          source: 'scan',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          mitigations: [],
          evidenceRefs: [],
        },
        {
          id: 'r2',
          departmentId: 'd1',
          title: 'Weak auth',
          category: 'compliance',
          severity: 'medium',
          likelihood: 3,
          impact: 3,
          riskScore: 9,
          status: 'in_progress',
          owner: 'bob',
          dueDate: null,
          source: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          mitigations: [],
          evidenceRefs: [],
        },
      ],
      total: 2,
    }),
  } as any;
}

describe('DepartmentRiskReportGenerator', () => {
  let gen: DepartmentRiskReportGenerator;
  let mgr: ReturnType<typeof makeMockManager>;

  beforeEach(() => {
    mgr = makeMockManager();
    gen = new DepartmentRiskReportGenerator({ departmentRiskManager: mgr });
  });

  // ── Department Scorecard ──────────────────────────────────

  describe('generateDepartmentScorecard', () => {
    it('returns JSON by default', async () => {
      const result = await gen.generateDepartmentScorecard('d1');
      const parsed = JSON.parse(result);
      expect(parsed.department.name).toBe('Engineering');
      expect(parsed.trend).toHaveLength(2);
    });

    it('returns valid HTML', async () => {
      const result = await gen.generateDepartmentScorecard('d1', 'html');
      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('Engineering');
      expect(result).toContain('Domain Scores');
      expect(result).toContain('security');
    });

    it('returns markdown', async () => {
      const result = await gen.generateDepartmentScorecard('d1', 'md');
      expect(result).toContain('# Department Scorecard: Engineering');
      expect(result).toContain('42/100');
      expect(result).toContain('Security');
      expect(result).toContain('Trend (90 days)');
    });

    it('returns CSV', async () => {
      const result = await gen.generateDepartmentScorecard('d1', 'csv');
      expect(result).toContain('metric,value');
      expect(result).toContain('department_name,Engineering');
      expect(result).toContain('overall_score,42');
      expect(result).toContain('domain_security,60');
    });

    it('handles missing latestScore gracefully', async () => {
      mgr.getDepartmentScorecard.mockResolvedValue({
        department: { id: 'd1', name: 'Empty Dept' },
        latestScore: null,
        openRisks: 0,
        overdueRisks: 0,
        criticalRisks: 0,
        appetiteBreaches: [],
        topRisks: [],
      });
      const result = await gen.generateDepartmentScorecard('d1', 'md');
      expect(result).toContain('Empty Dept');
      expect(result).toContain('N/A');
    });
  });

  // ── Executive Summary ─────────────────────────────────────

  describe('generateExecutiveSummary', () => {
    it('returns JSON', async () => {
      const result = await gen.generateExecutiveSummary('json');
      const parsed = JSON.parse(result);
      expect(parsed.totalDepartments).toBe(3);
      expect(parsed.heatmap).toHaveLength(3);
      expect(parsed.trends).toBeDefined();
    });

    it('returns HTML with KPI cards', async () => {
      const result = await gen.generateExecutiveSummary('html');
      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('Executive Risk Summary');
      expect(result).toContain('12'); // open risks
      expect(result).toContain('Engineering');
      expect(result).toContain('Risk Heatmap');
    });

    it('returns markdown', async () => {
      const result = await gen.generateExecutiveSummary('md');
      expect(result).toContain('# Executive Risk Summary');
      expect(result).toContain('| Engineering');
      expect(result).toContain('Appetite Breaches | 1');
    });
  });

  // ── Register Report ───────────────────────────────────────

  describe('generateRegisterReport', () => {
    it('returns JSON', async () => {
      const result = await gen.generateRegisterReport({}, 'json');
      const parsed = JSON.parse(result);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].title).toBe('SQL Injection');
    });

    it('returns CSV with GRC-compatible columns', async () => {
      const result = await gen.generateRegisterReport({}, 'csv');
      expect(result).toContain('id,department_id,title,category,severity');
      expect(result).toContain('SQL Injection');
      expect(result).toContain('Weak auth');
    });

    it('passes filters to manager', async () => {
      await gen.generateRegisterReport({ departmentId: 'd1', status: 'open' }, 'json');
      expect(mgr.listRegisterEntries).toHaveBeenCalledWith({
        departmentId: 'd1',
        status: 'open',
        limit: 10000,
      });
    });

    it('handles empty register', async () => {
      mgr.listRegisterEntries.mockResolvedValue({ items: [], total: 0 });
      const result = await gen.generateRegisterReport({}, 'csv');
      expect(result).toContain('id,department_id');
      const lines = result.split('\n');
      expect(lines).toHaveLength(1); // header only
    });
  });

  // ── Heatmap HTML ──────────────────────────────────────────

  describe('generateHeatmapHtml', () => {
    it('renders dept x domain grid', () => {
      const cells = [
        {
          departmentId: 'd1',
          departmentName: 'Eng',
          domain: 'security',
          score: 60,
          threshold: 50,
          breached: true,
        },
        {
          departmentId: 'd1',
          departmentName: 'Eng',
          domain: 'ops',
          score: 20,
          threshold: 50,
          breached: false,
        },
        {
          departmentId: 'd2',
          departmentName: 'Finance',
          domain: 'security',
          score: 25,
          threshold: 50,
          breached: false,
        },
      ];
      const html = gen.generateHeatmapHtml(cells);
      expect(html).toContain('Risk Heatmap');
      expect(html).toContain('Eng');
      expect(html).toContain('Finance');
      expect(html).toContain('60');
    });

    it('shows breach indicator', () => {
      const cells = [
        {
          departmentId: 'd1',
          departmentName: 'Eng',
          domain: 'security',
          score: 80,
          threshold: 50,
          breached: true,
        },
      ];
      const html = gen.generateHeatmapHtml(cells);
      expect(html).toContain('⚠');
      expect(html).toContain('BREACHED');
    });

    it('handles empty cells', () => {
      const html = gen.generateHeatmapHtml([]);
      expect(html).toContain('No heatmap data');
    });
  });
});
