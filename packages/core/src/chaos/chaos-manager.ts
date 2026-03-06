/**
 * Chaos Manager — orchestrates the chaos engineering lifecycle.
 *
 * Coordinates experiment creation, scheduling, execution, and result
 * tracking. Enforces safety limits and manages concurrent experiments.
 */

import type { Logger } from 'pino';
import type {
  ChaosEngineeringConfig,
  ChaosExperiment,
  ChaosExperimentCreate,
  ChaosExperimentStatus,
  ChaosExperimentResult,
  FaultInjectionResult,
} from '@secureyeoman/shared';
import { FaultInjector } from './fault-injector.js';
import type { ChaosStore } from './chaos-store.js';

export interface ChaosManagerDeps {
  store: ChaosStore;
  config: ChaosEngineeringConfig;
  log: Logger;
}

export class ChaosManager {
  private readonly injector: FaultInjector;
  private readonly store: ChaosStore;
  private readonly config: ChaosEngineeringConfig;
  private readonly log: Logger;
  private readonly runningExperiments = new Map<string, { abort: () => void }>();
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;

  constructor(deps: ChaosManagerDeps) {
    this.store = deps.store;
    this.config = deps.config;
    this.log = deps.log;
    this.injector = new FaultInjector({ log: deps.log });
  }

  /** Start the scheduler that checks for scheduled experiments. */
  start(): void {
    this.schedulerTimer = setInterval(() => {
      this.checkScheduledExperiments().catch((err) => {
        this.log.error({ err }, 'Chaos scheduler check failed');
      });
    }, 10_000);
    this.log.info('Chaos engineering scheduler started');
  }

  stop(): void {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    this.abortAll();
  }

  // ── Experiment CRUD ────────────────────────────────────────────

  async createExperiment(input: ChaosExperimentCreate): Promise<ChaosExperiment> {
    this.validateExperiment(input);

    const experiment: ChaosExperiment = {
      ...input,
      id: `chaos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: 'draft',
      startedAt: 0,
      completedAt: 0,
      createdAt: Date.now(),
    };

    await this.store.saveExperiment(experiment);
    this.log.info(
      { experimentId: experiment.id, name: experiment.name },
      'Chaos experiment created'
    );
    return experiment;
  }

  async getExperiment(id: string): Promise<ChaosExperiment | null> {
    return this.store.getExperiment(id);
  }

  async listExperiments(opts?: {
    status?: ChaosExperimentStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ items: ChaosExperiment[]; total: number }> {
    return this.store.listExperiments(opts);
  }

  async deleteExperiment(id: string): Promise<boolean> {
    if (this.runningExperiments.has(id)) {
      throw new Error('Cannot delete a running experiment — abort it first');
    }
    await this.store.deleteResults(id);
    return this.store.deleteExperiment(id);
  }

  // ── Experiment Execution ───────────────────────────────────────

  async runExperiment(id: string): Promise<ChaosExperimentResult> {
    const experiment = await this.store.getExperiment(id);
    if (!experiment) throw new Error(`Experiment ${id} not found`);

    if (experiment.status === 'running') {
      throw new Error(`Experiment ${id} is already running`);
    }

    if (this.runningExperiments.size >= this.config.maxConcurrentExperiments) {
      throw new Error(
        `Max concurrent experiments (${this.config.maxConcurrentExperiments}) reached`
      );
    }

    if (experiment.durationMs > this.config.maxExperimentDurationMs) {
      throw new Error(
        `Experiment duration ${experiment.durationMs}ms exceeds max ${this.config.maxExperimentDurationMs}ms`
      );
    }

    // Validate target types
    for (const rule of experiment.rules) {
      if (!this.config.allowedTargetTypes.includes(rule.targetType)) {
        throw new Error(
          `Target type '${rule.targetType}' is not allowed. Allowed: ${this.config.allowedTargetTypes.join(', ')}`
        );
      }
    }

    const startTime = Date.now();
    await this.store.updateExperimentStatus(id, 'running', { startedAt: startTime });

    let aborted = false;
    const abortController = {
      abort: () => {
        aborted = true;
      },
    };
    this.runningExperiments.set(id, abortController);

    const faultResults: FaultInjectionResult[] = [];
    let status: ChaosExperimentResult['status'] = 'passed';

    this.log.info(
      { experimentId: id, ruleCount: experiment.rules.length },
      'Starting chaos experiment'
    );

    try {
      // Execute each fault rule
      for (const rule of experiment.rules) {
        if (aborted) {
          status = 'aborted';
          break;
        }

        if (!rule.enabled) continue;

        const result = await this.injector.inject(rule);
        faultResults.push(result);

        if (result.error && experiment.rollbackOnFailure) {
          status = 'failed';
          this.log.warn(
            { ruleId: rule.id, error: result.error },
            'Fault injection error — rolling back'
          );
          break;
        }
      }
    } catch (err) {
      status = 'failed';
      this.log.error({ err, experimentId: id }, 'Chaos experiment failed');
    } finally {
      this.runningExperiments.delete(id);
    }

    const completedAt = Date.now();
    const endStatus =
      status === 'passed' ? 'completed' : status === 'aborted' ? 'aborted' : 'failed';
    await this.store.updateExperimentStatus(id, endStatus, { completedAt });

    const metrics = this.computeMetrics(faultResults);
    const experimentResult: ChaosExperimentResult & { id: string } = {
      id: `result-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      experimentId: id,
      status,
      startedAt: startTime,
      completedAt,
      durationMs: completedAt - startTime,
      faultResults,
      steadyStateValidated: status === 'passed',
      summary: this.buildSummary(experiment, faultResults, status),
      metrics,
    };

    await this.store.saveResult(experimentResult);

    this.log.info(
      { experimentId: id, status, durationMs: experimentResult.durationMs, metrics },
      'Chaos experiment completed'
    );

    return experimentResult;
  }

