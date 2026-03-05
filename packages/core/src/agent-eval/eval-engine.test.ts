/**
 * Tests for the Agent Eval Engine — Phase 135
 *
 * Covers: assertion evaluation, tool call validation, scenario execution,
 * timeout handling, budget enforcement, and forbidden tool detection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runScenario,
  validateToolCalls,
  evaluateAssertions,
} from './eval-engine.js';
import type { EvalAgentDeps } from './eval-engine.js';
import type {
  EvalScenario,
  OutputAssertion,
  ExpectedToolCall,
  ToolCallRecord,
} from '@secureyeoman/shared';

// ─── Test Helpers ─────────────────────────────────────────────────

function makeScenario(overrides: Partial<EvalScenario> = {}): EvalScenario {
  return {
    id: 'test-scenario',
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

function makeToolRecord(name: string, args: Record<string, unknown> = {}): ToolCallRecord {
  return { name, args, durationMs: 10, timestamp: Date.now() };
}

function makeDeps(overrides: Partial<EvalAgentDeps> = {}): EvalAgentDeps {
  return {
    executePrompt: vi.fn().mockResolvedValue({
      output: 'Hello back!',
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      costUsd: 0.001,
      model: 'test-model',
    }),
    ...overrides,
  };
}

// ─── evaluateAssertions ───────────────────────────────────────────

describe('evaluateAssertions', () => {
  const deps = makeDeps();

  it('exact match — pass', async () => {
    const assertions: OutputAssertion[] = [{ type: 'exact', value: 'hello' }];
    const results = await evaluateAssertions('hello', assertions, deps);
    expect(results).toHaveLength(1);
    expect(results[0]!.passed).toBe(true);
  });

  it('exact match — fail', async () => {
    const assertions: OutputAssertion[] = [{ type: 'exact', value: 'hello' }];
    const results = await evaluateAssertions('world', assertions, deps);
    expect(results[0]!.passed).toBe(false);
  });

  it('regex — pass', async () => {
    const assertions: OutputAssertion[] = [{ type: 'regex', pattern: 'hel+o' }];
    const results = await evaluateAssertions('helllo world', assertions, deps);
    expect(results[0]!.passed).toBe(true);
  });

  it('regex — fail', async () => {
    const assertions: OutputAssertion[] = [{ type: 'regex', pattern: '^exact$' }];
    const results = await evaluateAssertions('not exact', assertions, deps);
    expect(results[0]!.passed).toBe(false);
  });

  it('contains — case-insensitive pass', async () => {
    const assertions: OutputAssertion[] = [
      { type: 'contains', value: 'HELLO', caseSensitive: false },
    ];
    const results = await evaluateAssertions('say hello world', assertions, deps);
    expect(results[0]!.passed).toBe(true);
  });

  it('contains — case-sensitive fail', async () => {
    const assertions: OutputAssertion[] = [
      { type: 'contains', value: 'HELLO', caseSensitive: true },
    ];
    const results = await evaluateAssertions('say hello world', assertions, deps);
    expect(results[0]!.passed).toBe(false);
  });

  it('not_contains — pass when absent', async () => {
    const assertions: OutputAssertion[] = [
      { type: 'not_contains', value: 'secret', caseSensitive: false },
    ];
    const results = await evaluateAssertions('safe output', assertions, deps);
    expect(results[0]!.passed).toBe(true);
  });

  it('not_contains — fail when present', async () => {
    const assertions: OutputAssertion[] = [
      { type: 'not_contains', value: 'secret', caseSensitive: false },
    ];
    const results = await evaluateAssertions('contains secret data', assertions, deps);
    expect(results[0]!.passed).toBe(false);
  });

  it('semantic — fail when no similarity provider', async () => {
    const assertions: OutputAssertion[] = [
      { type: 'semantic', value: 'greeting', threshold: 0.8 },
    ];
    const results = await evaluateAssertions('hello', assertions, deps);
    expect(results[0]!.passed).toBe(false);
    expect(results[0]!.reason).toContain('not available');
  });

  it('semantic — pass when similarity above threshold', async () => {
    const depsWithSim = makeDeps({
      computeSimilarity: vi.fn().mockResolvedValue(0.95),
    });
    const assertions: OutputAssertion[] = [
      { type: 'semantic', value: 'greeting', threshold: 0.8 },
    ];
    const results = await evaluateAssertions('hello', assertions, depsWithSim);
    expect(results[0]!.passed).toBe(true);
  });

  it('semantic — fail when similarity below threshold', async () => {
    const depsWithSim = makeDeps({
      computeSimilarity: vi.fn().mockResolvedValue(0.5),
    });
    const assertions: OutputAssertion[] = [
      { type: 'semantic', value: 'greeting', threshold: 0.8 },
    ];
    const results = await evaluateAssertions('completely unrelated', assertions, depsWithSim);
    expect(results[0]!.passed).toBe(false);
  });

  it('multiple assertions — all must pass', async () => {
    const assertions: OutputAssertion[] = [
      { type: 'contains', value: 'hello', caseSensitive: false },
      { type: 'not_contains', value: 'error', caseSensitive: false },
      { type: 'regex', pattern: 'hello\\s+world' },
    ];
    const results = await evaluateAssertions('hello world', assertions, deps);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.passed)).toBe(true);
  });

  it('multiple assertions — partial failure', async () => {
    const assertions: OutputAssertion[] = [
      { type: 'contains', value: 'hello', caseSensitive: false },
      { type: 'exact', value: 'different' },
    ];
    const results = await evaluateAssertions('hello world', assertions, deps);
    expect(results[0]!.passed).toBe(true);
    expect(results[1]!.passed).toBe(false);
  });
});

// ─── validateToolCalls ────────────────────────────────────────────

describe('validateToolCalls', () => {
  it('empty expectations — no errors', () => {
    const actual = [makeToolRecord('tool_a')];
    expect(validateToolCalls(actual, [], false)).toEqual([]);
  });

  it('unordered — required tool found', () => {
    const actual = [makeToolRecord('tool_b'), makeToolRecord('tool_a')];
    const expected: ExpectedToolCall[] = [{ name: 'tool_a', required: true }];
    expect(validateToolCalls(actual, expected, false)).toEqual([]);
  });

  it('unordered — required tool missing', () => {
    const actual = [makeToolRecord('tool_b')];
    const expected: ExpectedToolCall[] = [{ name: 'tool_a', required: true }];
    const errors = validateToolCalls(actual, expected, false);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('tool_a');
    expect(errors[0]).toContain('not made');
  });

  it('ordered — correct order passes', () => {
    const actual = [makeToolRecord('tool_a'), makeToolRecord('tool_b')];
    const expected: ExpectedToolCall[] = [
      { name: 'tool_a', required: true },
      { name: 'tool_b', required: true },
    ];
    expect(validateToolCalls(actual, expected, true)).toEqual([]);
  });

  it('ordered — wrong order fails', () => {
    const actual = [makeToolRecord('tool_b'), makeToolRecord('tool_a')];
    const expected: ExpectedToolCall[] = [
      { name: 'tool_a', required: true },
      { name: 'tool_b', required: true },
    ];
    const errors = validateToolCalls(actual, expected, true);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('ordered — missing position fails', () => {
    const actual = [makeToolRecord('tool_a')];
    const expected: ExpectedToolCall[] = [
      { name: 'tool_a', required: true },
      { name: 'tool_b', required: true },
    ];
    const errors = validateToolCalls(actual, expected, true);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('tool_b');
  });

  it('unordered — arg matching pass', () => {
    const actual = [makeToolRecord('tool_a', { query: 'test', limit: 10 })];
    const expected: ExpectedToolCall[] = [
      { name: 'tool_a', required: true, args: { query: 'test' } },
    ];
    expect(validateToolCalls(actual, expected, false)).toEqual([]);
  });

  it('unordered — arg matching fail (wrong value)', () => {
    const actual = [makeToolRecord('tool_a', { query: 'other' })];
    const expected: ExpectedToolCall[] = [
      { name: 'tool_a', required: true, args: { query: 'test' } },
    ];
    const errors = validateToolCalls(actual, expected, false);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('query');
  });

  it('unordered — arg matching fail (missing key)', () => {
    const actual = [makeToolRecord('tool_a', {})];
    const expected: ExpectedToolCall[] = [
      { name: 'tool_a', required: true, args: { query: 'test' } },
    ];
    const errors = validateToolCalls(actual, expected, false);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('missing');
  });

  it('optional tool — no error when missing', () => {
    const actual: ToolCallRecord[] = [];
    const expected: ExpectedToolCall[] = [
      { name: 'optional_tool', required: false },
    ];
    expect(validateToolCalls(actual, expected, false)).toEqual([]);
  });
});

// ─── runScenario ──────────────────────────────────────────────────

describe('runScenario', () => {
  it('passes when output matches and no tool expectations', async () => {
    const scenario = makeScenario({
      outputAssertions: [{ type: 'contains', value: 'Hello', caseSensitive: false }],
    });
    const deps = makeDeps();
    const result = await runScenario(scenario, deps);

    expect(result.passed).toBe(true);
    expect(result.status).toBe('passed');
    expect(result.scenarioId).toBe('test-scenario');
    expect(result.model).toBe('test-model');
    expect(result.totalTokens).toBe(15);
  });

  it('fails when output assertion fails', async () => {
    const scenario = makeScenario({
      outputAssertions: [{ type: 'exact', value: 'wrong answer' }],
    });
    const deps = makeDeps();
    const result = await runScenario(scenario, deps);

    expect(result.passed).toBe(false);
    expect(result.status).toBe('failed');
  });

  it('fails on forbidden tool call violation', async () => {
    const scenario = makeScenario({
      forbiddenToolCalls: ['dangerous_tool'],
    });
    const deps = makeDeps({
      executePrompt: vi.fn().mockImplementation(async (opts) => {
        opts.onToolCall?.(makeToolRecord('dangerous_tool'));
        return {
          output: 'done',
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          costUsd: 0.001,
          model: 'test-model',
        };
      }),
    });

    const result = await runScenario(scenario, deps);
    expect(result.passed).toBe(false);
    expect(result.forbiddenToolCallViolations).toContain('dangerous_tool');
  });

  it('records tool calls from onToolCall callback', async () => {
    const scenario = makeScenario({
      expectedToolCalls: [{ name: 'search', required: true }],
    });
    const deps = makeDeps({
      executePrompt: vi.fn().mockImplementation(async (opts) => {
        opts.onToolCall?.(makeToolRecord('search', { query: 'test' }));
        return {
          output: 'found it',
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          costUsd: 0.001,
          model: 'test-model',
        };
      }),
    });

    const result = await runScenario(scenario, deps);
    expect(result.passed).toBe(true);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe('search');
  });

  it('returns error status on executePrompt failure', async () => {
    const scenario = makeScenario();
    const deps = makeDeps({
      executePrompt: vi.fn().mockRejectedValue(new Error('LLM error')),
    });

    const result = await runScenario(scenario, deps);
    expect(result.passed).toBe(false);
    expect(result.status).toBe('error');
    expect(result.errorMessage).toBe('LLM error');
  });

  it('returns timeout status when scenario exceeds maxDurationMs', async () => {
    const scenario = makeScenario({ maxDurationMs: 100 });
    const deps = makeDeps({
      executePrompt: vi.fn().mockImplementation(({ abortSignal }) => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve({
            output: 'late',
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            costUsd: 0,
            model: 'test',
          }), 5000);
          abortSignal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      }),
    });

    const result = await runScenario(scenario, deps);
    expect(result.passed).toBe(false);
    expect(result.status).toBe('timeout');
    expect(result.errorMessage).toContain('timed out');
  });

  it('returns budget_exceeded when tokens exceed maxTokens', async () => {
    const scenario = makeScenario({ maxTokens: 10 });
    const deps = makeDeps({
      executePrompt: vi.fn().mockResolvedValue({
        output: 'done',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        costUsd: 0.01,
        model: 'test-model',
      }),
    });

    const result = await runScenario(scenario, deps);
    expect(result.passed).toBe(false);
    expect(result.status).toBe('budget_exceeded');
    expect(result.errorMessage).toContain('Token budget exceeded');
  });

  it('passes personalityId and skillIds to executePrompt', async () => {
    const scenario = makeScenario({
      personalityId: 'friday',
      skillIds: ['skill-a', 'skill-b'],
      model: 'claude-opus-4-6',
    });
    const mockExecute = vi.fn().mockResolvedValue({
      output: 'ok',
      inputTokens: 5,
      outputTokens: 3,
      totalTokens: 8,
      costUsd: 0.0005,
      model: 'claude-opus-4-6',
    });
    const deps = makeDeps({ executePrompt: mockExecute });

    await runScenario(scenario, deps);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        personalityId: 'friday',
        skillIds: ['skill-a', 'skill-b'],
        model: 'claude-opus-4-6',
      })
    );
  });

  it('passes conversation history to executePrompt', async () => {
    const scenario = makeScenario({
      conversationHistory: [
        { role: 'user', content: 'previous question' },
        { role: 'assistant', content: 'previous answer' },
      ],
    });
    const mockExecute = vi.fn().mockResolvedValue({
      output: 'follow-up answer',
      inputTokens: 20,
      outputTokens: 10,
      totalTokens: 30,
      costUsd: 0.002,
      model: 'test-model',
    });
    const deps = makeDeps({ executePrompt: mockExecute });

    await runScenario(scenario, deps);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationHistory: [
          { role: 'user', content: 'previous question' },
          { role: 'assistant', content: 'previous answer' },
        ],
      })
    );
  });

  it('fails when expected required tool call is missing', async () => {
    const scenario = makeScenario({
      expectedToolCalls: [{ name: 'required_tool', required: true }],
    });
    const deps = makeDeps(); // no tool calls
    const result = await runScenario(scenario, deps);

    expect(result.passed).toBe(false);
    expect(result.toolCallErrors).toHaveLength(1);
    expect(result.toolCallErrors[0]).toContain('required_tool');
  });
});
