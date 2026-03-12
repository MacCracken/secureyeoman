/**
 * HyperparamAutoresearch — Applies autoresearch patterns to hyperparameter search.
 *
 * Instead of static grid/random search, iteratively narrows the parameter space
 * using retain/discard decisions. After each batch of trials, analyzes results
 * to tighten bounds around promising regions and proposes the next batch.
 *
 * Integrates with ExperimentRunner for hypothesis tracking, journaling, and
 * baseline promotion.
 */

import type { SecureLogger } from '../logging/logger.js';
import type {
  ExperimentSession,
  ExperimentBudget,
  ExperimentResult,
  ExperimentHypothesis,
} from '../simulation/experiment-runner.js';

// ── Types ──────────────────────────────────────────────────────────────

export interface ParamRange {
  values: number[];
  /** Current best value from retained experiments */
  bestValue?: number;
}

export interface SearchAnalysis {
  /** Param ranges narrowed based on retained results */
  refinedSpace: Record<string, ParamRange>;
  /** Best metric seen so far */
  bestMetric: number;
  /** Total trials run */
  trialsCompleted: number;
  /** How many trials were retained */
  trialsRetained: number;
  /** Whether the search has converged (improvement < convergenceThreshold over last N) */
  converged: boolean;
}

export interface HyperparamAutoresearchOpts {
  logger: SecureLogger;
  /** Initial parameter space: key → array of candidate values */
  paramSpace: Record<string, number[]>;
  /** Base config values that don't change */
  baseConfig: Record<string, unknown>;
  /** How many trials per batch before analyzing and refining */
  trialsPerBatch?: number;
  /** Minimum improvement to avoid convergence declaration */
  convergenceThreshold?: number;
  /** Number of recent results to check for convergence */
  convergenceWindow?: number;
  /** Factor by which to narrow bounds around best (0-1, default 0.5 = keep middle 50%) */
  narrowingFactor?: number;
  /** Metric direction */
  lowerIsBetter?: boolean;
  /** Maximum wall-clock time per trial in ms (default: 300_000 = 5 min) */
  maxDurationMs?: number;
  /** Callback to actually run a training trial with given params */
  runTrial?: (params: Record<string, unknown>) => Promise<Record<string, number>>;
}

export class HyperparamAutoresearch {
  private logger: SecureLogger;
  private paramSpace: Record<string, number[]>;
  private baseConfig: Record<string, unknown>;
  private trialsPerBatch: number;
  private convergenceThreshold: number;
  private convergenceWindow: number;
  private narrowingFactor: number;
  private lowerIsBetter: boolean;
  private maxDurationMs: number;
  private runTrial?: (params: Record<string, unknown>) => Promise<Record<string, number>>;

  // State tracking
  private history: { params: Record<string, unknown>; metric: number; retained: boolean }[] = [];

  constructor(opts: HyperparamAutoresearchOpts) {
    this.logger = opts.logger;
    this.paramSpace = { ...opts.paramSpace };
    this.baseConfig = { ...opts.baseConfig };
    this.trialsPerBatch = opts.trialsPerBatch ?? 5;
    this.convergenceThreshold = opts.convergenceThreshold ?? 0.001;
    this.convergenceWindow = opts.convergenceWindow ?? 3;
    this.narrowingFactor = opts.narrowingFactor ?? 0.5;
    this.lowerIsBetter = opts.lowerIsBetter ?? true;
    this.maxDurationMs = opts.maxDurationMs ?? 300_000;
    this.runTrial = opts.runTrial;
  }

  /**
   * Returns a propose callback for ExperimentRunner.
   * Generates hypotheses by sampling from the current (possibly narrowed) param space.
   */
  createProposer(): (session: ExperimentSession) => Promise<ExperimentHypothesis | null> {
    return async (session) => {
      const analysis = this.analyze();
      if (analysis.converged) {
        this.logger.info(
          { trialsCompleted: analysis.trialsCompleted, bestMetric: analysis.bestMetric },
          'Hyperparam search converged — no more experiments'
        );
        return null;
      }

      const modifications = this.sampleFromSpace();
      const description = Object.entries(modifications)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');

      return {
        description: `Trial ${analysis.trialsCompleted + 1}: ${description}`,
        modifications,
        expectedOutcome:
          analysis.trialsCompleted === 0
            ? 'Establish baseline metric'
            : `Improve ${session.metricName} from ${analysis.bestMetric}`,
      };
    };
  }

