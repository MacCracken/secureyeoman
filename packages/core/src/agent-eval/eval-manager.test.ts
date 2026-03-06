/**
 * Tests for the Agent Eval Manager — Phase 135
 *
 * Covers: suite execution, scenario CRUD delegation, cost budget enforcement,
 * run cancellation, history retrieval, cleanup.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: mockQuery }),
}));

import { EvalManager } from './eval-manager.js';
import type { EvalAgentDeps } from './eval-engine.js';
import type { AgentEvalConfig, EvalScenario, EvalSuite } from '@secureyeoman/shared';

// ─── Helpers ──────────────────────────────────────────────────────

function makeConfig(overrides: Partial<AgentEvalConfig> = {}): AgentEvalConfig {
  return {
    enabled: true,
    defaultTimeoutMs: 60000,
    maxConcurrency: 3,
    defaultMaxCostUsd: null,
    storeTraces: false, // skip DB writes in unit tests
    retentionDays: 90,
    ...overrides,
  };
}

function makeAgentDeps(): EvalAgentDeps {
  return {
    executePrompt: vi.fn().mockResolvedValue({
      output: 'test response',
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      costUsd: 0.001,
      model: 'test-model',
    }),
  };
}

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn().mockReturnThis(),
} as any;

function makeManager(configOverrides: Partial<AgentEvalConfig> = {}) {
  mockQuery.mockReset();
  return new EvalManager({
    logger: mockLogger,
    agentDeps: makeAgentDeps(),
    config: makeConfig(configOverrides),
  });
}

function makeScenario(overrides: Partial<EvalScenario> = {}): EvalScenario {
  return {
    id: 'scenario-1',
    name: 'Test Scenario',
    description: '',
    category: 'general',
    tags: [],
    input: 'Hello',
    conversationHistory: [],
    expectedToolCalls: [],
    orderedToolCalls: false,
    forbiddenToolCalls: [],
    outputAssertions: [],
    maxTokens: null,
    maxDurationMs: 5000,
    personalityId: null,
    skillIds: [],
    model: null,
    ...overrides,
  };
}

function makeSuite(overrides: Partial<EvalSuite> = {}): EvalSuite {
  return {
    id: 'suite-1',
    name: 'Test Suite',
    description: '',
    scenarioIds: ['scenario-1'],
    maxCostUsd: null,
    concurrency: 1,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────

describe('EvalManager', () => {
  describe('createScenario', () => {
    it('delegates to store and returns scenario', async () => {
      const manager = makeManager();
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      const scenario = makeScenario();
      const result = await manager.createScenario(scenario);
      expect(result.id).toBe('scenario-1');
      expect(mockQuery).toHaveBeenCalled();
    });
  });

  describe('getScenario', () => {
    it('returns scenario when found', async () => {
      const manager = makeManager();
      const row = {
        id: 'scenario-1',
        name: 'Test',
        description: '',
        category: 'general',
        tags: [],
        input: 'Hello',
        conversation_history: [],
        expected_tool_calls: [],
        ordered_tool_calls: false,
        forbidden_tool_calls: [],
        output_assertions: [],
        max_tokens: null,
        max_duration_ms: 5000,
        personality_id: null,
        skill_ids: [],
        model: null,
      };
      mockQuery.mockResolvedValue({ rows: [row], rowCount: 1 });

      const result = await manager.getScenario('scenario-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('scenario-1');
    });

    it('returns null when not found', async () => {
      const manager = makeManager();
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await manager.getScenario('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('runSuite', () => {
    it('throws when suite not found', async () => {
      const manager = makeManager();
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await expect(manager.runSuite('nonexistent')).rejects.toThrow('Suite not found');
    });

    it('runs all scenarios sequentially and returns aggregate result', async () => {
      const manager = makeManager();
      const suiteRow = {
        id: 'suite-1',
        name: 'Test Suite',
        description: '',
        scenario_ids: ['s1', 's2'],
        max_cost_usd: null,
        concurrency: 1,
      };
      const scenarioRow = (id: string) => ({
        id,
        name: `Scenario ${id}`,
        description: '',
        category: 'general',
        tags: [],
        input: 'test',
        conversation_history: [],
        expected_tool_calls: [],
        ordered_tool_calls: false,
        forbidden_tool_calls: [],
        output_assertions: [],
        max_tokens: null,
        max_duration_ms: 5000,
        personality_id: null,
        skill_ids: [],
        model: null,
      });

      // getSuite → getScenario('s1') → getScenario('s2')
      mockQuery
        .mockResolvedValueOnce({ rows: [suiteRow], rowCount: 1 }) // getSuite
        .mockResolvedValueOnce({ rows: [scenarioRow('s1')], rowCount: 1 }) // getScenario s1
        .mockResolvedValueOnce({ rows: [scenarioRow('s2')], rowCount: 1 }); // getScenario s2

      const result = await manager.runSuite('suite-1');
      expect(result.totalScenarios).toBe(2);
      expect(result.passedCount).toBe(2);
      expect(result.passed).toBe(true);
      expect(result.results).toHaveLength(2);
    });

    it('skips missing scenarios with warning', async () => {
      const manager = makeManager();
      const suiteRow = {
        id: 'suite-1',
        name: 'Test Suite',
        description: '',
        scenario_ids: ['exists', 'missing'],
        max_cost_usd: null,
        concurrency: 1,
      };
      const scenarioRow = {
        id: 'exists',
        name: 'Exists',
        description: '',
        category: 'general',
        tags: [],
        input: 'test',
        conversation_history: [],
        expected_tool_calls: [],
        ordered_tool_calls: false,
        forbidden_tool_calls: [],
        output_assertions: [],
        max_tokens: null,
        max_duration_ms: 5000,
        personality_id: null,
        skill_ids: [],
        model: null,
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [suiteRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [scenarioRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // missing

      const result = await manager.runSuite('suite-1');
      expect(result.totalScenarios).toBe(1);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('runSingleScenario', () => {
    it('runs one scenario and returns result', async () => {
      const manager = makeManager();
      const row = {
        id: 'scenario-1',
        name: 'Test',
        description: '',
        category: 'general',
        tags: [],
        input: 'Hello',
        conversation_history: [],
        expected_tool_calls: [],
        ordered_tool_calls: false,
        forbidden_tool_calls: [],
        output_assertions: [],
        max_tokens: null,
        max_duration_ms: 5000,
        personality_id: null,
        skill_ids: [],
        model: null,
      };
      mockQuery.mockResolvedValue({ rows: [row], rowCount: 1 });

      const result = await manager.runSingleScenario('scenario-1');
      expect(result.passed).toBe(true);
      expect(result.scenarioId).toBe('scenario-1');
    });

    it('throws when scenario not found', async () => {
      const manager = makeManager();
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await expect(manager.runSingleScenario('nonexistent')).rejects.toThrow('Scenario not found');
    });
  });

  describe('cancelRun', () => {
    it('returns false for unknown run ID', () => {
      const manager = makeManager();
      expect(manager.cancelRun('unknown')).toBe(false);
    });
  });

  describe('suite/scenario CRUD delegation', () => {
    it('createSuite calls store', async () => {
      const manager = makeManager();
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      const suite = makeSuite();
      const result = await manager.createSuite(suite);
      expect(result.id).toBe('suite-1');
    });

    it('deleteSuite returns true when deleted', async () => {
      const manager = makeManager();
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await manager.deleteSuite('suite-1');
      expect(result).toBe(true);
    });

    it('deleteScenario returns false when not found', async () => {
      const manager = makeManager();
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await manager.deleteScenario('nonexistent');
      expect(result).toBe(false);
    });
  });
});
