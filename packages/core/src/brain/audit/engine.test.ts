import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryAuditEngine } from './engine.js';
import type { AuditEngineOpts } from './engine.js';
import type {
  MemoryAuditReport,
  CompressionSummary,
  ReorganizationSummary,
  AuditSnapshot,
  MemoryHealthMetrics,
} from '@secureyeoman/shared';

// ── Helpers ──────────────────────────────────────────────────

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  child: vi.fn(() => mockLogger),
  level: 'info',
};

function _makeSnapshot(overrides: Partial<AuditSnapshot> = {}): AuditSnapshot {
  return {
    totalMemories: 100,
    totalKnowledge: 20,
    byType: { episodic: 80, semantic: 20 },
    avgImportance: 0.6,
    oldestMemoryAge: 86400000,
    expiringCount: 5,
    ...overrides,
  };
}

function makeReport(overrides: Partial<MemoryAuditReport> = {}): MemoryAuditReport {
  return {
    id: 'report-1',
    tenantId: 'default',
    personalityId: null,
    scope: 'daily',
    startedAt: Date.now(),
    completedAt: null,
    preSnapshot: null,
    postSnapshot: null,
    compressionSummary: null,
    reorganizationSummary: null,
    maintenanceSummary: null,
    status: 'running',
    approvedBy: null,
    approvedAt: null,
    error: null,
    ...overrides,
  };
}

function makeCompressionSummary(overrides: Partial<CompressionSummary> = {}): CompressionSummary {
  return {
    candidatesFound: 10,
    memoriesCompressed: 5,
    memoriesArchived: 3,
    compressionRatio: 0.7,
    qualityChecksPassed: 5,
    qualityChecksFailed: 0,
    errors: [],
    ...overrides,
  };
}

function makeReorganizationSummary(
  overrides: Partial<ReorganizationSummary> = {}
): ReorganizationSummary {
  return {
    promoted: 2,
    demoted: 1,
    topicsMerged: 3,
    topicsSplit: 0,
    importanceRecalibrated: 4,
    coherenceIssuesFound: 0,
    coherenceIssuesFixed: 0,
    errors: [],
    ...overrides,
  };
}

function makeHealthMetrics(overrides: Partial<MemoryHealthMetrics> = {}): MemoryHealthMetrics {
  return {
    healthScore: 85,
    totalMemories: 100,
    totalKnowledge: 20,
    avgImportance: 0.6,
    expiringWithin7Days: 5,
    lowImportanceRatio: 0.1,
    duplicateEstimate: 0,
    lastAuditAt: Date.now(),
    lastAuditScope: 'daily',
    compressionSavings: 10,
    ...overrides,
  };
}

function makeMocks() {
  const brainStorage = {
    queryMemories: vi.fn().mockResolvedValue([]),
    getMeta: vi.fn().mockResolvedValue('0.5'),
    setMeta: vi.fn().mockResolvedValue(undefined),
  };

  const auditStorage = {
    createReport: vi.fn().mockResolvedValue(makeReport()),
    updateReport: vi
      .fn()
      .mockImplementation((_id: string, updates: Partial<MemoryAuditReport>) =>
        Promise.resolve(makeReport(updates))
      ),
    getHealthMetrics: vi.fn().mockResolvedValue(makeHealthMetrics()),
  };

  const policy = {
    isCompressionEnabled: vi.fn().mockReturnValue(true),
    isReorganizationEnabled: vi.fn().mockReturnValue(true),
    requiresApproval: vi.fn().mockReturnValue(false),
    isEnabled: vi.fn().mockReturnValue(true),
    getSchedule: vi.fn().mockReturnValue('30 3 * * *'),
    shouldRetainOriginals: vi.fn().mockReturnValue(true),
    getArchivalAgeDays: vi.fn().mockReturnValue(30),
    getCompressionThreshold: vi.fn().mockReturnValue(0.85),
    getMaxMemoriesPerPersonality: vi.fn().mockReturnValue(10000),
    getModel: vi.fn().mockReturnValue(null),
    getConfig: vi.fn().mockReturnValue({}),
  };

  const brainManager = {
    getStats: vi.fn().mockResolvedValue({
      memories: { total: 100, byType: { episodic: 80, semantic: 20 } },
      knowledge: { total: 20 },
    }),
    runMaintenance: vi.fn().mockResolvedValue({ pruned: 2, decayed: 5, vectorSynced: 0 }),
  };

  const compressor = {
    compress: vi.fn().mockResolvedValue(makeCompressionSummary()),
  };

  const reorganizer = {
    reorganize: vi.fn().mockResolvedValue(makeReorganizationSummary()),
  };

  const coherenceChecker = {
    check: vi.fn().mockResolvedValue({ issuesFound: 1, issuesFixed: 1, details: [] }),
  };

  const mockAlertManager = {
    evaluate: vi.fn().mockResolvedValue(undefined),
  };

  const getAlertManager = vi.fn(() => mockAlertManager);

  return {
    brainStorage,
    auditStorage,
    policy,
    brainManager,
    compressor,
    reorganizer,
    coherenceChecker,
    mockAlertManager,
    getAlertManager,
  };
}