  async scheduleExperiment(id: string, scheduledAt: number): Promise<ChaosExperiment> {
    const experiment = await this.store.getExperiment(id);
    if (!experiment) throw new Error(`Experiment ${id} not found`);

    experiment.status = 'scheduled';
    experiment.scheduledAt = scheduledAt;
    await this.store.saveExperiment(experiment);

    this.log.info(
      { experimentId: id, scheduledAt: new Date(scheduledAt).toISOString() },
      'Chaos experiment scheduled'
    );

    return experiment;
  }

  async abortExperiment(id: string): Promise<boolean> {
    const handle = this.runningExperiments.get(id);
    if (handle) {
      handle.abort();
      this.injector.abortAll();
      this.runningExperiments.delete(id);
      await this.store.updateExperimentStatus(id, 'aborted', { completedAt: Date.now() });
      this.log.info({ experimentId: id }, 'Chaos experiment aborted');
      return true;
    }
    return false;
  }

  async getResults(experimentId: string): Promise<ChaosExperimentResult[]> {
    return this.store.getResults(experimentId);
  }

  get runningCount(): number {
    return this.runningExperiments.size;
  }

  // ── Private ────────────────────────────────────────────────────

  private abortAll(): void {
    for (const [id, handle] of this.runningExperiments) {
      handle.abort();
      this.log.info({ experimentId: id }, 'Aborted running experiment on shutdown');
    }
    this.injector.abortAll();
    this.runningExperiments.clear();
  }

  private async checkScheduledExperiments(): Promise<void> {
    const { items } = await this.store.listExperiments({ status: 'scheduled', limit: 10 });
    const now = Date.now();

    for (const exp of items) {
      if (exp.scheduledAt > 0 && exp.scheduledAt <= now) {
        this.runExperiment(exp.id).catch((err) => {
          this.log.error({ err, experimentId: exp.id }, 'Scheduled experiment failed to start');
        });
      }
    }
  }

  private validateExperiment(input: ChaosExperimentCreate): void {
    if (!input.rules || input.rules.length === 0) {
      throw new Error('Experiment must have at least one fault rule');
    }

    if (input.durationMs > this.config.maxExperimentDurationMs) {
      throw new Error(
        `Duration ${input.durationMs}ms exceeds max ${this.config.maxExperimentDurationMs}ms`
      );
    }

    const ruleIds = new Set<string>();
    for (const rule of input.rules) {
      if (ruleIds.has(rule.id)) {
        throw new Error(`Duplicate rule ID: ${rule.id}`);
      }
      ruleIds.add(rule.id);
    }
  }

  private computeMetrics(results: FaultInjectionResult[]): ChaosExperimentResult['metrics'] {
    const total = results.length;
    const recovered = results.filter((r) => r.recovered).length;
    const recoveryTimes = results
      .filter((r) => r.recovered && r.recoveryTimeMs > 0)
      .map((r) => r.recoveryTimeMs);

    const meanRecoveryTimeMs =
      recoveryTimes.length > 0
        ? Math.round(recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length)
        : 0;

    const circuitBreakersTripped = results.filter(
      (r) => r.faultType === 'circuit_breaker_trip'
    ).length;

    return {
      totalFaultsInjected: total,
      faultsRecovered: recovered,
      meanRecoveryTimeMs,
      circuitBreakersTripped,
    };
  }

  private buildSummary(
    experiment: ChaosExperiment,
    results: FaultInjectionResult[],
    status: string
  ): string {
    const total = results.length;
    const recovered = results.filter((r) => r.recovered).length;
    return `Experiment '${experiment.name}': ${status}. ${total} faults injected, ${recovered}/${total} recovered.`;
  }
}
