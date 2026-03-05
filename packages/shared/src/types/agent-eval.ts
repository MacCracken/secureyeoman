/**
 * Agent Evaluation Harness Types
 *
 * Schemas and types for the agent evaluation framework — "unit tests for AI agents."
 * Defines eval scenarios, run results, and configuration.
 */

import { z } from 'zod';

// ─── Eval Assertion Schemas ─────────────────────────────────────

export const ExactMatchAssertionSchema = z.object({
  type: z.literal('exact'),
  value: z.string(),
});

export const RegexAssertionSchema = z.object({
  type: z.literal('regex'),
  pattern: z.string(),
});

export const SemanticAssertionSchema = z.object({
  type: z.literal('semantic'),
  value: z.string(),
  /** Minimum cosine similarity threshold (0–1). Default 0.8. */
  threshold: z.number().min(0).max(1).default(0.8),
});

export const ContainsAssertionSchema = z.object({
  type: z.literal('contains'),
  value: z.string(),
  caseSensitive: z.boolean().default(false),
});

export const NotContainsAssertionSchema = z.object({
  type: z.literal('not_contains'),
  value: z.string(),
  caseSensitive: z.boolean().default(false),
});

export const OutputAssertionSchema = z.discriminatedUnion('type', [
  ExactMatchAssertionSchema,
  RegexAssertionSchema,
  SemanticAssertionSchema,
  ContainsAssertionSchema,
  NotContainsAssertionSchema,
]);

export type OutputAssertion = z.infer<typeof OutputAssertionSchema>;

// ─── Expected Tool Call ─────────────────────────────────────────

export const ExpectedToolCallSchema = z.object({
  /** Tool name that should be called. */
  name: z.string().min(1),
  /** Expected arguments (partial match — only specified keys are checked). */
  args: z.record(z.string(), z.unknown()).optional(),
  /** Whether this tool call is required (true) or optional (false). Default true. */
  required: z.boolean().default(true),
});

export type ExpectedToolCall = z.infer<typeof ExpectedToolCallSchema>;

// ─── Eval Scenario ──────────────────────────────────────────────

export const EvalScenarioSchema = z.object({
  /** Unique scenario identifier. */
  id: z.string().min(1).max(200),
  /** Human-readable name. */
  name: z.string().min(1).max(500),
  /** Description of what this scenario tests. */
  description: z.string().max(2000).default(''),
  /** Category/tag for grouping. */
  category: z.string().max(100).default('general'),
  /** Tags for filtering. */
  tags: z.array(z.string().max(50)).default([]),

  /** The input prompt to send to the agent. */
  input: z.string().min(1),
  /** Optional conversation history to prepend (multi-turn scenarios). */
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .default([]),

  /** Expected tool calls (ordered or unordered). */
  expectedToolCalls: z.array(ExpectedToolCallSchema).default([]),
  /** Whether tool call order matters. Default false (unordered). */
  orderedToolCalls: z.boolean().default(false),
  /** Tool calls that must NOT occur. */
  forbiddenToolCalls: z.array(z.string()).default([]),

  /** Assertions on the final output. All must pass. */
  outputAssertions: z.array(OutputAssertionSchema).default([]),

  /** Maximum tokens the agent should consume. Null = no limit. */
  maxTokens: z.number().int().positive().nullable().default(null),
  /** Maximum wall-clock time in milliseconds. Default 60s. */
  maxDurationMs: z.number().int().positive().default(60_000),

  /** Personality ID to use. Null = default personality. */
  personalityId: z.string().nullable().default(null),
  /** Skill IDs to activate for this scenario. Empty = personality defaults. */
  skillIds: z.array(z.string()).default([]),
  /** Model override for this scenario. Null = personality default. */
  model: z.string().nullable().default(null),
});

export type EvalScenario = z.infer<typeof EvalScenarioSchema>;

// ─── Eval Suite ─────────────────────────────────────────────────

export const EvalSuiteSchema = z.object({
  /** Unique suite identifier. */
  id: z.string().min(1).max(200),
  /** Human-readable name. */
  name: z.string().min(1).max(500),
  /** Description. */
  description: z.string().max(2000).default(''),
  /** Ordered list of scenario IDs in this suite. */
  scenarioIds: z.array(z.string().min(1)),
  /** Maximum total cost budget in USD. Null = no limit. */
  maxCostUsd: z.number().positive().nullable().default(null),
  /** Maximum concurrent scenario executions. Default 1 (sequential). */
  concurrency: z.number().int().min(1).max(20).default(1),
});

