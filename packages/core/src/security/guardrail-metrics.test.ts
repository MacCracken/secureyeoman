/**
 * Tests for GuardrailMetricsCollector — Phase 143
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GuardrailMetricsCollector } from './guardrail-metrics.js';
import type { FilterExecutionMetric } from '@secureyeoman/shared';

function makeMetric(overrides: Partial<FilterExecutionMetric> = {}): FilterExecutionMetric {
  return {
    filterId: 'test:f1',
    filterName: 'Test Filter',
    direction: 'output',
    durationMs: 5,
    findingCount: 0,
    action: 'passed',
    ...overrides,
  };
}

describe('GuardrailMetricsCollector', () => {
  let collector: GuardrailMetricsCollector;

  beforeEach(() => {
    collector = new GuardrailMetricsCollector();
  });

  it('records and returns metrics', () => {
    collector.record(makeMetric({ durationMs: 10 }));
    collector.record(makeMetric({ durationMs: 20 }));
    collector.record(makeMetric({ action: 'blocked', findingCount: 2, durationMs: 30 }));

    const snapshot = collector.getSnapshot();
    expect(snapshot.filters).toHaveLength(1);

    const f = snapshot.filters[0]!;
    expect(f.filterId).toBe('test:f1');
    expect(f.totalExecutions).toBe(3);
    expect(f.totalBlocks).toBe(1);
    expect(f.totalFindings).toBe(2);
    expect(f.avgDurationMs).toBe(20);
  });

  it('tracks multiple filters separately', () => {
    collector.record(makeMetric({ filterId: 'a', filterName: 'A' }));
    collector.record(makeMetric({ filterId: 'b', filterName: 'B' }));

    const snapshot = collector.getSnapshot();
    expect(snapshot.filters).toHaveLength(2);
  });

  it('calculates p95 duration', () => {
    for (let i = 0; i < 100; i++) {
      collector.record(makeMetric({ durationMs: i + 1 }));
    }
    const snapshot = collector.getSnapshot();
    const f = snapshot.filters[0]!;
    expect(f.p95DurationMs).toBeGreaterThanOrEqual(95);
    expect(f.p95DurationMs).toBeLessThanOrEqual(96);
  });

  it('tracks error count', () => {
    collector.record(makeMetric({ action: 'error' }));
    collector.record(makeMetric({ action: 'error' }));
    collector.record(makeMetric({ action: 'passed' }));

    const snapshot = collector.getSnapshot();
    expect(snapshot.filters[0]!.errorCount).toBe(2);
  });

  it('reset clears all stats', () => {
    collector.record(makeMetric());
    collector.reset();
    const snapshot = collector.getSnapshot();
    expect(snapshot.filters).toHaveLength(0);
  });

  it('getActivationRate returns 0 for unknown filter', () => {
    expect(collector.getActivationRate('nope')).toBe(0);
  });

  it('ring buffer limits duration samples', () => {
    const small = new GuardrailMetricsCollector(5);
    for (let i = 0; i < 10; i++) {
      small.record(makeMetric({ durationMs: i * 10 }));
    }
    const snapshot = small.getSnapshot();
    // avg should be based on last 5 samples (50,60,70,80,90)
    expect(snapshot.filters[0]!.avgDurationMs).toBe(70);
  });

  it('period reflects collector lifetime', () => {
    const snapshot = collector.getSnapshot();
    expect(snapshot.period.from).toBeLessThanOrEqual(snapshot.period.to);
    expect(snapshot.period.to).toBeGreaterThan(0);
  });
});
