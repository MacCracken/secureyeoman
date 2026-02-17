/**
 * Integration Storage — PostgreSQL-backed storage for integration configs and messages.
 *
 * Uses PgBaseStorage for connection pooling and query helpers.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import type {
  IntegrationConfig,
  IntegrationCreate,
  IntegrationUpdate,
  IntegrationStatus,
  UnifiedMessage,
  Platform,
} from '@friday/shared';
import { uuidv7 } from '../utils/crypto.js';

// ─── Row Types ───────────────────────────────────────────────

interface IntegrationRow {
  id: string;
  platform: string;
  display_name: string;
  enabled: boolean;
  status: string;
  config: Record<string, unknown>; // JSONB — already parsed
  connected_at: number | null;
  last_message_at: number | null;
  message_count: number;
  error_message: string | null;
  created_at: number;
  updated_at: number;
}

interface MessageRow {
  id: string;
  integration_id: string;
  platform: string;
  direction: string;
  sender_id: string;
  sender_name: string;
  chat_id: string;
  text: string;
  attachments: unknown[]; // JSONB — already parsed
  reply_to_message_id: string | null;
  platform_message_id: string | null;
  metadata: Record<string, unknown>; // JSONB — already parsed
  timestamp: number;
}

// ─── Helpers ─────────────────────────────────────────────────

function rowToConfig(row: IntegrationRow): IntegrationConfig {
  return {
    id: row.id,
    platform: row.platform as Platform,
    displayName: row.display_name,
    enabled: row.enabled,
    status: row.status as IntegrationStatus,
    config: row.config ?? {},
    connectedAt: row.connected_at ?? undefined,
    lastMessageAt: row.last_message_at ?? undefined,
    messageCount: row.message_count,
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMessage(row: MessageRow): UnifiedMessage {
  return {
    id: row.id,
    integrationId: row.integration_id,
    platform: row.platform as Platform,
    direction: row.direction as UnifiedMessage['direction'],
    senderId: row.sender_id,
    senderName: row.sender_name,
    chatId: row.chat_id,
    text: row.text,
    attachments: (row.attachments as UnifiedMessage['attachments']) ?? [],
    replyToMessageId: row.reply_to_message_id ?? undefined,
    platformMessageId: row.platform_message_id ?? undefined,
    metadata: row.metadata ?? {},
    timestamp: row.timestamp,
  };
}

// ─── IntegrationStorage ──────────────────────────────────────

export class IntegrationStorage extends PgBaseStorage {
  constructor() {
    super();
  }

  // ── Integration CRUD ─────────────────────────────────────

  async createIntegration(data: IntegrationCreate): Promise<IntegrationConfig> {
    const now = Date.now();
    const id = uuidv7();

    await this.query(
      `INSERT INTO integration.integrations
         (id, platform, display_name, enabled, status, config, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'disconnected', $5, $6, $7)`,
      [
        id,
        data.platform,
        data.displayName,
        data.enabled ?? false,
        JSON.stringify(data.config ?? {}),
        now,
        now,
      ]
    );

    return (await this.getIntegration(id))!;
  }

  async getIntegration(id: string): Promise<IntegrationConfig | null> {
    const row = await this.queryOne<IntegrationRow>(
      'SELECT * FROM integration.integrations WHERE id = $1',
      [id]
    );
    return row ? rowToConfig(row) : null;
  }

  async listIntegrations(filter?: {
    platform?: Platform;
    enabled?: boolean;
  }): Promise<IntegrationConfig[]> {
    let sql = 'SELECT * FROM integration.integrations WHERE 1=1';
    const params: unknown[] = [];
    let counter = 1;

    if (filter?.platform) {
      sql += ` AND platform = $${counter++}`;
      params.push(filter.platform);
    }
    if (filter?.enabled !== undefined) {
      sql += ` AND enabled = $${counter++}`;
      params.push(filter.enabled);
    }

    sql += ' ORDER BY created_at DESC';
    const rows = await this.queryMany<IntegrationRow>(sql, params);
    return rows.map(rowToConfig);
  }

  async updateIntegration(id: string, data: IntegrationUpdate): Promise<IntegrationConfig | null> {
    const existing = await this.getIntegration(id);
    if (!existing) return null;

    const now = Date.now();
    const fields: string[] = [];
    const params: unknown[] = [];
    let counter = 1;

    fields.push(`updated_at = $${counter++}`);
    params.push(now);

    if (data.platform !== undefined) {
      fields.push(`platform = $${counter++}`);
      params.push(data.platform);
    }
    if (data.displayName !== undefined) {
      fields.push(`display_name = $${counter++}`);
      params.push(data.displayName);
    }
    if (data.enabled !== undefined) {
      fields.push(`enabled = $${counter++}`);
      params.push(data.enabled);
    }
    if (data.config !== undefined) {
      fields.push(`config = $${counter++}`);
      params.push(JSON.stringify(data.config));
    }

    params.push(id);
    await this.query(
      `UPDATE integration.integrations SET ${fields.join(', ')} WHERE id = $${counter}`,
      params
    );
    return this.getIntegration(id);
  }

  async deleteIntegration(id: string): Promise<boolean> {
    const rowCount = await this.execute('DELETE FROM integration.integrations WHERE id = $1', [id]);
    return rowCount > 0;
  }

  // ── Status updates ───────────────────────────────────────

  async updateStatus(id: string, status: IntegrationStatus, errorMessage?: string): Promise<void> {
    const now = Date.now();
    const fields: string[] = [];
    const params: unknown[] = [];
    let counter = 1;

    fields.push(`status = $${counter++}`);
    params.push(status);

    fields.push(`updated_at = $${counter++}`);
    params.push(now);

    if (status === 'connected') {
      fields.push(`connected_at = $${counter++}`);
      params.push(now);
      fields.push('error_message = NULL');
    }
    if (errorMessage !== undefined) {
      fields.push(`error_message = $${counter++}`);
      params.push(errorMessage);
    }

    params.push(id);
    await this.query(
      `UPDATE integration.integrations SET ${fields.join(', ')} WHERE id = $${counter}`,
      params
    );
  }

  async incrementMessageCount(id: string): Promise<void> {
    const now = Date.now();
    await this.query(
      `UPDATE integration.integrations
       SET message_count = message_count + 1, last_message_at = $1, updated_at = $2
       WHERE id = $3`,
      [now, now, id]
    );
  }

  // ── Message Storage ──────────────────────────────────────

  async storeMessage(message: Omit<UnifiedMessage, 'id'>): Promise<UnifiedMessage> {
    const id = uuidv7();

    await this.query(
      `INSERT INTO integration.messages
         (id, integration_id, platform, direction, sender_id, sender_name, chat_id,
          text, attachments, reply_to_message_id, platform_message_id, metadata, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id,
        message.integrationId,
        message.platform,
        message.direction,
        message.senderId,
        message.senderName,
        message.chatId,
        message.text,
        JSON.stringify(message.attachments),
        message.replyToMessageId ?? null,
        message.platformMessageId ?? null,
        JSON.stringify(message.metadata),
        message.timestamp,
      ]
    );

    await this.incrementMessageCount(message.integrationId);
    return { ...message, id };
  }

  async listMessages(
    integrationId: string,
    opts?: { limit?: number; offset?: number }
  ): Promise<UnifiedMessage[]> {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;
    const rows = await this.queryMany<MessageRow>(
      'SELECT * FROM integration.messages WHERE integration_id = $1 ORDER BY timestamp DESC LIMIT $2 OFFSET $3',
      [integrationId, limit, offset]
    );
    return rows.map(rowToMessage);
  }
}
