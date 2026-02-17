/**
 * Proactive Assistance Types (Phase 7.2)
 *
 * Zod schemas and TypeScript types for the proactive trigger system,
 * suggestion queue, and pattern learning.
 */

import { z } from 'zod';

// ─── Trigger Condition Schemas ──────────────────────────────────────

export const ScheduleConditionSchema = z.object({
  type: z.literal('schedule'),
  cron: z.string().min(9).max(256),
  timezone: z.string().default('UTC'),
});

export const EventConditionSchema = z.object({
  type: z.literal('event'),
  eventType: z.string().min(1).max(256),
  filter: z.record(z.unknown()).optional(),
});

export const PatternConditionSchema = z.object({
  type: z.literal('pattern'),
  patternId: z.string().min(1).max(128),
  minConfidence: z.number().min(0).max(1).default(0.7),
});

export const WebhookConditionSchema = z.object({
  type: z.literal('webhook'),
  path: z.string().min(1).max(512),
  secret: z.string().optional(),
  method: z.enum(['GET', 'POST', 'PUT']).default('POST'),
});

export const LLMConditionSchema = z.object({
  type: z.literal('llm'),
  prompt: z.string().min(1).max(4096),
  model: z.string().optional(),
  evaluationIntervalMs: z.number().int().positive().default(3600000),
});

export const TriggerConditionSchema = z.discriminatedUnion('type', [
  ScheduleConditionSchema,
  EventConditionSchema,
  PatternConditionSchema,
  WebhookConditionSchema,
  LLMConditionSchema,
]);

// ─── Action Schemas ─────────────────────────────────────────────────

export const MessageActionSchema = z.object({
  type: z.literal('message'),
  content: z.string().min(1).max(4096),
  channel: z.string().optional(),
  targets: z.array(z.string()).optional(),
});

export const WebhookActionSchema = z.object({
  type: z.literal('webhook'),
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('POST'),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  timeoutMs: z.number().int().positive().max(30000).default(5000),
});

export const RemindActionSchema = z.object({
  type: z.literal('remind'),
  content: z.string().min(1).max(4096),
  delayMs: z.number().int().positive().optional(),
  category: z.string().default('proactive_reminder'),
});

export const ExecuteActionSchema = z.object({
  type: z.literal('execute'),
  taskName: z.string().min(1).max(256),
  taskInput: z.record(z.unknown()).optional(),
  agentProfile: z.string().optional(),
});

export const LearnActionSchema = z.object({
  type: z.literal('learn'),
  memoryType: z.enum(['procedural', 'semantic', 'episodic']).default('procedural'),
  content: z.string().min(1).max(4096),
  category: z.string().default('proactive_learning'),
  importance: z.number().min(0).max(1).default(0.6),
});

export const ProactiveActionSchema = z.discriminatedUnion('type', [
  MessageActionSchema,
  WebhookActionSchema,
  RemindActionSchema,
  ExecuteActionSchema,
  LearnActionSchema,
]);

// ─── Trigger Schema ─────────────────────────────────────────────────

export const ProactiveTriggerSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(256),
  description: z.string().max(1024).optional(),
  enabled: z.boolean().default(true),
  type: z.enum(['schedule', 'event', 'pattern', 'webhook', 'llm']),
  condition: TriggerConditionSchema,
  action: ProactiveActionSchema,
  approvalMode: z.enum(['auto', 'suggest', 'manual']).default('suggest'),
  cooldownMs: z.number().int().min(0).default(0),
  limitPerDay: z.number().int().min(0).default(0),
  builtin: z.boolean().default(false),
  createdAt: z.string().or(z.date()).optional(),
  updatedAt: z.string().or(z.date()).optional(),
});

export const ProactiveTriggerCreateSchema = ProactiveTriggerSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  builtin: true,
});

// ─── Suggestion Schema ──────────────────────────────────────────────

export const SuggestionStatusSchema = z.enum([
  'pending',
  'approved',
  'dismissed',
  'executed',
  'expired',
]);

export const SuggestionSchema = z.object({
  id: z.string(),
  triggerId: z.string(),
  triggerName: z.string(),
  action: ProactiveActionSchema,
  context: z.record(z.unknown()).default({}),
  confidence: z.number().min(0).max(1).default(1),
  suggestedAt: z.string().or(z.date()),
  status: SuggestionStatusSchema.default('pending'),
  expiresAt: z.string().or(z.date()),
  approvedAt: z.string().or(z.date()).optional(),
  executedAt: z.string().or(z.date()).optional(),
  dismissedAt: z.string().or(z.date()).optional(),
  result: z.record(z.unknown()).optional(),
});

// ─── Config Schema ──────────────────────────────────────────────────

export const ProactiveConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    maxQueueSize: z.number().int().positive().max(500).default(50),
    autoDismissAfterMs: z.number().int().positive().max(604800000).default(86400000),
    defaultApprovalMode: z.enum(['auto', 'suggest', 'manual']).default('suggest'),
    limits: z
      .object({
        maxTriggers: z.number().int().positive().max(500).default(100),
        actionsPerDay: z.number().int().positive().max(10000).default(1000),
      })
      .default({}),
    learning: z
      .object({
        enabled: z.boolean().default(true),
        minConfidence: z.number().min(0).max(1).default(0.7),
        lookbackDays: z.number().int().positive().max(90).default(30),
      })
      .default({}),
    builtins: z
      .object({
        dailyStandup: z.boolean().default(false),
        weeklySummary: z.boolean().default(false),
        contextualFollowup: z.boolean().default(false),
        integrationHealthAlert: z.boolean().default(false),
        securityAlertDigest: z.boolean().default(false),
      })
      .default({}),
  })
  .default({});

// ─── Inferred Types ─────────────────────────────────────────────────

export type ScheduleCondition = z.infer<typeof ScheduleConditionSchema>;
export type EventCondition = z.infer<typeof EventConditionSchema>;
export type PatternCondition = z.infer<typeof PatternConditionSchema>;
export type WebhookCondition = z.infer<typeof WebhookConditionSchema>;
export type LLMCondition = z.infer<typeof LLMConditionSchema>;
export type TriggerCondition = z.infer<typeof TriggerConditionSchema>;

export type MessageAction = z.infer<typeof MessageActionSchema>;
export type WebhookAction = z.infer<typeof WebhookActionSchema>;
export type RemindAction = z.infer<typeof RemindActionSchema>;
export type ExecuteAction = z.infer<typeof ExecuteActionSchema>;
export type LearnAction = z.infer<typeof LearnActionSchema>;
export type ProactiveAction = z.infer<typeof ProactiveActionSchema>;

export type ProactiveTrigger = z.infer<typeof ProactiveTriggerSchema>;
export type ProactiveTriggerCreate = z.infer<typeof ProactiveTriggerCreateSchema>;
export type SuggestionStatus = z.infer<typeof SuggestionStatusSchema>;
export type Suggestion = z.infer<typeof SuggestionSchema>;
export type ProactiveConfig = z.infer<typeof ProactiveConfigSchema>;