export type EvalSuite = z.infer<typeof EvalSuiteSchema>;

// ─── Assertion Result ───────────────────────────────────────────

export const AssertionResultSchema = z.object({
  assertion: OutputAssertionSchema,
  passed: z.boolean(),
  actual: z.string().optional(),
  reason: z.string().optional(),
});

export type AssertionResult = z.infer<typeof AssertionResultSchema>;

// ─── Tool Call Record ───────────────────────────────────────────

export const ToolCallRecordSchema = z.object({
  name: z.string(),
  args: z.record(z.string(), z.unknown()).default({}),
  result: z.string().optional(),
  durationMs: z.number().int().default(0),
  timestamp: z.number().int(),
});

export type ToolCallRecord = z.infer<typeof ToolCallRecordSchema>;

// ─── Scenario Run Result ────────────────────────────────────────

export const ScenarioRunResultSchema = z.object({
  scenarioId: z.string(),
  scenarioName: z.string(),
  passed: z.boolean(),
  /** Overall status. */
  status: z.enum(['passed', 'failed', 'error', 'timeout', 'budget_exceeded']),
  /** Agent's final output text. */
  output: z.string().default(''),
  /** Assertion results. */
  assertionResults: z.array(AssertionResultSchema).default([]),
  /** Actual tool calls made by the agent. */
  toolCalls: z.array(ToolCallRecordSchema).default([]),
  /** Tool call validation results. */
  toolCallErrors: z.array(z.string()).default([]),
  /** Forbidden tool calls that were invoked. */
  forbiddenToolCallViolations: z.array(z.string()).default([]),
  /** Token usage. */
  inputTokens: z.number().int().default(0),
  outputTokens: z.number().int().default(0),
  totalTokens: z.number().int().default(0),
  /** Estimated cost in USD. */
  costUsd: z.number().default(0),
  /** Wall-clock duration in milliseconds. */
  durationMs: z.number().int().default(0),
  /** Error message if status is 'error'. */
  errorMessage: z.string().optional(),
  /** Model used. */
  model: z.string().optional(),
  /** Personality used. */
  personalityId: z.string().optional(),
});

export type ScenarioRunResult = z.infer<typeof ScenarioRunResultSchema>;

// ─── Suite Run Result ───────────────────────────────────────────

export const SuiteRunResultSchema = z.object({
  id: z.string(),
  suiteId: z.string(),
  suiteName: z.string(),
  /** Overall pass/fail. */
  passed: z.boolean(),
  /** Scenario results. */
  results: z.array(ScenarioRunResultSchema),
  /** Summary counts. */
  totalScenarios: z.number().int(),
  passedCount: z.number().int(),
  failedCount: z.number().int(),
  errorCount: z.number().int(),
  /** Aggregate metrics. */
  totalDurationMs: z.number().int(),
  totalTokens: z.number().int(),
  totalCostUsd: z.number(),
  /** Timestamp. */
  startedAt: z.number().int(),
  completedAt: z.number().int(),
});

export type SuiteRunResult = z.infer<typeof SuiteRunResultSchema>;

// ─── Config Schema ──────────────────────────────────────────────

export const AgentEvalConfigSchema = z
  .object({
    /** Enable the agent evaluation harness. */
    enabled: z.boolean().default(false),
    /** Default timeout per scenario in milliseconds. */
    defaultTimeoutMs: z.number().int().positive().max(300_000).default(60_000),
    /** Maximum concurrent scenario executions. */
    maxConcurrency: z.number().int().min(1).max(20).default(3),
    /** Maximum total cost per suite run in USD. Null = no limit. */
    defaultMaxCostUsd: z.number().positive().nullable().default(null),
    /** Store full execution traces (tool calls, outputs) in the database. */
    storeTraces: z.boolean().default(true),
    /** Retention period for run results in days. */
    retentionDays: z.number().int().min(1).default(90),
  })
  .default({});

export type AgentEvalConfig = z.infer<typeof AgentEvalConfigSchema>;
