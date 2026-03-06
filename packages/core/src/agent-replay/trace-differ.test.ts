/**
 * Tests for TraceDiffer
 */

import { describe, it, expect } from 'vitest';
import { diffTraces } from './trace-differ.js';
import type { ExecutionTrace, ToolCallStep, LlmCallStep } from '@secureyeoman/shared';

function makeTrace(overrides: Partial<ExecutionTrace> = {}): ExecutionTrace {
  return {
    id: 'trace-1',
    model: 'gpt-4',
    provider: 'openai',
    input: 'hello',
    output: 'world',
    steps: [],
    totalDurationMs: 1000,
    totalInputTokens: 100,
    totalOutputTokens: 50,
    totalCostUsd: 0.01,
    toolIterations: 1,
    success: true,
    tags: [],
    isReplay: false,
    createdAt: Date.now(),
    tenantId: 'default',
    ...overrides,
  };
}

function makeToolStep(overrides: Partial<ToolCallStep> = {}): ToolCallStep {
  return {
    index: 0,
    type: 'tool_call',
    timestamp: Date.now(),
    durationMs: 100,
    toolName: 'web_search',
    args: { query: 'test' },
    result: 'found it',
    isError: false,
    blocked: false,
    ...overrides,
  };
}

function makeLlmStep(overrides: Partial<LlmCallStep> = {}): LlmCallStep {
  return {
    index: 0,
    type: 'llm_call',
    timestamp: Date.now(),
    durationMs: 500,
    model: 'gpt-4',
    provider: 'openai',
    messageCount: 3,
    toolCount: 5,
    responseText: 'Hello',
    stopReason: 'end_turn',
    inputTokens: 100,
    outputTokens: 50,
    costUsd: 0.01,
    ...overrides,
  };
}

describe('diffTraces', () => {
  it('detects identical outputs', () => {
    const a = makeTrace({ output: 'same' });
    const b = makeTrace({ id: 'trace-2', output: 'same' });
    const diff = diffTraces(a, b);
    expect(diff.outputMatch).toBe(true);
  });

  it('detects different outputs', () => {
    const a = makeTrace({ output: 'hello' });
    const b = makeTrace({ id: 'trace-2', output: 'goodbye' });
    const diff = diffTraces(a, b);
    expect(diff.outputMatch).toBe(false);
  });

  it('computes duration/token/cost diffs', () => {
    const a = makeTrace({
      totalDurationMs: 1000,
      totalInputTokens: 100,
      totalOutputTokens: 50,
      totalCostUsd: 0.01,
    });
    const b = makeTrace({
      id: 'b',
      totalDurationMs: 1500,
      totalInputTokens: 200,
      totalOutputTokens: 80,
      totalCostUsd: 0.02,
    });
    const diff = diffTraces(a, b);
    expect(diff.durationDiffMs).toBe(500);
    expect(diff.tokenDiff).toBe(130);
    expect(diff.costDiff).toBeCloseTo(0.01);
  });

  it('diffs matching tool calls', () => {
    const a = makeTrace({
      steps: [makeToolStep({ toolName: 'search', args: { q: '1' }, result: 'r1' })],
    });
    const b = makeTrace({
      id: 'b',
      steps: [makeToolStep({ toolName: 'search', args: { q: '1' }, result: 'r1' })],
    });
    const diff = diffTraces(a, b);
    expect(diff.toolCallDiffs).toHaveLength(1);
    expect(diff.toolCallDiffs[0]!.status).toBe('same');
  });

  it('detects tool calls with different args', () => {
    const a = makeTrace({ steps: [makeToolStep({ toolName: 'search', args: { q: 'a' } })] });
    const b = makeTrace({
      id: 'b',
      steps: [makeToolStep({ toolName: 'search', args: { q: 'b' } })],
    });
    const diff = diffTraces(a, b);
    expect(diff.toolCallDiffs[0]!.status).toBe('args_differ');
  });

  it('detects removed tool calls', () => {
    const a = makeTrace({ steps: [makeToolStep({ toolName: 'removed_tool' })] });
    const b = makeTrace({ id: 'b', steps: [] });
    const diff = diffTraces(a, b);
    expect(diff.toolCallDiffs).toHaveLength(1);
    expect(diff.toolCallDiffs[0]!.status).toBe('removed_in_b');
  });

  it('detects added tool calls', () => {
    const a = makeTrace({ steps: [] });
    const b = makeTrace({ id: 'b', steps: [makeToolStep({ toolName: 'new_tool' })] });
    const diff = diffTraces(a, b);
    expect(diff.toolCallDiffs).toHaveLength(1);
    expect(diff.toolCallDiffs[0]!.status).toBe('added_in_b');
  });

  it('aligns steps by index', () => {
    const a = makeTrace({
      steps: [makeLlmStep({ index: 0 }), makeToolStep({ index: 1 })],
    });
    const b = makeTrace({
      id: 'b',
      steps: [makeLlmStep({ index: 0 }), makeToolStep({ index: 1, toolName: 'different' })],
    });
    const diff = diffTraces(a, b);
    expect(diff.stepAlignment).toHaveLength(2);
    expect(diff.stepAlignment[0]!.match).toBe('exact');
    expect(diff.stepAlignment[1]!.match).toBe('similar');
  });

  it('handles missing steps in alignment', () => {
    const a = makeTrace({ steps: [makeLlmStep({ index: 0 })] });
    const b = makeTrace({
      id: 'b',
      steps: [makeLlmStep({ index: 0 }), makeToolStep({ index: 1 })],
    });
    const diff = diffTraces(a, b);
    expect(diff.stepAlignment).toHaveLength(2);
    expect(diff.stepAlignment[1]!.match).toBe('missing_a');
  });

  it('includes output similarity when provided', () => {
    const diff = diffTraces(makeTrace(), makeTrace({ id: 'b' }), 0.95);
    expect(diff.outputSimilarity).toBe(0.95);
  });
});
