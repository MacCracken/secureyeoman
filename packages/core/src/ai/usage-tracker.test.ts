import { describe, it, expect, beforeEach } from 'vitest';
import { UsageTracker } from './usage-tracker.js';
import type { TokenUsage } from '@secureyeoman/shared';

function makeUsage(total: number, cached = 0): TokenUsage {
  return {
    inputTokens: Math.floor(total * 0.6),
    outputTokens: Math.floor(total * 0.4),
    cachedTokens: cached,
    totalTokens: total,
  };
}

describe('UsageTracker', () => {
  let tracker: UsageTracker;

  beforeEach(() => {
    tracker = new UsageTracker(100000); // 100k daily limit
  });

  it('should record usage and aggregate stats', () => {
    tracker.record({
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      usage: makeUsage(1000, 200),
      costUsd: 0.01,
      timestamp: Date.now(),
    });

    const stats = tracker.getStats();
    expect(stats.tokensUsedToday).toBe(1000);
    expect(stats.tokensCachedToday).toBe(200);
    expect(stats.costUsdToday).toBeCloseTo(0.01);
    expect(stats.apiCallsTotal).toBe(1);
  });

  it('should aggregate multiple records', () => {
    tracker.record({
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      usage: makeUsage(500),
      costUsd: 0.005,
      timestamp: Date.now(),
    });
    tracker.record({
      provider: 'openai',
      model: 'gpt-4o',
      usage: makeUsage(300),
      costUsd: 0.003,
      timestamp: Date.now(),
    });

    const stats = tracker.getStats();
    expect(stats.tokensUsedToday).toBe(800);
    expect(stats.costUsdToday).toBeCloseTo(0.008);
    expect(stats.byProvider['anthropic']!.tokensUsed).toBe(500);
    expect(stats.byProvider['openai']!.tokensUsed).toBe(300);
  });

  it('should enforce daily limit', () => {
    // Add usage close to limit
    tracker.record({
      provider: 'anthropic',
      model: 'test',
      usage: makeUsage(99999),
      costUsd: 0.5,
      timestamp: Date.now(),
    });

    expect(tracker.checkLimit().allowed).toBe(true);

    tracker.record({
      provider: 'anthropic',
      model: 'test',
      usage: makeUsage(2),
      costUsd: 0.001,
      timestamp: Date.now(),
    });

    expect(tracker.checkLimit().allowed).toBe(false);
    expect(tracker.checkLimit().tokensUsedToday).toBe(100001);
    expect(tracker.checkLimit().limitPerDay).toBe(100000);
  });

  it('should allow unlimited when no limit is set', () => {
    const unlimitedTracker = new UsageTracker();

    unlimitedTracker.record({
      provider: 'anthropic',
      model: 'test',
      usage: makeUsage(999999),
      costUsd: 10,
      timestamp: Date.now(),
    });

    expect(unlimitedTracker.checkLimit().allowed).toBe(true);
    expect(unlimitedTracker.checkLimit().limitPerDay).toBeUndefined();
  });

  it('should track errors and latency', () => {
    tracker.recordError();
    tracker.recordError();
    tracker.recordLatency(150);
    tracker.recordLatency(250);

    const stats = tracker.getStats();
    expect(stats.apiErrorsTotal).toBe(2);
    expect(stats.apiCallsTotal).toBe(2); // errors count as calls
    expect(stats.apiLatencyTotalMs).toBe(400);
  });

  it('should seed apiCallsTotal, apiErrorsTotal, and latency from DB on init', async () => {
    const now = Date.now();
    const historicalRecords = [
      { provider: 'anthropic' as const, model: 'claude-opus-4-20250514', usage: makeUsage(500), costUsd: 0.005, timestamp: now - 1000, latencyMs: 120 },
      { provider: 'anthropic' as const, model: 'claude-opus-4-20250514', usage: makeUsage(300), costUsd: 0.003, timestamp: now - 500, latencyMs: 80 },
    ];
    const mockStorage = {
      loadRecent: async () => historicalRecords,
      insert: async () => {},
      getResetAt: async () => 0,
      loadStats: async () => ({ errorCount: 3, latencyTotalMs: 200, latencyCallCount: 2 }),
    } as any;
    const seededTracker = new UsageTracker(undefined, mockStorage);

    await seededTracker.init();

    const stats = seededTracker.getStats();
    // apiCallsTotal = 2 successful records + 3 errors from DB
    expect(stats.apiCallsTotal).toBe(5);
    expect(stats.apiErrorsTotal).toBe(3);
    // latency seeded from DB loadStats (not from records array)
    expect(stats.apiLatencyTotalMs).toBe(200);
    expect(stats.apiCallCount).toBe(2);
    expect(stats.tokensUsedToday).toBe(800);
    expect(stats.costUsdToday).toBeCloseTo(0.008);
  });

  it('should track monthly cost separately from daily', () => {
    // Record from "today"
    tracker.record({
      provider: 'anthropic',
      model: 'test',
      usage: makeUsage(1000),
      costUsd: 0.01,
      timestamp: Date.now(),
    });

    const stats = tracker.getStats();
    expect(stats.costUsdToday).toBeCloseTo(0.01);
    expect(stats.costUsdMonth).toBeCloseTo(0.01);
  });
});
