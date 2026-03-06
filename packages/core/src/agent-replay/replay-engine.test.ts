/**
 * Tests for ReplayEngine
 */

import { describe, it, expect } from 'vitest';
import { ReplayEngine } from './replay-engine.js';
import type { ExecutionTrace, AgentReplayConfig } from '@secureyeoman/shared';

const config: AgentReplayConfig = {
  enabled: true,
  maxStepsPerTrace: 200,
  maxToolResultLength: 10_000,
  retentionDays: 30,
  maxConcurrentReplays: 2,
};

function makeTrace(overrides: Partial<ExecutionTrace> = {}): ExecutionTrace {
  return {
    id: 'source-1',
    model: 'gpt-4',
    provider: 'openai',
    input: 'hello',
    output: 'world',
    steps: [
      {
        index: 0,
        type: 'llm_call',
        timestamp: Date.now(),
        durationMs: 500,
        model: 'gpt-4',
        provider: 'openai',
        messageCount: 2,
        toolCount: 3,
        responseText: 'I need to search',
        stopReason: 'tool_use',
        inputTokens: 100,
        outputTokens: 20,
        costUsd: 0.005,
      },
      {
        index: 1,
        type: 'tool_call',
        timestamp: Date.now(),
        durationMs: 200,
        toolName: 'web_search',
        args: { query: 'test' },
        result: 'found it',
        isError: false,
        blocked: false,
      },
      {
        index: 2,
        type: 'guard_check',
        timestamp: Date.now(),
        durationMs: 5,
        guardName: 'ResponseGuard',
        passed: true,
        findingCount: 0,
        findings: [],
        contentModified: false,
      },
    ],
    totalDurationMs: 1000,
    totalInputTokens: 100,
    totalOutputTokens: 20,
    totalCostUsd: 0.005,
    toolIterations: 1,
    success: true,
    tags: [],
    isReplay: false,
    createdAt: Date.now(),
    tenantId: 'default',
    ...overrides,
  };
}

const noopDeps = {
  executeAndTrace: async () => {
    throw new Error('not implemented');
  },
};

describe('ReplayEngine', () => {
  it('mock replay reproduces all steps', async () => {
    const engine = new ReplayEngine(config);
    const source = makeTrace();

    const replay = await engine.replay(
      source,
      { mockToolCalls: true, tags: ['test'], label: 'mock test' },
      noopDeps
    );

    expect(replay.isReplay).toBe(true);
    expect(replay.sourceTraceId).toBe('source-1');
    expect(replay.steps).toHaveLength(3);
    expect(replay.steps[0]!.type).toBe('llm_call');
    expect(replay.steps[1]!.type).toBe('tool_call');
    expect(replay.steps[2]!.type).toBe('guard_check');
    expect(replay.input).toBe('hello');
    expect(replay.output).toBe('world');
    expect(replay.tags).toEqual(['test']);
    expect(replay.label).toBe('mock test');
  });

  it('mock replay overrides model/provider', async () => {
    const engine = new ReplayEngine(config);
    const source = makeTrace();

    const replay = await engine.replay(
      source,
      { mockToolCalls: true, model: 'claude-3', provider: 'anthropic' },
      noopDeps
    );

    expect(replay.model).toBe('claude-3');
    expect(replay.provider).toBe('anthropic');
    // LLM call step should also reflect override
    const llmStep = replay.steps[0] as any;
    expect(llmStep.model).toBe('claude-3');
  });

  it('live replay calls executeAndTrace', async () => {
    const engine = new ReplayEngine(config);
    const source = makeTrace();

    const replay = await engine.replay(
      source,
      { mockToolCalls: false },
      {
        executeAndTrace: async ({ recorder }) => {
          recorder.recordLlmCall({
            model: 'gpt-4o',
            provider: 'openai',
            messageCount: 2,
            toolCount: 0,
            responseText: 'live result',
            stopReason: 'end_turn',
            inputTokens: 50,
            outputTokens: 10,
            costUsd: 0.001,
            durationMs: 300,
          });
          return { output: 'live result', model: 'gpt-4o', provider: 'openai' };
        },
      }
    );

    expect(replay.isReplay).toBe(true);
    expect(replay.output).toBe('live result');
    expect(replay.steps).toHaveLength(1);
    expect(replay.success).toBe(true);
  });

  it('live replay handles errors gracefully', async () => {
    const engine = new ReplayEngine(config);
    const source = makeTrace();

    const replay = await engine.replay(
      source,
      { mockToolCalls: false },
      {
        executeAndTrace: async () => {
          throw new Error('LLM provider down');
        },
      }
    );

    expect(replay.success).toBe(false);
    expect(replay.errorMessage).toBe('LLM provider down');
    expect(replay.isReplay).toBe(true);
  });

  it('enforces maxConcurrentReplays', async () => {
    const engine = new ReplayEngine({ ...config, maxConcurrentReplays: 1 });
    const source = makeTrace();

    // Start a slow replay
    const slow = engine.replay(
      source,
      { mockToolCalls: false },
      {
        executeAndTrace: () => new Promise((resolve) => setTimeout(() => resolve({ output: 'ok', model: 'm', provider: 'p' }), 100)),
      }
    );

    // Try another — should reject
    await expect(
      engine.replay(source, { mockToolCalls: true }, noopDeps)
    ).rejects.toThrow('Maximum concurrent replays');

    await slow;

    // Now it should work
    const result = await engine.replay(source, { mockToolCalls: true }, noopDeps);
    expect(result.isReplay).toBe(true);
  });

  it('extractToolResults builds a lookup map', () => {
    const trace = makeTrace();
    const results = ReplayEngine.extractToolResults(trace);
    expect(results.size).toBe(1);
    const key = 'web_search:{"query":"test"}';
    expect(results.get(key)).toBe('found it');
  });
});
