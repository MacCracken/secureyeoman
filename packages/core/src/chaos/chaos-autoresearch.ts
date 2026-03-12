/**
 * ChaosAutoresearch — Applies autoresearch patterns to chaos experiments.
 *
 * Turns chaos engineering from one-shot experiments into an iterative
 * improvement loop:
 *   1. Run experiment → collect recovery metrics
 *   2. Retain if resilience improved (faster recovery, fewer failures)
 *   3. Propose next experiment: escalate if passing, investigate if failing
 *   4. Track hypothesis journal for each chaos run
 *
 * Integrates with ExperimentRunner for the retain/discard loop.
 */

import type { SecureLogger } from '../logging/logger.js';
import type {
  ExperimentSession,
  ExperimentBudget,
  ExperimentResult,
  ExperimentHypothesis,
} from '../simulation/experiment-runner.js';

// ── Types ──────────────────────────────────────────────────────────────

export interface ChaosTrialResult {
  /** Total faults injected in the trial */
  totalFaults: number;
  /** How many faults the system recovered from */
  faultsRecovered: number;
  /** Average recovery time in ms */
  meanRecoveryTimeMs: number;
  /** Circuit breakers that tripped */
  circuitBreakersTripped: number;
  /** Overall pass/fail */
  passed: boolean;
}

export interface ResilienceBaseline {
  /** Recovery rate: faultsRecovered / totalFaults (0-1, higher is better) */
  recoveryRate: number;
  /** Mean recovery time in ms (lower is better) */
  meanRecoveryTimeMs: number;
  /** Number of chaos trials that contributed to this baseline */
  trialCount: number;
}

export interface ChaosEscalation {
  /** Current fault intensity level (1=mild, 2=moderate, 3=severe) */
  level: number;
  /** Number of consecutive passes at current level */
  consecutivePasses: number;
  /** Passes needed to escalate */
  passesForEscalation: number;
}

export interface ChaosAutoresearchOpts {
  logger: SecureLogger;
  /** Target types to experiment with */
  targetTypes?: string[];
  /** How many consecutive passes before escalating fault intensity */
  passesForEscalation?: number;
  /** Maximum escalation level */
  maxEscalationLevel?: number;
  /** Maximum wall-clock time per chaos trial in ms (default: 120_000 = 2 min) */
  maxDurationMs?: number;
  /** Callback to run a chaos experiment and get metrics */
  runChaosExperiment?: (params: Record<string, unknown>) => Promise<ChaosTrialResult>;
}

export class ChaosAutoresearch {
  private logger: SecureLogger;
  private targetTypes: string[];
  private passesForEscalation: number;
  private maxEscalationLevel: number;
  private maxDurationMs: number;
  private runChaosExperiment?: (params: Record<string, unknown>) => Promise<ChaosTrialResult>;

  // State
  private history: {
    params: Record<string, unknown>;
    result: ChaosTrialResult;
    retained: boolean;
  }[] = [];
  private escalation: ChaosEscalation;
  private baseline: ResilienceBaseline = {
    recoveryRate: 0,
    meanRecoveryTimeMs: Infinity,
    trialCount: 0,
  };

  constructor(opts: ChaosAutoresearchOpts) {
    this.logger = opts.logger;
    this.targetTypes = opts.targetTypes ?? ['workflow_step', 'ai_provider', 'integration'];
    this.passesForEscalation = opts.passesForEscalation ?? 3;
    this.maxEscalationLevel = opts.maxEscalationLevel ?? 5;
    this.maxDurationMs = opts.maxDurationMs ?? 120_000;
    this.runChaosExperiment = opts.runChaosExperiment;
    this.escalation = {
      level: 1,
      consecutivePasses: 0,
      passesForEscalation: this.passesForEscalation,
    };
  }

  /**
   * Returns a propose callback for ExperimentRunner.
   * Generates chaos hypotheses based on escalation level and history.
   */
  createProposer(): (session: ExperimentSession) => Promise<ExperimentHypothesis | null> {
    return async (_session) => {
      const level = this.escalation.level;
      const target = this.targetTypes[this.history.length % this.targetTypes.length]!;
      const faultCount = level; // More faults at higher levels
      const probability = Math.min(0.3 + level * 0.15, 1.0); // 0.45 → 1.0

      const modifications: Record<string, unknown> = {
        targetType: target,
        faultCount,
        probability,
        escalationLevel: level,
      };

      const description =
        level === 1
          ? `Baseline: inject ${faultCount} fault(s) on ${target} at p=${probability}`
          : `Escalation L${level}: inject ${faultCount} concurrent fault(s) on ${target} at p=${probability}`;

      const expectedOutcome =
        this.baseline.trialCount === 0
          ? 'Establish resilience baseline'
          : `System should recover ≥${(this.baseline.recoveryRate * 100).toFixed(0)}% of faults within ${this.baseline.meanRecoveryTimeMs}ms`;

      return { description, modifications, expectedOutcome };
    };
  }

