/**
 * Eval Manager — Orchestrates suite execution and lifecycle management.
 *
 * Responsible for:
 * - Running eval suites (sequentially or concurrently)
 * - Cost budget enforcement across scenarios
 * - Persisting results via EvalStore
 */

import { randomUUID } from 'node:crypto';
import type { SecureLogger } from '../logging/logger.js';
import { EvalStore } from './eval-store.js';
import { runScenario } from './eval-engine.js';
import type { EvalAgentDeps } from './eval-engine.js';
import type {
  EvalScenario,
  EvalSuite,
  ScenarioRunResult,
  SuiteRunResult,
  AgentEvalConfig,
} from '@secureyeoman/shared';

export interface EvalManagerDeps {
  logger: SecureLogger;
  agentDeps: EvalAgentDeps;
  config: AgentEvalConfig;
}

export class EvalManager {
  private readonly store: EvalStore;
  private readonly logger: SecureLogger;
  private readonly agentDeps: EvalAgentDeps;
  private readonly config: AgentEvalConfig;
  private readonly activeRuns = new Map<string, AbortController>();

  constructor(deps: EvalManagerDeps) {
    this.store = new EvalStore();
    this.logger = deps.logger;
    this.agentDeps = deps.agentDeps;
    this.config = deps.config;
  }

  // ── Scenario CRUD ─────────────────────────────────────────

  async createScenario(scenario: EvalScenario, tenantId?: string): Promise<EvalScenario> {
    return this.store.createScenario(scenario, tenantId);
  }

  async getScenario(id: string, tenantId?: string): Promise<EvalScenario | null> {
    return this.store.getScenario(id, tenantId);
  }

  async listScenarios(opts?: {
    category?: string;
    tenantId?: string;
    limit?: number;
    offset?: number;
  }) {
    return this.store.listScenarios(opts);
  }

  async updateScenario(id: string, updates: Partial<EvalScenario>, tenantId?: string) {
    return this.store.updateScenario(id, updates, tenantId);
  }

  async deleteScenario(id: string, tenantId?: string): Promise<boolean> {
    return this.store.deleteScenario(id, tenantId);
  }

  // ── Suite CRUD ────────────────────────────────────────────

  async createSuite(suite: EvalSuite, tenantId?: string): Promise<EvalSuite> {
    return this.store.createSuite(suite, tenantId);
  }

  async getSuite(id: string, tenantId?: string): Promise<EvalSuite | null> {
    return this.store.getSuite(id, tenantId);
  }

  async listSuites(opts?: { tenantId?: string; limit?: number; offset?: number }) {
    return this.store.listSuites(opts);
  }

  async deleteSuite(id: string, tenantId?: string): Promise<boolean> {
    return this.store.deleteSuite(id, tenantId);
  }

  // ── Suite Execution ───────────────────────────────────────

