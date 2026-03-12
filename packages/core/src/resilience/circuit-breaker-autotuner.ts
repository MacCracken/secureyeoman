/**
 * CircuitBreakerAutotuner — Applies autoresearch patterns to circuit breaker tuning.
 *
 * Iteratively experiments with failureThreshold and resetTimeoutMs to find
 * optimal circuit breaker settings that balance:
 *   - Detection speed (time to open on real failures)
 *   - False open rate (opening when the service is actually healthy)
 *
 * Uses ExperimentRunner's retain/discard pattern: retain settings that improve
 * the composite detection score, discard those that don't.
 */

import type { SecureLogger } from '../logging/logger.js';
import type {
  ExperimentSession,
  ExperimentBudget,
  ExperimentResult,
  ExperimentHypothesis,
} from '../simulation/experiment-runner.js';

// ── Types ──────────────────────────────────────────────────────────────

export interface BreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
}

export interface BreakerObservation {
  /** Time from first failure to circuit open (ms) */
  detectionTimeMs: number;
  /** Did the breaker open when the service was actually healthy? */
  falseOpen: boolean;
  /** Did the breaker stay closed during a real outage? */
  missedFailure: boolean;
  /** Time spent in open state before successful half-open probe */
  recoveryTimeMs: number;
}

export interface AutotuneAnalysis {
  currentConfig: BreakerConfig;
  /** Detection score: 0-1, higher = faster detection with fewer false opens */
  detectionScore: number;
  /** Average time to detect failure */
  avgDetectionTimeMs: number;
  /** False open rate: fraction of observations that were false opens */
  falseOpenRate: number;
  /** Total observations collected */
  observationCount: number;
  /** Whether tuning has converged */
  converged: boolean;
}

export interface CircuitBreakerAutotunerOpts {
  logger: SecureLogger;
  /** Starting config */
  initialConfig?: BreakerConfig;
  /** Candidate failureThreshold values to explore */
  thresholdCandidates?: number[];
  /** Candidate resetTimeoutMs values to explore */
  timeoutCandidates?: number[];
  /** Minimum observations before analyzing */
  minObservations?: number;
  /** Convergence threshold for detection score */
  convergenceThreshold?: number;
  /** User-configurable max duration for autotuning budget */
  maxDurationMs?: number;
  /** Callback to apply new config to a real circuit breaker */
  applyConfig?: (config: BreakerConfig) => void;
}

export class CircuitBreakerAutotuner {
  private logger: SecureLogger;
  private currentConfig: BreakerConfig;
  private thresholdCandidates: number[];
  private timeoutCandidates: number[];
  private minObservations: number;
  private convergenceThreshold: number;
  private maxDurationMs: number;
  private applyConfig?: (config: BreakerConfig) => void;

  // State
  private observations: BreakerObservation[] = [];
  private history: { config: BreakerConfig; score: number; retained: boolean }[] = [];

  constructor(opts: CircuitBreakerAutotunerOpts) {
    this.logger = opts.logger;
    this.currentConfig = opts.initialConfig ?? { failureThreshold: 5, resetTimeoutMs: 30_000 };
    this.thresholdCandidates = opts.thresholdCandidates ?? [2, 3, 5, 7, 10];
    this.timeoutCandidates = opts.timeoutCandidates ?? [10_000, 20_000, 30_000, 45_000, 60_000];
    this.minObservations = opts.minObservations ?? 10;
    this.convergenceThreshold = opts.convergenceThreshold ?? 0.02;
    this.maxDurationMs = opts.maxDurationMs ?? 300_000;
    this.applyConfig = opts.applyConfig;
  }

  /**
   * Returns a propose callback for ExperimentRunner.
   */
  createProposer(): (session: ExperimentSession) => Promise<ExperimentHypothesis | null> {
    return async (_session) => {
      // Check convergence first (based on history, not observations)
      if (this.isConverged()) {
        this.logger.info({ config: this.currentConfig }, 'Circuit breaker autotuning converged');
        return null;
      }

      const analysis = this.analyze();

      if (analysis.observationCount < this.minObservations) {
        return {
          description: `Collecting baseline observations (${analysis.observationCount}/${this.minObservations})`,
          modifications: { ...this.currentConfig },
          expectedOutcome: 'Gather enough data to analyze current settings',
        };
      }

      // Propose a config change based on current weaknesses
      const proposed = this.proposeNextConfig(analysis);

      const changes: string[] = [];
      if (proposed.failureThreshold !== this.currentConfig.failureThreshold) {
        changes.push(
          `threshold: ${this.currentConfig.failureThreshold}→${proposed.failureThreshold}`
        );
      }
      if (proposed.resetTimeoutMs !== this.currentConfig.resetTimeoutMs) {
        changes.push(`timeout: ${this.currentConfig.resetTimeoutMs}→${proposed.resetTimeoutMs}ms`);
      }

      return {
        description: `Tune CB: ${changes.join(', ') || 'no change'}`,
        modifications: { ...proposed },
        expectedOutcome:
          analysis.falseOpenRate > 0.05
            ? `Reduce false open rate from ${(analysis.falseOpenRate * 100).toFixed(1)}%`
            : `Improve detection time from ${analysis.avgDetectionTimeMs.toFixed(0)}ms`,
      };
    };
  }

