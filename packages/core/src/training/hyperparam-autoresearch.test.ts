import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HyperparamAutoresearch } from './hyperparam-autoresearch.js';
import { createNoopLogger } from '../logging/logger.js';
import type { ExperimentSession } from '../simulation/experiment-runner.js';

function makeSession(overrides: Partial<ExperimentSession> = {}): ExperimentSession {
  return {
    id: 'sess-1',
    personalityId: 'p-1',
    name: 'HP Search',
    objective: 'Minimize loss',
    metricName: 'eval_loss',
    lowerIsBetter: true,
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

describe('HyperparamAutoresearch', () => {
  let logger: ReturnType<typeof createNoopLogger>;

  beforeEach(() => {
    logger = createNoopLogger();
  });

  describe('constructor defaults', () => {
    it('accepts all configurable options', () => {
      const ar = new HyperparamAutoresearch({
        logger,
        paramSpace: { lr: [0.001, 0.01, 0.1] },
        baseConfig: { model: 'llama3' },
        trialsPerBatch: 3,
        convergenceThreshold: 0.005,
        convergenceWindow: 5,
        narrowingFactor: 0.4,
        lowerIsBetter: false,
      });

      expect(ar.getParamSpace().lr).toEqual([0.001, 0.01, 0.1]);
      expect(ar.getHistory()).toHaveLength(0);
    });
  });

  describe('createProposer', () => {
    it('proposes experiments from param space', async () => {
      const ar = new HyperparamAutoresearch({
        logger,
        paramSpace: { lr: [0.001, 0.01], epochs: [3, 5] },
        baseConfig: {},
      });

      const propose = ar.createProposer();
      const hypothesis = await propose(makeSession());

      expect(hypothesis).not.toBeNull();
      expect(hypothesis!.description).toContain('Trial 1');
      expect(hypothesis!.modifications).toHaveProperty('lr');
      expect(hypothesis!.modifications).toHaveProperty('epochs');
    });

    it('returns null when converged', async () => {
      const ar = new HyperparamAutoresearch({
        logger,
        paramSpace: { lr: [0.001] },
        baseConfig: {},
        convergenceWindow: 3,
        convergenceThreshold: 0.01,
      });

      // Record 3 nearly identical retained results
      ar.recordResult({ lr: 0.001 }, 0.5, true);
      ar.recordResult({ lr: 0.001 }, 0.501, true);
      ar.recordResult({ lr: 0.001 }, 0.502, true);

      const propose = ar.createProposer();
      const hypothesis = await propose(makeSession());
      expect(hypothesis).toBeNull();
    });
  });

  describe('createExecutor', () => {
    it('runs trial and returns result', async () => {
      const runTrial = vi.fn().mockResolvedValue({ eval_loss: 0.42, accuracy: 0.88 });

      const ar = new HyperparamAutoresearch({
        logger,
        paramSpace: { lr: [0.001] },
        baseConfig: { model: 'test' },
        runTrial,
      });

      const executor = ar.createExecutor();
      const result = await executor(
        makeSession(),
        { lr: 0.001 },
        { maxDurationMs: 60_000, maxSteps: 0, maxConcurrent: 1 }
      );

      expect(runTrial).toHaveBeenCalledWith({ model: 'test', lr: 0.001 });
      expect(result.metrics.eval_loss).toBe(0.42);
      expect(result.primaryMetric).toBe(0.42);
    });

    it('uses simulated metrics when no runTrial callback', async () => {
      const ar = new HyperparamAutoresearch({
        logger,
        paramSpace: { lr: [0.01] },
        baseConfig: {},
      });

      const executor = ar.createExecutor();
      const result = await executor(
        makeSession({ metricName: 'lr' }),
        { lr: 0.01 },
        { maxDurationMs: 60_000, maxSteps: 0, maxConcurrent: 1 }
      );

      expect(result.metrics.lr).toBe(0.01);
      expect(result.primaryMetric).toBe(0.01);
    });
  });

  describe('recordResult + analyze', () => {
    it('tracks retained and discarded results', () => {
      const ar = new HyperparamAutoresearch({
        logger,
        paramSpace: { lr: [0.001, 0.01, 0.1] },
        baseConfig: {},
      });

      ar.recordResult({ lr: 0.001 }, 0.8, true);
      ar.recordResult({ lr: 0.1 }, 0.9, false);
      ar.recordResult({ lr: 0.01 }, 0.7, true);

      const analysis = ar.analyze();
      expect(analysis.trialsCompleted).toBe(3);
      expect(analysis.trialsRetained).toBe(2);
      expect(analysis.bestMetric).toBe(0.7); // lower is better
    });

    it('respects lowerIsBetter=false', () => {
      const ar = new HyperparamAutoresearch({
        logger,
        paramSpace: { lr: [0.001, 0.01] },
        baseConfig: {},
        lowerIsBetter: false,
      });

      ar.recordResult({ lr: 0.001 }, 0.7, true);
      ar.recordResult({ lr: 0.01 }, 0.9, true);

      expect(ar.analyze().bestMetric).toBe(0.9);
    });
  });

  describe('space narrowing', () => {
    it('narrows param space around retained values', () => {
      const ar = new HyperparamAutoresearch({
        logger,
        paramSpace: { lr: [0.001, 0.005, 0.01, 0.05, 0.1] },
        baseConfig: {},
        narrowingFactor: 0.5,
      });

      // Retain at lr=0.01 — should narrow to values within 50% of range around 0.01
      ar.recordResult({ lr: 0.01 }, 0.5, true);

      const space = ar.getParamSpace();
      // Range was [0.001, 0.1] = 0.099, keepRadius = 0.099*0.5/2 ≈ 0.025
      // Values within 0.025 of 0.01: 0.005, 0.01
      expect(space.lr.length).toBeLessThan(5);
      expect(space.lr).toContain(0.01);
    });

    it('does not narrow below 2 values', () => {
      const ar = new HyperparamAutoresearch({
        logger,
        paramSpace: { lr: [0.001, 0.01, 0.1] },
        baseConfig: {},
        narrowingFactor: 0.01, // Very aggressive
      });

      ar.recordResult({ lr: 0.01 }, 0.5, true);

      const space = ar.getParamSpace();
      expect(space.lr.length).toBeGreaterThanOrEqual(2);
    });

    it('does not narrow non-numeric params', () => {
      const ar = new HyperparamAutoresearch({
        logger,
        paramSpace: { lr: [0.001, 0.01, 0.1] },
        baseConfig: {},
      });

      ar.recordResult({ model: 'llama3' }, 0.5, true);

      // lr space should be unchanged since the retained param was not numeric for lr
      expect(ar.getParamSpace().lr).toEqual([0.001, 0.01, 0.1]);
    });
  });

  describe('convergence detection', () => {
    it('detects convergence when results stabilize', () => {
      const ar = new HyperparamAutoresearch({
        logger,
        paramSpace: { lr: [0.01] },
        baseConfig: {},
        convergenceThreshold: 0.01,
        convergenceWindow: 3,
      });

      ar.recordResult({ lr: 0.01 }, 0.5, true);
      expect(ar.analyze().converged).toBe(false);

      ar.recordResult({ lr: 0.01 }, 0.502, true);
      expect(ar.analyze().converged).toBe(false);

      ar.recordResult({ lr: 0.01 }, 0.504, true);
      expect(ar.analyze().converged).toBe(true);
    });

    it('does not converge with high variance', () => {
      const ar = new HyperparamAutoresearch({
        logger,
        paramSpace: { lr: [0.01] },
        baseConfig: {},
        convergenceThreshold: 0.01,
        convergenceWindow: 3,
      });

      ar.recordResult({ lr: 0.01 }, 0.3, true);
      ar.recordResult({ lr: 0.01 }, 0.5, true);
      ar.recordResult({ lr: 0.01 }, 0.7, true);

      expect(ar.analyze().converged).toBe(false);
    });
  });

  describe('user-configurable thresholds', () => {
    it('respects custom convergenceThreshold', () => {
      const ar = new HyperparamAutoresearch({
        logger,
        paramSpace: { lr: [0.01] },
        baseConfig: {},
        convergenceThreshold: 0.1, // very loose
        convergenceWindow: 2,
      });

      ar.recordResult({ lr: 0.01 }, 0.5, true);
      ar.recordResult({ lr: 0.01 }, 0.55, true);

      // Spread = 0.05 < threshold 0.1 → converged
      expect(ar.analyze().converged).toBe(true);
    });

    it('respects custom convergenceWindow', () => {
      const ar = new HyperparamAutoresearch({
        logger,
        paramSpace: { lr: [0.01] },
        baseConfig: {},
        convergenceThreshold: 0.01,
        convergenceWindow: 5,
      });

      // Only 3 retained — need 5 for convergence
      ar.recordResult({ lr: 0.01 }, 0.5, true);
      ar.recordResult({ lr: 0.01 }, 0.501, true);
      ar.recordResult({ lr: 0.01 }, 0.502, true);

      expect(ar.analyze().converged).toBe(false);
    });

    it('respects custom maxDurationMs', () => {
      const ar = new HyperparamAutoresearch({
        logger,
        paramSpace: { lr: [0.01] },
        baseConfig: {},
        maxDurationMs: 600_000,
      });
      expect(ar.getMaxDurationMs()).toBe(600_000);
    });

    it('defaults maxDurationMs to 300_000', () => {
      const ar = new HyperparamAutoresearch({
        logger,
        paramSpace: {},
        baseConfig: {},
      });
      expect(ar.getMaxDurationMs()).toBe(300_000);
    });

    it('respects custom narrowingFactor', () => {
      const loose = new HyperparamAutoresearch({
        logger,
        paramSpace: { lr: [0.001, 0.005, 0.01, 0.05, 0.1] },
        baseConfig: {},
        narrowingFactor: 0.9, // keep 90% of range
      });

      loose.recordResult({ lr: 0.01 }, 0.5, true);
      expect(loose.getParamSpace().lr.length).toBeGreaterThanOrEqual(4);
    });
  });
});
