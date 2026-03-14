import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RateLimiterLike, RateLimitResult, RateLimitRule } from './rate-limiter.js';
import type { AdaptiveRateLimitConfig } from '@secureyeoman/shared';

// ─── Mocks ─────────────────────────────────────────────────────────

/**
 * CPU mock: tracks cumulative times. Each call to cpus() advances the
 * accumulator by `increment` ticks, distributed according to `idleRatio`.
 * Set `cpuMock.idleRatio` to control utilisation (0 = 100% busy, 1 = 100% idle).
 */
const cpuMock = {
  idleRatio: 0.8,
  increment: 1000,
  _idle: 0,
  _user: 0,
  _sys: 0,
  reset() {
    this._idle = 0;
    this._user = 0;
    this._sys = 0;
    this.idleRatio = 0.8;
  },
};

vi.mock('node:os', () => ({
  cpus: () => {
    // Advance cumulative counters
    const busy = Math.round(cpuMock.increment * (1 - cpuMock.idleRatio));
    const idle = cpuMock.increment - busy;
    cpuMock._idle += idle;
    cpuMock._user += Math.round(busy * 0.7);
    cpuMock._sys += busy - Math.round(busy * 0.7);
    return [
      { times: { idle: cpuMock._idle, user: cpuMock._user, nice: 0, sys: cpuMock._sys, irq: 0 } },
      { times: { idle: cpuMock._idle, user: cpuMock._user, nice: 0, sys: cpuMock._sys, irq: 0 } },
    ];
  },
}));

// Mock node:perf_hooks — provide controllable event loop histogram
const mockHistogram = {
  mean: 5_000_000, // 5ms in nanoseconds
  enable: vi.fn(),
  disable: vi.fn(),
  reset: vi.fn(),
};
vi.mock('node:perf_hooks', () => ({
  monitorEventLoopDelay: () => mockHistogram,
}));

// Silence logger
vi.mock('../logging/logger.js', () => {
  const noop = () => {};
  const noopLogger = {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    child: () => noopLogger,
  };
  return {
    getLogger: () => noopLogger,
    createNoopLogger: () => noopLogger,
  };
});

// ─── Helpers ───────────────────────────────────────────────────────

function makeConfig(overrides: Partial<AdaptiveRateLimitConfig> = {}): AdaptiveRateLimitConfig {
  return {
    enabled: true,
    sampleIntervalMs: 100_000, // large — we drive sampling manually
    cpuWeight: 0.4,
    memoryWeight: 0.3,
    eventLoopWeight: 0.3,
    elevatedThreshold: 0.4,
    criticalThreshold: 0.7,
    elevatedMultiplier: 0.7,
    criticalMultiplier: 0.4,
    ...overrides,
  };
}

