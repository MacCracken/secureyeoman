/**
 * Tests for TraceRecorder
 */

import { describe, it, expect } from 'vitest';
import { TraceRecorder } from './trace-recorder.js';
import type { AgentReplayConfig } from '@secureyeoman/shared';

const config: AgentReplayConfig = {
  enabled: true,
  maxStepsPerTrace: 200,
  maxToolResultLength: 10_000,
  retentionDays: 30,
  maxConcurrentReplays: 2,
};

describe('TraceRecorder', () => {
  it('records LLM call steps', () => {
    const rec = new TraceRecorder(config);
    rec.recordLlmCall({
      model: 'gpt-4',
      provider: 'openai',
      messageCount: 3,
      toolCount: 5,
      responseText: 'Hello!',
      stopReason: 'end_turn',
      inputTokens: 100,
      outputTokens: 20,
      costUsd: 0.005,
      durationMs: 500,
    });

    const trace = rec.finalize({
      input: 'hi',
      output: 'Hello!',
      model: 'gpt-4',
      provider: 'openai',
      success: true,
    });

    expect(trace.steps).toHaveLength(1);
    expect(trace.steps[0]!.type).toBe('llm_call');
    expect(trace.totalInputTokens).toBe(100);
    expect(trace.totalOutputTokens).toBe(20);
    expect(trace.totalCostUsd).toBe(0.005);
    expect(trace.toolIterations).toBe(1);
  });

  it('records tool call steps', () => {
    const rec = new TraceRecorder(config);
    rec.recordToolCall({
      toolName: 'web_search',
      args: { query: 'test' },
      result: 'Found results',
      isError: false,
      blocked: false,
      durationMs: 200,
    });

    const trace = rec.finalize({
      input: 'search',
      output: 'done',
      model: 'gpt-4',
      provider: 'openai',
      success: true,
    });

    expect(trace.steps).toHaveLength(1);
    expect(trace.steps[0]!.type).toBe('tool_call');
    const step = trace.steps[0] as any;
    expect(step.toolName).toBe('web_search');
    expect(step.args).toEqual({ query: 'test' });
  });

  it('truncates large tool results', () => {
    const smallConfig = { ...config, maxToolResultLength: 50 };
    const rec = new TraceRecorder(smallConfig);
    rec.recordToolCall({
      toolName: 'big_tool',
      args: {},
      result: 'x'.repeat(200),
      isError: false,
      blocked: false,
      durationMs: 10,
    });

    const trace = rec.finalize({
      input: 'x',
      output: 'y',
      model: 'm',
      provider: 'p',
      success: true,
    });

    const step = trace.steps[0] as any;
    expect(step.result.length).toBeLessThan(200);
    expect(step.result).toContain('[truncated]');
  });

  it('records guard check steps', () => {
    const rec = new TraceRecorder(config);
    rec.recordGuardCheck({
      guardName: 'ResponseGuard',
      passed: true,
      findingCount: 1,
      findings: ['injection detected'],
      contentModified: false,
      durationMs: 5,
    });

    const trace = rec.finalize({
      input: 'x',
      output: 'y',
      model: 'm',
      provider: 'p',
      success: true,
    });

    expect(trace.steps).toHaveLength(1);
    expect(trace.steps[0]!.type).toBe('guard_check');
  });

  it('records brain retrieval steps', () => {
    const rec = new TraceRecorder(config);
    rec.recordBrainRetrieval({
      memoriesUsed: 5,
      knowledgeUsed: 3,
      snippetCount: 8,
      retrievalMode: 'rag',
      durationMs: 50,
    });

    const trace = rec.finalize({
      input: 'x',
      output: 'y',
      model: 'm',
      provider: 'p',
      success: true,
    });

    expect(trace.steps).toHaveLength(1);
    const step = trace.steps[0] as any;
    expect(step.memoriesUsed).toBe(5);
    expect(step.retrievalMode).toBe('rag');
  });

  it('records error steps', () => {
    const rec = new TraceRecorder(config);
    rec.recordError({
      message: 'Tool timeout',
      source: 'tool_call',
      recovered: true,
      durationMs: 5000,
    });

    const trace = rec.finalize({
      input: 'x',
      output: '',
      model: 'm',
      provider: 'p',
      success: false,
      errorMessage: 'Tool timeout',
    });

    expect(trace.steps).toHaveLength(1);
    expect(trace.success).toBe(false);
    expect(trace.errorMessage).toBe('Tool timeout');
  });

  it('respects maxStepsPerTrace', () => {
    const smallConfig = { ...config, maxStepsPerTrace: 3 };
    const rec = new TraceRecorder(smallConfig);

    for (let i = 0; i < 10; i++) {
      rec.recordGuardCheck({
        guardName: `guard-${i}`,
        passed: true,
        findingCount: 0,
        findings: [],
        contentModified: false,
        durationMs: 1,
      });
    }

    const trace = rec.finalize({
      input: 'x',
      output: 'y',
      model: 'm',
      provider: 'p',
      success: true,
    });

    expect(trace.steps).toHaveLength(3);
  });

  it('sets replay metadata', () => {
    const rec = new TraceRecorder(config);
    const trace = rec.finalize({
      input: 'x',
      output: 'y',
      model: 'm',
      provider: 'p',
      success: true,
      isReplay: true,
      sourceTraceId: 'original-123',
      tags: ['regression'],
      label: 'test replay',
    });

    expect(trace.isReplay).toBe(true);
    expect(trace.sourceTraceId).toBe('original-123');
    expect(trace.tags).toEqual(['regression']);
    expect(trace.label).toBe('test replay');
  });

  it('generates unique trace IDs', () => {
    const a = new TraceRecorder(config);
    const b = new TraceRecorder(config);
    expect(a.traceId).not.toBe(b.traceId);
  });

  it('tracks multiple LLM calls cumulatively', () => {
    const rec = new TraceRecorder(config);
    rec.recordLlmCall({
      model: 'gpt-4',
      provider: 'openai',
      messageCount: 2,
      toolCount: 3,
      responseText: 'a',
      stopReason: 'tool_use',
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.01,
      durationMs: 300,
    });
    rec.recordLlmCall({
      model: 'gpt-4',
      provider: 'openai',
      messageCount: 4,
      toolCount: 3,
      responseText: 'b',
      stopReason: 'end_turn',
      inputTokens: 200,
      outputTokens: 80,
      costUsd: 0.02,
      durationMs: 400,
    });

    const trace = rec.finalize({
      input: 'x',
      output: 'b',
      model: 'gpt-4',
      provider: 'openai',
      success: true,
    });

    expect(trace.totalInputTokens).toBe(300);
    expect(trace.totalOutputTokens).toBe(130);
    expect(trace.totalCostUsd).toBeCloseTo(0.03);
    expect(trace.toolIterations).toBe(2);
  });
});
