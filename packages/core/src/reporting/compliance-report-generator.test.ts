import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComplianceReportGenerator } from './compliance-report-generator.js';
import type { ComplianceReportOptions } from './compliance-report-generator.js';
import type { AuditEntry } from '@secureyeoman/shared';
import type { EgressEvent, ClassificationRecord } from '../security/dlp/types.js';

// ── Mock Data ──────────────────────────────────────────────────────────────────

const mockAuditEntries: AuditEntry[] = [
  {
    id: '00000000-0000-7000-8000-000000000001',
    event: 'user_login',
    level: 'info',
    message: 'User logged in',
    userId: 'user-1',
    timestamp: 1700000100000,
    integrity: { version: '1.0.0', signature: 'a'.repeat(64), previousEntryHash: '0'.repeat(64) },
  },
  {
    id: '00000000-0000-7000-8000-000000000002',
    event: 'data_access',
    level: 'warn',
    message: 'Sensitive data accessed',
    userId: 'user-2',
    timestamp: 1700000200000,
    integrity: { version: '1.0.0', signature: 'b'.repeat(64), previousEntryHash: 'a'.repeat(64) },
  },
  {
    id: '00000000-0000-7000-8000-000000000003',
    event: 'config_change',
    level: 'security',
    message: 'Security config updated',
    userId: 'user-1',
    timestamp: 1700000300000,
    integrity: { version: '1.0.0', signature: 'c'.repeat(64), previousEntryHash: 'b'.repeat(64) },
  },
];

const mockEgressEvents: EgressEvent[] = [
  {
    id: 'egr-1',
    destinationType: 'api',
    destinationId: 'ext-api-1',
    contentHash: 'hash1',
    classificationLevel: 'internal',
    bytesSent: 1024,
    policyId: 'pol-1',
    actionTaken: 'allowed',
    scanFindings: [{ type: 'pii', description: 'Email detected', severity: 'medium' }],
    userId: 'user-1',
    personalityId: null,
    createdAt: 1700000150000,
    tenantId: 'tenant-1',
  },
  {
    id: 'egr-2',
    destinationType: 'webhook',
    destinationId: 'hook-1',
    contentHash: 'hash2',
    classificationLevel: 'restricted',
    bytesSent: 2048,
    policyId: 'pol-2',
    actionTaken: 'blocked',
    scanFindings: [
      { type: 'pii', description: 'SSN detected', severity: 'critical' },
      { type: 'keyword', description: 'Confidential keyword', severity: 'high' },
    ],
    userId: 'user-2',
    personalityId: null,
    createdAt: 1700000250000,
    tenantId: 'tenant-1',
  },
  {
    id: 'egr-3',
    destinationType: 'email',
    destinationId: null,
    contentHash: 'hash3',
    classificationLevel: 'confidential',
    bytesSent: 512,
    policyId: null,
    actionTaken: 'warned',
    scanFindings: [],
    userId: 'user-1',
    personalityId: null,
    createdAt: 1700000350000,
    tenantId: 'tenant-1',
  },
];

const mockClassifications: ClassificationRecord[] = [
  {
    id: 'cls-1',
    contentId: 'doc-1',
    contentType: 'document',
    classificationLevel: 'restricted',
    autoLevel: 'restricted',
    manualOverride: false,
    overriddenBy: null,
    rulesTriggered: [{ type: 'pii', name: 'SSN Pattern', level: 'restricted' }],
    classifiedAt: 1700000120000,
    tenantId: 'tenant-1',
  },
  {
    id: 'cls-2',
    contentId: 'conv-1',
    contentType: 'conversation',
    classificationLevel: 'internal',
    autoLevel: 'internal',
    manualOverride: false,
    overriddenBy: null,
    rulesTriggered: [{ type: 'keyword', name: 'Internal Only', level: 'internal' }],
    classifiedAt: 1700000220000,
    tenantId: 'tenant-1',
  },
  {
    id: 'cls-3',
    contentId: 'msg-1',
    contentType: 'message',
    classificationLevel: 'confidential',
    autoLevel: 'confidential',
    manualOverride: true,
    overriddenBy: 'admin-1',
    rulesTriggered: [],
    classifiedAt: 1700000320000,
    tenantId: 'tenant-1',
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => makeMockLogger()),
  } as any;
}

