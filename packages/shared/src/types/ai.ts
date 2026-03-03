/**
 * AI Types for SecureYeoman
 *
 * Shared type definitions and Zod schemas for the multi-provider AI client layer.
 *
 * Security considerations:
 * - Token counts are validated as non-negative integers
 * - Tool call IDs are validated strings
 * - Content is validated but not sanitized here (handled by InputValidator)
 */

import { z } from 'zod';

// ─── Token Usage ──────────────────────────────────────────────

export const TokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cachedTokens: z.number().int().nonnegative().default(0),
  totalTokens: z.number().int().nonnegative(),
  thinkingTokens: z.number().int().nonnegative().optional(),
});

export type TokenUsage = z.infer<typeof TokenUsageSchema>;

// ─── Tool Definitions ─────────────────────────────────────────

export const ToolParameterSchema: z.ZodType = z.lazy(() =>
  z.object({
    type: z.string(),
    description: z.string().optional(),
    properties: z.record(z.string(), ToolParameterSchema).optional(),
    required: z.array(z.string()).optional(),
    items: ToolParameterSchema.optional(),
    enum: z.array(z.union([z.string(), z.number()])).optional(),
  })
);

export type ToolParameter = z.infer<typeof ToolParameterSchema>;

export const ToolSchema = z.object({
  name: z.string().min(1).max(256),
  description: z.string().max(4096).optional(),
  parameters: ToolParameterSchema,
});

export type Tool = z.infer<typeof ToolSchema>;

export const ToolCallSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()),
});

export type ToolCall = z.infer<typeof ToolCallSchema>;

export const ToolResultSchema = z.object({
  toolCallId: z.string().min(1),
  content: z.string(),
  isError: z.boolean().default(false),
});

export type ToolResult = z.infer<typeof ToolResultSchema>;

// ─── Thinking ─────────────────────────────────────────────────

export const ThinkingBlockSchema = z.object({
  thinking: z.string(),
  signature: z.string(),
});

export type ThinkingBlock = z.infer<typeof ThinkingBlockSchema>;

// ─── Creation Events ──────────────────────────────────────────

export const CreationEventSchema = z.object({
  tool: z.string(),
  label: z.string(),
  action: z.string(),
  name: z.string(),
  id: z.string().optional(),
});

export type CreationEvent = z.infer<typeof CreationEventSchema>;

// ─── Messages ─────────────────────────────────────────────────

export const AIMessageRoleSchema = z.enum(['system', 'user', 'assistant', 'tool']);
export type AIMessageRole = z.infer<typeof AIMessageRoleSchema>;

export const AIMessageSchema = z.object({
  role: AIMessageRoleSchema,
  content: z.string().optional(),
  toolCalls: z.array(ToolCallSchema).optional(),
  toolResult: ToolResultSchema.optional(),
  thinkingBlocks: z.array(ThinkingBlockSchema).optional(),
});

export type AIMessage = z.infer<typeof AIMessageSchema>;

// ─── Request ──────────────────────────────────────────────────

export const AIRequestSchema = z.object({
  messages: z.array(AIMessageSchema).min(1),
  tools: z.array(ToolSchema).optional(),
  maxTokens: z.number().int().positive().max(200000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  stream: z.boolean().default(false),
  stopSequences: z.array(z.string()).optional(),
  model: z.string().optional(),
  thinkingBudgetTokens: z.number().int().min(1024).optional(),
  reasoningEffort: z.enum(['low', 'medium', 'high']).optional(),
});

export type AIRequest = z.infer<typeof AIRequestSchema>;

// ─── Response ─────────────────────────────────────────────────

export const StopReasonSchema = z.enum([
  'end_turn',
  'tool_use',
  'max_tokens',
  'stop_sequence',
  'error',
]);

export type StopReason = z.infer<typeof StopReasonSchema>;

export const AIResponseSchema = z.object({
  id: z.string(),
  content: z.string(),
  toolCalls: z.array(ToolCallSchema).optional(),
  usage: TokenUsageSchema,
  stopReason: StopReasonSchema,
  model: z.string(),
  provider: z.string(),
  thinkingContent: z.string().optional(),
  thinkingBlocks: z.array(ThinkingBlockSchema).optional(),
});

export type AIResponse = z.infer<typeof AIResponseSchema>;

// ─── Streaming ────────────────────────────────────────────────

export const AIStreamChunkSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('thinking_delta'),
    thinking: z.string(),
  }),
  z.object({
    type: z.literal('content_delta'),
    content: z.string(),
  }),
  z.object({
    type: z.literal('tool_call_delta'),
    toolCall: ToolCallSchema.partial().extend({
      id: z.string().optional(),
      name: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('usage'),
    usage: TokenUsageSchema,
  }),
  z.object({
    type: z.literal('done'),
    stopReason: StopReasonSchema,
    usage: TokenUsageSchema.optional(),
    toolCalls: z.array(ToolCallSchema).optional(),
    thinkingBlocks: z.array(ThinkingBlockSchema).optional(),
  }),
]);

export type AIStreamChunk = z.infer<typeof AIStreamChunkSchema>;

// ─── Chat Stream Events (SSE) ──────────────────────────────────

export const ChatStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('thinking_delta'), thinking: z.string() }),
  z.object({ type: z.literal('content_delta'), content: z.string() }),
  z.object({
    type: z.literal('tool_start'),
    toolName: z.string(),
    label: z.string(),
    iteration: z.number(),
  }),
  z.object({
    type: z.literal('tool_result'),
    toolName: z.string(),
    success: z.boolean(),
    isError: z.boolean(),
  }),
  z.object({
    type: z.literal('mcp_tool_start'),
    toolName: z.string(),
    serverName: z.string(),
    iteration: z.number(),
  }),
  z.object({
    type: z.literal('mcp_tool_result'),
    toolName: z.string(),
    serverName: z.string(),
    success: z.boolean(),
  }),
  z.object({ type: z.literal('creation_event'), event: CreationEventSchema }),
  z.object({
    type: z.literal('done'),
    content: z.string(),
    model: z.string(),
    provider: z.string(),
    tokensUsed: z.number().optional(),
    thinkingContent: z.string().optional(),
    creationEvents: z.array(CreationEventSchema),
  }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);

export type ChatStreamEvent = z.infer<typeof ChatStreamEventSchema>;

// ─── Provider Enum ────────────────────────────────────────────

export const AIProviderNameSchema = z.enum([
  'anthropic',
  'openai',
  'gemini',
  'ollama',
  'opencode',
  'lmstudio',
  'localai',
  'deepseek',
  'mistral',
  'grok',
  'letta',
  'groq',
  'openrouter',
]);
export type AIProviderName = z.infer<typeof AIProviderNameSchema>;
