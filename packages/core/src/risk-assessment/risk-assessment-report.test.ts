import { describe, it, expect, beforeEach } from 'vitest';
import { RiskReportGenerator } from './risk-assessment-report.js';
import type { RiskAssessment } from '@secureyeoman/shared';

// ─── Fixtures ────────────────────────────────────────────────────────

const now = Date.now();

function makeAssessment(overrides: Partial<RiskAssessment> = {}): RiskAssessment {
  return {
    id: 'assess-1',
    name: 'Test Assessment',
    riskLevel: 'high',
    compositeScore: 65,
    windowDays: 30,
    assessmentTypes: ['authentication', 'authorization'],
    domainScores: { authentication: 70, authorization: 55 },
    findings: [
      {
        id: 'find-1',
        domain: 'authentication',
        severity: 'high',
        title: 'Weak password policy',
        description: 'Passwords under 8 chars allowed',
        recommendation: 'Enforce 12+ char passwords',
        affectedResource: '/api/v1/auth',
        evidence: { failedLogins: 42 },
      },
      {
        id: 'find-2',
        domain: 'authorization',
        severity: 'medium',
        title: 'Missing RBAC on endpoint',
        description: 'Endpoint accessible without role check',
        recommendation: 'Add role guard',
        affectedResource: undefined,
        evidence: undefined,
      },
      {
        id: 'find-3',
        domain: 'authorization',
        severity: 'critical',
        title: 'SQL injection',
        description: 'Raw query with user input',
        recommendation: 'Use parameterized queries',
      },
    ],
    status: 'completed',
    createdAt: now,
    completedAt: now + 1000,
    ...overrides,
  } as RiskAssessment;
}

