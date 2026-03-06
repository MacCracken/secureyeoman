/**
 * Fault Injector Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FaultInjector, ChaosInjectedError } from './fault-injector.js';
import type { FaultRule } from '@secureyeoman/shared';

const mockLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as any;

function makeRule(overrides: Partial<FaultRule> = {}): FaultRule {
  return {
    id: 'rule-1',
    name: 'Test Rule',
    targetType: 'workflow_step',
    targetId: 'step-1',
    fault: { type: 'latency', minMs: 1, maxMs: 5, distribution: 'uniform' },
    probability: 1,
    enabled: true,
    ...overrides,
  };
}

describe('FaultInjector', () => {
  let injector: FaultInjector;

  beforeEach(() => {
    injector = new FaultInjector({ log: mockLog });
    vi.clearAllMocks();
  });

  it('injects latency fault', async () => {
    const rule = makeRule({
      fault: { type: 'latency', minMs: 1, maxMs: 10, distribution: 'uniform' },
    });

    const result = await injector.inject(rule);

    expect(result.ruleId).toBe('rule-1');
    expect(result.faultType).toBe('latency');
    expect(result.recovered).toBe(true);
    expect(result.impactObserved).toContain('latency');
  });

  it('injects error fault', async () => {
    const rule = makeRule({
      fault: { type: 'error', errorCode: 503, errorMessage: 'Service unavailable' },
    });

    const result = await injector.inject(rule);

    expect(result.faultType).toBe('error');
    expect(result.recovered).toBe(false);
    expect(result.error).toBe('Service unavailable');
  });

  it('injects timeout fault', async () => {
    const rule = makeRule({
      fault: { type: 'timeout', timeoutMs: 5 },
    });

    const result = await injector.inject(rule);

    expect(result.faultType).toBe('timeout');
    expect(result.recovered).toBe(true);
    expect(result.impactObserved).toContain('timeout');
  });

  it('injects dependency failure fault', async () => {
    const rule = makeRule({
      fault: { type: 'dependency_failure', dependencyName: 'redis', failureMode: 'unavailable', recoveryAfterMs: 0 },
    });

    const result = await injector.inject(rule);

    expect(result.faultType).toBe('dependency_failure');
    expect(result.impactObserved).toContain('redis');
    expect(result.impactObserved).toContain('unavailable');
  });

  it('injects data corruption fault', async () => {
    const rule = makeRule({
      fault: { type: 'data_corruption', corruptionType: 'scramble', targetField: 'payload' },
    });

    const result = await injector.inject(rule);

    expect(result.faultType).toBe('data_corruption');
    expect(result.impactObserved).toContain('scramble');
    expect(result.impactObserved).toContain('payload');
  });

  it('injects circuit breaker trip fault', async () => {
    const rule = makeRule({
      fault: { type: 'circuit_breaker_trip', breakerName: 'ai-provider', holdOpenMs: 100 },
    });

    const result = await injector.inject(rule);

    expect(result.faultType).toBe('circuit_breaker_trip');
    expect(result.impactObserved).toContain('ai-provider');
  });

  it('injects rate limit fault', async () => {
    const rule = makeRule({
      fault: { type: 'rate_limit', maxRequestsPerSec: 5, burstSize: 0 },
    });

    const result = await injector.inject(rule);

    expect(result.faultType).toBe('rate_limit');
    expect(result.impactObserved).toContain('5 req/s');
  });

  it('injects resource exhaustion fault', async () => {
    const rule = makeRule({
      fault: { type: 'resource_exhaustion', resource: 'memory', pressure: 0.9, durationMs: 5 },
    });

    const result = await injector.inject(rule);

    expect(result.faultType).toBe('resource_exhaustion');
    expect(result.impactObserved).toContain('memory');
    expect(result.impactObserved).toContain('90%');
  });

  it('skips injection when probability is 0', async () => {
    const rule = makeRule({ probability: 0 });

    const result = await injector.inject(rule);

    expect(result.impactObserved).toContain('Skipped');
    expect(result.recovered).toBe(true);
  });

  it('tracks active injection count', async () => {
    expect(injector.activeCount).toBe(0);
  });

  it('can abort all injections', () => {
    injector.abortAll();
    expect(injector.activeCount).toBe(0);
  });

  it('abort returns false for unknown rule', () => {
    expect(injector.abort('nonexistent')).toBe(false);
  });

  it('latency with normal distribution works', async () => {
    const rule = makeRule({
      fault: { type: 'latency', minMs: 1, maxMs: 10, distribution: 'normal' },
    });

    const result = await injector.inject(rule);
    expect(result.impactObserved).toContain('normal');
  });

  it('latency with exponential distribution works', async () => {
    const rule = makeRule({
      fault: { type: 'latency', minMs: 1, maxMs: 10, distribution: 'exponential' },
    });

    const result = await injector.inject(rule);
    expect(result.impactObserved).toContain('exponential');
  });
});

describe('ChaosInjectedError', () => {
  it('has statusCode and message', () => {
    const err = new ChaosInjectedError(503, 'test error');
    expect(err.statusCode).toBe(503);
    expect(err.message).toBe('test error');
    expect(err.name).toBe('ChaosInjectedError');
  });
});
