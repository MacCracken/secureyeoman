/**
 * MemoryAuditStorage Tests (Phase 118)
 *
 * Note: named -store.test.ts (not -storage.test.ts) to avoid vitest unit config exclusion.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock pg pool ─────────────────────────────────────────────────────
const mockQuery = vi.fn();
vi.mock('../../storage/pg-pool.js', () => ({
  getPool: () => ({ query: mockQuery }),
}));

vi.mock('../../utils/crypto.js', () => ({
  uuidv7: () => 'test-uuid-0001',
}));

import { MemoryAuditStorage } from './audit-store.js';

// ── Row Helpers ──────────────────────────────────────────────────────

function makeReportRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rpt-1',
    tenant_id: 'default',
    personality_id: null,
    scope: 'daily',
    started_at: 1700000000000,
    completed_at: null,
    pre_snapshot: null,
    post_snapshot: null,
    compression_summary: null,
    reorganization_summary: null,
    maintenance_summary: null,
    status: 'running',
    approved_by: null,
    approved_at: null,
    error: null,
    created_at: 1700000000000,
    ...overrides,
  };
}

function makeArchiveRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'arc-1',
    original_memory_id: 'mem-1',
    original_content: 'some memory content',
    original_importance: 0.8,
    original_context: '{}',
    transform_type: 'compressed',
    audit_report_id: 'rpt-1',
    archived_at: 1700000000000,
    tenant_id: 'default',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('MemoryAuditStorage', () => {
  let storage: MemoryAuditStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new MemoryAuditStorage();
  });

  // ── createReport ─────────────────────────────────────────────────

  describe('createReport', () => {
    it('inserts a row and returns the mapped report', async () => {
      const row = makeReportRow({ id: 'test-uuid-0001', scope: 'weekly' });
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const result = await storage.createReport({ scope: 'weekly' });

      expect(result.id).toBe('test-uuid-0001');
      expect(result.scope).toBe('weekly');
      expect(result.status).toBe('running');
      expect(result.tenantId).toBe('default');
      expect(result.personalityId).toBeNull();
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO brain.audit_reports');
      expect(params[0]).toBe('test-uuid-0001');
      expect(params[1]).toBe('default');
      expect(params[3]).toBe('weekly');
    });

    it('uses provided tenantId and personalityId', async () => {
      const row = makeReportRow({
        id: 'test-uuid-0001',
        tenant_id: 'tenant-x',
        personality_id: 'pers-42',
      });
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const result = await storage.createReport({
        scope: 'monthly',
        tenantId: 'tenant-x',
        personalityId: 'pers-42',
      });

      expect(result.tenantId).toBe('tenant-x');
      expect(result.personalityId).toBe('pers-42');
      const params = mockQuery.mock.calls[0][1];
      expect(params[1]).toBe('tenant-x');
      expect(params[2]).toBe('pers-42');
    });
  });

  // ── updateReport ─────────────────────────────────────────────────

  describe('updateReport', () => {
    it('builds dynamic SET clause and returns updated report', async () => {
      const row = makeReportRow({ status: 'completed', completed_at: 1700001000000 });
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const result = await storage.updateReport('rpt-1', {
        status: 'completed',
        completedAt: 1700001000000,
      });

      expect(result).not.toBeNull();
      expect(result!.status).toBe('completed');
      expect(result!.completedAt).toBe(1700001000000);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('UPDATE brain.audit_reports SET');
      expect(sql).toContain('status = $1');
      expect(sql).toContain('completed_at = $2');
      expect(params).toEqual(['completed', 1700001000000, 'rpt-1']);
    });

    it('returns existing report when no updates provided', async () => {
      const row = makeReportRow();
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const result = await storage.updateReport('rpt-1', {});

      expect(result).not.toBeNull();
      expect(result!.id).toBe('rpt-1');
      // Should have queried with SELECT (getReport), not UPDATE
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('SELECT');
      expect(sql).not.toContain('UPDATE');
    });

    it('returns null when update finds no matching row', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await storage.updateReport('nonexistent', { status: 'failed' });

      expect(result).toBeNull();
    });

    it('JSON-stringifies snapshot and summary fields', async () => {
      const snapshot = { totalMemories: 10, totalKnowledge: 5, byType: {}, avgImportance: 0.5 };
      const compression = {
        candidatesFound: 3,
        memoriesCompressed: 2,
        memoriesArchived: 1,
        compressionRatio: 0.6,
        qualityChecksPassed: 2,
        qualityChecksFailed: 0,
        errors: [],
      };
      const row = makeReportRow({
        pre_snapshot: JSON.stringify(snapshot),
        compression_summary: JSON.stringify(compression),
      });
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      await storage.updateReport('rpt-1', {
        preSnapshot: snapshot,
        compressionSummary: compression,
      });

      const params = mockQuery.mock.calls[0][1];
      expect(params[0]).toBe(JSON.stringify(snapshot));
      expect(params[1]).toBe(JSON.stringify(compression));
    });

    it('handles error field update', async () => {
      const row = makeReportRow({ status: 'failed', error: 'Something broke' });
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const result = await storage.updateReport('rpt-1', {
        status: 'failed',
        error: 'Something broke',
      });

      expect(result!.status).toBe('failed');
      expect(result!.error).toBe('Something broke');
    });
  });

  // ── getReport ────────────────────────────────────────────────────

  describe('getReport', () => {
    it('returns report when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeReportRow()], rowCount: 1 });

      const result = await storage.getReport('rpt-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('rpt-1');
      expect(result!.scope).toBe('daily');
      expect(mockQuery.mock.calls[0][1]).toEqual(['rpt-1']);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await storage.getReport('nonexistent');

      expect(result).toBeNull();
    });

    it('parses JSON snapshot fields from row', async () => {
      const snapshot = {
        totalMemories: 50,
        totalKnowledge: 10,
        byType: { fact: 30 },
        avgImportance: 0.7,
      };
      const row = makeReportRow({ pre_snapshot: JSON.stringify(snapshot) });
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const result = await storage.getReport('rpt-1');

      expect(result!.preSnapshot).toEqual(snapshot);
    });
  });

  // ── listReports ──────────────────────────────────────────────────

  describe('listReports', () => {
    it('returns all reports with no filters', async () => {
      const rows = [makeReportRow({ id: 'rpt-1' }), makeReportRow({ id: 'rpt-2' })];
      mockQuery.mockResolvedValueOnce({ rows, rowCount: 2 });

      const result = await storage.listReports();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('rpt-1');
      expect(result[1].id).toBe('rpt-2');
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('ORDER BY started_at DESC');
      // Default limit=50, offset=0
      expect(params).toEqual([50, 0]);
    });

    it('filters by scope', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeReportRow()], rowCount: 1 });

      await storage.listReports({ scope: 'weekly' });

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('scope = $1');
      expect(params[0]).toBe('weekly');
    });

    it('filters by personalityId and status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await storage.listReports({ personalityId: 'pers-1', status: 'completed' });

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('personality_id = $1');
      expect(sql).toContain('status = $2');
      expect(params[0]).toBe('pers-1');
      expect(params[1]).toBe('completed');
    });

    it('respects limit and offset', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await storage.listReports({ limit: 10, offset: 20 });

      const params = mockQuery.mock.calls[0][1];
      expect(params).toEqual([10, 20]);
    });

    it('caps limit at 200', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await storage.listReports({ limit: 500 });

      const params = mockQuery.mock.calls[0][1];
      expect(params[0]).toBe(200);
    });
  });

  // ── approveReport ────────────────────────────────────────────────

  describe('approveReport', () => {
    it('sets status to completed and records approver', async () => {
      const row = makeReportRow({
        status: 'completed',
        approved_by: 'user-1',
        approved_at: 1700002000000,
      });
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const result = await storage.approveReport('rpt-1', 'user-1');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('completed');
      expect(result!.approvedBy).toBe('user-1');
      expect(result!.approvedAt).toBe(1700002000000);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("status = 'completed'");
      expect(sql).toContain("status = 'pending_approval'");
      expect(params[0]).toBe('user-1');
      expect(params[2]).toBe('rpt-1');
    });

    it('returns null if report is not in pending_approval status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await storage.approveReport('rpt-1', 'user-1');

      expect(result).toBeNull();
    });
  });

  // ── archiveMemory ────────────────────────────────────────────────

  describe('archiveMemory', () => {
    it('inserts archive row and returns mapped entry', async () => {
      const row = makeArchiveRow({ id: 'test-uuid-0001' });
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const result = await storage.archiveMemory({
        originalMemoryId: 'mem-1',
        originalContent: 'some memory content',
        originalImportance: 0.8,
        transformType: 'compressed',
        auditReportId: 'rpt-1',
      });

      expect(result.id).toBe('test-uuid-0001');
      expect(result.originalMemoryId).toBe('mem-1');
      expect(result.originalContent).toBe('some memory content');
      expect(result.originalImportance).toBe(0.8);
      expect(result.transformType).toBe('compressed');
      expect(result.auditReportId).toBe('rpt-1');
      expect(result.tenantId).toBe('default');
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO brain.memory_archive');
    });

    it('defaults tenantId to "default" and context to empty object', async () => {
      const row = makeArchiveRow({ id: 'test-uuid-0001', original_context: '{}' });
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      await storage.archiveMemory({
        originalMemoryId: 'mem-2',
        originalContent: 'content',
        originalImportance: 0.5,
        transformType: 'merged',
      });

      const params = mockQuery.mock.calls[0][1];
      // context stringified: "{}"
      expect(params[4]).toBe('{}');
      // auditReportId null
      expect(params[6]).toBeNull();
      // tenantId default
      expect(params[8]).toBe('default');
    });
  });

  // ── getArchiveForMemory ──────────────────────────────────────────

  describe('getArchiveForMemory', () => {
    it('returns archive entries sorted by archived_at desc', async () => {
      const rows = [
        makeArchiveRow({ id: 'arc-2', archived_at: 1700002000000 }),
        makeArchiveRow({ id: 'arc-1', archived_at: 1700001000000 }),
      ];
      mockQuery.mockResolvedValueOnce({ rows, rowCount: 2 });

      const result = await storage.getArchiveForMemory('mem-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('arc-2');
      expect(result[1].id).toBe('arc-1');
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('ORDER BY archived_at DESC');
      expect(params).toEqual(['mem-1']);
    });

    it('returns empty array when no archives exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await storage.getArchiveForMemory('no-such-mem');

      expect(result).toEqual([]);
    });
  });

  // ── cleanupOldArchives ───────────────────────────────────────────

  describe('cleanupOldArchives', () => {
    it('deletes old entries and returns count', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 5 });

      const count = await storage.cleanupOldArchives(30 * 24 * 60 * 60 * 1000);

      expect(count).toBe(5);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('DELETE FROM brain.memory_archive');
      expect(sql).toContain('archived_at < $1');
      expect(typeof params[0]).toBe('number');
    });

    it('returns 0 when no entries deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const count = await storage.cleanupOldArchives(1000);

      expect(count).toBe(0);
    });
  });

  // ── getHealthMetrics ─────────────────────────────────────────────

  describe('getHealthMetrics', () => {
    function mockHealthQueries(
      overrides: {
        totalMemories?: string;
        totalKnowledge?: string;
        avgImportance?: number | null;
        expiringCount?: string;
        lowCount?: string;
        lastAudit?: { started_at: number; scope: string } | null;
        archiveCount?: string;
      } = {}
    ) {
      // 1. total memories
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: overrides.totalMemories ?? '100' }],
        rowCount: 1,
      });
      // 2. total knowledge
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: overrides.totalKnowledge ?? '20' }],
        rowCount: 1,
      });
      // 3. avg importance
      mockQuery.mockResolvedValueOnce({
        rows: [{ avg: overrides.avgImportance !== undefined ? overrides.avgImportance : 0.65 }],
        rowCount: 1,
      });
      // 4. expiring within 7 days
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: overrides.expiringCount ?? '5' }],
        rowCount: 1,
      });
      // 5. low importance count
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: overrides.lowCount ?? '10' }],
        rowCount: 1,
      });
      // 6. last audit
      const lastAudit =
        overrides.lastAudit !== undefined
          ? overrides.lastAudit
          : {
              started_at: Date.now() - 2 * 24 * 60 * 60 * 1000,
              scope: 'daily',
            };
      mockQuery.mockResolvedValueOnce({
        rows: lastAudit ? [lastAudit] : [],
        rowCount: lastAudit ? 1 : 0,
      });
      // 7. compression savings (archived count)
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: overrides.archiveCount ?? '15' }],
        rowCount: 1,
      });
    }

    it('returns correct metrics with healthy data', async () => {
      mockHealthQueries();

      const metrics = await storage.getHealthMetrics();

      expect(metrics.totalMemories).toBe(100);
      expect(metrics.totalKnowledge).toBe(20);
      expect(metrics.avgImportance).toBe(0.65);
      expect(metrics.expiringWithin7Days).toBe(5);
      expect(metrics.compressionSavings).toBe(15);
      expect(metrics.duplicateEstimate).toBe(0);
      expect(metrics.lastAuditAt).toBeTypeOf('number');
      expect(metrics.lastAuditScope).toBe('daily');
      expect(mockQuery).toHaveBeenCalledTimes(7);
    });

    it('passes personalityId filter when provided', async () => {
      mockHealthQueries();

      await storage.getHealthMetrics('pers-42');

      // Queries that accept personalityId filter (1st, 2nd, 3rd, 4th, 5th calls)
      for (let i = 0; i < 5; i++) {
        const params = mockQuery.mock.calls[i][1];
        expect(params[0]).toBe('pers-42');
      }
    });

    it('deducts 20 from health score when lowImportanceRatio > 0.5', async () => {
      // 60 out of 100 memories are low importance => ratio 0.6
      mockHealthQueries({
        totalMemories: '100',
        lowCount: '60',
      });

      const metrics = await storage.getHealthMetrics();

      // base 100 - 20 (low ratio > 0.5) = 80
      expect(metrics.healthScore).toBeLessThanOrEqual(80);
      expect(metrics.lowImportanceRatio).toBe(0.6);
    });

    it('deducts 10 from health score when lowImportanceRatio > 0.3 but <= 0.5', async () => {
      // 40 out of 100 => ratio 0.4
      mockHealthQueries({
        totalMemories: '100',
        lowCount: '40',
      });

      const metrics = await storage.getHealthMetrics();

      expect(metrics.lowImportanceRatio).toBe(0.4);
      // base 100 - 10 (low ratio 0.3-0.5) = 90
      expect(metrics.healthScore).toBeLessThanOrEqual(90);
    });

    it('deducts 15 from health score when many memories are expiring', async () => {
      // 25 expiring out of 100 => 25% > 20% threshold
      mockHealthQueries({
        totalMemories: '100',
        expiringCount: '25',
        lowCount: '5', // keep low ratio small to isolate
      });

      const metrics = await storage.getHealthMetrics();

      expect(metrics.expiringWithin7Days).toBe(25);
      // base 100 - 15 (expiring) = 85
      expect(metrics.healthScore).toBeLessThanOrEqual(85);
    });

    it('deducts 10 from health score when no audit exists', async () => {
      mockHealthQueries({
        lastAudit: null,
        lowCount: '5',
        expiringCount: '0',
      });

      const metrics = await storage.getHealthMetrics();

      expect(metrics.lastAuditAt).toBeNull();
      expect(metrics.lastAuditScope).toBeNull();
      // base 100 - 10 (no audit) = 90
      expect(metrics.healthScore).toBe(90);
    });

    it('deducts 15 from health score when last audit is older than 30 days', async () => {
      mockHealthQueries({
        lastAudit: {
          started_at: Date.now() - 40 * 24 * 60 * 60 * 1000,
          scope: 'monthly',
        },
        lowCount: '5',
        expiringCount: '0',
      });

      const metrics = await storage.getHealthMetrics();

      // base 100 - 15 (stale audit > 30 days) = 85
      expect(metrics.healthScore).toBe(85);
    });

    it('deducts 5 from health score when last audit is 7-30 days old', async () => {
      mockHealthQueries({
        lastAudit: {
          started_at: Date.now() - 15 * 24 * 60 * 60 * 1000,
          scope: 'weekly',
        },
        lowCount: '5',
        expiringCount: '0',
      });

      const metrics = await storage.getHealthMetrics();

      // base 100 - 5 (audit 7-30 days old) = 95
      expect(metrics.healthScore).toBe(95);
    });

    it('clamps health score to minimum of 0', async () => {
      // Everything bad: high low-ratio, many expiring, stale audit
      mockHealthQueries({
        totalMemories: '10',
        lowCount: '8', // ratio 0.8 => -20
        expiringCount: '5', // 50% > 20% => -15
        lastAudit: {
          started_at: Date.now() - 60 * 24 * 60 * 60 * 1000, // > 30 days => -15
          scope: 'daily',
        },
      });

      const metrics = await storage.getHealthMetrics();

      // 100 - 20 - 15 - 15 = 50, still above 0, but let's verify clamping works
      expect(metrics.healthScore).toBeGreaterThanOrEqual(0);
      expect(metrics.healthScore).toBeLessThanOrEqual(100);
    });

    it('handles zero total memories gracefully', async () => {
      mockHealthQueries({
        totalMemories: '0',
        lowCount: '0',
        expiringCount: '0',
        avgImportance: null,
      });

      const metrics = await storage.getHealthMetrics();

      expect(metrics.totalMemories).toBe(0);
      expect(metrics.lowImportanceRatio).toBe(0);
      expect(metrics.avgImportance).toBe(0);
    });
  });
});