  /**
   * Returns an executor callback for ExperimentRunner.
   * Runs the chaos trial and computes a composite resilience score.
   */
  createExecutor(): (
    session: ExperimentSession,
    params: Record<string, unknown>,
    budget: ExperimentBudget
  ) => Promise<ExperimentResult> {
    return async (session, params, _budget) => {
      let trialResult: ChaosTrialResult;

      if (this.runChaosExperiment) {
        trialResult = await this.runChaosExperiment(params);
      } else {
        // Simulated result based on escalation level
        const level = (params.escalationLevel as number) ?? 1;
        trialResult = {
          totalFaults: (params.faultCount as number) ?? 1,
          faultsRecovered: Math.max(
            0,
            ((params.faultCount as number) ?? 1) - Math.floor(level / 3)
          ),
          meanRecoveryTimeMs: 100 + level * 50,
          circuitBreakersTripped: level > 2 ? 1 : 0,
          passed: level < 4,
        };
      }

      const recoveryRate =
        trialResult.totalFaults > 0 ? trialResult.faultsRecovered / trialResult.totalFaults : 1;

      // Composite resilience score: high recovery + fast recovery = good
      // Normalized to 0-1 range, higher is better
      const speedScore = Math.max(0, 1 - trialResult.meanRecoveryTimeMs / 10_000);
      const resilienceScore = recoveryRate * 0.7 + speedScore * 0.3;

      const metrics: Record<string, number> = {
        resilience_score: resilienceScore,
        recovery_rate: recoveryRate,
        mean_recovery_ms: trialResult.meanRecoveryTimeMs,
        faults_injected: trialResult.totalFaults,
        faults_recovered: trialResult.faultsRecovered,
        circuit_breakers_tripped: trialResult.circuitBreakersTripped,
        escalation_level: this.escalation.level,
      };

      return {
        primaryMetric: resilienceScore,
        metricName: session.metricName,
        metrics,
        lowerIsBetter: false, // higher resilience is better
      };
    };
  }

  /**
   * Record a chaos trial result and update escalation state.
   */
  recordResult(params: Record<string, unknown>, result: ChaosTrialResult, retained: boolean): void {
    this.history.push({ params, result, retained });

    if (retained) {
      // Update baseline from retained results
      const retainedResults = this.history.filter((h) => h.retained).map((h) => h.result);
      const totalRecoveryRate =
        retainedResults.reduce(
          (sum, r) => sum + (r.totalFaults > 0 ? r.faultsRecovered / r.totalFaults : 1),
          0
        ) / retainedResults.length;
      const totalRecoveryMs =
        retainedResults.reduce((sum, r) => sum + r.meanRecoveryTimeMs, 0) / retainedResults.length;

      this.baseline = {
        recoveryRate: totalRecoveryRate,
        meanRecoveryTimeMs: totalRecoveryMs,
        trialCount: retainedResults.length,
      };
    }

    // Update escalation
    if (result.passed) {
      this.escalation.consecutivePasses++;
      if (this.escalation.consecutivePasses >= this.passesForEscalation) {
        if (this.escalation.level < this.maxEscalationLevel) {
          this.escalation.level++;
          this.escalation.consecutivePasses = 0;
          this.logger.info({ newLevel: this.escalation.level }, 'Chaos escalation level increased');
        }
      }
    } else {
      // Failure resets consecutive passes but doesn't lower level
      this.escalation.consecutivePasses = 0;
    }
  }

  /** Get max duration per trial in ms */
  getMaxDurationMs(): number {
    return this.maxDurationMs;
  }

  /** Get current escalation state */
  getEscalation(): Readonly<ChaosEscalation> {
    return { ...this.escalation };
  }

  /** Get current resilience baseline */
  getBaseline(): Readonly<ResilienceBaseline> {
    return { ...this.baseline };
  }

  /** Get trial history */
  getHistory(): readonly {
    params: Record<string, unknown>;
    result: ChaosTrialResult;
    retained: boolean;
  }[] {
    return this.history;
  }
}
