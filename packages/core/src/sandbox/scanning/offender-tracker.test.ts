import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OffenderTracker } from './offender-tracker.js';
import type { ScanResult } from '@secureyeoman/shared';
import { randomUUID } from 'node:crypto';

function makeScanResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    artifactId: randomUUID(),
    verdict: 'quarantine',
    findings: [{ id: randomUUID(), scanner: 'test', severity: 'high', category: 'test', message: 'test' }],
    worstSeverity: 'high',
    scanDurationMs: 100,
    scannerVersions: {},
    scannedAt: Date.now(),
    ...overrides,
  };
}

describe('OffenderTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ignores pass verdicts', () => {
    const tracker = new OffenderTracker();
    tracker.track('user-1', undefined, makeScanResult({ verdict: 'pass' }));
    expect(tracker.getTrackedKeys()).toEqual([]);
  });

  it('tracks non-pass verdicts by user', () => {
    const tracker = new OffenderTracker();
    tracker.track('user-1', undefined, makeScanResult({ verdict: 'quarantine' }));
    expect(tracker.getTrackedKeys()).toContain('user:user-1');
    const status = tracker.getStatus('user:user-1');
    expect(status.recentOffenses).toBe(1);
  });

  it('tracks by personality', () => {
    const tracker = new OffenderTracker();
    tracker.track(undefined, 'personality-1', makeScanResult({ verdict: 'block' }));
    expect(tracker.getTrackedKeys()).toContain('personality:personality-1');
  });

  it('tracks by both user and personality', () => {
    const tracker = new OffenderTracker();
    tracker.track('user-1', 'personality-1', makeScanResult());
    expect(tracker.getTrackedKeys()).toContain('user:user-1');
    expect(tracker.getTrackedKeys()).toContain('personality:personality-1');
  });

  it('uses anonymous key when no user or personality', () => {
    const tracker = new OffenderTracker();
    tracker.track(undefined, undefined, makeScanResult());
    expect(tracker.getTrackedKeys()).toContain('anonymous');
  });

  it('detects repeat offender at threshold', () => {
    const tracker = new OffenderTracker({ escalationThreshold: 3 });
    tracker.track('user-1', undefined, makeScanResult());
    tracker.track('user-1', undefined, makeScanResult());
    expect(tracker.isRepeatOffender('user-1', undefined)).toBe(false);
    tracker.track('user-1', undefined, makeScanResult());
    expect(tracker.isRepeatOffender('user-1', undefined)).toBe(true);
  });

  it('expires records outside rolling window', () => {
    const tracker = new OffenderTracker({ windowMs: 60_000, escalationThreshold: 2 });
    tracker.track('user-1', undefined, makeScanResult());
    tracker.track('user-1', undefined, makeScanResult());
    expect(tracker.isRepeatOffender('user-1', undefined)).toBe(true);

    // Advance past the window
    vi.advanceTimersByTime(60_001);
    expect(tracker.isRepeatOffender('user-1', undefined)).toBe(false);
    expect(tracker.getStatus('user:user-1').recentOffenses).toBe(0);
  });

  it('applies time decay to weighted score', () => {
    const tracker = new OffenderTracker({ windowMs: 60_000, decayFactor: 0.5 });
    tracker.track('user-1', undefined, makeScanResult({ worstSeverity: 'high' }));
    const scoreImmediately = tracker.getStatus('user:user-1').weightedScore;

    // Advance half the window
    vi.advanceTimersByTime(30_000);
    const scoreHalfway = tracker.getStatus('user:user-1').weightedScore;

    expect(scoreHalfway).toBeLessThan(scoreImmediately);
  });

  it('weights by severity', () => {
    const tracker = new OffenderTracker({ escalationThreshold: 1 });
    const lowTracker = new OffenderTracker({ escalationThreshold: 1 });

    tracker.track('user-high', undefined, makeScanResult({ worstSeverity: 'critical' }));
    lowTracker.track('user-low', undefined, makeScanResult({ worstSeverity: 'low' }));

    const highStatus = tracker.getStatus('user:user-high');
    const lowStatus = lowTracker.getStatus('user:user-low');
    expect(highStatus.weightedScore).toBeGreaterThan(lowStatus.weightedScore);
  });

  it('recommends tier based on weighted score', () => {
    const tracker = new OffenderTracker({ escalationThreshold: 1 });

    // One low offense → tier2_alert (score ~1, meets threshold but score < 3)
    tracker.track('user-1', undefined, makeScanResult({ worstSeverity: 'low' }));
    expect(tracker.getStatus('user:user-1').recommendedTier).toBe('tier1_log');

    // Multiple critical offenses → higher tier
    const heavyTracker = new OffenderTracker({ escalationThreshold: 1 });
    heavyTracker.track('user-2', undefined, makeScanResult({ worstSeverity: 'critical' }));
    heavyTracker.track('user-2', undefined, makeScanResult({ worstSeverity: 'critical' }));
    heavyTracker.track('user-2', undefined, makeScanResult({ worstSeverity: 'critical' }));
    const status = heavyTracker.getStatus('user:user-2');
    expect(['tier3_suspend', 'tier4_revoke']).toContain(status.recommendedTier);
  });

  it('getRecommendedTier returns highest across keys', () => {
    const tracker = new OffenderTracker({ escalationThreshold: 1 });
    // Give user many critical offenses
    for (let i = 0; i < 5; i++) {
      tracker.track('user-1', 'personality-1', makeScanResult({ worstSeverity: 'critical' }));
    }
    const tier = tracker.getRecommendedTier('user-1', 'personality-1');
    expect(tier).toBe('tier4_revoke');
  });

  it('prune removes expired records', () => {
    const tracker = new OffenderTracker({ windowMs: 60_000 });
    tracker.track('user-1', undefined, makeScanResult());
    expect(tracker.getTrackedKeys()).toHaveLength(1);

    vi.advanceTimersByTime(60_001);
    tracker.prune();
    expect(tracker.getTrackedKeys()).toHaveLength(0);
  });

  it('prune keeps active records', () => {
    const tracker = new OffenderTracker({ windowMs: 60_000 });
    tracker.track('user-1', undefined, makeScanResult());
    vi.advanceTimersByTime(30_000);
    tracker.track('user-1', undefined, makeScanResult());

    vi.advanceTimersByTime(30_001); // first record expires, second still active
    tracker.prune();
    expect(tracker.getTrackedKeys()).toHaveLength(1);
    expect(tracker.getStatus('user:user-1').recentOffenses).toBe(1);
  });

  it('clear removes all records', () => {
    const tracker = new OffenderTracker();
    tracker.track('user-1', undefined, makeScanResult());
    tracker.track('user-2', undefined, makeScanResult());
    tracker.clear();
    expect(tracker.getTrackedKeys()).toEqual([]);
  });

  it('respects maxEntries limit', () => {
    const tracker = new OffenderTracker({ maxEntries: 3 });
    for (let i = 0; i < 10; i++) {
      tracker.track('user-1', undefined, makeScanResult());
    }
    // Internal list should be capped at 3
    const status = tracker.getStatus('user:user-1');
    expect(status.recentOffenses).toBeLessThanOrEqual(3);
  });

  it('handles info severity weight', () => {
    const tracker = new OffenderTracker({ escalationThreshold: 1 });
    tracker.track('user-1', undefined, makeScanResult({ worstSeverity: 'info' }));
    const status = tracker.getStatus('user:user-1');
    expect(status.weightedScore).toBeGreaterThan(0);
    expect(status.weightedScore).toBeLessThan(1);
  });
});
