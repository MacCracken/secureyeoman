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
    expect(stats.inputTokensToday).toBe(600);
    expect(stats.outputTokensToday).toBe(400);
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
    expect(stats.inputTokensToday).toBe(480); // (300 + 180)
    expect(stats.outputTokensToday).toBe(320); // (200 + 120)
    expect(stats.tokensUsedToday).toBe(800);
    expect(stats.costUsdToday).toBeCloseTo(0.008);
    expect(stats.byProvider['anthropic']!.inputTokensUsed).toBe(300);
    expect(stats.byProvider['anthropic']!.outputTokensUsed).toBe(200);
    expect(stats.byProvider['anthropic']!.tokensUsed).toBe(500);
    expect(stats.byProvider['openai']!.inputTokensUsed).toBe(180);
    expect(stats.byProvider['openai']!.outputTokensUsed).toBe(120);
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
      {
        provider: 'anthropic' as const,
        model: 'claude-opus-4-20250514',
        usage: makeUsage(500),
        costUsd: 0.005,
        timestamp: now - 1000,
        latencyMs: 120,
      },
      {
        provider: 'anthropic' as const,
        model: 'claude-opus-4-20250514',
        usage: makeUsage(300),
        costUsd: 0.003,
        timestamp: now - 500,
        latencyMs: 80,
      },
    ];
    const mockStorage = {
      loadToday: async () => historicalRecords,
      getTotalCallCount: async () => historicalRecords.length,
      loadMonthCostUsd: async () => historicalRecords.reduce((s, r) => s + r.costUsd, 0),
      loadProviderStats: async () => ({}),
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
    expect(stats.inputTokensToday).toBe(480);
    expect(stats.outputTokensToday).toBe(320);
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

  it('clears todayRecords when calendar day rolls over', () => {
    // Add a record with "yesterday" as the current day key
    tracker.record({
      provider: 'anthropic',
      model: 'test',
      usage: makeUsage(500),
      costUsd: 0.005,
      timestamp: Date.now(),
    });
    expect(tracker.getStats().tokensUsedToday).toBe(500);

    // Simulate midnight rollover by setting the day key to yesterday
    (tracker as any).currentDayKey = '1970-01-01';

    // Next record triggers the rollover logic
    tracker.record({
      provider: 'openai',
      model: 'gpt-4o',
      usage: makeUsage(300),
      costUsd: 0.003,
      timestamp: Date.now(),
    });

    // Only the new record's tokens should count as "today"
    const stats = tracker.getStats();
    expect(stats.tokensUsedToday).toBe(300);
  });

  it('init() returns early when no storage is set', async () => {
    const noStorageTracker = new UsageTracker();
    // Should resolve without error even with no storage
    await expect(noStorageTracker.init()).resolves.toBeUndefined();
  });

  it('record() calls storage.insert and swallows insert errors', async () => {
    let insertCallCount = 0;
    const mockStorage = {
      loadToday: async () => [],
      getTotalCallCount: async () => 0,
      loadMonthCostUsd: async () => 0,
      loadProviderStats: async () => ({}),
      getResetAt: async () => 0,
      loadStats: async () => ({ errorCount: 0, latencyTotalMs: 0, latencyCallCount: 0 }),
      insert: async () => {
        insertCallCount++;
        throw new Error('DB down');
      },
      insertError: async () => {},
      setResetAt: async () => {},
    } as any;

    const t = new UsageTracker(undefined, mockStorage);
    t.record({
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      usage: makeUsage(100),
      costUsd: 0.001,
      timestamp: Date.now(),
    });

    // Allow fire-and-forget to settle
    await new Promise((r) => setTimeout(r, 10));
    expect(insertCallCount).toBe(1);
    // Should not throw — in-memory record is still kept
    expect(t.getStats().apiCallsTotal).toBe(1);
  });

  it('recordError() calls storage.insertError when storage is available', async () => {
    let insertErrorCalled = false;
    const mockStorage = {
      loadToday: async () => [],
      getTotalCallCount: async () => 0,
      loadMonthCostUsd: async () => 0,
      loadProviderStats: async () => ({}),
      getResetAt: async () => 0,
      loadStats: async () => ({ errorCount: 0, latencyTotalMs: 0, latencyCallCount: 0 }),
      insert: async () => {},
      insertError: async () => { insertErrorCalled = true; },
      setResetAt: async () => {},
    } as any;

    const t = new UsageTracker(undefined, mockStorage);
    t.recordError('anthropic', 'claude-sonnet-4-20250514');

    await new Promise((r) => setTimeout(r, 10));
    expect(insertErrorCalled).toBe(true);
    expect(t.getStats().apiErrorsTotal).toBe(1);
    expect(t.getStats().apiCallsTotal).toBe(1);
  });

  it('resetErrors() resets error counter and calls storage.setResetAt', async () => {
    let resetAtType = '';
    let resetAtValue = 0;
    const mockStorage = {
      loadToday: async () => [],
      getTotalCallCount: async () => 0,
      loadMonthCostUsd: async () => 0,
      loadProviderStats: async () => ({}),
      getResetAt: async () => 0,
      loadStats: async () => ({ errorCount: 0, latencyTotalMs: 0, latencyCallCount: 0 }),
      insert: async () => {},
      insertError: async () => {},
      setResetAt: async (type: string, ts: number) => { resetAtType = type; resetAtValue = ts; },
    } as any;

    const t = new UsageTracker(undefined, mockStorage);
    t.recordError();
    t.recordError();
    expect(t.getStats().apiErrorsTotal).toBe(2);

    await t.resetErrors();
    expect(t.getStats().apiErrorsTotal).toBe(0);
    expect(resetAtType).toBe('errors');
    expect(resetAtValue).toBeGreaterThan(0);
  });

  it('resetLatency() resets latency counters and calls storage.setResetAt', async () => {
    let resetAtType = '';
    const mockStorage = {
      loadToday: async () => [],
      getTotalCallCount: async () => 0,
      loadMonthCostUsd: async () => 0,
      loadProviderStats: async () => ({}),
      getResetAt: async () => 0,
      loadStats: async () => ({ errorCount: 0, latencyTotalMs: 0, latencyCallCount: 0 }),
      insert: async () => {},
      insertError: async () => {},
      setResetAt: async (type: string) => { resetAtType = type; },
    } as any;

    const t = new UsageTracker(undefined, mockStorage);
    t.recordLatency(500);
    t.recordLatency(300);
    expect(t.getStats().apiLatencyTotalMs).toBe(800);
    expect(t.getStats().apiCallCount).toBe(2);

    await t.resetLatency();
    expect(t.getStats().apiLatencyTotalMs).toBe(0);
    expect(t.getStats().apiCallCount).toBe(0);
    expect(resetAtType).toBe('latency');
  });
});