  async runSuite(suiteId: string, tenantId = 'default'): Promise<SuiteRunResult> {
    const suite = await this.store.getSuite(suiteId, tenantId);
    if (!suite) {
      throw new Error(`Suite not found: ${suiteId}`);
    }

    const runId = randomUUID();
    const controller = new AbortController();
    this.activeRuns.set(runId, controller);

    this.logger.info(
      {
        suiteId,
        runId,
        scenarioCount: suite.scenarioIds.length,
      },
      'Starting eval suite run'
    );

    const startedAt = Date.now();
    const results: ScenarioRunResult[] = [];
    let totalCostUsd = 0;
    const maxCost = suite.maxCostUsd ?? this.config.defaultMaxCostUsd;
    const concurrency = Math.min(suite.concurrency, this.config.maxConcurrency);

    // Load all scenarios
    const scenarios: EvalScenario[] = [];
    for (const sid of suite.scenarioIds) {
      const scenario = await this.store.getScenario(sid, tenantId);
      if (scenario) {
        scenarios.push(scenario);
      } else {
        this.logger.warn({ scenarioId: sid, suiteId }, 'Scenario not found, skipping');
      }
    }

    try {
      if (concurrency <= 1) {
        // Sequential execution
        for (const scenario of scenarios) {
          if (controller.signal.aborted) break;
          if (maxCost !== null && totalCostUsd >= maxCost) {
            results.push(buildBudgetExceeded(scenario));
            continue;
          }

          const result = await runScenario(scenario, this.agentDeps, controller.signal);
          results.push(result);
          totalCostUsd += result.costUsd;

          this.logger.info(
            {
              scenarioId: scenario.id,
              passed: result.passed,
              status: result.status,
              durationMs: result.durationMs,
            },
            'Scenario completed'
          );
        }
      } else {
        // Concurrent execution in batches
        for (let i = 0; i < scenarios.length; i += concurrency) {
          if (controller.signal.aborted) break;

          const batch = scenarios.slice(i, i + concurrency);
          const batchResults = await Promise.all(
            batch.map((scenario) => {
              if (maxCost !== null && totalCostUsd >= maxCost) {
                return Promise.resolve(buildBudgetExceeded(scenario));
              }
              return runScenario(scenario, this.agentDeps, controller.signal);
            })
          );

          for (const result of batchResults) {
            results.push(result);
            totalCostUsd += result.costUsd;
          }
        }
      }
    } finally {
      this.activeRuns.delete(runId);
    }

    const completedAt = Date.now();
    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.filter((r) => r.status === 'failed').length;
    const errorCount = results.filter(
      (r) => r.status === 'error' || r.status === 'timeout' || r.status === 'budget_exceeded'
    ).length;

    const suiteResult: SuiteRunResult = {
      id: runId,
      suiteId: suite.id,
      suiteName: suite.name,
      passed: passedCount === results.length,
      results,
      totalScenarios: results.length,
      passedCount,
      failedCount,
      errorCount,
      totalDurationMs: completedAt - startedAt,
      totalTokens: results.reduce((sum, r) => sum + r.totalTokens, 0),
      totalCostUsd,
      startedAt,
      completedAt,
    };

    // Persist results
    if (this.config.storeTraces) {
      await this.store.saveSuiteRun(suiteResult, tenantId);
    }

    this.logger.info(
      {
        runId,
        suiteId,
        passed: suiteResult.passed,
        passedCount,
        failedCount,
        errorCount,
        durationMs: suiteResult.totalDurationMs,
      },
      'Eval suite run completed'
    );

    return suiteResult;
  }

  /** Cancel a running suite execution. */
  cancelRun(runId: string): boolean {
    const controller = this.activeRuns.get(runId);
    if (controller) {
      controller.abort();
      this.activeRuns.delete(runId);
      return true;
    }
    return false;
  }

  // ── Run History ───────────────────────────────────────────

  async getSuiteRun(id: string, tenantId?: string): Promise<SuiteRunResult | null> {
    return this.store.getSuiteRun(id, tenantId);
  }

  async listSuiteRuns(opts?: {
    suiteId?: string;
    tenantId?: string;
    limit?: number;
    offset?: number;
  }) {
    return this.store.listSuiteRuns(opts);
  }

  /** Run a single scenario outside of a suite context (ad-hoc evaluation). */
  async runSingleScenario(scenarioId: string, tenantId = 'default'): Promise<ScenarioRunResult> {
    const scenario = await this.store.getScenario(scenarioId, tenantId);
    if (!scenario) {
      throw new Error(`Scenario not found: ${scenarioId}`);
    }

    this.logger.info({ scenarioId }, 'Running single scenario evaluation');
    const result = await runScenario(scenario, this.agentDeps);

    this.logger.info(
      {
        scenarioId,
        passed: result.passed,
        status: result.status,
        durationMs: result.durationMs,
      },
      'Single scenario evaluation completed'
    );

    return result;
  }

  /** Clean up old run results based on retention config. */
  async cleanupOldRuns(tenantId = 'default'): Promise<number> {
    const deleted = await this.store.deleteOldRuns(this.config.retentionDays, tenantId);
    if (deleted > 0) {
      this.logger.info(
        {
          deleted,
          retentionDays: this.config.retentionDays,
        },
        'Cleaned up old eval runs'
      );
    }
    return deleted;
  }
}

function buildBudgetExceeded(scenario: EvalScenario): ScenarioRunResult {
  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    passed: false,
    status: 'budget_exceeded',
    output: '',
    assertionResults: [],
    toolCalls: [],
    toolCallErrors: [],
    forbiddenToolCallViolations: [],
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    durationMs: 0,
    errorMessage: 'Suite cost budget exceeded before this scenario could run',
    personalityId: scenario.personalityId ?? undefined,
  };
}
