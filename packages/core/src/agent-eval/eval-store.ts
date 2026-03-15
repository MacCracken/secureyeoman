/**
 * Eval Store — Persistent storage for eval scenarios, suites, and run results.
 *
 * Extends PgBaseStorage for PostgreSQL access.
 */

import { randomUUID } from 'node:crypto';
import { PgBaseStorage } from '../storage/pg-base.js';
import { buildWhere, buildSet, parseCount } from '../storage/query-helpers.js';
import type {
  EvalScenario,
  EvalSuite,
  ScenarioRunResult,
  SuiteRunResult,
} from '@secureyeoman/shared';

// ─── Row Mappers ────────────────────────────────────────────────

function rowToScenario(row: Record<string, unknown>): EvalScenario {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? '',
    category: (row.category as string) ?? 'general',
    tags: (row.tags as string[]) ?? [],
    input: row.input as string,
    conversationHistory:
      (row.conversation_history as { role: 'user' | 'assistant'; content: string }[]) ?? [],
    expectedToolCalls: (row.expected_tool_calls as EvalScenario['expectedToolCalls']) ?? [],
    orderedToolCalls: (row.ordered_tool_calls as boolean) ?? false,
    forbiddenToolCalls: (row.forbidden_tool_calls as string[]) ?? [],
    outputAssertions: (row.output_assertions as EvalScenario['outputAssertions']) ?? [],
    maxTokens: (row.max_tokens as number) ?? null,
    maxDurationMs: (row.max_duration_ms as number) ?? 60000,
    personalityId: (row.personality_id as string) ?? null,
    skillIds: (row.skill_ids as string[]) ?? [],
    model: (row.model as string) ?? null,
  };
}

function rowToSuite(row: Record<string, unknown>): EvalSuite {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? '',
    scenarioIds: (row.scenario_ids as string[]) ?? [],
    maxCostUsd: (row.max_cost_usd as number) ?? null,
    concurrency: (row.concurrency as number) ?? 1,
  };
}

function rowToScenarioResult(row: Record<string, unknown>): ScenarioRunResult {
  return {
    scenarioId: row.scenario_id as string,
    scenarioName: row.scenario_name as string,
    passed: row.passed as boolean,
    status: row.status as ScenarioRunResult['status'],
    output: (row.output as string) ?? '',
    assertionResults: (row.assertion_results as ScenarioRunResult['assertionResults']) ?? [],
    toolCalls: (row.tool_calls as ScenarioRunResult['toolCalls']) ?? [],
    toolCallErrors: (row.tool_call_errors as string[]) ?? [],
    forbiddenToolCallViolations: (row.forbidden_violations as string[]) ?? [],
    inputTokens: (row.input_tokens as number) ?? 0,
    outputTokens: (row.output_tokens as number) ?? 0,
    totalTokens: (row.total_tokens as number) ?? 0,
    costUsd: (row.cost_usd as number) ?? 0,
    durationMs: (row.duration_ms as number) ?? 0,
    errorMessage: (row.error_message as string) ?? undefined,
    model: (row.model as string) ?? undefined,
    personalityId: (row.personality_id as string) ?? undefined,
  };
}

function rowToSuiteResult(
  row: Record<string, unknown>,
  results: ScenarioRunResult[]
): SuiteRunResult {
  return {
    id: row.id as string,
    suiteId: row.suite_id as string,
    suiteName: row.suite_name as string,
    passed: row.passed as boolean,
    results,
    totalScenarios: (row.total_scenarios as number) ?? 0,
    passedCount: (row.passed_count as number) ?? 0,
    failedCount: (row.failed_count as number) ?? 0,
    errorCount: (row.error_count as number) ?? 0,
    totalDurationMs: (row.total_duration_ms as number) ?? 0,
    totalTokens: (row.total_tokens as number) ?? 0,
    totalCostUsd: (row.total_cost_usd as number) ?? 0,
    startedAt: (row.started_at as number) ?? 0,
    completedAt: (row.completed_at as number) ?? 0,
  };
}

// ─── Store ──────────────────────────────────────────────────────

export class EvalStore extends PgBaseStorage {
  // ── Scenarios ───────────────────────────────────────────

