/**
 * Experiment Runner — Autonomous research loop inspired by Karpathy's autoresearch.
 *
 * Each experiment cycle:
 *   1. LLM proposes a hypothesis and parameter modifications
 *   2. Modifications are applied within bounded constraints
 *   3. Training runs for a fixed budget (time or steps)
 *   4. Results are evaluated against a quantifiable metric
 *   5. Best result is retained; experiment is journaled
 *   6. Cycle repeats on next tick (or group of ticks)
 *
 * Design principles (from autoresearch):
 *   - Fixed-budget experimentation: every run gets the same compute budget
 *   - Single-scope modification: constrain what the agent can change per cycle
 *   - Metric-driven optimization: every experiment has a measurable success criterion
 *   - Experiment journaling: full provenance for every run
 */

import type { TickEvent } from '@secureyeoman/shared';
import type { SecureLogger } from '../logging/logger.js';
import { uuidv7 } from '../utils/crypto.js';

// ── Types ───────────────────────────────────────────────────────────

export type ExperimentStatus =
  | 'pending'
  | 'running'
  | 'evaluating'
  | 'completed'
  | 'failed'
  | 'retained'
  | 'discarded';

export interface ExperimentBudget {
  /** Maximum wall-clock time per experiment in ms (default: 300_000 = 5 min) */
  maxDurationMs: number;
  /** Maximum training steps per experiment (0 = unlimited) */
  maxSteps: number;
  /** Maximum concurrent experiments (default: 1) */
  maxConcurrent: number;
}

export interface ExperimentConstraints {
  /** Keys that may be modified (whitelist). Empty = all allowed. */
  mutableKeys: string[];
  /** Value bounds per key: { learningRate: { min: 1e-6, max: 1e-2 } } */
  bounds: Record<string, { min?: number; max?: number }>;
  /** Keys that must never be modified (blacklist) */
  frozenKeys: string[];
}

export interface ExperimentHypothesis {
  /** Natural language description of what this experiment tests */
  description: string;
  /** Parameter modifications proposed by the LLM */
  modifications: Record<string, unknown>;
  /** Expected outcome / success criterion */
  expectedOutcome: string;
}

export interface ExperimentResult {
  /** Primary evaluation metric (e.g., val_bpb, loss, accuracy) */
  primaryMetric: number;
  /** Name of the primary metric */
  metricName: string;
  /** All computed metrics */
  metrics: Record<string, number>;
  /** Whether lower metric values are better (default: true for loss-like metrics) */
  lowerIsBetter: boolean;
}

export interface ExperimentRun {
  id: string;
  personalityId: string;
  sessionId: string;
  runNumber: number;
  hypothesis: ExperimentHypothesis;
  baselineParams: Record<string, unknown>;
  modifiedParams: Record<string, unknown>;
  status: ExperimentStatus;
  result: ExperimentResult | null;
  startedAt: number;
  completedAt: number | null;
  durationMs: number | null;
  retained: boolean;
  tick: number;
  errorMessage: string | null;
}

export interface ExperimentSession {
  id: string;
  personalityId: string;
  name: string;
  objective: string;
  metricName: string;
  lowerIsBetter: boolean;
  budget: ExperimentBudget;
  constraints: ExperimentConstraints;
  baselineParams: Record<string, unknown>;
  bestMetric: number | null;
  bestRunId: string | null;
  totalRuns: number;
  retainedRuns: number;
  discardedRuns: number;
  status: 'active' | 'paused' | 'completed';
  createdAt: number;
  updatedAt: number;
}

export interface ExperimentSessionCreate {
  name: string;
  objective: string;
  metricName: string;
  lowerIsBetter?: boolean;
  budget?: Partial<ExperimentBudget>;
  constraints?: Partial<ExperimentConstraints>;
  baselineParams: Record<string, unknown>;
}

// ── In-memory experiment store (supplements SimulationStore) ─────────

export interface ExperimentRunnerStore {
  saveSession(session: ExperimentSession): Promise<void>;
  getSession(sessionId: string): Promise<ExperimentSession | null>;
  listSessions(personalityId: string): Promise<ExperimentSession[]>;
  saveRun(run: ExperimentRun): Promise<void>;
  getRun(runId: string): Promise<ExperimentRun | null>;
  listRuns(sessionId: string, opts?: { limit?: number }): Promise<ExperimentRun[]>;
  getBestRun(sessionId: string): Promise<ExperimentRun | null>;
}

// ── Experiment Runner ───────────────────────────────────────────────