describe('RiskReportGenerator', () => {
  let gen: RiskReportGenerator;

  beforeEach(() => {
    gen = new RiskReportGenerator();
  });

  describe('generateJson', () => {
    it('returns valid JSON string', () => {
      const assessment = makeAssessment();
      const json = gen.generateJson(assessment);
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('contains assessment id', () => {
      const json = gen.generateJson(makeAssessment());
      expect(json).toContain('assess-1');
    });

    it('is pretty-printed with 2-space indent', () => {
      const json = gen.generateJson(makeAssessment());
      expect(json).toContain('\n  ');
    });
  });

  describe('generateHtml', () => {
    it('returns an HTML string with doctype', () => {
      const html = gen.generateHtml(makeAssessment());
      expect(html).toContain('<!DOCTYPE html>');
    });

    it('includes the assessment name', () => {
      const html = gen.generateHtml(makeAssessment());
      expect(html).toContain('Test Assessment');
    });

    it('includes composite score', () => {
      const html = gen.generateHtml(makeAssessment());
      expect(html).toContain('65');
    });

    it('shows critical/high warning banner', () => {
      const html = gen.generateHtml(makeAssessment());
      expect(html).toContain('Require Immediate Attention');
    });

    it('handles no findings gracefully', () => {
      const html = gen.generateHtml(makeAssessment({ findings: [] }));
      expect(html).toContain('No findings');
    });

    it('escapes HTML special chars in content', () => {
      const assessment = makeAssessment({
        findings: [
          {
            id: 'f1',
            domain: 'auth',
            severity: 'high',
            title: '<script>alert(1)</script>',
            description: 'XSS & injection',
          } as any,
        ],
      });
      const html = gen.generateHtml(assessment);
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&amp;');
    });

    it('renders each risk level color — critical', () => {
      const assessment = makeAssessment({ riskLevel: 'critical', compositeScore: 90 });
      const html = gen.generateHtml(assessment);
      expect(html).toContain('#dc2626'); // critical color
    });

    it('renders each risk level color — medium', () => {
      const assessment = makeAssessment({
        riskLevel: 'medium',
        compositeScore: 40,
        findings: [
          { id: 'f', domain: 'd', severity: 'medium', title: 'T', description: 'D' } as any,
        ],
      });
      const html = gen.generateHtml(assessment);
      expect(html).toContain('#d97706'); // medium color
    });

    it('renders each risk level color — low', () => {
      const assessment = makeAssessment({
        riskLevel: 'low',
        compositeScore: 10,
        findings: [
          { id: 'f', domain: 'd', severity: 'low', title: 'T', description: 'D' } as any,
        ],
      });
      const html = gen.generateHtml(assessment);
      expect(html).toContain('#16a34a'); // low color
    });

    it('handles missing completedAt — uses createdAt', () => {
      const assessment = makeAssessment({ completedAt: undefined });
      const html = gen.generateHtml(assessment);
      expect(html).toContain('UTC');
    });

    it('handles finding with no affectedResource', () => {
      const html = gen.generateHtml(makeAssessment());
      // find-2 has no affectedResource — should show dash
      expect(html).toContain('—');
    });
  });

  describe('generateMarkdown', () => {
    it('starts with h1 heading', () => {
      const md = gen.generateMarkdown(makeAssessment());
      expect(md).toMatch(/^# Risk Assessment Report/);
    });

    it('includes composite score', () => {
      const md = gen.generateMarkdown(makeAssessment());
      expect(md).toContain('65/100');
    });

    it('includes critical & high findings section', () => {
      const md = gen.generateMarkdown(makeAssessment());
      expect(md).toContain('## Critical & High Findings');
    });

    it('shows no-critical message when none', () => {
      const assessment = makeAssessment({
        findings: [
          { id: 'f', domain: 'd', severity: 'low', title: 'T', description: 'D' } as any,
        ],
      });
      const md = gen.generateMarkdown(assessment);
      expect(md).toContain('No critical or high findings');
    });

    it('includes all findings table', () => {
      const md = gen.generateMarkdown(makeAssessment());
      expect(md).toContain('## All Findings');
    });

    it('recommends escalation when score >= 75', () => {
      const md = gen.generateMarkdown(makeAssessment({ compositeScore: 80, riskLevel: 'critical' }));
      expect(md).toContain('CRITICAL');
    });

    it('recommends remediation sprint when score 50-74', () => {
      const md = gen.generateMarkdown(makeAssessment({ compositeScore: 60, findings: [] }));
      expect(md).toContain('remediation sprint');
    });

    it('recommends no action when no findings and low score', () => {
      const md = gen.generateMarkdown(
        makeAssessment({ findings: [], compositeScore: 10, riskLevel: 'low' })
      );
      expect(md).toContain('No immediate action required');
    });

    it('includes evidence appendix when evidence exists', () => {
      const md = gen.generateMarkdown(makeAssessment());
      expect(md).toContain('## Appendix: Evidence');
      expect(md).toContain('failedLogins');
    });

    it('shows no evidence message when none', () => {
      const assessment = makeAssessment({
        findings: [
          { id: 'f', domain: 'd', severity: 'low', title: 'T', description: 'D' } as any,
        ],
      });
      const md = gen.generateMarkdown(assessment);
      expect(md).toContain('No evidence attached');
    });
  });

  describe('generateCsv', () => {
    it('has correct header row', () => {
      const csv = gen.generateCsv(makeAssessment());
      const header = csv.split('\n')[0];
      expect(header).toBe('id,domain,severity,title,affected_resource,recommendation,evidence_summary');
    });

    it('has one row per finding', () => {
      const csv = gen.generateCsv(makeAssessment());
      const lines = csv.split('\n').filter(Boolean);
      // 1 header + 3 findings = 4
      expect(lines).toHaveLength(4);
    });

    it('returns header only when no findings', () => {
      const csv = gen.generateCsv(makeAssessment({ findings: [] }));
      const lines = csv.split('\n').filter(Boolean);
      expect(lines).toHaveLength(1);
    });

    it('escapes commas in CSV fields', () => {
      const assessment = makeAssessment({
        findings: [
          {
            id: 'f1',
            domain: 'auth',
            severity: 'high',
            title: 'Title, with comma',
            description: 'desc',
          } as any,
        ],
      });
      const csv = gen.generateCsv(assessment);
      expect(csv).toContain('"Title, with comma"');
    });

    it('escapes double quotes in CSV fields', () => {
      const assessment = makeAssessment({
        findings: [
          {
            id: 'f1',
            domain: 'auth',
            severity: 'high',
            title: 'Say "hello"',
            description: 'desc',
          } as any,
        ],
      });
      const csv = gen.generateCsv(assessment);
      expect(csv).toContain('"Say ""hello"""');
    });

    it('includes evidence summary keys', () => {
      const csv = gen.generateCsv(makeAssessment());
      expect(csv).toContain('failedLogins');
    });

    it('leaves affectedResource empty when undefined', () => {
      const csv = gen.generateCsv(makeAssessment());
      // find-2 has no affectedResource — field is empty
      const rows = csv.split('\n');
      const find2Row = rows.find((r) => r.startsWith('find-2'));
      expect(find2Row).toBeDefined();
    });
  });
});