  async createScenario(scenario: EvalScenario, tenantId = 'default'): Promise<EvalScenario> {
    const now = Date.now();
    await this.execute(
      `INSERT INTO eval.scenarios (
        id, name, description, category, tags, input,
        conversation_history, expected_tool_calls, ordered_tool_calls,
        forbidden_tool_calls, output_assertions, max_tokens,
        max_duration_ms, personality_id, skill_ids, model,
        tenant_id, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [
        scenario.id,
        scenario.name,
        scenario.description,
        scenario.category,
        JSON.stringify(scenario.tags),
        scenario.input,
        JSON.stringify(scenario.conversationHistory),
        JSON.stringify(scenario.expectedToolCalls),
        scenario.orderedToolCalls,
        JSON.stringify(scenario.forbiddenToolCalls),
        JSON.stringify(scenario.outputAssertions),
        scenario.maxTokens,
        scenario.maxDurationMs,
        scenario.personalityId,
        JSON.stringify(scenario.skillIds),
        scenario.model,
        tenantId,
        now,
        now,
      ]
    );
    return scenario;
  }

  async getScenario(id: string, tenantId = 'default'): Promise<EvalScenario | null> {
    const row = await this.queryOne<Record<string, unknown>>(
      'SELECT * FROM eval.scenarios WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    return row ? rowToScenario(row) : null;
  }

  async listScenarios(
    opts: { category?: string; tenantId?: string; limit?: number; offset?: number } = {}
  ): Promise<{ items: EvalScenario[]; total: number }> {
    const { where, values, nextIdx } = buildWhere([
      { column: 'tenant_id', value: opts.tenantId ?? 'default' },
      { column: 'category', value: opts.category },
    ]);

    const countResult = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count FROM eval.scenarios ${where}`,
      values
    );
    const total = parseCount(countResult);

    const limit = Math.min(opts.limit ?? 100, 500);
    const offset = opts.offset ?? 0;
    let idx = nextIdx;
    const rows = await this.queryMany<Record<string, unknown>>(
      `SELECT * FROM eval.scenarios ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...values, limit, offset]
    );

    return { items: rows.map(rowToScenario), total };
  }

  async deleteScenario(id: string, tenantId = 'default'): Promise<boolean> {
    const count = await this.execute(
      'DELETE FROM eval.scenarios WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    return count > 0;
  }

  async updateScenario(
    id: string,
    updates: Partial<EvalScenario>,
    tenantId = 'default'
  ): Promise<EvalScenario | null> {
    const u = updates as Record<string, unknown>;
    const has = (key: string) => (key in updates ? u[key] : undefined);

    const { setClause, values, nextIdx, hasUpdates } = buildSet([
      { column: 'name', value: has('name') },
      { column: 'description', value: has('description') },
      { column: 'category', value: has('category') },
      { column: 'input', value: has('input') },
      { column: 'ordered_tool_calls', value: has('orderedToolCalls') },
      { column: 'max_tokens', value: has('maxTokens') },
      { column: 'max_duration_ms', value: has('maxDurationMs') },
      { column: 'personality_id', value: has('personalityId') },
      { column: 'model', value: has('model') },
      { column: 'tags', value: has('tags'), json: true },
      { column: 'conversation_history', value: has('conversationHistory'), json: true },
      { column: 'expected_tool_calls', value: has('expectedToolCalls'), json: true },
      { column: 'forbidden_tool_calls', value: has('forbiddenToolCalls'), json: true },
      { column: 'output_assertions', value: has('outputAssertions'), json: true },
      { column: 'skill_ids', value: has('skillIds'), json: true },
    ]);

    if (!hasUpdates) return this.getScenario(id, tenantId);

    // Append updated_at timestamp
    const fullSetClause = `${setClause}, updated_at = $${nextIdx}`;
    values.push(Date.now());

    let idx = nextIdx + 1;
    values.push(id, tenantId);

    await this.execute(
      `UPDATE eval.scenarios SET ${fullSetClause} WHERE id = $${idx++} AND tenant_id = $${idx}`,
      values
    );

    return this.getScenario(id, tenantId);
  }

  // ── Suites ──────────────────────────────────────────────

  async createSuite(suite: EvalSuite, tenantId = 'default'): Promise<EvalSuite> {
    const now = Date.now();
    await this.execute(
      `INSERT INTO eval.suites (id, name, description, scenario_ids, max_cost_usd, concurrency, tenant_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        suite.id,
        suite.name,
        suite.description,
        JSON.stringify(suite.scenarioIds),
        suite.maxCostUsd,
        suite.concurrency,
        tenantId,
        now,
        now,
      ]
    );
    return suite;
  }

