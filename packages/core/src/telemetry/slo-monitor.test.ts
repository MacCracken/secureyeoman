import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SloMonitor, type SloDefinition } from './slo-monitor.js';

const mockLogger = {
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn().mockReturnThis(),
  level: 'info' as const,
};

const mockAlertManager = {
  evaluate: vi.fn().mockResolvedValue(undefined),
};

function makeSlo(overrides: Partial<SloDefinition> = {}): SloDefinition {
  return {
    id: 'slo-1',
    name: 'Test SLO',
    metricType: 'tool_success_rate',
    target: 95,
    windowMs: 3_600_000,
    burnRateThreshold: 2.0,
    ...overrides,
  };
}

describe('SloMonitor', () => {
  let monitor: SloMonitor;

  beforeEach(() => {
    vi.clearAllMocks();
    monitor = new SloMonitor(mockLogger, () => mockAlertManager as any);
  });

  it('should add and list definitions', () => {
    monitor.addDefinition(makeSlo());
    expect(monitor.getDefinitions()).toHaveLength(1);
  });

  it('should remove definitions', () => {
    monitor.addDefinition(makeSlo());
    expect(monitor.removeDefinition('slo-1')).toBe(true);
    expect(monitor.getDefinitions()).toHaveLength(0);
  });

  it('should return compliant status with no observations', () => {
    monitor.addDefinition(makeSlo());
    const [status] = monitor.evaluate();
    expect(status.compliant).toBe(true);
    expect(status.observationCount).toBe(0);
    expect(status.errorBudgetRemaining).toBe(1.0);
  });

  it('should track good observations for rate-based SLOs', () => {
    monitor.addDefinition(makeSlo({ target: 90 }));

    // 10 good observations
    for (let i = 0; i < 10; i++) monitor.record('tool_success_rate', 100);

    const [status] = monitor.evaluate();
    expect(status.compliant).toBe(true);
    expect(status.currentValue).toBe(100);
    expect(status.observationCount).toBe(10);
  });

  it('should detect non-compliance when too many bad observations', () => {
    monitor.addDefinition(makeSlo({ target: 95 }));

    // 100 observations, only 90 good
    for (let i = 0; i < 90; i++) monitor.record('tool_success_rate', 100);
    for (let i = 0; i < 10; i++) monitor.record('tool_success_rate', 50);

    const [status] = monitor.evaluate();
    expect(status.compliant).toBe(false);
  });

  it('should track latency SLOs (lower is better)', () => {
    monitor.addDefinition(
      makeSlo({
        id: 'latency-slo',
        metricType: 'response_latency_p95',
        target: 200, // max 200ms
      })
    );

    // All requests under 200ms
    for (let i = 0; i < 20; i++) monitor.record('response_latency_p95', 100 + i * 5);

    const [status] = monitor.evaluate();
    expect(status.compliant).toBe(true);
    expect(status.currentValue).toBeLessThanOrEqual(200);
  });

  it('should detect latency SLO violations', () => {
    monitor.addDefinition(
      makeSlo({
        id: 'latency-slo',
        metricType: 'response_latency_p95',
        target: 100,
      })
    );

    // Many slow requests
    for (let i = 0; i < 20; i++) monitor.record('response_latency_p95', 500);

    const [status] = monitor.evaluate();
    expect(status.compliant).toBe(false);
  });

  it('should fire burn rate alert when threshold exceeded', () => {
    monitor.addDefinition(makeSlo({ target: 95, burnRateThreshold: 1.0 }));

    // All bad observations — extreme burn rate
    for (let i = 0; i < 50; i++) monitor.record('tool_success_rate', 0);

    const [status] = monitor.evaluate();
    expect(status.alerting).toBe(true);
    expect(mockAlertManager.evaluate).toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('should not fire alert when within budget', () => {
    monitor.addDefinition(makeSlo({ target: 95, burnRateThreshold: 10.0 }));

    for (let i = 0; i < 100; i++) monitor.record('tool_success_rate', 100);

    const [status] = monitor.evaluate();
    expect(status.alerting).toBe(false);
    expect(mockAlertManager.evaluate).not.toHaveBeenCalled();
  });

  it('should only record to matching metric types', () => {
    monitor.addDefinition(makeSlo({ metricType: 'tool_success_rate' }));

    monitor.record('response_latency_p95', 100); // should not match
    monitor.record('tool_success_rate', 95); // should match

    const [status] = monitor.evaluate();
    expect(status.observationCount).toBe(1);
  });

  it('should handle multiple SLO definitions for same metric type', () => {
    monitor.addDefinition(makeSlo({ id: 'slo-a', target: 90 }));
    monitor.addDefinition(makeSlo({ id: 'slo-b', target: 99 }));

    for (let i = 0; i < 20; i++) monitor.record('tool_success_rate', 95);

    const results = monitor.evaluate();
    expect(results).toHaveLength(2);
    const a = results.find((r) => r.id === 'slo-a')!;
    const b = results.find((r) => r.id === 'slo-b')!;
    expect(a.compliant).toBe(true); // 95 >= 90
    expect(b.compliant).toBe(false); // 95 < 99
  });

  it('should handle alertManager being null', () => {
    const monitor2 = new SloMonitor(mockLogger, () => null);
    monitor2.addDefinition(makeSlo({ target: 95, burnRateThreshold: 0.01 }));
    for (let i = 0; i < 50; i++) monitor2.record('tool_success_rate', 0);

    // Should not throw even when alertManager is null
    const results = monitor2.evaluate();
    expect(results[0].alerting).toBe(true);
  });
});
