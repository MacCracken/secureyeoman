/**
 * GroupChatStorage — Queries the existing messages + integrations tables
 * to surface channel listings and message threads for the Group Chat View.
 *
 * ADR 086
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import type { GroupChatChannel, GroupChatMessage } from '@secureyeoman/shared';

export class GroupChatStorage extends PgBaseStorage {
  /**
   * List all known channels (integrationId × chatId pairs) with metadata.
   * A channel appears once an integration has received or sent at least one message.
   */
  async listChannels(opts: {
    limit?: number;
    offset?: number;
    platform?: string;
    integrationId?: string;
  } = {}): Promise<{ channels: GroupChatChannel[]; total: number }> {
    const { limit = 50, offset = 0, platform, integrationId } = opts;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let p = 1;

    if (platform) {
      conditions.push(`m.platform = $${p++}`);
      params.push(platform);
    }
    if (integrationId) {
      conditions.push(`m.integration_id = $${p++}`);
      params.push(integrationId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await this.queryMany<{
      integration_id: string;
      chat_id: string;
      platform: string;
      integration_name: string;
      last_message_at: number | null;
      last_message_text: string | null;
      message_count: number;
      unreplied_count: number;
      personality_id: string | null;
    }>(
      `SELECT
         m.integration_id,
         m.chat_id,
         m.platform,
         COALESCE(i.display_name, m.platform) AS integration_name,
         MAX(m.timestamp) AS last_message_at,
         (
           SELECT text FROM messages
           WHERE integration_id = m.integration_id
             AND chat_id = m.chat_id
           ORDER BY timestamp DESC LIMIT 1
         ) AS last_message_text,
         COUNT(*)::integer AS message_count,
         COUNT(*) FILTER (WHERE m.direction = 'inbound')::integer AS unreplied_count,
         (
           SELECT personality_id FROM messages
           WHERE integration_id = m.integration_id
             AND chat_id = m.chat_id
             AND personality_id IS NOT NULL
           ORDER BY timestamp DESC LIMIT 1
         ) AS personality_id
       FROM messages m
       LEFT JOIN integrations i ON i.id = m.integration_id
       ${where}
       GROUP BY m.integration_id, m.chat_id, m.platform, i.display_name
       ORDER BY last_message_at DESC NULLS LAST
       LIMIT $${p++} OFFSET $${p++}`,
      [...params, limit, offset]
    );

    const countRows = await this.queryMany<{ total: number }>(
      `SELECT COUNT(DISTINCT (integration_id, chat_id))::integer AS total
       FROM messages m
       ${where}`,
      params
    );

    // Resolve personality names for channels that have a personality_id
    const personalityIds = [...new Set(rows.map((r) => r.personality_id).filter(Boolean))] as string[];
    const personalityNames = new Map<string, string>();

    if (personalityIds.length > 0) {
      const placeholders = personalityIds.map((_, i) => `$${i + 1}`).join(', ');
      const personalities = await this.queryMany<{ id: string; name: string }>(
        `SELECT id, name FROM soul.personalities WHERE id IN (${placeholders})`,
        personalityIds
      );
      for (const p of personalities) {
        personalityNames.set(p.id, p.name);
      }
    }

    const channels: GroupChatChannel[] = rows.map((r) => ({
      integrationId: r.integration_id,
      chatId: r.chat_id,
      platform: r.platform,
      integrationName: r.integration_name,
      lastMessageAt: r.last_message_at ?? null,
      lastMessageText: r.last_message_text ?? null,
      messageCount: r.message_count,
      unrepliedCount: r.unreplied_count,
      personalityId: r.personality_id ?? null,
      personalityName: r.personality_id ? (personalityNames.get(r.personality_id) ?? null) : null,
    }));

    return { channels, total: countRows[0]?.total ?? 0 };
  }

  /**
   * List messages for a specific channel, sorted newest-first.
   */
  async listMessages(
    integrationId: string,
    chatId: string,
    opts: { limit?: number; offset?: number; before?: number } = {}
  ): Promise<{ messages: GroupChatMessage[]; total: number }> {
    const { limit = 50, offset = 0, before } = opts;

    const conditions = [`integration_id = $1`, `chat_id = $2`];
    const params: unknown[] = [integrationId, chatId];
    let p = 3;

    if (before) {
      conditions.push(`timestamp < $${p++}`);
      params.push(before);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const rows = await this.queryMany<{
      id: string;
      integration_id: string;
      platform: string;
      direction: 'inbound' | 'outbound';
      sender_id: string;
      sender_name: string;
      chat_id: string;
      text: string;
      attachments: unknown;
      reply_to_message_id: string | null;
      platform_message_id: string | null;
      metadata: unknown;
      timestamp: number;
      personality_id: string | null;
    }>(
      `SELECT id, integration_id, platform, direction, sender_id, sender_name,
              chat_id, text, attachments, reply_to_message_id, platform_message_id,
              metadata, timestamp, personality_id
       FROM messages
       ${where}
       ORDER BY timestamp DESC
       LIMIT $${p++} OFFSET $${p++}`,
      [...params, limit, offset]
    );

    const countRows = await this.queryMany<{ total: number }>(
      `SELECT COUNT(*)::integer AS total FROM messages ${where}`,
      [integrationId, chatId]
    );

    // Resolve personality names
    const pIds = [...new Set(rows.map((r) => r.personality_id).filter(Boolean))] as string[];
    const personalityNames = new Map<string, string>();

    if (pIds.length > 0) {
      const placeholders = pIds.map((_, i) => `$${i + 1}`).join(', ');
      const personalities = await this.queryMany<{ id: string; name: string }>(
        `SELECT id, name FROM soul.personalities WHERE id IN (${placeholders})`,
        pIds
      );
      for (const p of personalities) {
        personalityNames.set(p.id, p.name);
      }
    }

    const messages: GroupChatMessage[] = rows.map((r) => ({
      id: r.id,
      integrationId: r.integration_id,
      platform: r.platform,
      direction: r.direction,
      senderId: r.sender_id,
      senderName: r.sender_name,
      chatId: r.chat_id,
      text: r.text,
      attachments: (r.attachments as GroupChatMessage['attachments']) ?? [],
      replyToMessageId: r.reply_to_message_id ?? undefined,
      platformMessageId: r.platform_message_id ?? undefined,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      timestamp: r.timestamp,
      personalityId: r.personality_id ?? null,
      personalityName: r.personality_id ? (personalityNames.get(r.personality_id) ?? null) : null,
    }));

    return { messages, total: countRows[0]?.total ?? 0 };
  }
}
