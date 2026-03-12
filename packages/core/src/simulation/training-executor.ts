/**
 * Training Executor — Bridges simulation experiment runner to the real training pipeline.
 *
 * Connects ExperimentRunner's abstract executeExperiment callback to:
 *   - ExperimentRegistryManager (training.experiments tracking)
 *   - FinetuneManager (LoRA/QLoRA job execution)
 *   - EvaluationManager (post-training metric evaluation)
 *
 * This enables the autoresearch loop to autonomously launch training jobs,
 * wait for completion, evaluate results, and feed metrics back to the
 * experiment runner for retain/discard decisions.
 */

import type { SecureLogger } from '../logging/logger.js';
import type { ExperimentSession, ExperimentBudget, ExperimentResult } from './experiment-runner.js';

// ── Dependency interfaces (avoid hard coupling to concrete managers) ──

export interface TrainingJobLauncher {
  createJob(config: {
    name: string;
    baseModel: string;
    adapterName: string;
    datasetPath: string;
    loraRank?: number;
    loraAlpha?: number;
    batchSize?: number;
    epochs?: number;
    learningRate?: number;
    warmupSteps?: number;
  }): Promise<{ id: string; status: string }>;
  waitForCompletion(
    jobId: string,
    timeoutMs: number
  ): Promise<{ status: string; adapterPath?: string | null; errorMessage?: string | null }>;
}

export interface TrainingEvaluator {
  evaluate(config: {
    modelFn: (prompt: string) => Promise<string>;
    datasetPath?: string;
    maxSamples?: number;
  }): Promise<{
    metrics: Record<string, number>;
  }>;
}

export interface ExperimentTracker {
  createExperiment(data: {
    name: string;
    finetuneJobId?: string;
    hyperparameters?: Record<string, unknown>;
    environment?: Record<string, unknown>;
    status?: string;
    notes?: string;
  }): Promise<{ id: string }>;
  updateExperiment(id: string, updates: { status?: string; notes?: string }): Promise<unknown>;
  linkEvalRun?(
    experimentId: string,
    evalRunId: string,
    evalMetrics: Record<string, number>
  ): Promise<unknown>;
}

// ── Training Executor ─────────────────────────────────────────────────

export interface TrainingExecutorOpts {
  logger: SecureLogger;
  jobLauncher?: TrainingJobLauncher;
  evaluator?: TrainingEvaluator;
  tracker?: ExperimentTracker;
  /** Default model for fine-tuning (e.g., 'llama3.2:3b') */
  defaultBaseModel?: string;
  /** Default dataset path */
  defaultDatasetPath?: string;
  /** Callback to get model response for evaluation */
  modelFn?: (prompt: string) => Promise<string>;
  /** Primary metric name to extract from eval results */
  primaryMetricKey?: string;
}

export class TrainingExecutor {
  private logger: SecureLogger;
  private jobLauncher?: TrainingJobLauncher;
  private evaluator?: TrainingEvaluator;
  private tracker?: ExperimentTracker;
  private defaultBaseModel: string;
  private defaultDatasetPath: string;
  private modelFn?: (prompt: string) => Promise<string>;
  private primaryMetricKey: string;

  constructor(opts: TrainingExecutorOpts) {
    this.logger = opts.logger;
    this.jobLauncher = opts.jobLauncher;
    this.evaluator = opts.evaluator;
    this.tracker = opts.tracker;
    this.defaultBaseModel = opts.defaultBaseModel ?? 'llama3.2:3b';
    this.defaultDatasetPath = opts.defaultDatasetPath ?? '';
    this.modelFn = opts.modelFn;
    this.primaryMetricKey = opts.primaryMetricKey ?? 'char_similarity';
  }

