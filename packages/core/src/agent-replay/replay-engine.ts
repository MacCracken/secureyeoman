/**
 * Replay Engine — re-executes an execution trace with optional overrides.
 *
 * Supports two modes:
 * - **Mock replay**: Uses recorded tool results (no live calls). Fast, deterministic.
 * - **Live replay**: Re-executes the same input with live LLM + tool calls.
 */

import type {
  ExecutionTrace,
  ReplayOptions,
  AgentReplayConfig,
  ToolCallStep,
} from '@secureyeoman/shared';
import { TraceRecorder } from './trace-recorder.js';

export interface ReplayDeps {
  /** Execute a prompt and return the trace (live mode) */
  executeAndTrace(opts: {
    input: string;
    personalityId?: string;
    model?: string;
    provider?: string;
    recorder: TraceRecorder;
  }): Promise<{ output: string; model: string; provider: string }>;
}

export class ReplayEngine {
  private readonly config: AgentReplayConfig;
  private activeReplays = 0;

  constructor(config: AgentReplayConfig) {
    this.config = config;
  }

  get currentReplays(): number {
    return this.activeReplays;
  }

  async replay(
    sourceTrace: ExecutionTrace,
    options: ReplayOptions,
    deps: ReplayDeps
  ): Promise<ExecutionTrace> {
    if (this.activeReplays >= this.config.maxConcurrentReplays) {
      throw new Error(
        `Maximum concurrent replays (${this.config.maxConcurrentReplays}) reached`
      );
    }

    this.activeReplays++;
    try {
      if (options.mockToolCalls) {
        return this.mockReplay(sourceTrace, options);
      }
      return await this.liveReplay(sourceTrace, options, deps);
    } finally {
      this.activeReplays--;
    }
  }

  private mockReplay(
    sourceTrace: ExecutionTrace,
    options: ReplayOptions
  ): ExecutionTrace {
    const recorder = new TraceRecorder(this.config);

    // Replay all steps from the source trace as-is
    for (const step of sourceTrace.steps) {
      switch (step.type) {
        case 'llm_call':
          recorder.recordLlmCall({
            model: options.model ?? step.model,
            provider: options.provider ?? step.provider,
            messageCount: step.messageCount,
            toolCount: step.toolCount,
            responseText: step.responseText,
            stopReason: step.stopReason,
            inputTokens: step.inputTokens,
            outputTokens: step.outputTokens,
            costUsd: step.costUsd,
            durationMs: step.durationMs,
          });
          break;
        case 'tool_call':
          recorder.recordToolCall({
            toolName: step.toolName,
            serverId: step.serverId,
            args: step.args,
            result: step.result,
            isError: step.isError,
            blocked: step.blocked,
            blockReason: step.blockReason,
            durationMs: step.durationMs,
          });
          break;
        case 'guard_check':
          recorder.recordGuardCheck({
            guardName: step.guardName,
            passed: step.passed,
            findingCount: step.findingCount,
            findings: step.findings,
            contentModified: step.contentModified,
            durationMs: step.durationMs,
          });
          break;
        case 'brain_retrieval':
          recorder.recordBrainRetrieval({
            memoriesUsed: step.memoriesUsed,
            knowledgeUsed: step.knowledgeUsed,
            snippetCount: step.snippetCount,
            retrievalMode: step.retrievalMode,
            durationMs: step.durationMs,
          });
          break;
        case 'error':
          recorder.recordError({
            message: step.message,
            source: step.source,
            recovered: step.recovered,
            durationMs: step.durationMs,
          });
          break;
      }
    }

    return recorder.finalize({
      input: sourceTrace.input,
      output: sourceTrace.output,
      conversationId: undefined,
      personalityId: options.personalityId ?? sourceTrace.personalityId,
      personalityName: sourceTrace.personalityName,
      model: options.model ?? sourceTrace.model,
      provider: options.provider ?? sourceTrace.provider,
      success: sourceTrace.success,
      errorMessage: sourceTrace.errorMessage,
      tags: options.tags,
      label: options.label ?? `Mock replay of ${sourceTrace.id}`,
      isReplay: true,
      sourceTraceId: sourceTrace.id,
      tenantId: sourceTrace.tenantId,
    });
  }

  private async liveReplay(
    sourceTrace: ExecutionTrace,
    options: ReplayOptions,
    deps: ReplayDeps
  ): Promise<ExecutionTrace> {
    const recorder = new TraceRecorder(this.config);

    try {
      const result = await deps.executeAndTrace({
        input: sourceTrace.input,
        personalityId: options.personalityId ?? sourceTrace.personalityId,
        model: options.model,
        provider: options.provider,
        recorder,
      });

      return recorder.finalize({
        input: sourceTrace.input,
        output: result.output,
        personalityId: options.personalityId ?? sourceTrace.personalityId,
        personalityName: sourceTrace.personalityName,
        model: result.model,
        provider: result.provider,
        success: true,
        tags: options.tags,
        label: options.label ?? `Live replay of ${sourceTrace.id}`,
        isReplay: true,
        sourceTraceId: sourceTrace.id,
        tenantId: sourceTrace.tenantId,
      });
    } catch (err) {
      return recorder.finalize({
        input: sourceTrace.input,
        output: '',
        personalityId: options.personalityId ?? sourceTrace.personalityId,
        model: options.model ?? sourceTrace.model,
        provider: options.provider ?? sourceTrace.provider,
        success: false,
        errorMessage: err instanceof Error ? err.message : String(err),
        tags: options.tags,
        label: options.label ?? `Live replay of ${sourceTrace.id} (failed)`,
        isReplay: true,
        sourceTraceId: sourceTrace.id,
        tenantId: sourceTrace.tenantId,
      });
    }
  }

  /** Extract tool call results from a trace for mock injection */
  static extractToolResults(trace: ExecutionTrace): Map<string, string> {
    const results = new Map<string, string>();
    for (const step of trace.steps) {
      if (step.type === 'tool_call' && !step.isError && !step.blocked) {
        const key = `${step.toolName}:${JSON.stringify(step.args)}`;
        results.set(key, step.result);
      }
    }
    return results;
  }
}
