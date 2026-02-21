/**
 * Group Chat View Types (ADR 086)
 *
 * A "channel" is the logical combination of (integrationId, chatId) — one
 * conversation thread within a specific integration instance.
 */

import { z } from 'zod';

// ─── Channel ────────────────────────────────────────────────────────────────

export const GroupChatChannelSchema = z.object({
  integrationId: z.string(),
  chatId: z.string(),
  platform: z.string(),
  integrationName: z.string(),
  lastMessageAt: z.number().nullable(),
  lastMessageText: z.string().nullable(),
  messageCount: z.number().int().nonnegative(),
  /** Number of inbound messages not yet responded to (approximate unread count). */
  unrepliedCount: z.number().int().nonnegative().default(0),
  /** Active personality that last handled this channel, if known. */
  personalityId: z.string().nullable().default(null),
  personalityName: z.string().nullable().default(null),
});

export type GroupChatChannel = z.infer<typeof GroupChatChannelSchema>;

// ─── Message ─────────────────────────────────────────────────────────────────

export const GroupChatMessageSchema = z.object({
  id: z.string(),
  integrationId: z.string(),
  platform: z.string(),
  direction: z.enum(['inbound', 'outbound']),
  senderId: z.string(),
  senderName: z.string(),
  chatId: z.string(),
  text: z.string(),
  attachments: z.array(z.object({
    type: z.enum(['image', 'audio', 'video', 'file', 'location']),
    url: z.string().optional(),
    mimeType: z.string().optional(),
    fileName: z.string().optional(),
    size: z.number().optional(),
  })).default([]),
  replyToMessageId: z.string().nullable().optional(),
  platformMessageId: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  timestamp: z.number(),
  /** The personality that produced this message (outbound only). */
  personalityId: z.string().nullable().optional(),
  personalityName: z.string().nullable().optional(),
});

export type GroupChatMessage = z.infer<typeof GroupChatMessageSchema>;

// ─── Send Request ─────────────────────────────────────────────────────────────

export const GroupChatSendSchema = z.object({
  text: z.string().min(1).max(32000),
  /** Optionally override which personality sends this message. */
  personalityId: z.string().optional(),
});

export type GroupChatSend = z.infer<typeof GroupChatSendSchema>;

// ─── WebSocket Event ─────────────────────────────────────────────────────────

export const GroupChatEventSchema = z.object({
  type: z.enum(['message', 'channel_updated']),
  message: GroupChatMessageSchema.optional(),
  channel: GroupChatChannelSchema.optional(),
});

export type GroupChatEvent = z.infer<typeof GroupChatEventSchema>;
