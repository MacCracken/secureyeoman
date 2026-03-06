/**
 * Trace Recorder — captures execution steps during agent conversations.
 *
 * Injected into chat-routes to record LLM calls, tool calls, guard checks,
 * brain retrieval, and errors as they happen. Produces an ExecutionTrace.
 */

import { randomUUID } from 'node:crypto';
import type {
  ExecutionTrace,
  TraceStep,
  LlmCallStep,
  ToolCallStep,
  GuardCheckStep,
  BrainRetrievalStep,
  ErrorStep,
  AgentReplayConfig,
} from '@secureyeoman/shared';

export class TraceRecorder {
  private readonly steps: TraceStep[] = [];
  private readonly startTime: number;
  private readonly config: AgentReplayConfig;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private totalCostUsd = 0;
  private toolIterations = 0;

  readonly traceId: string;

  constructor(config: AgentReplayConfig) {
    this.config = config;
    this.traceId = randomUUID();
    this.startTime = Date.now();
  }

  private nextIndex(): number {
    return this.steps.length;
  }

  private canRecord(): boolean {
    return this.steps.length < this.config.maxStepsPerTrace;
  }

  recordLlmCall(data: Omit<LlmCallStep, 'index' | 'type' | 'timestamp'>): void {
    if (!this.canRecord()) return;
    this.steps.push({
      ...data,
      index: this.nextIndex(),
      type: 'llm_call',
      timestamp: Date.now(),
    });
    this.totalInputTokens += data.inputTokens;
    this.totalOutputTokens += data.outputTokens;
    this.totalCostUsd += data.costUsd;
    this.toolIterations++;
  }

  recordToolCall(data: Omit<ToolCallStep, 'index' | 'type' | 'timestamp'>): void {
    if (!this.canRecord()) return;
    // Truncate large tool results
    let result = data.result;
    if (result.length > this.config.maxToolResultLength) {
      result = result.slice(0, this.config.maxToolResultLength) + '... [truncated]';
    }
    this.steps.push({
      ...data,
      result,
      index: this.nextIndex(),
      type: 'tool_call',
      timestamp: Date.now(),
    });
  }

  recordGuardCheck(data: Omit<GuardCheckStep, 'index' | 'type' | 'timestamp'>): void {
    if (!this.canRecord()) return;
    this.steps.push({
      ...data,
      index: this.nextIndex(),
      type: 'guard_check',
      timestamp: Date.now(),
    });
  }

  recordBrainRetrieval(data: Omit<BrainRetrievalStep, 'index' | 'type' | 'timestamp'>): void {
    if (!this.canRecord()) return;
    this.steps.push({
      ...data,
      index: this.nextIndex(),
      type: 'brain_retrieval',
      timestamp: Date.now(),
    });
  }

  recordError(data: Omit<ErrorStep, 'index' | 'type' | 'timestamp'>): void {
    if (!this.canRecord()) return;
    this.steps.push({
      ...data,
      index: this.nextIndex(),
      type: 'error',
      timestamp: Date.now(),
    });
  }

  finalize(opts: {
    input: string;
    output: string;
    conversationId?: string;
    personalityId?: string;
    personalityName?: string;
    model: string;
    provider: string;
    success: boolean;
    errorMessage?: string;
    tags?: string[];
    label?: string;
    isReplay?: boolean;
    sourceTraceId?: string;
    tenantId?: string;
  }): ExecutionTrace {
    return {
      id: this.traceId,
      conversationId: opts.conversationId,
      personalityId: opts.personalityId,
      personalityName: opts.personalityName,
      model: opts.model,
      provider: opts.provider,
      input: opts.input,
      output: opts.output,
      steps: this.steps,
      totalDurationMs: Date.now() - this.startTime,
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      totalCostUsd: this.totalCostUsd,
      toolIterations: this.toolIterations,
      success: opts.success,
      errorMessage: opts.errorMessage,
      tags: opts.tags ?? [],
      label: opts.label,
      isReplay: opts.isReplay ?? false,
      sourceTraceId: opts.sourceTraceId,
      createdAt: Date.now(),
      tenantId: opts.tenantId ?? 'default',
    };
  }
}
