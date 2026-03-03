import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderHealthTracker } from './provider-health.js';

describe('ProviderHealthTracker', () => {
  let tracker: ProviderHealthTracker;

  beforeEach(() => {
    tracker = new ProviderHealthTracker(10);
  });

  describe('recordRequest + getHealth', () => {
    it('returns healthy defaults for unknown provider', () => {
      const health = tracker.getHealth('unknown');
      expect(health.status).toBe('healthy');
      expect(health.errorRate).toBe(0);
      expect(health.p95LatencyMs).toBe(0);
      expect(health.consecutiveFailures).toBe(0);
      expect(health.totalRequests).toBe(0);
    });

    it('tracks successful requests', () => {
      tracker.recordRequest('openai', true, 100);
      tracker.recordRequest('openai', true, 150);
      const health = tracker.getHealth('openai');
      expect(health.totalRequests).toBe(2);
      expect(health.errorRate).toBe(0);
      expect(health.status).toBe('healthy');
    });

    it('calculates error rate correctly', () => {
      // 2 out of 10 = 20% → degraded
      for (let i = 0; i < 8; i++) tracker.recordRequest('openai', true, 100);
      tracker.recordRequest('openai', false, 200);
      tracker.recordRequest('openai', false, 300);
      const health = tracker.getHealth('openai');
      expect(health.errorRate).toBe(0.2);
    });

    it('marks healthy when error rate < 5%', () => {
      for (let i = 0; i < 10; i++) tracker.recordRequest('openai', true, 100);
      expect(tracker.getHealth('openai').status).toBe('healthy');
    });

    it('marks degraded when error rate 5-20%', () => {
      for (let i = 0; i < 9; i++) tracker.recordRequest('openai', true, 100);
      tracker.recordRequest('openai', false, 200);
      // 1/10 = 10% → degraded
      expect(tracker.getHealth('openai').status).toBe('degraded');
    });

    it('marks unhealthy when error rate > 20%', () => {
      for (let i = 0; i < 7; i++) tracker.recordRequest('openai', true, 100);
      for (let i = 0; i < 3; i++) tracker.recordRequest('openai', false, 200);
      // 3/10 = 30% → unhealthy
      expect(tracker.getHealth('openai').status).toBe('unhealthy');
    });

    it('tracks consecutive failures', () => {
      tracker.recordRequest('openai', true, 100);
      tracker.recordRequest('openai', false, 200);
      tracker.recordRequest('openai', false, 300);
      expect(tracker.getHealth('openai').consecutiveFailures).toBe(2);
    });

    it('resets consecutive failures on success', () => {
      tracker.recordRequest('openai', false, 200);
      tracker.recordRequest('openai', false, 300);
      tracker.recordRequest('openai', true, 100);
      expect(tracker.getHealth('openai').consecutiveFailures).toBe(0);
    });

    it('computes p95 latency correctly', () => {
      // 10 entries: latencies 10, 20, 30, ..., 100
      for (let i = 1; i <= 10; i++) tracker.recordRequest('openai', true, i * 10);
      const health = tracker.getHealth('openai');
      // p95 index = ceil(10 * 0.95) - 1 = 9 → sorted[9] = 100
      expect(health.p95LatencyMs).toBe(100);
    });
  });

  describe('ring buffer wrap', () => {
    it('overwrites oldest entries when buffer is full', () => {
      // Fill buffer with 10 successes
      for (let i = 0; i < 10; i++) tracker.recordRequest('openai', true, 100);
      expect(tracker.getHealth('openai').errorRate).toBe(0);

      // Add 5 failures — they overwrite the oldest 5 successes
      for (let i = 0; i < 5; i++) tracker.recordRequest('openai', false, 200);
      // Buffer: 5 failures + 5 successes = 50% error rate
      const health = tracker.getHealth('openai');
      expect(health.totalRequests).toBe(10); // buffer is capped
      expect(health.errorRate).toBe(0.5);
    });
  });

  describe('getProviderRanking', () => {
    it('sorts healthy providers first', () => {
      // openai = healthy (0% errors)
      for (let i = 0; i < 10; i++) tracker.recordRequest('openai', true, 100);
      // anthropic = unhealthy (50% errors)
      for (let i = 0; i < 5; i++) tracker.recordRequest('anthropic', true, 100);
      for (let i = 0; i < 5; i++) tracker.recordRequest('anthropic', false, 200);
      // gemini = degraded (10% errors)
      for (let i = 0; i < 9; i++) tracker.recordRequest('gemini', true, 100);
      tracker.recordRequest('gemini', false, 200);

      const ranking = tracker.getProviderRanking();
      expect(ranking[0]).toBe('openai');
      expect(ranking[1]).toBe('gemini');
      expect(ranking[2]).toBe('anthropic');
    });

    it('sorts by error rate within same status', () => {
      // Both degraded but different error rates
      // providerA: 1/10 = 10%
      for (let i = 0; i < 9; i++) tracker.recordRequest('providerA', true, 100);
      tracker.recordRequest('providerA', false, 200);
      // providerB: 2/10 = 20% (still < 20% threshold since it's not strictly less)
      // Actually 2/10 = 0.2 which is >= DEGRADED_THRESHOLD (0.2) → unhealthy
      // Let's use 15% instead: need a tracker with 20 buffer size
      const t2 = new ProviderHealthTracker(20);
      for (let i = 0; i < 17; i++) t2.recordRequest('providerA', true, 100);
      for (let i = 0; i < 3; i++) t2.recordRequest('providerA', false, 200);
      // 3/20 = 15% → degraded
      for (let i = 0; i < 18; i++) t2.recordRequest('providerB', true, 100);
      for (let i = 0; i < 2; i++) t2.recordRequest('providerB', false, 200);
      // 2/20 = 10% → degraded

      const ranking = t2.getProviderRanking();
      expect(ranking[0]).toBe('providerB'); // lower error rate
      expect(ranking[1]).toBe('providerA');
    });
  });

  describe('getAllHealth', () => {
    it('returns health for all tracked providers', () => {
      tracker.recordRequest('openai', true, 100);
      tracker.recordRequest('anthropic', true, 150);
      tracker.recordRequest('gemini', false, 200);

      const all = tracker.getAllHealth();
      expect(Object.keys(all)).toHaveLength(3);
      expect(all['openai']).toBeDefined();
      expect(all['anthropic']).toBeDefined();
      expect(all['gemini']).toBeDefined();
      expect(all['openai']!.totalRequests).toBe(1);
    });

    it('returns empty object when no requests recorded', () => {
      expect(tracker.getAllHealth()).toEqual({});
    });
  });

  describe('single entry edge cases', () => {
    it('handles single success', () => {
      tracker.recordRequest('openai', true, 42);
      const health = tracker.getHealth('openai');
      expect(health.totalRequests).toBe(1);
      expect(health.errorRate).toBe(0);
      expect(health.p95LatencyMs).toBe(42);
    });

    it('handles single failure', () => {
      tracker.recordRequest('openai', false, 500);
      const health = tracker.getHealth('openai');
      expect(health.totalRequests).toBe(1);
      expect(health.errorRate).toBe(1);
      expect(health.status).toBe('unhealthy');
      expect(health.consecutiveFailures).toBe(1);
    });
  });
});
