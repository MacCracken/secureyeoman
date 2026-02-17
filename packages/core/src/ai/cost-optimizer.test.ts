import { describe, it, expect } from 'vitest';
import { CostOptimizer } from './cost-optimizer.js';
import { createNoopLogger } from '../logging/logger.js';

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
      ...overrides,
    }),
  } as any;
}

describe('CostOptimizer', () => {
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
});