export interface ExperimentRunnerOpts {
  store: ExperimentRunnerStore;
  logger: SecureLogger;
  /** Callback: LLM proposes next experiment given session context + history */
  proposeExperiment?: (
    session: ExperimentSession,
    history: ExperimentRun[]
  ) => Promise<ExperimentHypothesis | null>;
  /** Callback: execute the actual training/simulation with given params */
  executeExperiment?: (
    session: ExperimentSession,
    params: Record<string, unknown>,
    budget: ExperimentBudget
  ) => Promise<ExperimentResult>;
  /** How many ticks between experiment cycles (default: 1) */
  ticksPerCycle?: number;
}

const DEFAULT_BUDGET: ExperimentBudget = {
  maxDurationMs: 300_000,
  maxSteps: 0,
  maxConcurrent: 1,
};

const DEFAULT_CONSTRAINTS: ExperimentConstraints = {
  mutableKeys: [],
  bounds: {},
  frozenKeys: [],
};

export class ExperimentRunner {
  private store: ExperimentRunnerStore;
  private logger: SecureLogger;
  private proposeExperiment?: ExperimentRunnerOpts['proposeExperiment'];
  private executeExperiment?: ExperimentRunnerOpts['executeExperiment'];
  private ticksPerCycle: number;
  private tickCounter = new Map<string, number>();
  private running = new Set<string>();

  constructor(opts: ExperimentRunnerOpts) {
    this.store = opts.store;
    this.logger = opts.logger;
    this.proposeExperiment = opts.proposeExperiment;
    this.executeExperiment = opts.executeExperiment;
    this.ticksPerCycle = opts.ticksPerCycle ?? 1;
  }

  // ── Session Management ────────────────────────────────────────────

