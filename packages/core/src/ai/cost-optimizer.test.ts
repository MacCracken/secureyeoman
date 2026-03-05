import { describe, it, expect, vi } from 'vitest';
import { CostOptimizer } from './cost-optimizer.js';
import { createNoopLogger } from '../logging/logger.js';
import type { HistoryRow } from './usage-storage.js';

function createMockTracker(overrides: Record<string, unknown> = {}) {
  return {
    getStats: () => ({
      tokensUsedToday: 0,
      tokensCachedToday: 0,
      costUsdToday: 0,
      costUsdMonth: 0,
      apiCallsTotal: 0,
      apiErrorsTotal: 0,
      apiCallCount: 0,
      apiLatencyTotalMs: 0,
      inputTokensToday: 0,
      outputTokensToday: 0,
      ...overrides,
    }),
  } as any;
}

function createMockStorage(rows: HistoryRow[] = []) {
  return {
    queryHistory: vi.fn().mockResolvedValue(rows),
  } as any;
}

function createMockCalculator() {
  return {
    calculate: vi.fn((_provider: string, _model: string, usage: any) => {
      // Simple: 0.001 per token (cheap model)
      return (usage.inputTokens + usage.outputTokens) * 0.000001;
    }),
    getPricing: vi.fn(() => ({ inputPer1M: 1, outputPer1M: 1 })),
  } as any;
}

function makeHistoryRow(overrides: Partial<HistoryRow> = {}): HistoryRow {
  return {
    date: '2026-03-01',
    provider: 'anthropic',
    model: 'claude-opus-4-20250514',
    personalityId: null,
    inputTokens: 5000,
    outputTokens: 200,
    cachedTokens: 0,
    totalTokens: 5200,
    costUsd: 1.5,
    calls: 10,
    ...overrides,
  };
}