/** Minimal mock inner rate limiter. */
function makeMockInner(): RateLimiterLike & {
  rules: Map<string, RateLimitRule>;
  lastCheck: { ruleName: string; key: string } | null;
} {
  const rules = new Map<string, RateLimitRule>();
  return {
    rules,
    lastCheck: null,
    addRule(rule: RateLimitRule) {
      rules.set(rule.name, rule);
    },
    removeRule(name: string) {
      return rules.delete(name);
    },
    check(ruleName: string, key: string): RateLimitResult {
      (this as any).lastCheck = { ruleName, key };
      return { allowed: true, remaining: 50, resetAt: Date.now() + 60_000 };
    },
    stop() {},
    getStats() {
      return { totalHits: 10, totalChecks: 100 };
    },
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('AdaptiveRateLimiter', () => {
  let AdaptiveRateLimiter: typeof import('./adaptive-rate-limiter.js').AdaptiveRateLimiter;

  beforeEach(async () => {
    vi.useFakeTimers();
    cpuMock.reset();
    mockHistogram.mean = 5_000_000;
    // Re-import to get fresh module with mocks applied
    const mod = await import('./adaptive-rate-limiter.js');
    AdaptiveRateLimiter = mod.AdaptiveRateLimiter;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('delegates addRule to inner with current multiplier', () => {
    const inner = makeMockInner();
    const limiter = new AdaptiveRateLimiter(inner, makeConfig());
    const rule: RateLimitRule = {
      name: 'test',
      windowMs: 60_000,
      maxRequests: 100,
      keyType: 'ip',
      onExceed: 'reject',
    };

    limiter.addRule(rule);

    // At normal pressure, multiplier is 1 → maxRequests unchanged
    expect(inner.rules.get('test')?.maxRequests).toBe(100);

    limiter.stop();
  });

  it('delegates removeRule to inner and removes original tracking', () => {
    const inner = makeMockInner();
    const limiter = new AdaptiveRateLimiter(inner, makeConfig());

    limiter.addRule({
      name: 'test',
      windowMs: 60_000,
      maxRequests: 100,
      keyType: 'ip',
      onExceed: 'reject',
    });
    expect(inner.rules.has('test')).toBe(true);

    const removed = limiter.removeRule('test');
    expect(removed).toBe(true);
    expect(inner.rules.has('test')).toBe(false);

    limiter.stop();
  });

  it('delegates check to inner', () => {
    const inner = makeMockInner();
    const limiter = new AdaptiveRateLimiter(inner, makeConfig());

    const result = limiter.check('someRule', '127.0.0.1');
    expect(result).toHaveProperty('allowed', true);
    expect(inner.lastCheck).toEqual({ ruleName: 'someRule', key: '127.0.0.1' });

    limiter.stop();
  });

  it('delegates getStats to inner', () => {
    const inner = makeMockInner();
    const limiter = new AdaptiveRateLimiter(inner, makeConfig());

    const stats = limiter.getStats();
    expect(stats).toEqual({ totalHits: 10, totalChecks: 100 });

    limiter.stop();
  });

  it('getPressure returns current state', () => {
    const inner = makeMockInner();
    const limiter = new AdaptiveRateLimiter(inner, makeConfig());

    const pressure = limiter.getPressure();
    expect(pressure).toHaveProperty('cpu');
    expect(pressure).toHaveProperty('memory');
    expect(pressure).toHaveProperty('eventLoop');
    expect(pressure).toHaveProperty('composite');
    expect(pressure).toHaveProperty('multiplier', 1);
    expect(pressure).toHaveProperty('level', 'normal');

    limiter.stop();
  });

  it('computes pressure score from weighted metrics', () => {
    const inner = makeMockInner();
    const config = makeConfig({
      cpuWeight: 1,
      memoryWeight: 0,
      eventLoopWeight: 0,
      sampleIntervalMs: 1000,
    });
    const limiter = new AdaptiveRateLimiter(inner, config);

    // Set high CPU utilisation (0% idle)
    cpuMock.idleRatio = 0;

    // Advance timer to trigger sample
    vi.advanceTimersByTime(1000);

    const pressure = limiter.getPressure();
    // With alpha=0.3 and first real sample, smoothed should be > 0
    expect(pressure.composite).toBeGreaterThan(0);

    limiter.stop();
  });

  it('applies elevated multiplier when pressure exceeds elevated threshold', () => {
    const inner = makeMockInner();
    const config = makeConfig({
      sampleIntervalMs: 100,
      cpuWeight: 1,
      memoryWeight: 0,
      eventLoopWeight: 0,
      elevatedThreshold: 0.2,
      criticalThreshold: 0.9,
      elevatedMultiplier: 0.7,
    });
    const limiter = new AdaptiveRateLimiter(inner, config);

    limiter.addRule({
      name: 'api',
      windowMs: 60_000,
      maxRequests: 100,
      keyType: 'ip',
      onExceed: 'reject',
    });

    // Max out CPU (0% idle)
    cpuMock.idleRatio = 0;

    // Run enough samples to push EMA above elevated threshold
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(100);
    }

    const pressure = limiter.getPressure();
    expect(pressure.level).not.toBe('normal');

    // Rule should be adjusted — maxRequests < 100
    const apiRule = inner.rules.get('api');
    expect(apiRule).toBeDefined();
    expect(apiRule!.maxRequests).toBeLessThan(100);

    limiter.stop();
  });

  it('applies critical multiplier when pressure exceeds critical threshold', () => {
    const inner = makeMockInner();
    const config = makeConfig({
      sampleIntervalMs: 100,
      cpuWeight: 1,
      memoryWeight: 0,
      eventLoopWeight: 0,
      elevatedThreshold: 0.1,
      criticalThreshold: 0.3,
      criticalMultiplier: 0.4,
    });
    const limiter = new AdaptiveRateLimiter(inner, config);

    limiter.addRule({
      name: 'api',
      windowMs: 60_000,
      maxRequests: 100,
      keyType: 'ip',
      onExceed: 'reject',
    });

    // Max out CPU (0% idle)
    cpuMock.idleRatio = 0;

    // Run enough samples to push EMA above critical
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(100);
    }

    const pressure = limiter.getPressure();
    expect(pressure.level).toBe('critical');
    expect(pressure.multiplier).toBe(0.4);

    // maxRequests should be ~40
    const apiRule = inner.rules.get('api');
    expect(apiRule!.maxRequests).toBe(40);

    limiter.stop();
  });

  it('stop() clears interval, restores original rules, and stops inner', () => {
    const inner = makeMockInner();
    const config = makeConfig({
      sampleIntervalMs: 100,
      cpuWeight: 1,
      memoryWeight: 0,
      eventLoopWeight: 0,
      criticalThreshold: 0.1,
    });
    const limiter = new AdaptiveRateLimiter(inner, config);

    limiter.addRule({
      name: 'api',
      windowMs: 60_000,
      maxRequests: 100,
      keyType: 'ip',
      onExceed: 'reject',
    });

    // Force critical
    cpuMock.idleRatio = 0;

    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(100);
    }

    // Confirm rule was adjusted
    expect(inner.rules.get('api')!.maxRequests).toBeLessThan(100);

    // Stop should restore
    limiter.stop();
    expect(inner.rules.get('api')!.maxRequests).toBe(100);
  });

  it('adjusts rules when pressure changes back to normal', () => {
    const inner = makeMockInner();
    const config = makeConfig({
      sampleIntervalMs: 100,
      cpuWeight: 1,
      memoryWeight: 0,
      eventLoopWeight: 0,
      elevatedThreshold: 0.2,
      criticalThreshold: 0.8,
      elevatedMultiplier: 0.7,
    });
    const limiter = new AdaptiveRateLimiter(inner, config);

    limiter.addRule({
      name: 'api',
      windowMs: 60_000,
      maxRequests: 100,
      keyType: 'ip',
      onExceed: 'reject',
    });

    // Drive pressure up
    cpuMock.idleRatio = 0;

    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(100);
    }

    expect(inner.rules.get('api')!.maxRequests).toBeLessThan(100);

    // Drive pressure back down (95% idle)
    cpuMock.idleRatio = 0.95;

    for (let i = 0; i < 60; i++) {
      vi.advanceTimersByTime(100);
    }

    // Should recover to normal
    expect(inner.rules.get('api')!.maxRequests).toBe(100);

    limiter.stop();
  });

  it('ensures maxRequests never drops below 1', () => {
    const inner = makeMockInner();
    const config = makeConfig({
      sampleIntervalMs: 100,
      cpuWeight: 1,
      memoryWeight: 0,
      eventLoopWeight: 0,
      criticalThreshold: 0.1,
      criticalMultiplier: 0.1,
    });
    const limiter = new AdaptiveRateLimiter(inner, config);

    // Rule with very low maxRequests
    limiter.addRule({
      name: 'tiny',
      windowMs: 60_000,
      maxRequests: 2,
      keyType: 'ip',
      onExceed: 'reject',
    });

    // Force critical
    cpuMock.idleRatio = 0;

    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(100);
    }

    // 2 * 0.1 = 0.2 → rounds to 0, but should be clamped to 1
    expect(inner.rules.get('tiny')!.maxRequests).toBeGreaterThanOrEqual(1);

    limiter.stop();
  });
});