  async createSession(
    personalityId: string,
    input: ExperimentSessionCreate
  ): Promise<ExperimentSession> {
    const session: ExperimentSession = {
      id: uuidv7(),
      personalityId,
      name: input.name,
      objective: input.objective,
      metricName: input.metricName,
      lowerIsBetter: input.lowerIsBetter ?? true,
      budget: { ...DEFAULT_BUDGET, ...input.budget },
      constraints: { ...DEFAULT_CONSTRAINTS, ...input.constraints },
      baselineParams: input.baselineParams,
      bestMetric: null,
      bestRunId: null,
      totalRuns: 0,
      retainedRuns: 0,
      discardedRuns: 0,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await this.store.saveSession(session);
    this.logger.info({ sessionId: session.id, personalityId }, 'experiment session created');
    return session;
  }

  async getSession(sessionId: string): Promise<ExperimentSession | null> {
    return this.store.getSession(sessionId);
  }

  async listSessions(personalityId: string): Promise<ExperimentSession[]> {
    return this.store.listSessions(personalityId);
  }

  async pauseSession(sessionId: string): Promise<ExperimentSession | null> {
    const session = await this.store.getSession(sessionId);
    if (!session) return null;
    session.status = 'paused';
    session.updatedAt = Date.now();
    await this.store.saveSession(session);
    return session;
  }

  async resumeSession(sessionId: string): Promise<ExperimentSession | null> {
    const session = await this.store.getSession(sessionId);
    if (!session || session.status === 'completed') return null;
    session.status = 'active';
    session.updatedAt = Date.now();
    await this.store.saveSession(session);
    return session;
  }

  async completeSession(sessionId: string): Promise<ExperimentSession | null> {
    const session = await this.store.getSession(sessionId);
    if (!session) return null;
    session.status = 'completed';
    session.updatedAt = Date.now();
    await this.store.saveSession(session);
    return session;
  }

  // ── Run Management ────────────────────────────────────────────────

  async listRuns(sessionId: string, opts?: { limit?: number }): Promise<ExperimentRun[]> {
    return this.store.listRuns(sessionId, opts);
  }

  async getBestRun(sessionId: string): Promise<ExperimentRun | null> {
    return this.store.getBestRun(sessionId);
  }

  // ── Manual Experiment Submission ──────────────────────────────────

  async submitExperiment(
    sessionId: string,
    hypothesis: ExperimentHypothesis
  ): Promise<ExperimentRun | null> {
    const session = await this.store.getSession(sessionId);
    if (session?.status !== 'active') return null;

    const validated = this.validateModifications(session, hypothesis.modifications);
    const params = { ...session.baselineParams, ...validated };

    return this.runExperiment(session, hypothesis, params);
  }

  // ── Tick Handler ──────────────────────────────────────────────────

  createTickHandler(): (event: TickEvent) => Promise<void> {
    return async (event: TickEvent) => {
      await this.onTick(event);
    };
  }

  async onTick(event: TickEvent): Promise<void> {
    const { personalityId, tick } = event;

    // Tick interval throttle
    const count = (this.tickCounter.get(personalityId) ?? 0) + 1;
    this.tickCounter.set(personalityId, count);
    if (count % this.ticksPerCycle !== 0) return;

    const sessions = await this.store.listSessions(personalityId);
    const active = sessions.filter((s) => s.status === 'active');

    for (const session of active) {
      if (this.running.has(session.id)) continue;
      if (!this.proposeExperiment || !this.executeExperiment) continue;

      try {
        this.running.add(session.id);
        const history = await this.store.listRuns(session.id, { limit: 20 });
        const hypothesis = await this.proposeExperiment(session, history);
        if (!hypothesis) {
          this.running.delete(session.id);
          continue;
        }

        const validated = this.validateModifications(session, hypothesis.modifications);
        const params = { ...session.baselineParams, ...validated };
        await this.runExperiment(session, hypothesis, params, tick);
      } catch (err) {
        this.logger.error({ err, sessionId: session.id }, 'autonomous experiment cycle failed');
      } finally {
        this.running.delete(session.id);
      }
    }
  }

  // ── Core Experiment Execution ─────────────────────────────────────

  private async runExperiment(
    session: ExperimentSession,
    hypothesis: ExperimentHypothesis,
    params: Record<string, unknown>,
    tick = 0
  ): Promise<ExperimentRun> {
    const now = Date.now();
    const run: ExperimentRun = {
      id: uuidv7(),
      personalityId: session.personalityId,
      sessionId: session.id,
      runNumber: session.totalRuns + 1,
      hypothesis,
      baselineParams: session.baselineParams,
      modifiedParams: params,
      status: 'running',
      result: null,
      startedAt: now,
      completedAt: null,
      durationMs: null,
      retained: false,
      tick,
      errorMessage: null,
    };

    await this.store.saveRun(run);

    if (this.executeExperiment) {
      try {
        run.status = 'evaluating';
        const result = await this.executeExperiment(session, params, session.budget);
        run.result = result;
        run.completedAt = Date.now();
        run.durationMs = run.completedAt - run.startedAt;

        // Determine if this run beats the current best
        const isBetter = this.isBetterResult(session, result.primaryMetric);
        run.retained = isBetter;
        run.status = isBetter ? 'retained' : 'discarded';

        // Update session stats
        session.totalRuns++;
        if (isBetter) {
          session.bestMetric = result.primaryMetric;
          session.bestRunId = run.id;
          session.retainedRuns++;
          // Promote modified params as new baseline for next cycle
          session.baselineParams = params;
        } else {
          session.discardedRuns++;
        }
        run.status = isBetter ? 'retained' : 'discarded';
      } catch (err) {
        run.status = 'failed';
        run.completedAt = Date.now();
        run.durationMs = run.completedAt - run.startedAt;
        run.errorMessage = err instanceof Error ? err.message : String(err);
        session.totalRuns++;
      }
    } else {
      // No executor — mark as completed with no result (manual evaluation)
      run.status = 'completed';
      run.completedAt = Date.now();
      run.durationMs = 0;
      session.totalRuns++;
    }

    session.updatedAt = Date.now();
    await this.store.saveSession(session);
    await this.store.saveRun(run);

    this.logger.info(
      {
        runId: run.id,
        sessionId: session.id,
        status: run.status,
        metric: run.result?.primaryMetric,
        retained: run.retained,
      },
      'experiment run completed'
    );

    return run;
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private isBetterResult(session: ExperimentSession, metric: number): boolean {
    if (session.bestMetric == null) return true;
    return session.lowerIsBetter ? metric < session.bestMetric : metric > session.bestMetric;
  }

  validateModifications(
    session: ExperimentSession,
    mods: Record<string, unknown>
  ): Record<string, unknown> {
    const { constraints } = session;
    const validated: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(mods)) {
      // Frozen key check
      if (constraints.frozenKeys.includes(key)) continue;

      // Mutable key whitelist check
      if (constraints.mutableKeys.length > 0 && !constraints.mutableKeys.includes(key)) continue;

      // Numeric bounds check
      const bound = constraints.bounds[key];
      if (bound && typeof value === 'number') {
        let clamped = value;
        if (bound.min != null) clamped = Math.max(bound.min, clamped);
        if (bound.max != null) clamped = Math.min(bound.max, clamped);
        validated[key] = clamped;
      } else {
        validated[key] = value;
      }
    }

    return validated;
  }
}