  /**
   * Returns the executeExperiment callback for ExperimentRunner.
   *
   * This function:
   *   1. Creates a training.experiment record
   *   2. Launches a fine-tune job with the given params
   *   3. Waits for completion within budget
   *   4. Evaluates the result
   *   5. Links eval to the experiment record
   *   6. Returns ExperimentResult with metrics
   */
  createExecutor(): (
    session: ExperimentSession,
    params: Record<string, unknown>,
    budget: ExperimentBudget
  ) => Promise<ExperimentResult> {
    return async (session, params, budget) => {
      return this.execute(session, params, budget);
    };
  }

  async execute(
    session: ExperimentSession,
    params: Record<string, unknown>,
    budget: ExperimentBudget
  ): Promise<ExperimentResult> {
    const expName = `${session.name} - Run ${session.totalRuns + 1}`;

    // 1. Track the experiment
    let experimentId: string | undefined;
    if (this.tracker) {
      const exp = await this.tracker.createExperiment({
        name: expName,
        hyperparameters: params,
        environment: { sessionId: session.id, budgetMs: budget.maxDurationMs },
        status: 'running',
      });
      experimentId = exp.id;
    }

    try {
      let metrics: Record<string, number> = {};

      // 2. Launch training job if launcher is available
      if (this.jobLauncher) {
        const jobConfig = {
          name: expName,
          baseModel: (params.baseModel as string) ?? this.defaultBaseModel,
          adapterName: `autoresearch-${session.id}-${session.totalRuns + 1}`,
          datasetPath: (params.datasetPath as string) ?? this.defaultDatasetPath,
          loraRank: params.loraRank as number | undefined,
          loraAlpha: params.loraAlpha as number | undefined,
          batchSize: params.batchSize as number | undefined,
          epochs: params.epochs as number | undefined,
          learningRate: params.learningRate as number | undefined,
          warmupSteps: params.warmupSteps as number | undefined,
        };

        const job = await this.jobLauncher.createJob(jobConfig);

        if (experimentId && this.tracker) {
          await this.tracker.updateExperiment(experimentId, {
            notes: `Finetune job: ${job.id}`,
          });
        }

        // Wait for completion within budget
        const result = await this.jobLauncher.waitForCompletion(job.id, budget.maxDurationMs);

        if (result.status === 'failed') {
          throw new Error(result.errorMessage ?? 'Training job failed');
        }

        this.logger.info({ jobId: job.id, status: result.status }, 'training job completed');
      }

      // 3. Evaluate if evaluator is available
      if (this.evaluator && this.modelFn) {
        const evalResult = await this.evaluator.evaluate({
          modelFn: this.modelFn,
          datasetPath: (params.evalDatasetPath as string) ?? this.defaultDatasetPath,
          maxSamples: params.maxEvalSamples as number | undefined,
        });
        metrics = evalResult.metrics;
      } else {
        // Simulated metrics from params (for testing / non-Docker environments)
        metrics = this.extractSimulatedMetrics(params);
      }

      // 4. Link eval to experiment record
      if (experimentId && this.tracker?.linkEvalRun) {
        await this.tracker.linkEvalRun(experimentId, `eval-${experimentId}`, metrics);
      }

      if (experimentId && this.tracker) {
        await this.tracker.updateExperiment(experimentId, { status: 'completed' });
      }

      // 5. Build result
      const primaryMetric = metrics[this.primaryMetricKey] ?? metrics[session.metricName] ?? 0;

      return {
        primaryMetric,
        metricName: session.metricName,
        metrics,
        lowerIsBetter: session.lowerIsBetter,
      };
    } catch (err) {
      if (experimentId && this.tracker) {
        await this.tracker.updateExperiment(experimentId, {
          status: 'failed',
          notes: err instanceof Error ? err.message : String(err),
        });
      }
      throw err;
    }
  }

  /**
   * Extract simulated metrics from parameter values.
   * Useful when no real training infrastructure is available (e.g., testing,
   * or purely simulation-based parameter optimization).
   */
  private extractSimulatedMetrics(params: Record<string, unknown>): Record<string, number> {
    const metrics: Record<string, number> = {};
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'number') {
        metrics[key] = value;
      }
    }
    return metrics;
  }
}
