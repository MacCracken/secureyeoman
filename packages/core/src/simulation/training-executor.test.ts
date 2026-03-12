import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrainingExecutor } from './training-executor.js';
import type {
  TrainingJobLauncher,
  TrainingEvaluator,
  ExperimentTracker,
} from './training-executor.js';
import type { ExperimentSession, ExperimentBudget } from './experiment-runner.js';
import { createNoopLogger } from '../logging/logger.js';

function makeSession(overrides: Partial<ExperimentSession> = {}): ExperimentSession {
  return {
    id: 'sess-1',
    personalityId: 'p-1',
    name: 'LR Sweep',
    objective: 'Minimize loss',
    metricName: 'char_similarity',
    lowerIsBetter: false,
    budget: { maxDurationMs: 60_000, maxSteps: 0, maxConcurrent: 1 },
    constraints: { mutableKeys: [], bounds: {}, frozenKeys: [] },
    baselineParams: { learningRate: 0.001 },
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

const budget: ExperimentBudget = { maxDurationMs: 60_000, maxSteps: 0, maxConcurrent: 1 };

describe('TrainingExecutor', () => {
  let logger: ReturnType<typeof createNoopLogger>;

  beforeEach(() => {
    logger = createNoopLogger();
  });

  describe('execute without dependencies', () => {
    it('returns simulated metrics from params when no launcher/evaluator', async () => {
      const executor = new TrainingExecutor({ logger });

      const result = await executor.execute(
        makeSession({ metricName: 'learningRate' }),
        { learningRate: 0.01, batchSize: 32, label: 'test' },
        budget
      );

      expect(result.metrics.learningRate).toBe(0.01);
      expect(result.metrics.batchSize).toBe(32);
      // Non-numeric params should be excluded
      expect(result.metrics).not.toHaveProperty('label');
      expect(result.primaryMetric).toBe(0.01);
      expect(result.metricName).toBe('learningRate');
    });

    it('uses primaryMetricKey to select metric', async () => {
      const executor = new TrainingExecutor({
        logger,
        primaryMetricKey: 'batchSize',
      });

      const result = await executor.execute(makeSession(), { batchSize: 64, epochs: 3 }, budget);

      expect(result.primaryMetric).toBe(64);
    });

    it('falls back to session metricName then 0', async () => {
      const executor = new TrainingExecutor({ logger });

      const result = await executor.execute(
        makeSession({ metricName: 'missing' }),
        { something: 42 },
        budget
      );

      // primaryMetricKey is 'char_similarity' (default), not in metrics
      // session.metricName is 'missing', not in metrics
      expect(result.primaryMetric).toBe(0);
    });
  });

  describe('execute with job launcher', () => {
    it('creates and waits for training job', async () => {
      const launcher: TrainingJobLauncher = {
        createJob: vi.fn().mockResolvedValue({ id: 'job-1', status: 'pending' }),
        waitForCompletion: vi
          .fn()
          .mockResolvedValue({ status: 'complete', adapterPath: '/adapters/test' }),
      };

      const executor = new TrainingExecutor({ logger, jobLauncher: launcher });
      const session = makeSession({ totalRuns: 2 });

      await executor.execute(session, { learningRate: 0.005 }, budget);

      expect(launcher.createJob).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'LR Sweep - Run 3',
          adapterName: 'autoresearch-sess-1-3',
          baseModel: 'llama3.2:3b',
        })
      );
      expect(launcher.waitForCompletion).toHaveBeenCalledWith('job-1', 60_000);
    });

    it('throws on failed training job', async () => {
      const launcher: TrainingJobLauncher = {
        createJob: vi.fn().mockResolvedValue({ id: 'job-1', status: 'pending' }),
        waitForCompletion: vi.fn().mockResolvedValue({ status: 'failed', errorMessage: 'GPU OOM' }),
      };

      const executor = new TrainingExecutor({ logger, jobLauncher: launcher });

      await expect(executor.execute(makeSession(), {}, budget)).rejects.toThrow('GPU OOM');
    });

    it('uses param baseModel over default', async () => {
      const launcher: TrainingJobLauncher = {
        createJob: vi.fn().mockResolvedValue({ id: 'job-1', status: 'pending' }),
        waitForCompletion: vi.fn().mockResolvedValue({ status: 'complete' }),
      };

      const executor = new TrainingExecutor({
        logger,
        jobLauncher: launcher,
        defaultBaseModel: 'llama3.2:3b',
      });

      await executor.execute(makeSession(), { baseModel: 'mistral:7b' }, budget);

      expect(launcher.createJob).toHaveBeenCalledWith(
        expect.objectContaining({ baseModel: 'mistral:7b' })
      );
    });
  });

  describe('execute with evaluator', () => {
    it('runs evaluation and returns real metrics', async () => {
      const modelFn = vi.fn().mockResolvedValue('response');
      const evaluator: TrainingEvaluator = {
        evaluate: vi.fn().mockResolvedValue({
          metrics: { char_similarity: 0.85, exact_match: 0.6 },
        }),
      };

      const executor = new TrainingExecutor({
        logger,
        evaluator,
        modelFn,
      });

      const result = await executor.execute(makeSession(), {}, budget);

      expect(evaluator.evaluate).toHaveBeenCalledWith(expect.objectContaining({ modelFn }));
      expect(result.metrics.char_similarity).toBe(0.85);
      expect(result.primaryMetric).toBe(0.85);
    });

    it('skips evaluation when modelFn is missing', async () => {
      const evaluator: TrainingEvaluator = {
        evaluate: vi.fn(),
      };

      const executor = new TrainingExecutor({ logger, evaluator });
      // No modelFn → falls back to simulated metrics
      const result = await executor.execute(makeSession(), { lr: 0.01 }, budget);

      expect(evaluator.evaluate).not.toHaveBeenCalled();
      expect(result.metrics.lr).toBe(0.01);
    });
  });

  describe('execute with tracker', () => {
    it('creates experiment, updates on success, links eval', async () => {
      const tracker: ExperimentTracker = {
        createExperiment: vi.fn().mockResolvedValue({ id: 'exp-1' }),
        updateExperiment: vi.fn().mockResolvedValue({}),
        linkEvalRun: vi.fn().mockResolvedValue({}),
      };

      const executor = new TrainingExecutor({ logger, tracker });

      await executor.execute(makeSession(), { lr: 0.01 }, budget);

      expect(tracker.createExperiment).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'LR Sweep - Run 1',
          status: 'running',
          hyperparameters: { lr: 0.01 },
        })
      );
      expect(tracker.linkEvalRun).toHaveBeenCalledWith(
        'exp-1',
        'eval-exp-1',
        expect.objectContaining({ lr: 0.01 })
      );
      expect(tracker.updateExperiment).toHaveBeenCalledWith('exp-1', { status: 'completed' });
    });

    it('marks experiment failed on error', async () => {
      const tracker: ExperimentTracker = {
        createExperiment: vi.fn().mockResolvedValue({ id: 'exp-2' }),
        updateExperiment: vi.fn().mockResolvedValue({}),
      };

      const launcher: TrainingJobLauncher = {
        createJob: vi.fn().mockResolvedValue({ id: 'job-1', status: 'pending' }),
        waitForCompletion: vi
          .fn()
          .mockResolvedValue({ status: 'failed', errorMessage: 'Disk full' }),
      };

      const executor = new TrainingExecutor({ logger, tracker, jobLauncher: launcher });

      await expect(executor.execute(makeSession(), {}, budget)).rejects.toThrow('Disk full');

      expect(tracker.updateExperiment).toHaveBeenCalledWith('exp-2', {
        status: 'failed',
        notes: 'Disk full',
      });
    });

    it('links finetune job id to experiment notes', async () => {
      const tracker: ExperimentTracker = {
        createExperiment: vi.fn().mockResolvedValue({ id: 'exp-3' }),
        updateExperiment: vi.fn().mockResolvedValue({}),
      };

      const launcher: TrainingJobLauncher = {
        createJob: vi.fn().mockResolvedValue({ id: 'ft-job-99', status: 'pending' }),
        waitForCompletion: vi.fn().mockResolvedValue({ status: 'complete' }),
      };

      const executor = new TrainingExecutor({ logger, tracker, jobLauncher: launcher });

      await executor.execute(makeSession(), {}, budget);

      expect(tracker.updateExperiment).toHaveBeenCalledWith('exp-3', {
        notes: 'Finetune job: ft-job-99',
      });
    });
  });

  describe('execute with all dependencies', () => {
    it('runs full pipeline: track → train → evaluate → link', async () => {
      const tracker: ExperimentTracker = {
        createExperiment: vi.fn().mockResolvedValue({ id: 'exp-full' }),
        updateExperiment: vi.fn().mockResolvedValue({}),
        linkEvalRun: vi.fn().mockResolvedValue({}),
      };

      const launcher: TrainingJobLauncher = {
        createJob: vi.fn().mockResolvedValue({ id: 'job-full', status: 'pending' }),
        waitForCompletion: vi.fn().mockResolvedValue({ status: 'complete', adapterPath: '/out' }),
      };

      const modelFn = vi.fn().mockResolvedValue('output');
      const evaluator: TrainingEvaluator = {
        evaluate: vi.fn().mockResolvedValue({
          metrics: { char_similarity: 0.92, exact_match: 0.75 },
        }),
      };

      const executor = new TrainingExecutor({
        logger,
        tracker,
        jobLauncher: launcher,
        evaluator,
        modelFn,
        primaryMetricKey: 'char_similarity',
      });

      const result = await executor.execute(
        makeSession(),
        { learningRate: 0.005, loraRank: 16 },
        budget
      );

      // Verify ordering: track → train → evaluate → link → complete
      expect(tracker.createExperiment).toHaveBeenCalledTimes(1);
      expect(launcher.createJob).toHaveBeenCalledTimes(1);
      expect(launcher.waitForCompletion).toHaveBeenCalledTimes(1);
      expect(evaluator.evaluate).toHaveBeenCalledTimes(1);
      expect(tracker.linkEvalRun).toHaveBeenCalledWith('exp-full', 'eval-exp-full', {
        char_similarity: 0.92,
        exact_match: 0.75,
      });
      expect(tracker.updateExperiment).toHaveBeenCalledWith('exp-full', { status: 'completed' });

      expect(result.primaryMetric).toBe(0.92);
      expect(result.metrics.exact_match).toBe(0.75);
    });
  });

  describe('createExecutor', () => {
    it('returns a callback compatible with ExperimentRunner', async () => {
      const executor = new TrainingExecutor({ logger });
      const cb = executor.createExecutor();

      expect(typeof cb).toBe('function');

      const result = await cb(makeSession({ metricName: 'x' }), { x: 0.5 }, budget);
      expect(result.primaryMetric).toBe(0.5);
      expect(result.metricName).toBe('x');
    });
  });
});