  async getSuite(id: string, tenantId = 'default'): Promise<EvalSuite | null> {
    const row = await this.queryOne<Record<string, unknown>>(
      'SELECT * FROM eval.suites WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    return row ? rowToSuite(row) : null;
  }

  async listSuites(
    opts: { tenantId?: string; limit?: number; offset?: number } = {}
  ): Promise<{ items: EvalSuite[]; total: number }> {
    const tenantId = opts.tenantId ?? 'default';
    const countResult = await this.queryOne<{ count: string }>(
      'SELECT COUNT(*)::TEXT AS count FROM eval.suites WHERE tenant_id = $1',
      [tenantId]
    );
    const total = parseCount(countResult);

    const limit = Math.min(opts.limit ?? 100, 500);
    const offset = opts.offset ?? 0;
    const rows = await this.queryMany<Record<string, unknown>>(
      'SELECT * FROM eval.suites WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [tenantId, limit, offset]
    );

    return { items: rows.map(rowToSuite), total };
  }

  async deleteSuite(id: string, tenantId = 'default'): Promise<boolean> {
    const count = await this.execute('DELETE FROM eval.suites WHERE id = $1 AND tenant_id = $2', [
      id,
      tenantId,
    ]);
    return count > 0;
  }

  // ── Run Results ─────────────────────────────────────────

  async saveSuiteRun(result: SuiteRunResult, tenantId = 'default'): Promise<void> {
    await this.execute(
      `INSERT INTO eval.suite_runs (
        id, suite_id, suite_name, passed, total_scenarios, passed_count,
        failed_count, error_count, total_duration_ms, total_tokens,
        total_cost_usd, started_at, completed_at, tenant_id, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        result.id,
        result.suiteId,
        result.suiteName,
        result.passed,
        result.totalScenarios,
        result.passedCount,
        result.failedCount,
        result.errorCount,
        result.totalDurationMs,
        result.totalTokens,
        result.totalCostUsd,
        result.startedAt,
        result.completedAt,
        tenantId,
        Date.now(),
      ]
    );

    // Save individual scenario results
    for (const sr of result.results) {
      const srId = randomUUID();
      await this.execute(
        `INSERT INTO eval.scenario_runs (
          id, suite_run_id, scenario_id, scenario_name, passed, status,
          output, assertion_results, tool_calls, tool_call_errors,
          forbidden_violations, input_tokens, output_tokens, total_tokens,
          cost_usd, duration_ms, error_message, model, personality_id,
          tenant_id, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
        [
          srId,
          result.id,
          sr.scenarioId,
          sr.scenarioName,
          sr.passed,
          sr.status,
          sr.output,
          JSON.stringify(sr.assertionResults),
          JSON.stringify(sr.toolCalls),
          JSON.stringify(sr.toolCallErrors),
          JSON.stringify(sr.forbiddenToolCallViolations),
          sr.inputTokens,
          sr.outputTokens,
          sr.totalTokens,
          sr.costUsd,
          sr.durationMs,
          sr.errorMessage ?? null,
          sr.model ?? null,
          sr.personalityId ?? null,
          tenantId,
          Date.now(),
        ]
      );
    }
  }

  async getSuiteRun(id: string, tenantId = 'default'): Promise<SuiteRunResult | null> {
    const row = await this.queryOne<Record<string, unknown>>(
      'SELECT * FROM eval.suite_runs WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    if (!row) return null;

    const scenarioRows = await this.queryMany<Record<string, unknown>>(
      'SELECT * FROM eval.scenario_runs WHERE suite_run_id = $1 ORDER BY created_at',
      [id]
    );

    return rowToSuiteResult(row, scenarioRows.map(rowToScenarioResult));
  }

  async listSuiteRuns(
    opts: { suiteId?: string; tenantId?: string; limit?: number; offset?: number } = {}
  ): Promise<{ items: SuiteRunResult[]; total: number }> {
    const { where, values, nextIdx } = buildWhere([
      { column: 'tenant_id', value: opts.tenantId ?? 'default' },
      { column: 'suite_id', value: opts.suiteId },
    ]);

    const countResult = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count FROM eval.suite_runs ${where}`,
      values
    );
    const total = parseCount(countResult);

    const limit = Math.min(opts.limit ?? 50, 200);
    const offset = opts.offset ?? 0;
    let idx = nextIdx;
    const rows = await this.queryMany<Record<string, unknown>>(
      `SELECT * FROM eval.suite_runs ${where} ORDER BY started_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...values, limit, offset]
    );

    // For list view, don't load full scenario results — return empty arrays
    const items = rows.map((r) => rowToSuiteResult(r, []));
    return { items, total };
  }

  async deleteOldRuns(retentionDays: number, tenantId = 'default'): Promise<number> {
    const cutoff = Date.now() - retentionDays * 86_400_000;
    const count = await this.execute(
      'DELETE FROM eval.suite_runs WHERE started_at < $1 AND tenant_id = $2',
      [cutoff, tenantId]
    );
    return count;
  }
}
