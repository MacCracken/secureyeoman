import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../../storage/pg-pool.js', () => ({
  getPool: () => ({
    query: mockQuery,
    connect: vi.fn(),
  }),
}));

import { ScanHistoryStore } from './scan-history-store.js';
import { randomUUID } from 'node:crypto';
import type { ScanResult } from '@secureyeoman/shared';

function makeScanResult(): ScanResult {
  return {
    artifactId: randomUUID(),
    verdict: 'warn',
    findings: [
      { id: randomUUID(), scanner: 'test', severity: 'medium', category: 'test', message: 'Test finding' },
    ],
    worstSeverity: 'medium',
    scanDurationMs: 15,
    scannerVersions: { test: '1.0.0' },
    scannedAt: Date.now(),
  };
}

describe('ScanHistoryStore', () => {
  let store: ScanHistoryStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new ScanHistoryStore();
  });

  describe('record', () => {
    it('inserts a scan record and returns mapped row', async () => {
      const now = Date.now();
      const sr = makeScanResult();
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'row-id',
          artifact_id: sr.artifactId,
          artifact_type: 'text/javascript',
          source_context: 'sandbox.run',
          personality_id: null,
          user_id: 'u1',
          verdict: 'warn',
          finding_count: 1,
          worst_severity: 'medium',
          intent_score: null,
          scan_duration_ms: 15,
          findings: JSON.stringify(sr.findings),
          threat_assessment: null,
          tenant_id: null,
          created_at: now,
        }],
      });

      const result = await store.record({
        artifactId: sr.artifactId,
        artifactType: 'text/javascript',
        sourceContext: 'sandbox.run',
        userId: 'u1',
        scanResult: sr,
      });

      expect(result.verdict).toBe('warn');
      expect(result.findingCount).toBe(1);
      expect(result.sourceContext).toBe('sandbox.run');
      expect(mockQuery).toHaveBeenCalledOnce();
    });
  });

  describe('list', () => {
    it('returns paginated results', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // COUNT
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'r1', artifact_id: 'a1', artifact_type: 'text/plain', source_context: 'test',
              verdict: 'pass', finding_count: 0, worst_severity: 'info', scan_duration_ms: 5,
              findings: '[]', created_at: Date.now(),
            },
            {
              id: 'r2', artifact_id: 'a2', artifact_type: 'text/plain', source_context: 'test',
              verdict: 'warn', finding_count: 1, worst_severity: 'medium', scan_duration_ms: 10,
              findings: '[]', created_at: Date.now(),
            },
          ],
        });

      const result = await store.list({ limit: 10, offset: 0 });
      expect(result.total).toBe(2);
      expect(result.items.length).toBe(2);
    });

    it('applies verdict filter', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await store.list({ verdict: 'block' });
      expect(mockQuery.mock.calls[0][1]).toContain('block');
    });
  });

  describe('getById', () => {
    it('returns mapped row by id', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'r1', artifact_id: 'a1', artifact_type: 'text/plain', source_context: 'test',
          verdict: 'pass', finding_count: 0, worst_severity: 'info', scan_duration_ms: 5,
          findings: '[]', threat_assessment: null, created_at: Date.now(),
        }],
      });

      const result = await store.getById('r1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('r1');
    });

    it('returns null for missing id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await store.getById('missing');
      expect(result).toBeNull();
    });
  });

  describe('getStats', () => {
    it('returns aggregated statistics', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '100' }] }) // total
        .mockResolvedValueOnce({
          rows: [
            { verdict: 'pass', count: '80' },
            { verdict: 'warn', count: '15' },
            { verdict: 'quarantine', count: '5' },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { worst_severity: 'info', count: '80' },
            { worst_severity: 'medium', count: '15' },
            { worst_severity: 'high', count: '5' },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ avg: '12.5' }] }) // avg duration
        .mockResolvedValueOnce({ rows: [{ count: '25' }] }); // last 24h

      const stats = await store.getStats();
      expect(stats.total).toBe(100);
      expect(stats.byVerdict.pass).toBe(80);
      expect(stats.byVerdict.warn).toBe(15);
      expect(stats.bySeverity.info).toBe(80);
      expect(stats.avgDurationMs).toBe(12.5);
      expect(stats.last24h).toBe(25);
    });
  });

  describe('row mapping', () => {
    it('parses JSON findings from string', async () => {
      const findings = [{ id: 'f1', scanner: 'test', severity: 'high', category: 'test', message: 'msg' }];
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'r1', artifact_id: 'a1', artifact_type: 'text/plain', source_context: 'test',
          verdict: 'warn', finding_count: 1, worst_severity: 'high', scan_duration_ms: 5,
          findings: JSON.stringify(findings), threat_assessment: null, created_at: Date.now(),
        }],
      });

      const result = await store.getById('r1');
      expect(result!.findings).toEqual(findings);
    });

    it('parses threat assessment from JSON string', async () => {
      const ta = { classification: 'suspicious', intentScore: 0.5, escalationTier: 'tier2_alert' };
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'r1', artifact_id: 'a1', artifact_type: 'text/plain', source_context: 'test',
          verdict: 'quarantine', finding_count: 3, worst_severity: 'high', scan_duration_ms: 20,
          findings: '[]', threat_assessment: JSON.stringify(ta), intent_score: 0.5, created_at: Date.now(),
        }],
      });

      const result = await store.getById('r1');
      expect(result!.threatAssessment?.classification).toBe('suspicious');
      expect(result!.intentScore).toBe(0.5);
    });
  });
});
