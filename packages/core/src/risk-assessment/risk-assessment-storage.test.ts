/**
 * RiskAssessmentStorage Tests — Phase 53
 *
 * Unit tests using a mocked pg pool — no DB required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RiskAssessmentStorage } from './risk-assessment-storage.js';

// ─── Mock pg-pool ────────────────────────────────────────────────────────────

let mockQuery: ReturnType<typeof vi.fn>;

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: (...args: any[]) => mockQuery(...args) }),
}));

// ─── Row fixtures ────────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000;
const ASSESSMENT_ID = 'assess-001';
const FEED_ID = 'feed-001';
const FINDING_ID = 'finding-001';

function makeAssessmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSESSMENT_ID,
    name: 'Q1 Risk Assessment',
    status: 'pending',
    assessment_types: ['security', 'autonomy'],
    window_days: 7,
    composite_score: null,
    risk_level: null,
    domain_scores: {},
    findings: [],
    findings_count: 0,
    report_json: null,
    report_html: null,
    report_markdown: null,
    report_csv: null,
    options: {},
    created_by: 'user-1',
    created_at: NOW,
    completed_at: null,
    error: null,
    ...overrides,
  };
}

function makeFeedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: FEED_ID,
    name: 'CVE Feed',
    description: null,
    source_type: 'manual',
    category: 'cyber',
    enabled: true,
    config: {},
    last_ingested_at: null,
    record_count: 0,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makeFindingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: FINDING_ID,
    feed_id: FEED_ID,
    source_ref: 'CVE-2024-0001',
    category: 'cyber',
    severity: 'high',
    title: 'Remote Code Execution',
    description: 'Critical RCE in library X',
    affected_resource: 'api-server',
    recommendation: 'Update to 2.0.0',
    evidence: null,
    status: 'open',
    acknowledged_by: null,
    acknowledged_at: null,
    resolved_at: null,
    source_date: null,
    imported_at: NOW,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RiskAssessmentStorage', () => {
  let storage: RiskAssessmentStorage;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    storage = new RiskAssessmentStorage();
  });

  // ── create ───────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('inserts and returns assessment with defaults', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeAssessmentRow()], rowCount: 1 });

      const result = await storage.create({ name: 'Q1 Risk Assessment', assessmentTypes: ['security', 'autonomy'], windowDays: 7 }, 'user-1');

      expect(result.id).toBe(ASSESSMENT_ID);
      expect(result.name).toBe('Q1 Risk Assessment');
      expect(result.status).toBe('pending');
      expect(result.assessmentTypes).toEqual(['security', 'autonomy']);
      expect(result.windowDays).toBe(7);
      expect(result.findingsCount).toBe(0);
      expect(result.createdBy).toBe('user-1');
    });

    it('passes createdBy to query', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeAssessmentRow()], rowCount: 1 });
      await storage.create({ name: 'Test', assessmentTypes: ['security'], windowDays: 7 }, 'alice');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params).toContain('alice');
    });

    it('generates a unique id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeAssessmentRow({ id: 'auto-id' })], rowCount: 1 });
      const result = await storage.create({ name: 'Test', assessmentTypes: [], windowDays: 7 });
      expect(result.id).toBe('auto-id');
    });
  });

  // ── list ─────────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns items and total', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeAssessmentRow()], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 });

      const result = await storage.list();
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe(ASSESSMENT_ID);
      expect(result.total).toBe(5);
    });

    it('passes status filter when provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

      await storage.list({ status: 'completed' });
      const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('status');
    });

    it('caps limit and offsets correctly', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

      await storage.list({ limit: 5, offset: 10 });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params).toContain(5);
      expect(params).toContain(10);
    });
  });

  // ── get ──────────────────────────────────────────────────────────────────────

  describe('get', () => {
    it('returns assessment when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeAssessmentRow()], rowCount: 1 });
      const result = await storage.get(ASSESSMENT_ID);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(ASSESSMENT_ID);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.get('nonexistent');
      expect(result).toBeNull();
    });

    it('maps numeric fields from string DB values', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ findings_count: '3', window_days: '14', created_at: '1700000000000' })],
        rowCount: 1,
      });
      const result = await storage.get(ASSESSMENT_ID);
      expect(result!.findingsCount).toBe(3);
      expect(result!.windowDays).toBe(14);
      expect(result!.createdAt).toBe(1700000000000);
    });
  });

  // ── updateStatus ─────────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('calls UPDATE with correct params', async () => {
      await storage.updateStatus(ASSESSMENT_ID, 'running');
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('UPDATE risk.assessments');
      expect(params[0]).toBe('running');
      expect(params[1]).toBeNull(); // error
      expect(params[2]).toBe(ASSESSMENT_ID);
    });

    it('passes error message when provided', async () => {
      await storage.updateStatus(ASSESSMENT_ID, 'failed', 'Something went wrong');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[1]).toBe('Something went wrong');
    });
  });

  // ── saveResults ──────────────────────────────────────────────────────────────

  describe('saveResults', () => {
    it('sets status to completed and returns updated assessment', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ status: 'completed', composite_score: 42, risk_level: 'medium' })],
        rowCount: 1,
      });

      const result = await storage.saveResults(ASSESSMENT_ID, {
        compositeScore: 42,
        riskLevel: 'medium',
        domainScores: { security: 30 },
        findings: [],
        findingsCount: 0,
      });

      expect(result.status).toBe('completed');
      expect(result.compositeScore).toBe(42);
      expect(result.riskLevel).toBe('medium');
    });
  });

  // ── createFeed ───────────────────────────────────────────────────────────────

  describe('createFeed', () => {
    it('inserts and returns feed', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeFeedRow()], rowCount: 1 });
      const feed = await storage.createFeed({
        name: 'CVE Feed',
        sourceType: 'manual',
        category: 'cyber',
        enabled: true,
      });
      expect(feed.id).toBe(FEED_ID);
      expect(feed.name).toBe('CVE Feed');
      expect(feed.sourceType).toBe('manual');
      expect(feed.category).toBe('cyber');
      expect(feed.recordCount).toBe(0);
    });
  });

  // ── listFeeds ─────────────────────────────────────────────────────────────────

  describe('listFeeds', () => {
    it('returns all feeds', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeFeedRow(), makeFeedRow({ id: 'feed-002' })], rowCount: 2 });
      const feeds = await storage.listFeeds();
      expect(feeds).toHaveLength(2);
    });

    it('returns empty array when no feeds', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const feeds = await storage.listFeeds();
      expect(feeds).toEqual([]);
    });
  });

  // ── deleteFeed ───────────────────────────────────────────────────────────────

  describe('deleteFeed', () => {
    it('returns true when feed deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await storage.deleteFeed(FEED_ID);
      expect(result).toBe(true);
    });

    it('returns false when feed not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.deleteFeed('nonexistent');
      expect(result).toBe(false);
    });
  });

  // ── createFinding ─────────────────────────────────────────────────────────────

  describe('createFinding', () => {
    it('inserts and returns finding', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeFindingRow()], rowCount: 1 });
      const finding = await storage.createFinding({
        feedId: FEED_ID,
        category: 'cyber',
        severity: 'high',
        title: 'Remote Code Execution',
        sourceRef: 'CVE-2024-0001',
      });
      expect(finding.id).toBe(FINDING_ID);
      expect(finding.severity).toBe('high');
      expect(finding.status).toBe('open');
    });
  });

  // ── ingestFindings ────────────────────────────────────────────────────────────

  describe('ingestFindings', () => {
    it('creates findings and returns counts', async () => {
      // For first finding: no existing source_ref → insert
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // check existing source_ref
        .mockResolvedValueOnce({ rows: [makeFindingRow()], rowCount: 1 }) // insert
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // update feed stats

      const result = await storage.ingestFindings(FEED_ID, [
        { category: 'cyber', severity: 'high', title: 'RCE', sourceRef: 'CVE-2024-0001' },
      ]);

      expect(result.created).toBe(1);
      expect(result.skipped).toBe(0);
    });

    it('skips duplicate source_refs', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'existing' }], rowCount: 1 }); // existing source_ref

      const result = await storage.ingestFindings(FEED_ID, [
        { category: 'cyber', severity: 'high', title: 'RCE', sourceRef: 'CVE-2024-0001' },
      ]);

      expect(result.created).toBe(0);
      expect(result.skipped).toBe(1);
    });

    it('inserts findings without source_ref without dedup check', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeFindingRow({ source_ref: null })], rowCount: 1 }) // insert
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // update feed stats

      const result = await storage.ingestFindings(FEED_ID, [
        { category: 'cyber', severity: 'medium', title: 'Config Issue' },
      ]);

      expect(result.created).toBe(1);
      expect(result.skipped).toBe(0);
    });
  });

  // ── listFindings ─────────────────────────────────────────────────────────────

  describe('listFindings', () => {
    it('returns items and total', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeFindingRow()], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '10' }], rowCount: 1 });

      const result = await storage.listFindings();
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(10);
    });

    it('applies status filter', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

      await storage.listFindings({ status: 'open' });
      const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('status');
    });

    it('applies severity filter', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

      await storage.listFindings({ severity: 'critical' });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params).toContain('critical');
    });
  });

  // ── updateFindingStatus ───────────────────────────────────────────────────────

  describe('updateFindingStatus', () => {
    it('returns updated finding for acknowledge', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeFindingRow({ status: 'acknowledged', acknowledged_by: 'alice', acknowledged_at: NOW })],
        rowCount: 1,
      });
      const result = await storage.updateFindingStatus(FINDING_ID, 'acknowledged', 'alice');
      expect(result).not.toBeNull();
      expect(result!.status).toBe('acknowledged');
      expect(result!.acknowledgedBy).toBe('alice');
    });

    it('returns updated finding for resolve', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeFindingRow({ status: 'resolved', resolved_at: NOW })],
        rowCount: 1,
      });
      const result = await storage.updateFindingStatus(FINDING_ID, 'resolved');
      expect(result).not.toBeNull();
      expect(result!.status).toBe('resolved');
    });

    it('returns null when finding not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.updateFindingStatus('nonexistent', 'resolved');
      expect(result).toBeNull();
    });
  });
});
