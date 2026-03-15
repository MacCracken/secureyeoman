import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExperimentRunner } from './experiment-runner.js';
import { InMemoryExperimentStore } from './experiment-store.js';
import type {
  _ExperimentSession,
  ExperimentHypothesis,
  ExperimentResult,
} from './experiment-runner.js';
import { createNoopLogger } from '../logging/logger.js';

describe('ExperimentRunner', () => {
  let store: InMemoryExperimentStore;
  let runner: ExperimentRunner;

  beforeEach(() => {
    store = new InMemoryExperimentStore();
    runner = new ExperimentRunner({ store, logger: createNoopLogger() });
  });

  describe('session management', () => {
    it('creates a session with defaults', async () => {
      const session = await runner.createSession('p-1', {
        name: 'LR Sweep',
        objective: 'Minimize validation loss',
        metricName: 'val_loss',
        baselineParams: { learningRate: 0.001, batchSize: 32 },
      });

      expect(session.id).toBeTruthy();
      expect(session.personalityId).toBe('p-1');
      expect(session.name).toBe('LR Sweep');
      expect(session.lowerIsBetter).toBe(true);
      expect(session.budget.maxDurationMs).toBe(300_000);
      expect(session.status).toBe('active');
      expect(session.totalRuns).toBe(0);
    });

    it('lists sessions by personality', async () => {
      await runner.createSession('p-1', {
        name: 'Session A',
        objective: 'test',
        metricName: 'm',
        baselineParams: {},
      });
      await runner.createSession('p-2', {
        name: 'Session B',
        objective: 'test',
        metricName: 'm',
        baselineParams: {},
      });

      const sessions = await runner.listSessions('p-1');
      expect(sessions).toHaveLength(1);
      expect(sessions[0].name).toBe('Session A');
    });

    it('pauses and resumes a session', async () => {
      const session = await runner.createSession('p-1', {
        name: 'Test',
        objective: 'test',
        metricName: 'm',
        baselineParams: {},
      });

      const paused = await runner.pauseSession(session.id);
      expect(paused!.status).toBe('paused');

      const resumed = await runner.resumeSession(session.id);
      expect(resumed!.status).toBe('active');
    });

    it('completes a session', async () => {
      const session = await runner.createSession('p-1', {
        name: 'Test',
        objective: 'test',
        metricName: 'm',
        baselineParams: {},
      });

      const completed = await runner.completeSession(session.id);
      expect(completed!.status).toBe('completed');

      // Cannot resume a completed session
      const resumed = await runner.resumeSession(session.id);
      expect(resumed).toBeNull();
    });
  });

  describe('validateModifications', () => {
    it('respects frozen keys', async () => {
      const session = await runner.createSession('p-1', {
        name: 'Test',
        objective: 'test',
        metricName: 'm',
        baselineParams: { lr: 0.001, epochs: 10 },
        constraints: { frozenKeys: ['epochs'] },
      });

      const validated = runner.validateModifications(session, {
        lr: 0.01,
        epochs: 20,
      });

      expect(validated.lr).toBe(0.01);
      expect(validated.epochs).toBeUndefined();
    });

    it('respects mutable key whitelist', async () => {
      const session = await runner.createSession('p-1', {
        name: 'Test',
        objective: 'test',
        metricName: 'm',
        baselineParams: {},
        constraints: { mutableKeys: ['lr'] },
      });

      const validated = runner.validateModifications(session, {
        lr: 0.01,
        batchSize: 64,
      });

      expect(validated.lr).toBe(0.01);
      expect(validated.batchSize).toBeUndefined();
    });

    it('clamps numeric values to bounds', async () => {
      const session = await runner.createSession('p-1', {
        name: 'Test',
        objective: 'test',
        metricName: 'm',
        baselineParams: {},
        constraints: {
          bounds: { lr: { min: 1e-6, max: 1e-2 } },
        },
      });

      expect(runner.validateModifications(session, { lr: 0.1 }).lr).toBe(1e-2);
      expect(runner.validateModifications(session, { lr: 1e-8 }).lr).toBe(1e-6);
      expect(runner.validateModifications(session, { lr: 5e-4 }).lr).toBe(5e-4);
    });
  });

  describe('submitExperiment', () => {
    it('runs an experiment with executor', async () => {
      const executor = vi.fn().mockResolvedValue({
        primaryMetric: 0.85,
        metricName: 'val_loss',
        metrics: { val_loss: 0.85, train_loss: 0.72 },
        lowerIsBetter: true,
      } satisfies ExperimentResult);

      runner = new ExperimentRunner({
        store,
        logger: createNoopLogger(),
        executeExperiment: executor,
      });

      const session = await runner.createSession('p-1', {
        name: 'Test',
        objective: 'Minimize loss',
        metricName: 'val_loss',
        baselineParams: { lr: 0.001 },
      });

      const run = await runner.submitExperiment(session.id, {
        description: 'Increase LR',
        modifications: { lr: 0.01 },
        expectedOutcome: 'Lower loss with higher LR',
      });

      expect(run).not.toBeNull();
      expect(run!.status).toBe('retained'); // First run is always best
      expect(run!.result!.primaryMetric).toBe(0.85);
      expect(run!.retained).toBe(true);

      const updated = await runner.getSession(session.id);
      expect(updated!.bestMetric).toBe(0.85);
      expect(updated!.totalRuns).toBe(1);
      expect(updated!.retainedRuns).toBe(1);
    });

    it('discards worse results and keeps baseline', async () => {
      let callCount = 0;
      const executor = vi.fn().mockImplementation(async () => {
        callCount++;
        return {
          primaryMetric: callCount === 1 ? 0.5 : 0.8, // Second run is worse
          metricName: 'val_loss',
          metrics: {},
          lowerIsBetter: true,
        } satisfies ExperimentResult;
      });

      runner = new ExperimentRunner({
        store,
        logger: createNoopLogger(),
        executeExperiment: executor,
      });

      const session = await runner.createSession('p-1', {
        name: 'Test',
        objective: 'Minimize loss',
        metricName: 'val_loss',
        baselineParams: { lr: 0.001 },
      });

      // First run — retained
      const run1 = await runner.submitExperiment(session.id, {
        description: 'Run 1',
        modifications: { lr: 0.005 },
        expectedOutcome: 'Better',
      });
      expect(run1!.retained).toBe(true);

      // Second run — worse, discarded
      const run2 = await runner.submitExperiment(session.id, {
        description: 'Run 2',
        modifications: { lr: 0.1 },
        expectedOutcome: 'Even better',
      });
      expect(run2!.retained).toBe(false);
      expect(run2!.status).toBe('discarded');

      const updated = await runner.getSession(session.id);
      expect(updated!.bestMetric).toBe(0.5);
      expect(updated!.retainedRuns).toBe(1);
      expect(updated!.discardedRuns).toBe(1);
    });

    it('handles higher-is-better metrics', async () => {
      let callCount = 0;
      const executor = vi.fn().mockImplementation(async () => {
        callCount++;
        return {
          primaryMetric: callCount === 1 ? 0.7 : 0.9,
          metricName: 'accuracy',
          metrics: {},
          lowerIsBetter: false,
        };
      });

      runner = new ExperimentRunner({
        store,
        logger: createNoopLogger(),
        executeExperiment: executor,
      });

      const session = await runner.createSession('p-1', {
        name: 'Accuracy',
        objective: 'Maximize accuracy',
        metricName: 'accuracy',
        lowerIsBetter: false,
        baselineParams: {},
      });

      await runner.submitExperiment(session.id, {
        description: 'Run 1',
        modifications: {},
        expectedOutcome: '',
      });
      const run2 = await runner.submitExperiment(session.id, {
        description: 'Run 2',
        modifications: {},
        expectedOutcome: '',
      });

      expect(run2!.retained).toBe(true);
      const updated = await runner.getSession(session.id);
      expect(updated!.bestMetric).toBe(0.9);
    });

    it('handles executor failures gracefully', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('GPU OOM'));

      runner = new ExperimentRunner({
        store,
        logger: createNoopLogger(),
        executeExperiment: executor,
      });

      const session = await runner.createSession('p-1', {
        name: 'Test',
        objective: 'test',
        metricName: 'm',
        baselineParams: {},
      });

      const run = await runner.submitExperiment(session.id, {
        description: 'Crash test',
        modifications: {},
        expectedOutcome: '',
      });

      expect(run!.status).toBe('failed');
      expect(run!.errorMessage).toBe('GPU OOM');
    });

    it('returns null for inactive session', async () => {
      const session = await runner.createSession('p-1', {
        name: 'Test',
        objective: 'test',
        metricName: 'm',
        baselineParams: {},
      });
      await runner.pauseSession(session.id);

      const run = await runner.submitExperiment(session.id, {
        description: 'Should fail',
        modifications: {},
        expectedOutcome: '',
      });
      expect(run).toBeNull();
    });

    it('promotes baseline on retained run', async () => {
      const executor = vi.fn().mockResolvedValue({
        primaryMetric: 0.5,
        metricName: 'loss',
        metrics: {},
        lowerIsBetter: true,
      });

      runner = new ExperimentRunner({
        store,
        logger: createNoopLogger(),
        executeExperiment: executor,
      });

      const session = await runner.createSession('p-1', {
        name: 'Test',
        objective: 'test',
        metricName: 'loss',
        baselineParams: { lr: 0.001 },
      });

      await runner.submitExperiment(session.id, {
        description: 'Better LR',
        modifications: { lr: 0.005 },
        expectedOutcome: '',
      });

      // Baseline should now be updated with the retained params
      const updated = await runner.getSession(session.id);
      expect(updated!.baselineParams.lr).toBe(0.005);
    });
  });

  describe('onTick (autonomous mode)', () => {
    it('proposes and executes experiments on tick', async () => {
      const propose = vi.fn().mockResolvedValue({
        description: 'Try higher LR',
        modifications: { lr: 0.01 },
        expectedOutcome: 'Lower loss',
      } satisfies ExperimentHypothesis);

      const execute = vi.fn().mockResolvedValue({
        primaryMetric: 0.42,
        metricName: 'val_loss',
        metrics: { val_loss: 0.42 },
        lowerIsBetter: true,
      } satisfies ExperimentResult);

      runner = new ExperimentRunner({
        store,
        logger: createNoopLogger(),
        proposeExperiment: propose,
        executeExperiment: execute,
        ticksPerCycle: 1,
      });

      await runner.createSession('p-1', {
        name: 'Auto',
        objective: 'test',
        metricName: 'val_loss',
        baselineParams: { lr: 0.001 },
      });

      await runner.onTick({ tick: 1, simTime: 1000, personalityId: 'p-1', timestamp: Date.now() });

      expect(propose).toHaveBeenCalledOnce();
      expect(execute).toHaveBeenCalledOnce();

      const sessions = await runner.listSessions('p-1');
      expect(sessions[0].totalRuns).toBe(1);
    });

    it('respects ticksPerCycle throttle', async () => {
      const propose = vi.fn().mockResolvedValue({
        description: 'test',
        modifications: {},
        expectedOutcome: '',
      });
      const execute = vi.fn().mockResolvedValue({
        primaryMetric: 1,
        metricName: 'm',
        metrics: {},
        lowerIsBetter: true,
      });

      runner = new ExperimentRunner({
        store,
        logger: createNoopLogger(),
        proposeExperiment: propose,
        executeExperiment: execute,
        ticksPerCycle: 3,
      });

      await runner.createSession('p-1', {
        name: 'Auto',
        objective: 'test',
        metricName: 'm',
        baselineParams: {},
      });

      // Ticks 1, 2 should not trigger
      await runner.onTick({ tick: 1, simTime: 1000, personalityId: 'p-1', timestamp: Date.now() });
      await runner.onTick({ tick: 2, simTime: 2000, personalityId: 'p-1', timestamp: Date.now() });
      expect(propose).not.toHaveBeenCalled();

      // Tick 3 should trigger
      await runner.onTick({ tick: 3, simTime: 3000, personalityId: 'p-1', timestamp: Date.now() });
      expect(propose).toHaveBeenCalledOnce();
    });

    it('skips paused sessions', async () => {
      const propose = vi.fn().mockResolvedValue(null);

      runner = new ExperimentRunner({
        store,
        logger: createNoopLogger(),
        proposeExperiment: propose,
        executeExperiment: vi.fn(),
      });

      const session = await runner.createSession('p-1', {
        name: 'Auto',
        objective: 'test',
        metricName: 'm',
        baselineParams: {},
      });
      await runner.pauseSession(session.id);

      await runner.onTick({ tick: 1, simTime: 1000, personalityId: 'p-1', timestamp: Date.now() });
      expect(propose).not.toHaveBeenCalled();
    });

    it('handles null hypothesis (no experiment proposed)', async () => {
      const propose = vi.fn().mockResolvedValue(null);
      const execute = vi.fn();

      runner = new ExperimentRunner({
        store,
        logger: createNoopLogger(),
        proposeExperiment: propose,
        executeExperiment: execute,
      });

      await runner.createSession('p-1', {
        name: 'Auto',
        objective: 'test',
        metricName: 'm',
        baselineParams: {},
      });

      await runner.onTick({ tick: 1, simTime: 1000, personalityId: 'p-1', timestamp: Date.now() });
      expect(execute).not.toHaveBeenCalled();
    });
  });

  describe('run listing and best run', () => {
    it('tracks best run across session', async () => {
      let callCount = 0;
      const executor = vi.fn().mockImplementation(async () => ({
        primaryMetric: [0.8, 0.5, 0.6][callCount++],
        metricName: 'loss',
        metrics: {},
        lowerIsBetter: true,
      }));

      runner = new ExperimentRunner({
        store,
        logger: createNoopLogger(),
        executeExperiment: executor,
      });

      const session = await runner.createSession('p-1', {
        name: 'Test',
        objective: 'test',
        metricName: 'loss',
        baselineParams: {},
      });

      for (let i = 0; i < 3; i++) {
        await runner.submitExperiment(session.id, {
          description: `Run ${i}`,
          modifications: {},
          expectedOutcome: '',
        });
      }

      const best = await runner.getBestRun(session.id);
      expect(best).not.toBeNull();
      expect(best!.result!.primaryMetric).toBe(0.5);

      const runs = await runner.listRuns(session.id);
      expect(runs).toHaveLength(3);
    });
  });
});

describe('InMemoryExperimentStore', () => {
  it('stores and retrieves sessions', async () => {
    const store = new InMemoryExperimentStore();
    const session = {
      id: 's-1',
      personalityId: 'p-1',
      name: 'Test',
      objective: 'test',
      metricName: 'm',
      lowerIsBetter: true,
      budget: { maxDurationMs: 300_000, maxSteps: 0, maxConcurrent: 1 },
      constraints: { mutableKeys: [], bounds: {}, frozenKeys: [] },
      baselineParams: {},
      bestMetric: null,
      bestRunId: null,
      totalRuns: 0,
      retainedRuns: 0,
      discardedRuns: 0,
      status: 'active' as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await store.saveSession(session);
    expect(await store.getSession('s-1')).toEqual(session);
    expect(await store.listSessions('p-1')).toHaveLength(1);
    expect(await store.listSessions('other')).toHaveLength(0);
  });
});