function makeEngine(mocks: ReturnType<typeof makeMocks>, overrides: Partial<AuditEngineOpts> = {}) {
  return new MemoryAuditEngine({
    brainStorage: mocks.brainStorage as never,
    auditStorage: mocks.auditStorage as never,
    policy: mocks.policy as never,
    brainManager: mocks.brainManager as never,
    compressor: mocks.compressor as never,
    reorganizer: mocks.reorganizer as never,
    coherenceChecker: mocks.coherenceChecker as never,
    logger: mockLogger as never,
    getAlertManager: mocks.getAlertManager as never,
    ...overrides,
  });
}

// ── Tests ────────────────────────────────────────────────────

describe('MemoryAuditEngine', () => {
  let mocks: ReturnType<typeof makeMocks>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = makeMocks();
  });

  // ── Report creation & snapshots ────────────────────────────

  it('creates a report via auditStorage', async () => {
    const engine = makeEngine(mocks);
    await engine.runAudit('daily');
    expect(mocks.auditStorage.createReport).toHaveBeenCalledWith({
      scope: 'daily',
      personalityId: null,
    });
  });

  it('passes personalityId to createReport when provided', async () => {
    const engine = makeEngine(mocks);
    await engine.runAudit('weekly', 'soul-42');
    expect(mocks.auditStorage.createReport).toHaveBeenCalledWith({
      scope: 'weekly',
      personalityId: 'soul-42',
    });
  });

  it('takes pre and post snapshots', async () => {
    const engine = makeEngine(mocks);
    await engine.runAudit('daily');

    // brainManager.getStats called twice (pre + post)
    expect(mocks.brainManager.getStats).toHaveBeenCalledTimes(2);
    // updateReport called with preSnapshot and postSnapshot
    const calls = mocks.auditStorage.updateReport.mock.calls;
    const preCall = calls.find(
      (c: unknown[]) => (c[1] as Record<string, unknown>).preSnapshot !== undefined
    );
    const postCall = calls.find(
      (c: unknown[]) => (c[1] as Record<string, unknown>).postSnapshot !== undefined
    );
    expect(preCall).toBeDefined();
    expect(postCall).toBeDefined();
  });

  it('queries oldest memory for snapshot', async () => {
    const engine = makeEngine(mocks);
    await engine.runAudit('daily');
    expect(mocks.brainStorage.queryMemories).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 1, sortDirection: 'asc' })
    );
  });

  it('reads avg importance from meta cache', async () => {
    const engine = makeEngine(mocks);
    await engine.runAudit('daily');
    expect(mocks.brainStorage.getMeta).toHaveBeenCalledWith('__avg_importance_cache');
  });

  // ── Compression pass ───────────────────────────────────────

  it('runs compression when enabled and compressor exists', async () => {
    mocks.policy.isCompressionEnabled.mockReturnValue(true);
    const engine = makeEngine(mocks);
    await engine.runAudit('daily');
    expect(mocks.compressor.compress).toHaveBeenCalledWith('daily', 'report-1', undefined);
  });

  it('skips compression when policy disables it', async () => {
    mocks.policy.isCompressionEnabled.mockReturnValue(false);
    const engine = makeEngine(mocks);
    await engine.runAudit('daily');
    expect(mocks.compressor.compress).not.toHaveBeenCalled();
  });

  it('skips compression when no compressor provided', async () => {
    mocks.policy.isCompressionEnabled.mockReturnValue(true);
    const engine = makeEngine(mocks, { compressor: null });
    await engine.runAudit('daily');
    expect(mocks.compressor.compress).not.toHaveBeenCalled();
  });

  it('handles compression errors gracefully', async () => {
    mocks.compressor.compress.mockRejectedValue(new Error('compression boom'));
    const engine = makeEngine(mocks);
    const report = await engine.runAudit('daily');

    // Should not throw — report still completes
    expect(report.status).not.toBe('failed');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('compression boom') }),
      'Compression pass failed'
    );
  });

  it('saves compression summary to report', async () => {
    const engine = makeEngine(mocks);
    await engine.runAudit('daily');

    const calls = mocks.auditStorage.updateReport.mock.calls;
    const compressionCall = calls.find(
      (c: unknown[]) => (c[1] as Record<string, unknown>).compressionSummary !== undefined
    );
    expect(compressionCall).toBeDefined();
  });

  // ── Reorganization pass ────────────────────────────────────

  it('runs reorganization when enabled and reorganizer exists', async () => {
    mocks.policy.isReorganizationEnabled.mockReturnValue(true);
    const engine = makeEngine(mocks);
    await engine.runAudit('weekly');
    expect(mocks.reorganizer.reorganize).toHaveBeenCalledWith('weekly', 'report-1', undefined);
  });

  it('skips reorganization when policy disables it', async () => {
    mocks.policy.isReorganizationEnabled.mockReturnValue(false);
    const engine = makeEngine(mocks);
    await engine.runAudit('daily');
    expect(mocks.reorganizer.reorganize).not.toHaveBeenCalled();
  });

  it('skips reorganization when no reorganizer provided', async () => {
    mocks.policy.isReorganizationEnabled.mockReturnValue(true);
    const engine = makeEngine(mocks, { reorganizer: null });
    await engine.runAudit('daily');
    expect(mocks.reorganizer.reorganize).not.toHaveBeenCalled();
  });

  it('handles reorganization errors gracefully', async () => {
    mocks.reorganizer.reorganize.mockRejectedValue(new Error('reorg boom'));
    const engine = makeEngine(mocks);
    const report = await engine.runAudit('daily');

    expect(report.status).not.toBe('failed');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('reorg boom') }),
      'Reorganization pass failed'
    );
  });

  it('saves reorganization summary to report', async () => {
    const engine = makeEngine(mocks);
    await engine.runAudit('daily');

    const calls = mocks.auditStorage.updateReport.mock.calls;
    const reorgCall = calls.find(
      (c: unknown[]) => (c[1] as Record<string, unknown>).reorganizationSummary !== undefined
    );
    expect(reorgCall).toBeDefined();
  });

  // ── Coherence check ────────────────────────────────────────

  it('runs coherence check only on monthly scope', async () => {
    const engine = makeEngine(mocks);
    await engine.runAudit('monthly');
    expect(mocks.coherenceChecker.check).toHaveBeenCalled();
  });

  it('does not run coherence check on daily scope', async () => {
    const engine = makeEngine(mocks);
    await engine.runAudit('daily');
    expect(mocks.coherenceChecker.check).not.toHaveBeenCalled();
  });

  it('does not run coherence check on weekly scope', async () => {
    const engine = makeEngine(mocks);
    await engine.runAudit('weekly');
    expect(mocks.coherenceChecker.check).not.toHaveBeenCalled();
  });

  it('merges coherence results into reorganization summary on monthly', async () => {
    mocks.coherenceChecker.check.mockResolvedValue({ issuesFound: 3, issuesFixed: 2, details: [] });
    const engine = makeEngine(mocks);
    await engine.runAudit('monthly');

    const calls = mocks.auditStorage.updateReport.mock.calls;
    const reorgCall = calls.find(
      (c: unknown[]) => (c[1] as Record<string, unknown>).reorganizationSummary !== undefined
    );
    expect(reorgCall).toBeDefined();
    const summary = (reorgCall![1] as { reorganizationSummary: ReorganizationSummary })
      .reorganizationSummary;
    expect(summary.coherenceIssuesFound).toBe(3);
    expect(summary.coherenceIssuesFixed).toBe(2);
  });

  // ── Maintenance pass ───────────────────────────────────────

  it('runs maintenance pass', async () => {
    const engine = makeEngine(mocks);
    await engine.runAudit('daily');
    expect(mocks.brainManager.runMaintenance).toHaveBeenCalled();
  });

  it('saves maintenance summary to report', async () => {
    const engine = makeEngine(mocks);
    await engine.runAudit('daily');

    const calls = mocks.auditStorage.updateReport.mock.calls;
    const maintCall = calls.find(
      (c: unknown[]) => (c[1] as Record<string, unknown>).maintenanceSummary !== undefined
    );
    expect(maintCall).toBeDefined();
    const summary = (
      maintCall![1] as { maintenanceSummary: { expiredPruned: number; decayApplied: number } }
    ).maintenanceSummary;
    expect(summary.expiredPruned).toBe(2);
    expect(summary.decayApplied).toBe(5);
  });

  it('handles maintenance errors gracefully', async () => {
    mocks.brainManager.runMaintenance.mockRejectedValue(new Error('maint boom'));
    const engine = makeEngine(mocks);
    const report = await engine.runAudit('daily');

    expect(report.status).not.toBe('failed');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('maint boom') }),
      'Maintenance pass failed'
    );
  });

  it('returns zero counts when runMaintenance returns null', async () => {
    mocks.brainManager.runMaintenance.mockResolvedValue(null);
    const engine = makeEngine(mocks);
    await engine.runAudit('daily');

    const calls = mocks.auditStorage.updateReport.mock.calls;
    const maintCall = calls.find(
      (c: unknown[]) => (c[1] as Record<string, unknown>).maintenanceSummary !== undefined
    );
    const summary = (
      maintCall![1] as { maintenanceSummary: { expiredPruned: number; decayApplied: number } }
    ).maintenanceSummary;
    expect(summary.expiredPruned).toBe(0);
    expect(summary.decayApplied).toBe(0);
  });

  // ── Final status ───────────────────────────────────────────

  it('sets status to completed when no approval required', async () => {
    mocks.policy.requiresApproval.mockReturnValue(false);
    const engine = makeEngine(mocks);
    await engine.runAudit('daily');

    const calls = mocks.auditStorage.updateReport.mock.calls;
    const finalCall = calls.find(
      (c: unknown[]) => (c[1] as Record<string, unknown>).status === 'completed'
    );
    expect(finalCall).toBeDefined();
  });

  it('sets status to pending_approval when approval required', async () => {
    mocks.policy.requiresApproval.mockReturnValue(true);
    const engine = makeEngine(mocks);
    await engine.runAudit('daily');

    const calls = mocks.auditStorage.updateReport.mock.calls;
    const finalCall = calls.find(
      (c: unknown[]) => (c[1] as Record<string, unknown>).status === 'pending_approval'
    );
    expect(finalCall).toBeDefined();
  });

  // ── Alerts ─────────────────────────────────────────────────

  it('emits audit_completed alert on success', async () => {
    const engine = makeEngine(mocks);
    await engine.runAudit('daily');
    expect(mocks.mockAlertManager.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ 'brain.audit_completed': 1 })
    );
  });

  it('emits audit_failed alert on error', async () => {
    mocks.auditStorage.createReport.mockResolvedValue(makeReport());
    // Force takeSnapshot to throw
    mocks.brainManager.getStats.mockRejectedValue(new Error('snapshot fail'));
    const engine = makeEngine(mocks);
    await engine.runAudit('daily');

    expect(mocks.mockAlertManager.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ 'brain.audit_failed': 1 })
    );
  });

  it('emits health_degraded alert when healthScore < 50', async () => {
    mocks.auditStorage.getHealthMetrics.mockResolvedValue(makeHealthMetrics({ healthScore: 30 }));
    const engine = makeEngine(mocks);
    await engine.runAudit('daily');

    expect(mocks.mockAlertManager.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ 'brain.memory_health_degraded': 1 })
    );
  });

  it('does not emit health_degraded alert when healthScore >= 50', async () => {
    mocks.auditStorage.getHealthMetrics.mockResolvedValue(makeHealthMetrics({ healthScore: 80 }));
    const engine = makeEngine(mocks);
    await engine.runAudit('daily');

    const evaluateCalls = mocks.mockAlertManager.evaluate.mock.calls;
    const healthCall = evaluateCalls.find(
      (c: unknown[]) =>
        (c[0] as Record<string, unknown>)['brain.memory_health_degraded'] !== undefined
    );
    expect(healthCall).toBeUndefined();
  });

  it('does not check health when totalMemories is 0', async () => {
    mocks.brainManager.getStats.mockResolvedValue({
      memories: { total: 0, byType: {} },
      knowledge: { total: 0 },
    });
    const engine = makeEngine(mocks);
    await engine.runAudit('daily');
    expect(mocks.auditStorage.getHealthMetrics).not.toHaveBeenCalled();
  });

  it('handles missing alertManager gracefully', async () => {
    const engine = makeEngine(mocks, { getAlertManager: undefined });
    // Should not throw
    const report = await engine.runAudit('daily');
    expect(report).toBeDefined();
  });

  it('handles alertManager returning null', async () => {
    mocks.getAlertManager.mockReturnValue(null);
    const engine = makeEngine(mocks);
    // Should not throw
    const report = await engine.runAudit('daily');
    expect(report).toBeDefined();
  });

  // ── Error handling ─────────────────────────────────────────

  it('returns failed report when top-level error is thrown', async () => {
    mocks.brainManager.getStats.mockRejectedValue(new Error('fatal failure'));
    const engine = makeEngine(mocks);
    const report = await engine.runAudit('daily');

    expect(report.status).toBe('failed');
    expect(report.error).toBe('fatal failure');
  });

  it('logs error when audit fails', async () => {
    mocks.brainManager.getStats.mockRejectedValue(new Error('bad stats'));
    const engine = makeEngine(mocks);
    await engine.runAudit('daily');

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'bad stats' }),
      'Memory audit failed'
    );
  });

  it('handles non-Error thrown values', async () => {
    mocks.brainManager.getStats.mockRejectedValue('string error');
    const engine = makeEngine(mocks);
    const report = await engine.runAudit('daily');

    expect(report.status).toBe('failed');
    expect(report.error).toBe('string error');
  });

  // ── Full pipeline ──────────────────────────────────────────

  it('full audit pipeline runs successfully end to end', async () => {
    const engine = makeEngine(mocks);
    const report = await engine.runAudit('monthly', 'soul-7');

    // createReport called once
    expect(mocks.auditStorage.createReport).toHaveBeenCalledTimes(1);

    // Compression and reorganization both ran
    expect(mocks.compressor.compress).toHaveBeenCalledTimes(1);
    expect(mocks.reorganizer.reorganize).toHaveBeenCalledTimes(1);

    // Coherence check ran (monthly)
    expect(mocks.coherenceChecker.check).toHaveBeenCalledTimes(1);

    // Maintenance ran
    expect(mocks.brainManager.runMaintenance).toHaveBeenCalledTimes(1);

    // Pre+post snapshots (2 getStats calls)
    expect(mocks.brainManager.getStats).toHaveBeenCalledTimes(2);

    // Report is completed
    expect(report.status).toBe('completed');

    // Alert fired
    expect(mocks.mockAlertManager.evaluate).toHaveBeenCalled();
  });

  it('logs audit start with scope and reportId', async () => {
    const engine = makeEngine(mocks);
    await engine.runAudit('weekly', 'soul-3');

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'weekly', personalityId: 'soul-3', reportId: 'report-1' }),
      'Memory audit started'
    );
  });

  it('logs audit completion with snapshot counts', async () => {
    const engine = makeEngine(mocks);
    await engine.runAudit('daily');

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        reportId: 'report-1',
        scope: 'daily',
        status: 'completed',
      }),
      'Memory audit completed'
    );
  });
});