describe('CostOptimizer', () => {
  // ── Original analyze() tests (regression) ───────────────────────────

  it('should return empty recommendations for low usage', () => {
    const optimizer = new CostOptimizer({
      logger: createNoopLogger(),
      usageTracker: createMockTracker(),
    });
    const analysis = optimizer.analyze();
    expect(analysis.recommendations).toHaveLength(0);
    expect(analysis.analyzedAt).toBeGreaterThan(0);
  });

  it('should recommend caching when cost exceeds $1/day', () => {
    const optimizer = new CostOptimizer({
      logger: createNoopLogger(),
      usageTracker: createMockTracker({ costUsdToday: 2, costUsdMonth: 20 }),
    });
    const analysis = optimizer.analyze();
    const caching = analysis.recommendations.find((r) => r.category === 'caching');
    expect(caching).toBeTruthy();
    expect(caching!.priority).toBe('medium');
  });

  it('should recommend model switch when cost exceeds $5/day', () => {
    const optimizer = new CostOptimizer({
      logger: createNoopLogger(),
      usageTracker: createMockTracker({ costUsdToday: 10, costUsdMonth: 100, apiCallsTotal: 50 }),
    });
    const analysis = optimizer.analyze();
    const modelRec = analysis.recommendations.find((r) => r.category === 'model_selection');
    expect(modelRec).toBeTruthy();
    expect(modelRec!.priority).toBe('high');
  });

  it('should recommend token reduction for high usage', () => {
    const optimizer = new CostOptimizer({
      logger: createNoopLogger(),
      usageTracker: createMockTracker({
        tokensUsedToday: 200000,
        costUsdToday: 3,
        costUsdMonth: 30,
        apiCallsTotal: 100,
      }),
    });
    const analysis = optimizer.analyze();
    const tokenRec = analysis.recommendations.find((r) => r.category === 'token_reduction');
    expect(tokenRec).toBeTruthy();
  });

  it('should recommend batching for active usage', () => {
    const optimizer = new CostOptimizer({
      logger: createNoopLogger(),
      usageTracker: createMockTracker({ apiCallsTotal: 50, costUsdToday: 0.5, costUsdMonth: 5 }),
    });
    const analysis = optimizer.analyze();
    const batch = analysis.recommendations.find((r) => r.category === 'batching');
    expect(batch).toBeTruthy();
  });

  it('should set caching recommendation priority to high when cost exceeds $10/day', () => {
    const optimizer = new CostOptimizer({
      logger: createNoopLogger(),
      usageTracker: createMockTracker({ costUsdToday: 15, costUsdMonth: 150, apiCallsTotal: 200 }),
    });
    const analysis = optimizer.analyze();
    const caching = analysis.recommendations.find((r) => r.category === 'caching');
    expect(caching).toBeTruthy();
    expect(caching!.priority).toBe('high');
  });

  it('returns totalCostUsd from costUsdMonth', () => {
    const optimizer = new CostOptimizer({
      logger: createNoopLogger(),
      usageTracker: createMockTracker({ costUsdMonth: 99 }),
    });
    const analysis = optimizer.analyze();
    expect(analysis.totalCostUsd).toBe(99);
  });

  // ── analyzeDetailed() ───────────────────────────────────────────────

  it('analyzeDetailed returns correct per-model stats', async () => {
    const rows: HistoryRow[] = [
      makeHistoryRow({
        model: 'claude-opus-4-20250514',
        calls: 10,
        costUsd: 5,
        totalTokens: 10000,
        outputTokens: 2000,
      }),
      makeHistoryRow({
        model: 'gpt-4o-mini',
        provider: 'openai',
        calls: 20,
        costUsd: 0.5,
        totalTokens: 8000,
        outputTokens: 4000,
      }),
    ];
    const optimizer = new CostOptimizer({
      logger: createNoopLogger(),
      usageTracker: createMockTracker({ costUsdMonth: 5.5 }),
      usageStorage: createMockStorage(rows),
    });

    const result = await optimizer.analyzeDetailed({ days: 7 });
    expect(result.perModelStats).toHaveLength(2);
    // Sorted by cost descending
    expect(result.perModelStats[0].model).toBe('claude-opus-4-20250514');
    expect(result.perModelStats[0].totalCostUsd).toBe(5);
    expect(result.perModelStats[0].avgCostPerCall).toBe(0.5);
    expect(result.perModelStats[1].model).toBe('gpt-4o-mini');
  });

  it('analyzeDetailed computes workload breakdown', async () => {
    const rows: HistoryRow[] = [
      // Simple: 200 avg output tokens (< 500)
      makeHistoryRow({ calls: 50, outputTokens: 10000 }),
      // Moderate: 1000 avg output tokens (500-2000)
      makeHistoryRow({ calls: 30, outputTokens: 30000, model: 'gpt-4o', provider: 'openai' }),
      // Complex: 5000 avg output tokens (>= 2000)
      makeHistoryRow({ calls: 20, outputTokens: 100000, model: 'o1', provider: 'openai' }),
    ];
    const optimizer = new CostOptimizer({
      logger: createNoopLogger(),
      usageTracker: createMockTracker(),
      usageStorage: createMockStorage(rows),
    });

    const result = await optimizer.analyzeDetailed();
    expect(result.workloadBreakdown.simple).toBe(50); // 50/100
    expect(result.workloadBreakdown.moderate).toBe(30); // 30/100
    expect(result.workloadBreakdown.complex).toBe(20); // 20/100
  });

  // ── getRoutingSuggestions() ──────────────────────────────────────────

  it('getRoutingSuggestions identifies premium model misuse', async () => {
    const rows: HistoryRow[] = [
      // Premium model with low output tokens — should suggest cheaper alternative
      makeHistoryRow({
        model: 'claude-opus-4-20250514',
        provider: 'anthropic',
        calls: 50,
        outputTokens: 5000, // avg 100 per call < 500 threshold
        inputTokens: 25000,
        costUsd: 10,
      }),
    ];
    const optimizer = new CostOptimizer({
      logger: createNoopLogger(),
      usageTracker: createMockTracker(),
      usageStorage: createMockStorage(rows),
    });

    const suggestions = await optimizer.getRoutingSuggestions();
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].currentModel).toBe('claude-opus-4-20250514');
    expect(suggestions[0].suggestedModel).toBe('claude-haiku-3-5-20241022');
    expect(suggestions[0].affectedCalls).toBe(50);
  });

  it('getRoutingSuggestions calculates savings correctly', async () => {
    const rows: HistoryRow[] = [
      makeHistoryRow({
        model: 'claude-opus-4-20250514',
        provider: 'anthropic',
        calls: 100,
        outputTokens: 10000, // avg 100
        inputTokens: 50000,
        costUsd: 20,
      }),
    ];
    const calculator = createMockCalculator();
    const optimizer = new CostOptimizer({
      logger: createNoopLogger(),
      usageTracker: createMockTracker(),
      usageStorage: createMockStorage(rows),
      costCalculator: calculator,
    });

    const suggestions = await optimizer.getRoutingSuggestions();
    expect(suggestions.length).toBe(1);
    expect(suggestions[0].savingsUsd).toBeGreaterThan(0);
    expect(suggestions[0].savingsPercent).toBeGreaterThan(0);
    // projected should be less than current
    expect(suggestions[0].projectedCostUsd).toBeLessThan(suggestions[0].currentCostUsd);
  });

  it('getRoutingSuggestions returns empty when all usage is optimal', async () => {
    const rows: HistoryRow[] = [
      // High output tokens — not a simple task, no suggestion needed
      makeHistoryRow({
        model: 'claude-opus-4-20250514',
        calls: 10,
        outputTokens: 20000, // avg 2000
        costUsd: 5,
      }),
    ];
    const optimizer = new CostOptimizer({
      logger: createNoopLogger(),
      usageTracker: createMockTracker(),
      usageStorage: createMockStorage(rows),
    });

    const suggestions = await optimizer.getRoutingSuggestions();
    expect(suggestions).toHaveLength(0);
  });

  it('getRoutingSuggestions returns empty for models without alternatives', async () => {
    const rows: HistoryRow[] = [
      makeHistoryRow({
        model: 'gemma2-9b-it',
        provider: 'groq',
        calls: 50,
        outputTokens: 5000,
        costUsd: 1,
      }),
    ];
    const optimizer = new CostOptimizer({
      logger: createNoopLogger(),
      usageTracker: createMockTracker(),
      usageStorage: createMockStorage(rows),
    });

    const suggestions = await optimizer.getRoutingSuggestions();
    expect(suggestions).toHaveLength(0);
  });

  // ── forecast() ──────────────────────────────────────────────────────

  it('forecast projects costs linearly', async () => {
    const rows: HistoryRow[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(2026, 2, 1 + i);
      rows.push(
        makeHistoryRow({
          date: d.toISOString().slice(0, 10),
          costUsd: 5,
          calls: 10,
        })
      );
    }
    const optimizer = new CostOptimizer({
      logger: createNoopLogger(),
      usageTracker: createMockTracker(),
      usageStorage: createMockStorage(rows),
    });

    const result = await optimizer.forecast(7);
    expect(result.dailyProjected).toBe(5);
    expect(result.weeklyProjected).toBe(35);
    expect(result.monthlyProjected).toBe(150);
  });

  it('forecast detects increasing trend', async () => {
    const rows: HistoryRow[] = [];
    // First half: low cost, second half: high cost
    for (let i = 0; i < 10; i++) {
      const d = new Date(2026, 2, 1 + i);
      rows.push(
        makeHistoryRow({
          date: d.toISOString().slice(0, 10),
          costUsd: i < 5 ? 2 : 10,
          calls: 5,
        })
      );
    }
    const optimizer = new CostOptimizer({
      logger: createNoopLogger(),
      usageTracker: createMockTracker(),
      usageStorage: createMockStorage(rows),
    });

    const result = await optimizer.forecast(10);
    expect(result.trend).toBe('increasing');
  });

  it('forecast detects decreasing trend', async () => {
    const rows: HistoryRow[] = [];
    for (let i = 0; i < 10; i++) {
      const d = new Date(2026, 2, 1 + i);
      rows.push(
        makeHistoryRow({
          date: d.toISOString().slice(0, 10),
          costUsd: i < 5 ? 10 : 2,
          calls: 5,
        })
      );
    }
    const optimizer = new CostOptimizer({
      logger: createNoopLogger(),
      usageTracker: createMockTracker(),
      usageStorage: createMockStorage(rows),
    });

    const result = await optimizer.forecast(10);
    expect(result.trend).toBe('decreasing');
  });

  it('forecast detects stable trend', async () => {
    const rows: HistoryRow[] = [];
    for (let i = 0; i < 10; i++) {
      const d = new Date(2026, 2, 1 + i);
      rows.push(
        makeHistoryRow({
          date: d.toISOString().slice(0, 10),
          costUsd: 5,
          calls: 10,
        })
      );
    }
    const optimizer = new CostOptimizer({
      logger: createNoopLogger(),
      usageTracker: createMockTracker(),
      usageStorage: createMockStorage(rows),
    });

    const result = await optimizer.forecast(10);
    expect(result.trend).toBe('stable');
  });

  it('forecast confidence decreases with less data', async () => {
    // 3 days of data — low confidence
    const rows3: HistoryRow[] = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(2026, 2, 1 + i);
      rows3.push(makeHistoryRow({ date: d.toISOString().slice(0, 10), costUsd: 5, calls: 5 }));
    }
    const opt3 = new CostOptimizer({
      logger: createNoopLogger(),
      usageTracker: createMockTracker(),
      usageStorage: createMockStorage(rows3),
    });
    const fc3 = await opt3.forecast(7);

    // 14 days of data — high confidence
    const rows14: HistoryRow[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(2026, 2, 1 + i);
      rows14.push(makeHistoryRow({ date: d.toISOString().slice(0, 10), costUsd: 5, calls: 5 }));
    }
    const opt14 = new CostOptimizer({
      logger: createNoopLogger(),
      usageTracker: createMockTracker(),
      usageStorage: createMockStorage(rows14),
    });
    const fc14 = await opt14.forecast(14);

    expect(fc3.confidence).toBeLessThan(fc14.confidence);
    expect(fc14.confidence).toBe(1);
  });

  // ── Edge cases ──────────────────────────────────────────────────────

  it('empty usage history returns zero costs', async () => {
    const optimizer = new CostOptimizer({
      logger: createNoopLogger(),
      usageTracker: createMockTracker(),
      usageStorage: createMockStorage([]),
    });

    const result = await optimizer.analyzeDetailed();
    expect(result.perModelStats).toHaveLength(0);
    expect(result.workloadBreakdown).toEqual({ simple: 0, moderate: 0, complex: 0 });
    expect(result.forecast.dailyProjected).toBe(0);
    expect(result.forecast.confidence).toBe(0);
    expect(result.routingSuggestions).toHaveLength(0);
    expect(result.potentialSavingsUsd).toBe(0);
  });

  it('personalityId filter is passed to storage', async () => {
    const storage = createMockStorage([]);
    const optimizer = new CostOptimizer({
      logger: createNoopLogger(),
      usageTracker: createMockTracker(),
      usageStorage: storage,
    });

    await optimizer.analyzeDetailed({ personalityId: 'test-personality' });
    expect(storage.queryHistory).toHaveBeenCalledWith(
      expect.objectContaining({ personalityId: 'test-personality' })
    );
  });

  it('days parameter limits query range', async () => {
    const storage = createMockStorage([]);
    const optimizer = new CostOptimizer({
      logger: createNoopLogger(),
      usageTracker: createMockTracker(),
      usageStorage: storage,
    });

    await optimizer.analyzeDetailed({ days: 7 });
    const call = storage.queryHistory.mock.calls[0][0];
    expect(call.from).toBeGreaterThan(0);
    // Should be roughly 7 days ago
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    expect(call.from).toBeGreaterThan(now - sevenDaysMs - 5000);
    expect(call.from).toBeLessThan(now - sevenDaysMs + 5000);
  });

  it('works without usageStorage (graceful fallback)', async () => {
    const optimizer = new CostOptimizer({
      logger: createNoopLogger(),
      usageTracker: createMockTracker({ costUsdMonth: 10 }),
    });

    const result = await optimizer.analyzeDetailed();
    expect(result.totalCostUsd).toBe(10);
    expect(result.perModelStats).toHaveLength(0);
    expect(result.forecast.dailyProjected).toBe(0);
  });

  it('routing suggestions sorted by savings descending', async () => {
    const rows: HistoryRow[] = [
      makeHistoryRow({
        model: 'gpt-4o',
        provider: 'openai',
        calls: 10,
        outputTokens: 1000,
        costUsd: 2,
      }),
      makeHistoryRow({
        model: 'claude-opus-4-20250514',
        provider: 'anthropic',
        calls: 50,
        outputTokens: 5000,
        costUsd: 20,
      }),
    ];
    const optimizer = new CostOptimizer({
      logger: createNoopLogger(),
      usageTracker: createMockTracker(),
      usageStorage: createMockStorage(rows),
    });

    const suggestions = await optimizer.getRoutingSuggestions();
    if (suggestions.length >= 2) {
      expect(suggestions[0].savingsUsd).toBeGreaterThanOrEqual(suggestions[1].savingsUsd);
    }
  });

  it('analyzeDetailed populates topModels from perModelStats', async () => {
    const rows: HistoryRow[] = [
      makeHistoryRow({ model: 'claude-opus-4-20250514', costUsd: 10 }),
      makeHistoryRow({ model: 'gpt-4o-mini', provider: 'openai', costUsd: 2 }),
    ];
    const optimizer = new CostOptimizer({
      logger: createNoopLogger(),
      usageTracker: createMockTracker(),
      usageStorage: createMockStorage(rows),
    });

    const result = await optimizer.analyzeDetailed();
    expect(result.topModels.length).toBe(2);
    expect(result.topModels[0].costUsd).toBe(10);
    expect(result.topModels[0].model).toContain('claude-opus');
  });
});
