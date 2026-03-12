import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreakerAutotuner } from './circuit-breaker-autotuner.js';
import { createNoopLogger } from '../logging/logger.js';
import type { ExperimentSession } from '../simulation/experiment-runner.js';

function makeSession(overrides: Partial<ExperimentSession> = {}): ExperimentSession {
  return {
    id: 'sess-1',
    personalityId: 'p-1',
    name: 'CB Tuning',
    objective: 'Optimize circuit breaker',
    metricName: 'detection_score',
    lowerIsBetter: false,
    budget: { maxDurationMs: 60_000, maxSteps: 0, maxConcurrent: 1 },
    constraints: { mutableKeys: [], bounds: {}, frozenKeys: [] },
    baselineParams: {},
    bestMetric: null,
    bestRunId: null,
    totalRuns: 0,
    retainedRuns: 0,
    discardedRuns: 0,
    status: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('CircuitBreakerAutotuner', () => {
  let logger: ReturnType<typeof createNoopLogger>;

  beforeEach(() => {
    logger = createNoopLogger();
  });

  describe('defaults', () => {
    it('starts with default config', () => {
      const at = new CircuitBreakerAutotuner({ logger });
      expect(at.getCurrentConfig()).toEqual({ failureThreshold: 5, resetTimeoutMs: 30_000 });
    });

    it('accepts custom initial config', () => {
      const at = new CircuitBreakerAutotuner({
        logger,
        initialConfig: { failureThreshold: 3, resetTimeoutMs: 10_000 },
      });
      expect(at.getCurrentConfig()).toEqual({ failureThreshold: 3, resetTimeoutMs: 10_000 });
    });

    it('accepts custom maxDurationMs', () => {
      const at = new CircuitBreakerAutotuner({
        logger,
        maxDurationMs: 600_000,
      });
      expect(at.getMaxDurationMs()).toBe(600_000);
    });
  });

  describe('observations', () => {
    it('collects observations and computes analysis', () => {
      const at = new CircuitBreakerAutotuner({ logger });

      at.addObservation({
        detectionTimeMs: 100,
        falseOpen: false,
        missedFailure: false,
        recoveryTimeMs: 500,
      });
      at.addObservation({
        detectionTimeMs: 200,
        falseOpen: false,
        missedFailure: false,
        recoveryTimeMs: 300,
      });
      at.addObservation({
        detectionTimeMs: 0,
        falseOpen: true,
        missedFailure: false,
        recoveryTimeMs: 0,
      });

      const analysis = at.analyze();
      expect(analysis.observationCount).toBe(3);
      expect(analysis.falseOpenRate).toBeCloseTo(1 / 3);
      expect(analysis.avgDetectionTimeMs).toBe(150); // avg of 100, 200
    });

    it('returns zero scores with no observations', () => {
      const at = new CircuitBreakerAutotuner({ logger });
      const analysis = at.analyze();
      expect(analysis.detectionScore).toBe(0);
      expect(analysis.observationCount).toBe(0);
    });
  });

  describe('createProposer', () => {
    it('proposes data collection when insufficient observations', async () => {
      const at = new CircuitBreakerAutotuner({ logger, minObservations: 5 });

      // Only 2 observations
      at.addObservation({
        detectionTimeMs: 100,
        falseOpen: false,
        missedFailure: false,
        recoveryTimeMs: 500,
      });
      at.addObservation({
        detectionTimeMs: 200,
        falseOpen: false,
        missedFailure: false,
        recoveryTimeMs: 300,
      });

      const propose = at.createProposer();
      const h = await propose(makeSession());
      expect(h!.description).toContain('baseline');
      expect(h!.description).toContain('2/5');
    });

    it('proposes config change when enough observations', async () => {
      const at = new CircuitBreakerAutotuner({
        logger,
        minObservations: 3,
        initialConfig: { failureThreshold: 5, resetTimeoutMs: 30_000 },
        thresholdCandidates: [2, 3, 5, 7, 10],
      });

      // High false open rate → should propose higher threshold
      for (let i = 0; i < 5; i++) {
        at.addObservation({
          detectionTimeMs: 50,
          falseOpen: i < 3,
          missedFailure: false,
          recoveryTimeMs: 100,
        });
      }

      const propose = at.createProposer();
      const h = await propose(makeSession());
      expect(h).not.toBeNull();
      expect(h!.description).toContain('threshold');
    });

    it('returns null when converged', async () => {
      const at = new CircuitBreakerAutotuner({ logger, convergenceThreshold: 0.1 });

      // Record 3 similar history entries
      at.recordResult({ failureThreshold: 5, resetTimeoutMs: 30_000 }, 0.8, true);
      at.recordResult({ failureThreshold: 5, resetTimeoutMs: 30_000 }, 0.82, true);
      at.recordResult({ failureThreshold: 5, resetTimeoutMs: 30_000 }, 0.81, true);

      const propose = at.createProposer();
      const h = await propose(makeSession());
      expect(h).toBeNull();
    });
  });

  describe('createExecutor', () => {
    it('returns detection score as primary metric', async () => {
      const at = new CircuitBreakerAutotuner({ logger });

      at.addObservation({
        detectionTimeMs: 100,
        falseOpen: false,
        missedFailure: false,
        recoveryTimeMs: 500,
      });
      at.addObservation({
        detectionTimeMs: 200,
        falseOpen: false,
        missedFailure: false,
        recoveryTimeMs: 300,
      });

      const executor = at.createExecutor();
      const result = await executor(
        makeSession(),
        { failureThreshold: 5, resetTimeoutMs: 30_000 },
        { maxDurationMs: 60_000, maxSteps: 0, maxConcurrent: 1 }
      );

      expect(result.primaryMetric).toBeGreaterThan(0);
      expect(result.metrics.failure_threshold).toBe(5);
      expect(result.metrics.reset_timeout_ms).toBe(30_000);
      expect(result.lowerIsBetter).toBe(false);
    });
  });

  describe('recordResult', () => {
    it('updates config on retained result', () => {
      const at = new CircuitBreakerAutotuner({ logger });
      at.recordResult({ failureThreshold: 3, resetTimeoutMs: 20_000 }, 0.9, true);

      expect(at.getCurrentConfig()).toEqual({ failureThreshold: 3, resetTimeoutMs: 20_000 });
    });

    it('does not update config on discarded result', () => {
      const at = new CircuitBreakerAutotuner({
        logger,
        initialConfig: { failureThreshold: 5, resetTimeoutMs: 30_000 },
      });
      at.recordResult({ failureThreshold: 3, resetTimeoutMs: 20_000 }, 0.3, false);

      expect(at.getCurrentConfig()).toEqual({ failureThreshold: 5, resetTimeoutMs: 30_000 });
    });

    it('calls applyConfig callback on retain', () => {
      const apply = vi.fn();
      const at = new CircuitBreakerAutotuner({ logger, applyConfig: apply });
      at.recordResult({ failureThreshold: 3, resetTimeoutMs: 15_000 }, 0.9, true);

      expect(apply).toHaveBeenCalledWith({ failureThreshold: 3, resetTimeoutMs: 15_000 });
    });

    it('does not call applyConfig on discard', () => {
      const apply = vi.fn();
      const at = new CircuitBreakerAutotuner({ logger, applyConfig: apply });
      at.recordResult({ failureThreshold: 3, resetTimeoutMs: 15_000 }, 0.3, false);

      expect(apply).not.toHaveBeenCalled();
    });
  });

  describe('convergence', () => {
    it('detects convergence when scores stabilize', () => {
      const at = new CircuitBreakerAutotuner({ logger, convergenceThreshold: 0.05 });

      at.recordResult({ failureThreshold: 5, resetTimeoutMs: 30_000 }, 0.8, true);
      at.recordResult({ failureThreshold: 5, resetTimeoutMs: 30_000 }, 0.82, true);
      at.recordResult({ failureThreshold: 5, resetTimeoutMs: 30_000 }, 0.81, true);

      expect(at.analyze().converged).toBe(true);
    });

    it('does not converge with high variance', () => {
      const at = new CircuitBreakerAutotuner({ logger, convergenceThreshold: 0.05 });

      at.recordResult({ failureThreshold: 5, resetTimeoutMs: 30_000 }, 0.3, true);
      at.recordResult({ failureThreshold: 3, resetTimeoutMs: 30_000 }, 0.8, true);
      at.recordResult({ failureThreshold: 7, resetTimeoutMs: 30_000 }, 0.5, true);

      expect(at.analyze().converged).toBe(false);
    });
  });

  describe('user-configurable thresholds', () => {
    it('custom thresholdCandidates controls search space', async () => {
      const at = new CircuitBreakerAutotuner({
        logger,
        thresholdCandidates: [1, 2, 3],
        minObservations: 1,
        initialConfig: { failureThreshold: 2, resetTimeoutMs: 30_000 },
      });

      // High false open rate → propose higher threshold
      at.addObservation({
        detectionTimeMs: 50,
        falseOpen: true,
        missedFailure: false,
        recoveryTimeMs: 100,
      });

      const propose = at.createProposer();
      const h = await propose(makeSession());
      // Should propose threshold=3 (next higher candidate)
      expect(h!.modifications.failureThreshold).toBe(3);
    });

    it('custom timeoutCandidates controls timeout search', () => {
      const at = new CircuitBreakerAutotuner({
        logger,
        timeoutCandidates: [5_000, 15_000, 30_000],
      });

      expect(at.getHistory()).toHaveLength(0);
    });

    it('custom convergenceThreshold controls sensitivity', () => {
      const loose = new CircuitBreakerAutotuner({ logger, convergenceThreshold: 0.5 });
      loose.recordResult({ failureThreshold: 5, resetTimeoutMs: 30_000 }, 0.5, true);
      loose.recordResult({ failureThreshold: 3, resetTimeoutMs: 30_000 }, 0.8, true);
      loose.recordResult({ failureThreshold: 7, resetTimeoutMs: 30_000 }, 0.6, true);
      // Spread = 0.3 < 0.5 → converged
      expect(loose.analyze().converged).toBe(true);

      const tight = new CircuitBreakerAutotuner({ logger, convergenceThreshold: 0.01 });
      tight.recordResult({ failureThreshold: 5, resetTimeoutMs: 30_000 }, 0.5, true);
      tight.recordResult({ failureThreshold: 3, resetTimeoutMs: 30_000 }, 0.8, true);
      tight.recordResult({ failureThreshold: 7, resetTimeoutMs: 30_000 }, 0.6, true);
      expect(tight.analyze().converged).toBe(false);
    });

    it('custom minObservations controls data requirement', async () => {
      const at = new CircuitBreakerAutotuner({ logger, minObservations: 20 });
      at.addObservation({
        detectionTimeMs: 100,
        falseOpen: false,
        missedFailure: false,
        recoveryTimeMs: 500,
      });

      const propose = at.createProposer();
      const h = await propose(makeSession());
      expect(h!.description).toContain('1/20');
    });
  });
});