  /**
   * Returns an executor callback for ExperimentRunner.
   */
  createExecutor(): (
    session: ExperimentSession,
    params: Record<string, unknown>,
    budget: ExperimentBudget
  ) => Promise<ExperimentResult> {
    return async (session, params, _budget) => {
      const config: BreakerConfig = {
        failureThreshold:
          (params.failureThreshold as number) ?? this.currentConfig.failureThreshold,
        resetTimeoutMs: (params.resetTimeoutMs as number) ?? this.currentConfig.resetTimeoutMs,
      };

      const analysis = this.analyzeWithConfig(config);

      const metrics: Record<string, number> = {
        detection_score: analysis.detectionScore,
        avg_detection_ms: analysis.avgDetectionTimeMs,
        false_open_rate: analysis.falseOpenRate,
        failure_threshold: config.failureThreshold,
        reset_timeout_ms: config.resetTimeoutMs,
        observation_count: analysis.observationCount,
      };

      return {
        primaryMetric: analysis.detectionScore,
        metricName: session.metricName,
        metrics,
        lowerIsBetter: false, // higher detection score is better
      };
    };
  }

  /**
   * Record an observation from the circuit breaker.
   */
  addObservation(obs: BreakerObservation): void {
    this.observations.push(obs);
  }

  /**
   * Record a tuning result.
   */
  recordResult(config: BreakerConfig, score: number, retained: boolean): void {
    this.history.push({ config, score, retained });

    if (retained) {
      this.currentConfig = { ...config };
      if (this.applyConfig) {
        this.applyConfig(config);
        this.logger.info({ config }, 'Applied new circuit breaker config');
      }
    }
  }

  /**
   * Analyze current observations with current config.
   */
  analyze(): AutotuneAnalysis {
    return this.analyzeWithConfig(this.currentConfig);
  }

  /** Get current config */
  getCurrentConfig(): Readonly<BreakerConfig> {
    return { ...this.currentConfig };
  }

  /** Get max duration for autotuning budget */
  getMaxDurationMs(): number {
    return this.maxDurationMs;
  }

  /** Get tuning history */
  getHistory(): readonly { config: BreakerConfig; score: number; retained: boolean }[] {
    return this.history;
  }

  // ── Private ─────────────────────────────────────────────────────────

  private isConverged(): boolean {
    if (this.history.length >= 3) {
      const recent = this.history.slice(-3).map((h) => h.score);
      const spread = Math.max(...recent) - Math.min(...recent);
      return spread < this.convergenceThreshold;
    }
    return false;
  }

  private analyzeWithConfig(config: BreakerConfig): AutotuneAnalysis {
    const obs = this.observations;
    if (obs.length === 0) {
      return {
        currentConfig: { ...config },
        detectionScore: 0,
        avgDetectionTimeMs: 0,
        falseOpenRate: 0,
        observationCount: 0,
        converged: this.isConverged(),
      };
    }

    const falseOpens = obs.filter((o) => o.falseOpen).length;
    const falseOpenRate = falseOpens / obs.length;

    const detectionTimes = obs.filter((o) => !o.falseOpen && o.detectionTimeMs > 0);
    const avgDetectionTimeMs =
      detectionTimes.length > 0
        ? detectionTimes.reduce((sum, o) => sum + o.detectionTimeMs, 0) / detectionTimes.length
        : 0;

    // Detection score: penalize false opens and slow detection
    const speedScore =
      avgDetectionTimeMs > 0
        ? Math.max(0, 1 - avgDetectionTimeMs / (config.resetTimeoutMs * 2))
        : 0.5;
    const accuracyScore = 1 - falseOpenRate;
    const detectionScore = accuracyScore * 0.6 + speedScore * 0.4;

    const converged = this.isConverged();

    return {
      currentConfig: { ...config },
      detectionScore,
      avgDetectionTimeMs,
      falseOpenRate,
      observationCount: obs.length,
      converged,
    };
  }

  private proposeNextConfig(analysis: AutotuneAnalysis): BreakerConfig {
    const current = this.currentConfig;

    // If false open rate is high, increase threshold (less sensitive)
    if (analysis.falseOpenRate > 0.1) {
      const higherThresholds = this.thresholdCandidates.filter((t) => t > current.failureThreshold);
      if (higherThresholds.length > 0) {
        return { ...current, failureThreshold: higherThresholds[0]! };
      }
    }

    // If detection is slow, decrease threshold (more sensitive)
    if (analysis.avgDetectionTimeMs > current.resetTimeoutMs * 0.5) {
      const lowerThresholds = this.thresholdCandidates.filter((t) => t < current.failureThreshold);
      if (lowerThresholds.length > 0) {
        return { ...current, failureThreshold: lowerThresholds[lowerThresholds.length - 1]! };
      }
    }

    // Try adjusting timeout
    const currentTimeoutIdx = this.timeoutCandidates.indexOf(current.resetTimeoutMs);
    if (currentTimeoutIdx >= 0) {
      // If recovery is slow, try shorter timeout
      const avgRecovery = this.observations
        .filter((o) => o.recoveryTimeMs > 0)
        .reduce((sum, o, _, arr) => sum + o.recoveryTimeMs / arr.length, 0);

      if (
        avgRecovery > current.resetTimeoutMs &&
        currentTimeoutIdx < this.timeoutCandidates.length - 1
      ) {
        return { ...current, resetTimeoutMs: this.timeoutCandidates[currentTimeoutIdx + 1]! };
      }
      if (avgRecovery < current.resetTimeoutMs * 0.3 && currentTimeoutIdx > 0) {
        return { ...current, resetTimeoutMs: this.timeoutCandidates[currentTimeoutIdx - 1]! };
      }
    }

    // Default: try next untried threshold
    const triedThresholds = new Set(this.history.map((h) => h.config.failureThreshold));
    const untried = this.thresholdCandidates.filter((t) => !triedThresholds.has(t));
    if (untried.length > 0) {
      return { ...current, failureThreshold: untried[0]! };
    }

    return current;
  }
}
