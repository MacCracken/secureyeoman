/**
 * Unit tests for EvalStore — eval scenarios, suites, and run results storage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.hoisted(() => vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }));

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: mockQuery }),
}));

vi.mock('node:crypto', async (importOriginal) => {
  const orig = await importOriginal<typeof import('node:crypto')>();
  return {
    ...orig,
    randomUUID: () => 'mock-uuid-1234',
  };
});

import { EvalStore } from './eval-store.js';
import type {
  EvalScenario,
  EvalSuite,
  ScenarioRunResult,
  SuiteRunResult,
} from '@secureyeoman/shared';

// ── Helpers ───────────────────────────────────────────────

function makeScenario(overrides: Partial<EvalScenario> = {}): EvalScenario {
  return {
    id: 'sc-1',
    name: 'Test Scenario',
    description: 'A test scenario',
    category: 'general',
    tags: ['tag1'],
    input: 'hello',
    conversationHistory: [{ role: 'user', content: 'hi' }],
    expectedToolCalls: [],
    orderedToolCalls: false,
    forbiddenToolCalls: [],
    outputAssertions: [],
    maxTokens: 100,
    maxDurationMs: 60000,
    personalityId: 'p-1',
    skillIds: ['sk-1'],
    model: 'gpt-4',
    ...overrides,
  };
}

function makeSuite(overrides: Partial<EvalSuite> = {}): EvalSuite {
  return {
    id: 'suite-1',
    name: 'Test Suite',
    description: 'A test suite',
    scenarioIds: ['sc-1', 'sc-2'],
    maxCostUsd: 10,
    concurrency: 2,
    ...overrides,
  };
}

function makeScenarioResult(overrides: Partial<ScenarioRunResult> = {}): ScenarioRunResult {
  return {
    scenarioId: 'sc-1',
    scenarioName: 'Test Scenario',
    passed: true,
    status: 'passed',
    output: 'output text',
    assertionResults: [],
    toolCalls: [],
    toolCallErrors: [],
    forbiddenToolCallViolations: [],
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    costUsd: 0.01,
    durationMs: 500,
    errorMessage: undefined,
    model: 'gpt-4',
    personalityId: 'p-1',
    ...overrides,
  };
}

function makeSuiteResult(overrides: Partial<SuiteRunResult> = {}): SuiteRunResult {
  return {
    id: 'run-1',
    suiteId: 'suite-1',
    suiteName: 'Test Suite',
    passed: true,
    results: [makeScenarioResult()],
    totalScenarios: 1,
    passedCount: 1,
    failedCount: 0,
    errorCount: 0,
    totalDurationMs: 500,
    totalTokens: 30,
    totalCostUsd: 0.01,
    startedAt: 1000,
    completedAt: 1500,
    ...overrides,
  };
}

/** Build a DB row that mirrors how eval.scenarios would be returned */
function scenarioRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'sc-1',
    name: 'Test Scenario',
    description: 'A test scenario',
    category: 'general',
    tags: ['tag1'],
    input: 'hello',
    conversation_history: [{ role: 'user', content: 'hi' }],
    expected_tool_calls: [],
    ordered_tool_calls: false,
    forbidden_tool_calls: [],
    output_assertions: [],
    max_tokens: 100,
    max_duration_ms: 60000,
    personality_id: 'p-1',
    skill_ids: ['sk-1'],
    model: 'gpt-4',
    ...overrides,
  };
}

function suiteRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'suite-1',
    name: 'Test Suite',
    description: 'A test suite',
    scenario_ids: ['sc-1', 'sc-2'],
    max_cost_usd: 10,
    concurrency: 2,
    ...overrides,
  };
}

function scenarioRunRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    scenario_id: 'sc-1',
    scenario_name: 'Test Scenario',
    passed: true,
    status: 'passed',
    output: 'output text',
    assertion_results: [],
    tool_calls: [],
    tool_call_errors: [],
    forbidden_violations: [],
    input_tokens: 10,
    output_tokens: 20,
    total_tokens: 30,
    cost_usd: 0.01,
    duration_ms: 500,
    error_message: undefined,
    model: 'gpt-4',
    personality_id: 'p-1',
    ...overrides,
  };
}

function suiteRunRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'run-1',
    suite_id: 'suite-1',
    suite_name: 'Test Suite',
    passed: true,
    total_scenarios: 1,
    passed_count: 1,
    failed_count: 0,
    error_count: 0,
    total_duration_ms: 500,
    total_tokens: 30,
    total_cost_usd: 0.01,
    started_at: 1000,
    completed_at: 1500,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────

describe('EvalStore', () => {
  let store: EvalStore;

  beforeEach(() => {
    mockQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    store = new EvalStore();
  });

  // ── Scenarios ─────────────────────────────────────────

  describe('createScenario', () => {
    it('inserts a scenario and returns it', async () => {
      const scenario = makeScenario();
      const result = await store.createScenario(scenario);
      expect(result).toBe(scenario);
      expect(mockQuery).toHaveBeenCalledOnce();
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO eval.scenarios');
      expect(params[0]).toBe('sc-1');
      expect(params[16]).toBe('default'); // tenantId
    });

    it('uses provided tenantId', async () => {
      const scenario = makeScenario();
      await store.createScenario(scenario, 'tenant-abc');
      const [, params] = mockQuery.mock.calls[0];
      expect(params[16]).toBe('tenant-abc');
    });

    it('serializes JSON fields', async () => {
      const scenario = makeScenario({ tags: ['a', 'b'], skillIds: ['s1'] });
      await store.createScenario(scenario);
      const [, params] = mockQuery.mock.calls[0];
      expect(params[4]).toBe(JSON.stringify(['a', 'b'])); // tags
      expect(params[14]).toBe(JSON.stringify(['s1'])); // skillIds
    });
  });

  describe('getScenario', () => {
    it('returns mapped scenario when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [scenarioRow()], rowCount: 1 });
      const result = await store.getScenario('sc-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('sc-1');
      expect(result!.name).toBe('Test Scenario');
      expect(result!.tags).toEqual(['tag1']);
      expect(result!.conversationHistory).toEqual([{ role: 'user', content: 'hi' }]);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await store.getScenario('nonexistent');
      expect(result).toBeNull();
    });

    it('uses default tenantId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await store.getScenario('sc-1');
      expect(mockQuery.mock.calls[0][1]).toEqual(['sc-1', 'default']);
    });

    it('uses provided tenantId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await store.getScenario('sc-1', 'tenant-xyz');
      expect(mockQuery.mock.calls[0][1]).toEqual(['sc-1', 'tenant-xyz']);
    });

    it('handles null/undefined fields with defaults', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'sc-1',
            name: 'Minimal',
            description: undefined,
            category: undefined,
            tags: undefined,
            input: 'hi',
            conversation_history: undefined,
            expected_tool_calls: undefined,
            ordered_tool_calls: undefined,
            forbidden_tool_calls: undefined,
            output_assertions: undefined,
            max_tokens: undefined,
            max_duration_ms: undefined,
            personality_id: undefined,
            skill_ids: undefined,
            model: undefined,
          },
        ],
        rowCount: 1,
      });
      const result = await store.getScenario('sc-1');
      expect(result).not.toBeNull();
      expect(result!.description).toBe('');
      expect(result!.category).toBe('general');
      expect(result!.tags).toEqual([]);
      expect(result!.conversationHistory).toEqual([]);
      expect(result!.expectedToolCalls).toEqual([]);
      expect(result!.orderedToolCalls).toBe(false);
      expect(result!.forbiddenToolCalls).toEqual([]);
      expect(result!.outputAssertions).toEqual([]);
      expect(result!.maxTokens).toBeNull();
      expect(result!.maxDurationMs).toBe(60000);
      expect(result!.personalityId).toBeNull();
      expect(result!.skillIds).toEqual([]);
      expect(result!.model).toBeNull();
    });
  });

  describe('listScenarios', () => {
    it('returns items and total with defaults', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [scenarioRow(), scenarioRow({ id: 'sc-2' })], rowCount: 2 });

      const result = await store.listScenarios();
      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
      // default tenant
      expect(mockQuery.mock.calls[0][1]).toEqual(['default']);
    });

    it('filters by category when provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [scenarioRow()], rowCount: 1 });

      await store.listScenarios({ category: 'security' });
      const [countSql, countParams] = mockQuery.mock.calls[0];
      expect(countSql).toContain('category = $2');
      expect(countParams).toEqual(['default', 'security']);
    });

    it('uses custom tenantId, limit and offset', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await store.listScenarios({ tenantId: 'custom', limit: 25, offset: 5 });
      expect(mockQuery.mock.calls[0][1]).toEqual(['custom']);
      const [, dataParams] = mockQuery.mock.calls[1];
      expect(dataParams).toEqual(['custom', 25, 5]);
    });

    it('caps limit at 500', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await store.listScenarios({ limit: 1000 });
      const [, dataParams] = mockQuery.mock.calls[1];
      expect(dataParams[1]).toBe(500);
    });

    it('handles null count result', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // queryOne returns null
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await store.listScenarios();
      expect(result.total).toBe(0);
    });

    it('handles count with category filter in idx numbering', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await store.listScenarios({ category: 'test' });
      // With category, idx starts at 2 for category, then 3 for limit, 4 for offset
      const [dataSql] = mockQuery.mock.calls[1];
      expect(dataSql).toContain('LIMIT $3');
      expect(dataSql).toContain('OFFSET $4');
    });
  });

  describe('deleteScenario', () => {
    it('returns true when row deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await store.deleteScenario('sc-1');
      expect(result).toBe(true);
      expect(mockQuery.mock.calls[0][1]).toEqual(['sc-1', 'default']);
    });

    it('returns false when no row deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await store.deleteScenario('nonexistent');
      expect(result).toBe(false);
    });

    it('uses provided tenantId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await store.deleteScenario('sc-1', 'tenant-abc');
      expect(mockQuery.mock.calls[0][1]).toEqual(['sc-1', 'tenant-abc']);
    });
  });

  describe('updateScenario', () => {
    it('updates scalar fields and returns updated scenario', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // execute UPDATE
        .mockResolvedValueOnce({ rows: [scenarioRow({ name: 'Updated' })], rowCount: 1 }); // getScenario

      const result = await store.updateScenario('sc-1', { name: 'Updated' });
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Updated');
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain('UPDATE eval.scenarios SET');
      expect(sql).toContain('name = $1');
    });

    it('updates JSON fields with serialization', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [scenarioRow({ tags: ['new'] })], rowCount: 1 });

      await store.updateScenario('sc-1', { tags: ['new'] });
      const [, params] = mockQuery.mock.calls[0];
      expect(params[0]).toBe(JSON.stringify(['new']));
    });

    it('returns current scenario when no updates provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [scenarioRow()], rowCount: 1 });
      const result = await store.updateScenario('sc-1', {});
      expect(result).not.toBeNull();
      // Should only have called getScenario, not execute
      expect(mockQuery).toHaveBeenCalledOnce();
      expect(mockQuery.mock.calls[0][0]).toContain('SELECT');
    });

    it('handles multiple field updates simultaneously', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [scenarioRow()], rowCount: 1 });

      await store.updateScenario('sc-1', {
        name: 'New Name',
        description: 'New Desc',
        category: 'security',
        tags: ['a'],
        skillIds: ['s1'],
      });

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('name = $1');
      expect(sql).toContain('description = $2');
      expect(sql).toContain('category = $3');
      expect(sql).toContain('tags = $4');
      expect(sql).toContain('skill_ids = $5');
      expect(params[0]).toBe('New Name');
      expect(params[1]).toBe('New Desc');
      expect(params[2]).toBe('security');
      expect(params[3]).toBe(JSON.stringify(['a']));
      expect(params[4]).toBe(JSON.stringify(['s1']));
    });

    it('uses provided tenantId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [scenarioRow()], rowCount: 1 });

      await store.updateScenario('sc-1', { name: 'X' }, 'tenant-abc');
      const [, params] = mockQuery.mock.calls[0];
      // Last two params are id and tenantId
      expect(params[params.length - 1]).toBe('tenant-abc');
      expect(params[params.length - 2]).toBe('sc-1');
    });

    it('updates all mappable scalar fields', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [scenarioRow()], rowCount: 1 });

      await store.updateScenario('sc-1', {
        input: 'new input',
        orderedToolCalls: true,
        maxTokens: 200,
        maxDurationMs: 30000,
        personalityId: 'p-2',
        model: 'claude-3',
      });

      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain('input = $');
      expect(sql).toContain('ordered_tool_calls = $');
      expect(sql).toContain('max_tokens = $');
      expect(sql).toContain('max_duration_ms = $');
      expect(sql).toContain('personality_id = $');
      expect(sql).toContain('model = $');
    });

    it('updates all JSON fields', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [scenarioRow()], rowCount: 1 });

      await store.updateScenario('sc-1', {
        conversationHistory: [{ role: 'assistant', content: 'hi' }],
        expectedToolCalls: [],
        forbiddenToolCalls: ['tool1'],
        outputAssertions: [],
      });

      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain('conversation_history = $');
      expect(sql).toContain('expected_tool_calls = $');
      expect(sql).toContain('forbidden_tool_calls = $');
      expect(sql).toContain('output_assertions = $');
    });
  });

  // ── Suites ────────────────────────────────────────────

  describe('createSuite', () => {
    it('inserts a suite and returns it', async () => {
      const suite = makeSuite();
      const result = await store.createSuite(suite);
      expect(result).toBe(suite);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO eval.suites');
      expect(params[0]).toBe('suite-1');
      expect(params[3]).toBe(JSON.stringify(['sc-1', 'sc-2']));
      expect(params[6]).toBe('default');
    });

    it('uses provided tenantId', async () => {
      await store.createSuite(makeSuite(), 'tenant-xyz');
      expect(mockQuery.mock.calls[0][1][6]).toBe('tenant-xyz');
    });
  });

  describe('getSuite', () => {
    it('returns mapped suite when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [suiteRow()], rowCount: 1 });
      const result = await store.getSuite('suite-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('suite-1');
      expect(result!.scenarioIds).toEqual(['sc-1', 'sc-2']);
      expect(result!.concurrency).toBe(2);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await store.getSuite('nonexistent')).toBeNull();
    });

    it('handles null/undefined fields with defaults', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'suite-1',
            name: 'Minimal',
            description: undefined,
            scenario_ids: undefined,
            max_cost_usd: undefined,
            concurrency: undefined,
          },
        ],
        rowCount: 1,
      });
      const result = await store.getSuite('suite-1');
      expect(result!.description).toBe('');
      expect(result!.scenarioIds).toEqual([]);
      expect(result!.maxCostUsd).toBeNull();
      expect(result!.concurrency).toBe(1);
    });
  });

  describe('listSuites', () => {
    it('returns items and total with defaults', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [suiteRow()], rowCount: 1 });

      const result = await store.listSuites();
      expect(result.total).toBe(3);
      expect(result.items).toHaveLength(1);
    });

    it('uses custom options', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await store.listSuites({ tenantId: 'custom', limit: 20, offset: 10 });
      expect(mockQuery.mock.calls[0][1]).toEqual(['custom']);
      expect(mockQuery.mock.calls[1][1]).toEqual(['custom', 20, 10]);
    });

    it('caps limit at 500', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await store.listSuites({ limit: 999 });
      expect(mockQuery.mock.calls[1][1][1]).toBe(500);
    });

    it('handles null count', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await store.listSuites();
      expect(result.total).toBe(0);
    });
  });

  describe('deleteSuite', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      expect(await store.deleteSuite('suite-1')).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await store.deleteSuite('nope')).toBe(false);
    });

    it('uses provided tenantId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await store.deleteSuite('suite-1', 'tenant-abc');
      expect(mockQuery.mock.calls[0][1]).toEqual(['suite-1', 'tenant-abc']);
    });
  });

  // ── Run Results ───────────────────────────────────────

  describe('saveSuiteRun', () => {
    it('inserts suite run and all scenario results', async () => {
      const sr1 = makeScenarioResult({ scenarioId: 'sc-1' });
      const sr2 = makeScenarioResult({
        scenarioId: 'sc-2',
        passed: false,
        status: 'failed',
        errorMessage: 'fail',
      });
      const run = makeSuiteResult({ results: [sr1, sr2] });

      await store.saveSuiteRun(run);
      // 1 suite_runs INSERT + 2 scenario_runs INSERTs
      expect(mockQuery).toHaveBeenCalledTimes(3);
      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO eval.suite_runs');
      expect(mockQuery.mock.calls[1][0]).toContain('INSERT INTO eval.scenario_runs');
      expect(mockQuery.mock.calls[2][0]).toContain('INSERT INTO eval.scenario_runs');
    });

    it('uses default tenantId', async () => {
      await store.saveSuiteRun(makeSuiteResult());
      const [, params] = mockQuery.mock.calls[0];
      expect(params[13]).toBe('default'); // tenantId for suite_runs
    });

    it('uses provided tenantId', async () => {
      await store.saveSuiteRun(makeSuiteResult(), 'tenant-xyz');
      const suiteParams = mockQuery.mock.calls[0][1];
      expect(suiteParams[13]).toBe('tenant-xyz');
      const scenarioParams = mockQuery.mock.calls[1][1];
      expect(scenarioParams[19]).toBe('tenant-xyz');
    });

    it('handles scenario result with undefined optional fields', async () => {
      const sr = makeScenarioResult({
        errorMessage: undefined,
        model: undefined,
        personalityId: undefined,
      });
      await store.saveSuiteRun(makeSuiteResult({ results: [sr] }));
      const scenarioParams = mockQuery.mock.calls[1][1];
      expect(scenarioParams[16]).toBeNull(); // errorMessage ?? null
      expect(scenarioParams[17]).toBeNull(); // model ?? null
      expect(scenarioParams[18]).toBeNull(); // personalityId ?? null
    });

    it('handles empty results array', async () => {
      await store.saveSuiteRun(makeSuiteResult({ results: [] }));
      // Only 1 INSERT for the suite_runs row, no scenario_runs
      expect(mockQuery).toHaveBeenCalledOnce();
    });

    it('uses randomUUID for scenario run ids', async () => {
      await store.saveSuiteRun(makeSuiteResult());
      const scenarioParams = mockQuery.mock.calls[1][1];
      expect(scenarioParams[0]).toBe('mock-uuid-1234');
    });

    it('serializes JSON fields in scenario results', async () => {
      const sr = makeScenarioResult({
        assertionResults: [
          { name: 'a', passed: true, message: 'ok' },
        ] as ScenarioRunResult['assertionResults'],
        toolCalls: [{ tool: 'test', args: {} }] as ScenarioRunResult['toolCalls'],
        toolCallErrors: ['err1'],
        forbiddenToolCallViolations: ['forbidden1'],
      });
      await store.saveSuiteRun(makeSuiteResult({ results: [sr] }));
      const [, params] = mockQuery.mock.calls[1];
      expect(params[7]).toBe(JSON.stringify(sr.assertionResults));
      expect(params[8]).toBe(JSON.stringify(sr.toolCalls));
      expect(params[9]).toBe(JSON.stringify(sr.toolCallErrors));
      expect(params[10]).toBe(JSON.stringify(sr.forbiddenToolCallViolations));
    });
  });

  describe('getSuiteRun', () => {
    it('returns mapped suite run with scenario results', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [suiteRunRow()], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [scenarioRunRow()], rowCount: 1 });

      const result = await store.getSuiteRun('run-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('run-1');
      expect(result!.suiteId).toBe('suite-1');
      expect(result!.results).toHaveLength(1);
      expect(result!.results[0].scenarioId).toBe('sc-1');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await store.getSuiteRun('nonexistent')).toBeNull();
    });

    it('handles suite run with no scenario results', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [suiteRunRow()], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await store.getSuiteRun('run-1');
      expect(result!.results).toEqual([]);
    });

    it('handles null/undefined fields in suite run row', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'run-1',
              suite_id: 'suite-1',
              suite_name: 'S',
              passed: false,
              total_scenarios: undefined,
              passed_count: undefined,
              failed_count: undefined,
              error_count: undefined,
              total_duration_ms: undefined,
              total_tokens: undefined,
              total_cost_usd: undefined,
              started_at: undefined,
              completed_at: undefined,
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await store.getSuiteRun('run-1');
      expect(result!.totalScenarios).toBe(0);
      expect(result!.passedCount).toBe(0);
      expect(result!.failedCount).toBe(0);
      expect(result!.errorCount).toBe(0);
      expect(result!.totalDurationMs).toBe(0);
      expect(result!.totalTokens).toBe(0);
      expect(result!.totalCostUsd).toBe(0);
      expect(result!.startedAt).toBe(0);
      expect(result!.completedAt).toBe(0);
    });

    it('handles null/undefined fields in scenario run row', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [suiteRunRow()], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [
            {
              scenario_id: 'sc-1',
              scenario_name: 'S',
              passed: false,
              status: 'error',
              output: undefined,
              assertion_results: undefined,
              tool_calls: undefined,
              tool_call_errors: undefined,
              forbidden_violations: undefined,
              input_tokens: undefined,
              output_tokens: undefined,
              total_tokens: undefined,
              cost_usd: undefined,
              duration_ms: undefined,
              error_message: undefined,
              model: undefined,
              personality_id: undefined,
            },
          ],
          rowCount: 1,
        });

      const result = await store.getSuiteRun('run-1');
      const sr = result!.results[0];
      expect(sr.output).toBe('');
      expect(sr.assertionResults).toEqual([]);
      expect(sr.toolCalls).toEqual([]);
      expect(sr.toolCallErrors).toEqual([]);
      expect(sr.forbiddenToolCallViolations).toEqual([]);
      expect(sr.inputTokens).toBe(0);
      expect(sr.outputTokens).toBe(0);
      expect(sr.totalTokens).toBe(0);
      expect(sr.costUsd).toBe(0);
      expect(sr.durationMs).toBe(0);
      expect(sr.errorMessage).toBeUndefined();
      expect(sr.model).toBeUndefined();
      expect(sr.personalityId).toBeUndefined();
    });
  });

  describe('listSuiteRuns', () => {
    it('returns items with empty results arrays and total', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [suiteRunRow()], rowCount: 1 });

      const result = await store.listSuiteRuns();
      expect(result.total).toBe(5);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].results).toEqual([]);
    });

    it('filters by suiteId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await store.listSuiteRuns({ suiteId: 'suite-1' });
      const [countSql, countParams] = mockQuery.mock.calls[0];
      expect(countSql).toContain('suite_id = $2');
      expect(countParams).toEqual(['default', 'suite-1']);
    });

    it('uses custom tenantId, limit and offset', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await store.listSuiteRuns({ tenantId: 'custom', limit: 10, offset: 5 });
      expect(mockQuery.mock.calls[0][1]).toEqual(['custom']);
      expect(mockQuery.mock.calls[1][1]).toEqual(['custom', 10, 5]);
    });

    it('caps limit at 200', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await store.listSuiteRuns({ limit: 999 });
      expect(mockQuery.mock.calls[1][1][1]).toBe(200);
    });

    it('defaults limit to 50', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await store.listSuiteRuns();
      expect(mockQuery.mock.calls[1][1][1]).toBe(50);
    });

    it('handles null count', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await store.listSuiteRuns();
      expect(result.total).toBe(0);
    });

    it('handles suiteId filter with correct idx for LIMIT/OFFSET', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await store.listSuiteRuns({ suiteId: 'suite-1' });
      const [dataSql] = mockQuery.mock.calls[1];
      expect(dataSql).toContain('LIMIT $3');
      expect(dataSql).toContain('OFFSET $4');
    });
  });

  describe('deleteOldRuns', () => {
    it('deletes runs older than retention period and returns count', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 5 });
      const result = await store.deleteOldRuns(30);
      expect(result).toBe(5);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('DELETE FROM eval.suite_runs');
      expect(sql).toContain('started_at < $1');
      expect(params[1]).toBe('default');
      // cutoff should be Date.now() - 30 * 86_400_000
      expect(typeof params[0]).toBe('number');
    });

    it('returns 0 when nothing deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await store.deleteOldRuns(7)).toBe(0);
    });

    it('uses provided tenantId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 2 });
      await store.deleteOldRuns(7, 'tenant-abc');
      expect(mockQuery.mock.calls[0][1][1]).toBe('tenant-abc');
    });

    it('calculates correct cutoff timestamp', async () => {
      const now = Date.now();
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await store.deleteOldRuns(10);
      const cutoff = mockQuery.mock.calls[0][1][0] as number;
      const expected = now - 10 * 86_400_000;
      // Allow 100ms tolerance for test execution time
      expect(Math.abs(cutoff - expected)).toBeLessThan(100);
    });
  });
});