  /**
   * Returns an executor callback for ExperimentRunner.
   * Runs the trial and records results for analysis.
   */
  createExecutor(): (
    session: ExperimentSession,
    params: Record<string, unknown>,
    budget: ExperimentBudget
  ) => Promise<ExperimentResult> {
    return async (session, params, _budget) => {
      let metrics: Record<string, number>;

      if (this.runTrial) {
        metrics = await this.runTrial({ ...this.baseConfig, ...params });
      } else {
        // Simulated: extract numeric params as metrics
        metrics = {};
        for (const [k, v] of Object.entries(params)) {
          if (typeof v === 'number') metrics[k] = v;
        }
      }

      const primaryMetric = metrics[session.metricName] ?? 0;

      return {
        primaryMetric,
        metricName: session.metricName,
        metrics,
        lowerIsBetter: session.lowerIsBetter,
      };
    };
  }

  /**
   * Record a trial result for analysis. Called externally or by the experiment runner's
   * retain/discard logic.
   */
  recordResult(params: Record<string, unknown>, metric: number, retained: boolean): void {
    this.history.push({ params, metric, retained });

    if (retained) {
      this.refineSpace(params);
    }
  }

  /**
   * Analyze current state: convergence, best metric, refined space.
   */
  analyze(): SearchAnalysis {
    const trialsCompleted = this.history.length;
    const trialsRetained = this.history.filter((h) => h.retained).length;
    const retainedMetrics = this.history.filter((h) => h.retained).map((h) => h.metric);

    const bestMetric =
      retainedMetrics.length > 0
        ? this.lowerIsBetter
          ? Math.min(...retainedMetrics)
          : Math.max(...retainedMetrics)
        : 0;

    // Check convergence: last N retained results all within threshold of best
    let converged = false;
    if (retainedMetrics.length >= this.convergenceWindow) {
      const recent = retainedMetrics.slice(-this.convergenceWindow);
      const spread = Math.max(...recent) - Math.min(...recent);
      converged = spread < this.convergenceThreshold;
    }

    const refinedSpace: Record<string, ParamRange> = {};
    for (const [key, values] of Object.entries(this.paramSpace)) {
      const bestEntry = this.history
        .filter((h) => h.retained && typeof h.params[key] === 'number')
        .sort((a, b) => (this.lowerIsBetter ? a.metric - b.metric : b.metric - a.metric))[0];

      refinedSpace[key] = {
        values,
        bestValue: bestEntry ? (bestEntry.params[key] as number) : undefined,
      };
    }

    return { refinedSpace, bestMetric, trialsCompleted, trialsRetained, converged };
  }

  /** Get max duration per trial in ms */
  getMaxDurationMs(): number {
    return this.maxDurationMs;
  }

  /** Get current (possibly narrowed) parameter space */
  getParamSpace(): Record<string, number[]> {
    return { ...this.paramSpace };
  }

  /** Get trial history */
  getHistory(): readonly { params: Record<string, unknown>; metric: number; retained: boolean }[] {
    return this.history;
  }

  // ── Private ─────────────────────────────────────────────────────────

  /**
   * Sample a point from the current param space.
   */
  private sampleFromSpace(): Record<string, unknown> {
    const sample: Record<string, unknown> = {};
    for (const [key, values] of Object.entries(this.paramSpace)) {
      sample[key] = values[Math.floor(Math.random() * values.length)];
    }
    return sample;
  }

  /**
   * Narrow the parameter space around retained results.
   * For each numeric param with a retained best value, keep only the values
   * within `narrowingFactor` of the range centered on the best.
   */
  private refineSpace(retainedParams: Record<string, unknown>): void {
    for (const [key, values] of Object.entries(this.paramSpace)) {
      const retainedValue = retainedParams[key];
      if (typeof retainedValue !== 'number' || values.length <= 2) continue;

      const sorted = [...values].sort((a, b) => a - b);
      const range = sorted[sorted.length - 1]! - sorted[0]!;
      if (range === 0) continue;

      const keepRadius = (range * this.narrowingFactor) / 2;
      const narrowed = sorted.filter((v) => Math.abs(v - retainedValue) <= keepRadius);

      // Only narrow if we keep at least 2 values
      if (narrowed.length >= 2) {
        this.paramSpace[key] = narrowed;
        this.logger.info(
          { key, from: values.length, to: narrowed.length, center: retainedValue },
          'Narrowed param space'
        );
      }
    }
  }
}
