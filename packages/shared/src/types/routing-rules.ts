/**
 * Cross-Integration Routing Rules Types (ADR 087)
 *
 * Rules evaluate inbound (or outbound) messages and trigger actions:
 * forwarding, personality override, or webhook notification.
 */

import { z } from 'zod';

// ─── Action Types ─────────────────────────────────────────────────────────────

export const RoutingActionTypeSchema = z.enum([
  'forward',      // forward message text to another integration/chat
  'reply',        // send a reply via a different integration (same chatId unless overridden)
  'personality',  // override the active personality for this message's response
  'notify',       // POST the message payload to a webhook URL
]);

export type RoutingActionType = z.infer<typeof RoutingActionTypeSchema>;

// ─── Rule ────────────────────────────────────────────────────────────────────

export const RoutingRuleSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(128),
  description: z.string().max(500).default(''),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(1).max(9999).default(100),

  // Trigger conditions — null = wildcard (match all)
  triggerPlatforms: z.array(z.string()).default([]),         // [] = all
  triggerIntegrationIds: z.array(z.string()).default([]),    // [] = all
  triggerChatIdPattern: z.string().nullable().default(null), // regex or null
  triggerSenderIdPattern: z.string().nullable().default(null),
  triggerKeywordPattern: z.string().nullable().default(null),
  triggerDirection: z.enum(['inbound', 'outbound', 'both']).default('inbound'),

  // Action
  actionType: RoutingActionTypeSchema,
  actionTargetIntegrationId: z.string().nullable().default(null),
  actionTargetChatId: z.string().nullable().default(null),
  actionPersonalityId: z.string().nullable().default(null),
  actionWebhookUrl: z.string().url().nullable().default(null),
  /** Mustache-style template: {{text}}, {{senderName}}, {{platform}}, {{chatId}} */
  actionMessageTemplate: z.string().max(10000).nullable().default(null),

  matchCount: z.number().int().nonnegative().default(0),
  lastMatchedAt: z.number().nullable().default(null),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type RoutingRule = z.infer<typeof RoutingRuleSchema>;

export const RoutingRuleCreateSchema = RoutingRuleSchema.omit({
  id: true,
  matchCount: true,
  lastMatchedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type RoutingRuleCreate = z.infer<typeof RoutingRuleCreateSchema>;

export const RoutingRuleUpdateSchema = RoutingRuleCreateSchema.partial();
export type RoutingRuleUpdate = z.infer<typeof RoutingRuleUpdateSchema>;

// ─── Rule Match Result ────────────────────────────────────────────────────────

export const RoutingRuleMatchSchema = z.object({
  rule: RoutingRuleSchema,
  matched: z.boolean(),
  reason: z.string().optional(),
});

export type RoutingRuleMatch = z.infer<typeof RoutingRuleMatchSchema>;

// ─── Dry Run Request ─────────────────────────────────────────────────────────

export const RoutingRuleDryRunSchema = z.object({
  platform: z.string(),
  integrationId: z.string().optional(),
  chatId: z.string().optional(),
  senderId: z.string().optional(),
  text: z.string().default(''),
  direction: z.enum(['inbound', 'outbound']).default('inbound'),
});

export type RoutingRuleDryRun = z.infer<typeof RoutingRuleDryRunSchema>;
