/**
 * Agent Replay & Debugging Types
 *
 * Execution trace recording, step-by-step replay, and trace comparison.
 * Complements the eval harness (Phase 135) by capturing full execution
 * traces from live conversations for replay and debugging.
 */

import { z } from 'zod';

// ── Trace Step Types ─────────────────────────────────────────────────

export const TraceStepTypeSchema = z.enum([
  'llm_call',
  'tool_call',
  'guard_check',
  'brain_retrieval',
  'error',
]);

export type TraceStepType = z.infer<typeof TraceStepTypeSchema>;

export interface TraceStepBase {
  /** Step index in the trace (0-based) */
  index: number;
  /** Step type discriminator */
  type: TraceStepType;
  /** Wall-clock timestamp (ms since epoch) */
  timestamp: number;
  /** Duration of this step in milliseconds */
  durationMs: number;
}

export interface LlmCallStep extends TraceStepBase {
  type: 'llm_call';
  /** Model used */
  model: string;
  /** Provider name */
  provider: string;
  /** Number of messages sent */
  messageCount: number;
  /** Tool schemas provided to the model */
  toolCount: number;
  /** Model's response text (may be empty if tool_use) */
  responseText: string;
  /** Stop reason */
  stopReason: string;
  /** Token usage */
  inputTokens: number;
  outputTokens: number;
  /** Estimated cost */
  costUsd: number;
}

export interface ToolCallStep extends TraceStepBase {
  type: 'tool_call';
  /** Tool name */
  toolName: string;
  /** Server ID (for MCP tools) */
  serverId?: string;
  /** Arguments passed to the tool */
  args: Record<string, unknown>;
  /** Tool result (truncated if too large) */
  result: string;
  /** Whether the tool errored */
  isError: boolean;
  /** Whether LLM Judge or Intent blocked this call */
  blocked: boolean;
  blockReason?: string;
}

export interface GuardCheckStep extends TraceStepBase {
  type: 'guard_check';
  /** Guard name (e.g. 'ResponseGuard', 'ContentGuardrail', 'PromptGuard') */
  guardName: string;
  /** Whether the guard passed */
  passed: boolean;
  /** Number of findings */
  findingCount: number;
  /** Finding summaries */
  findings: string[];
  /** Whether content was modified (e.g. PII redacted) */
  contentModified: boolean;
}

export interface BrainRetrievalStep extends TraceStepBase {
  type: 'brain_retrieval';
  /** Number of memories retrieved */
  memoriesUsed: number;
  /** Number of knowledge entries used */
  knowledgeUsed: number;
  /** Number of context snippets */
  snippetCount: number;
  /** Retrieval mode (rag | notebook | hybrid) */
  retrievalMode: string;
}

export interface ErrorStep extends TraceStepBase {
  type: 'error';
  /** Error message */
  message: string;
  /** Error source (e.g. 'tool_call', 'llm_call', 'guard') */
  source: string;
  /** Whether the error was recovered from */
  recovered: boolean;
}

export type TraceStep =
  | LlmCallStep
  | ToolCallStep
  | GuardCheckStep
  | BrainRetrievalStep
  | ErrorStep;

// ── Execution Trace ──────────────────────────────────────────────────

export interface ExecutionTrace {
  /** Unique trace ID */
  id: string;
  /** Source conversation ID (if from live chat) */
  conversationId?: string;
  /** Personality used */
  personalityId?: string;
  personalityName?: string;
  /** Model used */
  model: string;
  provider: string;
  /** User's original input */
  input: string;
  /** Final agent output */
  output: string;
  /** All execution steps in order */
  steps: TraceStep[];
  /** Total wall-clock duration */
  totalDurationMs: number;
  /** Total token usage */
  totalInputTokens: number;
  totalOutputTokens: number;
  /** Total estimated cost */
  totalCostUsd: number;
  /** Number of tool call iterations */
  toolIterations: number;
  /** Whether the trace completed successfully */
  success: boolean;
  /** Error message if failed */
  errorMessage?: string;
  /** Tags for organization */
  tags: string[];
  /** Optional label/description */
  label?: string;
  /** Whether this trace was from a replay */
  isReplay: boolean;
  /** Source trace ID if this is a replay */
  sourceTraceId?: string;
  /** Timestamp */
  createdAt: number;
  /** Tenant ID */
  tenantId: string;
}

// ── Replay Options ───────────────────────────────────────────────────

export const ReplayOptionsSchema = z.object({
  /** Override model for replay */
  model: z.string().optional(),
  /** Override provider */
  provider: z.string().optional(),
  /** Override personality */
  personalityId: z.string().optional(),
  /** Use recorded tool results instead of live execution */
  mockToolCalls: z.boolean().default(false),
  /** Tags to apply to the replay trace */
  tags: z.array(z.string()).default([]),
  /** Label for this replay */
  label: z.string().optional(),
});

export type ReplayOptions = z.infer<typeof ReplayOptionsSchema>;

// ── Trace Diff ───────────────────────────────────────────────────────

export interface TraceDiff {
  traceA: { id: string; label?: string; model: string };
  traceB: { id: string; label?: string; model: string };
  /** Whether the outputs match */
  outputMatch: boolean;
  /** Cosine similarity of outputs (if available) */
  outputSimilarity?: number;
  /** Tool call differences */
  toolCallDiffs: ToolCallDiff[];
  /** Timing differences */
  durationDiffMs: number;
  tokenDiff: number;
  costDiff: number;
  /** Step-by-step alignment */
  stepAlignment: StepAlignment[];
}

export interface ToolCallDiff {
  toolName: string;
  /** 'same' | 'added_in_b' | 'removed_in_b' | 'args_differ' | 'result_differ' */
  status: 'same' | 'added_in_b' | 'removed_in_b' | 'args_differ' | 'result_differ';
  detailA?: string;
  detailB?: string;
}

export interface StepAlignment {
  indexA: number | null;
  indexB: number | null;
  type: TraceStepType;
  match: 'exact' | 'similar' | 'different' | 'missing_a' | 'missing_b';
  summary: string;
}

// ── Config ───────────────────────────────────────────────────────────

export const AgentReplayConfigSchema = z
  .object({
    /** Enable execution trace recording */
    enabled: z.boolean().default(false),
    /** Maximum steps per trace (prevents runaway recordings) */
    maxStepsPerTrace: z.number().int().min(10).max(500).default(200),
    /** Truncate tool results longer than this (bytes) */
    maxToolResultLength: z.number().int().min(100).default(10_000),
    /** Retention period for traces in days */
    retentionDays: z.number().int().min(1).default(30),
    /** Maximum concurrent replays */
    maxConcurrentReplays: z.number().int().min(1).max(5).default(2),
  })
  .default({});

export type AgentReplayConfig = z.infer<typeof AgentReplayConfigSchema>;
