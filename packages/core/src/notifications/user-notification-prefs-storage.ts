/**
 * UserNotificationPrefsStorage — Phase 55: Per-User Notification Preferences
 *
 * Each row describes one external delivery channel for a given authenticated
 * user. The NotificationManager fan-out iterates all enabled rows and calls
 * the appropriate IntegrationManager adapter on notify().
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';
import type { NotificationLevel } from './notification-storage.js';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface UserNotificationPref {
  id: string;
  userId: string;
  channel: string;
  integrationId: string | null;
  chatId: string;
  enabled: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  minLevel: NotificationLevel;
  createdAt: number;
  updatedAt: number;
}

export type UpsertUserNotificationPref = Omit<
  UserNotificationPref,
  'id' | 'userId' | 'createdAt' | 'updatedAt'
>;

// ─── Row type ──────────────────────────────────────────────────────────────

interface PrefRow {
  id: string;
  user_id: string;
  channel: string;
  integration_id: string | null;
  chat_id: string;
  enabled: boolean;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
  min_level: string;
  created_at: string | number;
  updated_at: string | number;
}

function rowToPref(row: PrefRow): UserNotificationPref {
  return {
    id: row.id,
    userId: row.user_id,
    channel: row.channel,
    integrationId: row.integration_id,
    chatId: row.chat_id,
    enabled: row.enabled,
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
    minLevel: row.min_level as NotificationLevel,
    createdAt: typeof row.created_at === 'string' ? Number(row.created_at) : row.created_at,
    updatedAt: typeof row.updated_at === 'string' ? Number(row.updated_at) : row.updated_at,
  };
}

// ─── Storage ───────────────────────────────────────────────────────────────

export class UserNotificationPrefsStorage extends PgBaseStorage {
  async list(userId: string): Promise<UserNotificationPref[]> {
    const rows = await this.queryMany<PrefRow>(
      `SELECT * FROM auth.user_notification_prefs WHERE user_id = $1 ORDER BY created_at ASC`,
      [userId]
    );
    return rows.map(rowToPref);
  }

  async listAll(): Promise<UserNotificationPref[]> {
    const rows = await this.queryMany<PrefRow>(
      `SELECT * FROM auth.user_notification_prefs WHERE enabled = true ORDER BY created_at ASC`
    );
    return rows.map(rowToPref);
  }

  async get(userId: string, id: string): Promise<UserNotificationPref | null> {
    const row = await this.queryOne<PrefRow>(
      `SELECT * FROM auth.user_notification_prefs WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return row ? rowToPref(row) : null;
  }

  async upsert(userId: string, pref: UpsertUserNotificationPref): Promise<UserNotificationPref> {
    const now = Date.now();
    const id = uuidv7();

    const row = await this.queryOne<PrefRow>(
      `INSERT INTO auth.user_notification_prefs
         (id, user_id, channel, integration_id, chat_id, enabled,
          quiet_hours_start, quiet_hours_end, min_level, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (user_id, channel, chat_id) DO UPDATE SET
         integration_id    = EXCLUDED.integration_id,
         enabled           = EXCLUDED.enabled,
         quiet_hours_start = EXCLUDED.quiet_hours_start,
         quiet_hours_end   = EXCLUDED.quiet_hours_end,
         min_level         = EXCLUDED.min_level,
         updated_at        = EXCLUDED.updated_at
       RETURNING *`,
      [
        id,
        userId,
        pref.channel,
        pref.integrationId ?? null,
        pref.chatId,
        pref.enabled,
        pref.quietHoursStart ?? null,
        pref.quietHoursEnd ?? null,
        pref.minLevel,
        now,
        now,
      ]
    );
    return rowToPref(row!);
  }

  async update(
    userId: string,
    id: string,
    patch: Partial<UpsertUserNotificationPref>
  ): Promise<UserNotificationPref | null> {
    const current = await this.get(userId, id);
    if (!current) return null;

    const now = Date.now();
    const merged = {
      channel: patch.channel ?? current.channel,
      integrationId:
        patch.integrationId !== undefined ? patch.integrationId : current.integrationId,
      chatId: patch.chatId ?? current.chatId,
      enabled: patch.enabled !== undefined ? patch.enabled : current.enabled,
      quietHoursStart:
        patch.quietHoursStart !== undefined ? patch.quietHoursStart : current.quietHoursStart,
      quietHoursEnd:
        patch.quietHoursEnd !== undefined ? patch.quietHoursEnd : current.quietHoursEnd,
      minLevel: patch.minLevel ?? current.minLevel,
    };

    const row = await this.queryOne<PrefRow>(
      `UPDATE auth.user_notification_prefs SET
         channel = $3, integration_id = $4, chat_id = $5, enabled = $6,
         quiet_hours_start = $7, quiet_hours_end = $8, min_level = $9,
         updated_at = $10
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [
        id,
        userId,
        merged.channel,
        merged.integrationId ?? null,
        merged.chatId,
        merged.enabled,
        merged.quietHoursStart ?? null,
        merged.quietHoursEnd ?? null,
        merged.minLevel,
        now,
      ]
    );
    return row ? rowToPref(row) : null;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const count = await this.execute(
      `DELETE FROM auth.user_notification_prefs WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return count > 0;
  }
}