function makeDeps(overrides: {
  auditEntries?: AuditEntry[];
  egressEvents?: EgressEvent[];
  classifications?: ClassificationRecord[];
} = {}) {
  const queryAuditLog = vi.fn().mockResolvedValue({
    entries: overrides.auditEntries ?? mockAuditEntries,
    total: (overrides.auditEntries ?? mockAuditEntries).length,
    limit: 10000,
    offset: 0,
  });

  const egressStore = {
    queryEgress: vi.fn().mockResolvedValue({
      events: overrides.egressEvents ?? mockEgressEvents,
      total: (overrides.egressEvents ?? mockEgressEvents).length,
    }),
  } as any;

  const classificationStore = {
    list: vi.fn().mockResolvedValue({
      records: overrides.classifications ?? mockClassifications,
      total: (overrides.classifications ?? mockClassifications).length,
    }),
  } as any;

  return { queryAuditLog, egressStore, classificationStore, logger: makeMockLogger() };
}

function baseOptions(format: 'json' | 'html' | 'csv' | 'md' = 'json'): ComplianceReportOptions {
  return {
    from: 1700000000000,
    to: 1700000400000,
    format,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ComplianceReportGenerator', () => {
  let generator: ComplianceReportGenerator;
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
    generator = new ComplianceReportGenerator(deps);
  });

  // 1
  it('generates a JSON report with all three data sources', async () => {
    const result = await generator.generate(baseOptions('json'));
    const parsed = JSON.parse(result.content);
    expect(parsed.auditEvents).toHaveLength(3);
    expect(parsed.egressEvents).toHaveLength(3);
    expect(parsed.classifications).toHaveLength(3);
    expect(parsed.summary.totalAuditEvents).toBe(3);
    expect(parsed.summary.totalEgressEvents).toBe(3);
    expect(parsed.summary.totalClassifications).toBe(3);
    expect(parsed.period.from).toBe(1700000000000);
    expect(parsed.period.to).toBe(1700000400000);
    expect(result.id).toBeDefined();
  });

  // 2
  it('generates an HTML report with table tags and summary cards', async () => {
    const result = await generator.generate(baseOptions('html'));
    expect(result.content).toContain('<table>');
    expect(result.content).toContain('</table>');
    expect(result.content).toContain('<th>');
    expect(result.content).toContain('summary-card');
    expect(result.content).toContain('Audit Events');
    expect(result.content).toContain('Blocked Egress');
    expect(result.content).toContain('PII Detections');
    expect(result.content).toContain('<!DOCTYPE html>');
  });

  // 3
  it('generates a CSV report with header row and data rows', async () => {
    const result = await generator.generate(baseOptions('csv'));
    const lines = result.content.split('\n');
    expect(lines[0]).toBe('timestamp,source,event_type,user,details,severity');
    // 3 audit + 3 egress + 3 classification = 9 data rows
    expect(lines).toHaveLength(10); // header + 9 rows
    // Check audit row
    expect(lines[1]).toContain('audit');
    expect(lines[1]).toContain('user_login');
    // Check egress row
    expect(lines[4]).toContain('egress');
    // Check classification row
    expect(lines[7]).toContain('classification');
  });

  // 4
  it('generates a Markdown report with table syntax', async () => {
    const result = await generator.generate(baseOptions('md'));
    expect(result.content).toContain('# Compliance Report');
    expect(result.content).toContain('| Metric | Count |');
    expect(result.content).toContain('|--------|-------|');
    expect(result.content).toContain('## Audit Events');
    expect(result.content).toContain('## Egress Events');
    expect(result.content).toContain('## Classifications');
    expect(result.content).toContain('| Audit Events | 3 |');
    expect(result.content).toContain('| Egress Events | 3 |');
  });

  // 5
  it('filters audit events by userId', async () => {
    const filteredEntries = mockAuditEntries.filter((e) => e.userId === 'user-1');
    const customDeps = makeDeps({ auditEntries: filteredEntries });
    const gen = new ComplianceReportGenerator(customDeps);

    const result = await gen.generate({ ...baseOptions('json'), userId: 'user-1' });
    const parsed = JSON.parse(result.content);
    expect(parsed.auditEvents).toHaveLength(2);
    expect(customDeps.queryAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' })
    );
  });

  // 6
  it('filters by classification level', async () => {
    const restricted = mockClassifications.filter((c) => c.classificationLevel === 'restricted');
    const customDeps = makeDeps({ classifications: restricted });
    const gen = new ComplianceReportGenerator(customDeps);

    const result = await gen.generate({
      ...baseOptions('json'),
      classificationLevels: ['restricted'],
    });
    const parsed = JSON.parse(result.content);
    expect(parsed.classifications).toHaveLength(1);
    expect(parsed.classifications[0].classificationLevel).toBe('restricted');
    expect(customDeps.classificationStore.list).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'restricted' })
    );
  });

  // 7
  it('filters by content type', async () => {
    const customDeps = makeDeps();
    const gen = new ComplianceReportGenerator(customDeps);

    const result = await gen.generate({
      ...baseOptions('json'),
      contentTypes: ['document'],
    });
    const parsed = JSON.parse(result.content);
    expect(parsed.classifications).toHaveLength(1);
    expect(parsed.classifications[0].contentType).toBe('document');
  });

  // 8
  it('handles empty results when no data in range', async () => {
    const emptyDeps = makeDeps({ auditEntries: [], egressEvents: [], classifications: [] });
    const gen = new ComplianceReportGenerator(emptyDeps);

    const result = await gen.generate(baseOptions('json'));
    const parsed = JSON.parse(result.content);
    expect(parsed.auditEvents).toHaveLength(0);
    expect(parsed.egressEvents).toHaveLength(0);
    expect(parsed.classifications).toHaveLength(0);
    expect(parsed.summary.totalAuditEvents).toBe(0);
    expect(parsed.summary.totalEgressEvents).toBe(0);
    expect(parsed.summary.totalClassifications).toBe(0);
    expect(parsed.summary.blockedEgressCount).toBe(0);
    expect(parsed.summary.restrictedContentCount).toBe(0);
    expect(parsed.summary.piiDetectionCount).toBe(0);
  });

  // 9
  it('computes summary statistics correctly', async () => {
    const result = await generator.generate(baseOptions('json'));
    expect(result.summary.totalAuditEvents).toBe(3);
    expect(result.summary.totalEgressEvents).toBe(3);
    expect(result.summary.totalClassifications).toBe(3);
    expect(result.summary.blockedEgressCount).toBe(1); // egr-2 is blocked
    expect(result.summary.restrictedContentCount).toBe(1); // cls-1 is restricted
    expect(result.summary.piiDetectionCount).toBe(2); // egr-1 has 1 pii, egr-2 has 1 pii
  });

  // 10
  it('respects period boundaries in queries', async () => {
    const opts = { ...baseOptions('json'), from: 1700000100000, to: 1700000300000 };
    await generator.generate(opts);
    expect(deps.queryAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ from: 1700000100000, to: 1700000300000 })
    );
    expect(deps.egressStore.queryEgress).toHaveBeenCalledWith(
      expect.objectContaining({ fromTime: 1700000100000, toTime: 1700000300000 })
    );
  });

  // 11
  it('generates egress-only report when audit and classifications are excluded', async () => {
    const result = await generator.generate({
      ...baseOptions('json'),
      includeAudit: false,
      includeClassifications: false,
    });
    const parsed = JSON.parse(result.content);
    expect(parsed.auditEvents).toHaveLength(0);
    expect(parsed.classifications).toHaveLength(0);
    expect(parsed.egressEvents).toHaveLength(3);
    expect(deps.queryAuditLog).not.toHaveBeenCalled();
    expect(deps.classificationStore.list).not.toHaveBeenCalled();
    expect(deps.egressStore.queryEgress).toHaveBeenCalled();
  });

  // 12
  it('generates audit-only report when egress and classifications are excluded', async () => {
    const result = await generator.generate({
      ...baseOptions('json'),
      includeEgress: false,
      includeClassifications: false,
    });
    const parsed = JSON.parse(result.content);
    expect(parsed.auditEvents).toHaveLength(3);
    expect(parsed.egressEvents).toHaveLength(0);
    expect(parsed.classifications).toHaveLength(0);
    expect(deps.queryAuditLog).toHaveBeenCalled();
    expect(deps.egressStore.queryEgress).not.toHaveBeenCalled();
    expect(deps.classificationStore.list).not.toHaveBeenCalled();
  });

  // 13
  it('includes all data sources by default', async () => {
    const result = await generator.generate(baseOptions('json'));
    const parsed = JSON.parse(result.content);
    expect(parsed.auditEvents).toHaveLength(3);
    expect(parsed.egressEvents).toHaveLength(3);
    expect(parsed.classifications).toHaveLength(3);
    expect(deps.queryAuditLog).toHaveBeenCalled();
    expect(deps.egressStore.queryEgress).toHaveBeenCalled();
    expect(deps.classificationStore.list).toHaveBeenCalled();
  });

  // 14
  it('caches generated reports for retrieval by ID', async () => {
    const result = await generator.generate(baseOptions('json'));
    const cached = generator.getReport(result.id);
    expect(cached).not.toBeNull();
    expect(cached!.id).toBe(result.id);
    expect(cached!.content).toBe(result.content);
    expect(cached!.summary.totalAuditEvents).toBe(3);
  });

  // 15
  it('returns null for unknown report ID', () => {
    const result = generator.getReport('nonexistent-id');
    expect(result).toBeNull();
  });

  // 16
  it('handles query failures gracefully and produces partial report', async () => {
    deps.queryAuditLog.mockRejectedValue(new Error('DB connection failed'));
    deps.egressStore.queryEgress.mockRejectedValue(new Error('Egress store unavailable'));

    const result = await generator.generate(baseOptions('json'));
    const parsed = JSON.parse(result.content);
    // Audit and egress should be empty due to errors, classifications still present
    expect(parsed.auditEvents).toHaveLength(0);
    expect(parsed.egressEvents).toHaveLength(0);
    expect(parsed.classifications).toHaveLength(3);
    expect(deps.logger.warn).toHaveBeenCalledTimes(2);
  });

  // 17
  it('generates HTML with empty sections for excluded sources', async () => {
    const emptyDeps = makeDeps({ auditEntries: [], egressEvents: [] });
    const gen = new ComplianceReportGenerator(emptyDeps);

    const result = await gen.generate(baseOptions('html'));
    // Should not contain audit or egress tables
    expect(result.content).not.toContain('<h2>Audit Events</h2>');
    expect(result.content).not.toContain('<h2>Egress Events</h2>');
    // But should contain classifications
    expect(result.content).toContain('<h2>Classifications</h2>');
  });

  // 18
  it('generates Markdown with "no data" placeholders for empty sections', async () => {
    const emptyDeps = makeDeps({ auditEntries: [], egressEvents: [], classifications: [] });
    const gen = new ComplianceReportGenerator(emptyDeps);

    const result = await gen.generate(baseOptions('md'));
    expect(result.content).toContain('_No audit events._');
    expect(result.content).toContain('_No egress events._');
    expect(result.content).toContain('_No classifications._');
  });
});
