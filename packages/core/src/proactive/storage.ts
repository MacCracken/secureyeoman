/**
 * ProactiveStorage — PostgreSQL-backed storage for proactive triggers and suggestions.
 *
 * Extends PgBaseStorage (same pattern as ExtensionStorage).
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';
import type {
  ProactiveTrigger,
  ProactiveTriggerCreate,
  Suggestion,
  SuggestionStatus,
} from '@friday/shared';

// ─── Row types ──────────────────────────────────────────────────────

interface TriggerRow {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  type: string;
  condition: string;
  action: string;
  approval_mode: string;
  cooldown_ms: number;
  limit_per_day: number;
  builtin: boolean;
  last_fired_at: string | null;
  fire_count: number;
  created_at: string;
  updated_at: string;
}

interface SuggestionRow {
  id: string;
  trigger_id: string;
  trigger_name: string;
  action: string;
  context: string;
  confidence: number;
  suggested_at: string;
  status: string;
  expires_at: string;
  approved_at: string | null;
  executed_at: string | null;
  dismissed_at: string | null;
  result: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────

function triggerFromRow(
  row: TriggerRow
): ProactiveTrigger & { lastFiredAt?: number; fireCount: number } {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    enabled: row.enabled,
    type: row.type as ProactiveTrigger['type'],
    condition: JSON.parse(row.condition),
    action: JSON.parse(row.action),
    approvalMode: row.approval_mode as ProactiveTrigger['approvalMode'],
    cooldownMs: row.cooldown_ms,
    limitPerDay: row.limit_per_day,
    builtin: row.builtin,
    lastFiredAt: row.last_fired_at ? new Date(row.last_fired_at).getTime() : undefined,
    fireCount: row.fire_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function suggestionFromRow(row: SuggestionRow): Suggestion {
  return {
    id: row.id,
    triggerId: row.trigger_id,
    triggerName: row.trigger_name,
    action: JSON.parse(row.action),
    context: JSON.parse(row.context),
    confidence: row.confidence,
    suggestedAt: row.suggested_at,
    status: row.status as SuggestionStatus,
    expiresAt: row.expires_at,
    approvedAt: row.approved_at ?? undefined,
    executedAt: row.executed_at ?? undefined,
    dismissedAt: row.dismissed_at ?? undefined,
    result: row.result ? JSON.parse(row.result) : undefined,
  };
}

// ─── Storage ────────────────────────────────────────────────────────

export class ProactiveStorage extends PgBaseStorage {
  async ensureTables(): Promise<void> {
    await this.execute(`
      CREATE SCHEMA IF NOT EXISTS proactive;

      CREATE TABLE IF NOT EXISTS proactive.triggers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        enabled BOOLEAN NOT NULL DEFAULT true,
        type TEXT NOT NULL,
        condition JSONB NOT NULL,
        action JSONB NOT NULL,
        approval_mode TEXT NOT NULL DEFAULT 'suggest',
        cooldown_ms INTEGER NOT NULL DEFAULT 0,
        limit_per_day INTEGER NOT NULL DEFAULT 0,
        builtin BOOLEAN NOT NULL DEFAULT false,
        last_fired_at TIMESTAMPTZ,
        fire_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS proactive.suggestions (
        id TEXT PRIMARY KEY,
        trigger_id TEXT NOT NULL REFERENCES proactive.triggers(id) ON DELETE CASCADE,
        trigger_name TEXT NOT NULL,
        action JSONB NOT NULL,
        context JSONB NOT NULL DEFAULT '{}',
        confidence REAL NOT NULL DEFAULT 1,
        suggested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        status TEXT NOT NULL DEFAULT 'pending',
        expires_at TIMESTAMPTZ NOT NULL,
        approved_at TIMESTAMPTZ,
        executed_at TIMESTAMPTZ,
        dismissed_at TIMESTAMPTZ,
        result JSONB
      );

      CREATE INDEX IF NOT EXISTS idx_triggers_type ON proactive.triggers(type);
      CREATE INDEX IF NOT EXISTS idx_triggers_enabled ON proactive.triggers(enabled);
      CREATE INDEX IF NOT EXISTS idx_suggestions_status ON proactive.suggestions(status);
      CREATE INDEX IF NOT EXISTS idx_suggestions_trigger ON proactive.suggestions(trigger_id);
    `);
  }

  // ── Trigger CRUD ────────────────────────────────────────────────

  async listTriggers(filter?: { type?: string; enabled?: boolean }): Promise<ProactiveTrigger[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filter?.type) {
      conditions.push(`type = $${idx++}`);
      values.push(filter.type);
    }
    if (filter?.enabled !== undefined) {
      conditions.push(`enabled = $${idx++}`);
      values.push(filter.enabled);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await this.queryMany<TriggerRow>(
      `SELECT * FROM proactive.triggers ${where} ORDER BY created_at ASC`,
      values
    );
    return rows.map(triggerFromRow);
  }

  async getTrigger(id: string): Promise<(ProactiveTrigger & { fireCount: number }) | null> {
    const row = await this.queryOne<TriggerRow>(`SELECT * FROM proactive.triggers WHERE id = $1`, [
      id,
    ]);
    return row ? triggerFromRow(row) : null;
  }

  async createTrigger(data: ProactiveTriggerCreate): Promise<ProactiveTrigger> {
    const id = uuidv7();
    const row = await this.queryOne<TriggerRow>(
      `INSERT INTO proactive.triggers (id, name, description, enabled, type, condition, action, approval_mode, cooldown_ms, limit_per_day)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10)
       RETURNING *`,
      [
        id,
        data.name,
        data.description ?? null,
        data.enabled ?? true,
        data.type,
        JSON.stringify(data.condition),
        JSON.stringify(data.action),
        data.approvalMode ?? 'suggest',
        data.cooldownMs ?? 0,
        data.limitPerDay ?? 0,
      ]
    );
    return triggerFromRow(row!);
  }

  async updateTrigger(
    id: string,
    data: Partial<ProactiveTriggerCreate>
  ): Promise<ProactiveTrigger | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${idx++}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${idx++}`);
      values.push(data.description);
    }
    if (data.enabled !== undefined) {
      updates.push(`enabled = $${idx++}`);
      values.push(data.enabled);
    }
    if (data.condition !== undefined) {
      updates.push(`condition = $${idx++}::jsonb`);
      values.push(JSON.stringify(data.condition));
    }
    if (data.action !== undefined) {
      updates.push(`action = $${idx++}::jsonb`);
      values.push(JSON.stringify(data.action));
    }
    if (data.approvalMode !== undefined) {
      updates.push(`approval_mode = $${idx++}`);
      values.push(data.approvalMode);
    }
    if (data.cooldownMs !== undefined) {
      updates.push(`cooldown_ms = $${idx++}`);
      values.push(data.cooldownMs);
    }
    if (data.limitPerDay !== undefined) {
      updates.push(`limit_per_day = $${idx++}`);
      values.push(data.limitPerDay);
    }

    if (updates.length === 0) return this.getTrigger(id);

    updates.push('updated_at = now()');
    values.push(id);

    const row = await this.queryOne<TriggerRow>(
      `UPDATE proactive.triggers SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return row ? triggerFromRow(row) : null;
  }

  async deleteTrigger(id: string): Promise<boolean> {
    const count = await this.execute(`DELETE FROM proactive.triggers WHERE id = $1`, [id]);
    return count > 0;
  }

  async setTriggerEnabled(id: string, enabled: boolean): Promise<ProactiveTrigger | null> {
    const row = await this.queryOne<TriggerRow>(
      `UPDATE proactive.triggers SET enabled = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [enabled, id]
    );
    return row ? triggerFromRow(row) : null;
  }

  async recordFiring(id: string): Promise<void> {
    await this.execute(
      `UPDATE proactive.triggers SET last_fired_at = now(), fire_count = fire_count + 1, updated_at = now() WHERE id = $1`,
      [id]
    );
  }

  async getDailyFiringCount(triggerId: string): Promise<number> {
    const row = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM proactive.suggestions
       WHERE trigger_id = $1 AND suggested_at >= CURRENT_DATE`,
      [triggerId]
    );
    return parseInt(row?.count ?? '0', 10);
  }

  // ── Suggestion CRUD ─────────────────────────────────────────────

  async listSuggestions(filter?: {
    status?: SuggestionStatus;
    triggerId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ suggestions: Suggestion[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filter?.status) {
      conditions.push(`status = $${idx++}`);
      values.push(filter.status);
    }
    if (filter?.triggerId) {
      conditions.push(`trigger_id = $${idx++}`);
      values.push(filter.triggerId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;

    const countRow = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM proactive.suggestions ${where}`,
      values
    );
    const total = parseInt(countRow?.count ?? '0', 10);

    const rows = await this.queryMany<SuggestionRow>(
      `SELECT * FROM proactive.suggestions ${where} ORDER BY suggested_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, limit, offset]
    );

    return { suggestions: rows.map(suggestionFromRow), total };
  }

  async getSuggestion(id: string): Promise<Suggestion | null> {
    const row = await this.queryOne<SuggestionRow>(
      `SELECT * FROM proactive.suggestions WHERE id = $1`,
      [id]
    );
    return row ? suggestionFromRow(row) : null;
  }

  async createSuggestion(data: {
    triggerId: string;
    triggerName: string;
    action: unknown;
    context?: Record<string, unknown>;
    confidence?: number;
    expiresAt: Date;
  }): Promise<Suggestion> {
    const id = uuidv7();
    const row = await this.queryOne<SuggestionRow>(
      `INSERT INTO proactive.suggestions (id, trigger_id, trigger_name, action, context, confidence, expires_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
       RETURNING *`,
      [
        id,
        data.triggerId,
        data.triggerName,
        JSON.stringify(data.action),
        JSON.stringify(data.context ?? {}),
        data.confidence ?? 1,
        data.expiresAt.toISOString(),
      ]
    );
    return suggestionFromRow(row!);
  }

  async updateSuggestionStatus(
    id: string,
    status: SuggestionStatus,
    result?: Record<string, unknown>
  ): Promise<Suggestion | null> {
    const timestampField =
      status === 'approved'
        ? 'approved_at'
        : status === 'executed'
          ? 'executed_at'
          : status === 'dismissed'
            ? 'dismissed_at'
            : null;

    const updates = [`status = $1`];
    const values: unknown[] = [status];
    let idx = 2;

    if (timestampField) {
      updates.push(`${timestampField} = now()`);
    }
    if (result !== undefined) {
      updates.push(`result = $${idx++}::jsonb`);
      values.push(JSON.stringify(result));
    }
    values.push(id);

    const row = await this.queryOne<SuggestionRow>(
      `UPDATE proactive.suggestions SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return row ? suggestionFromRow(row) : null;
  }

  async deleteExpiredSuggestions(): Promise<number> {
    return this.execute(
      `DELETE FROM proactive.suggestions WHERE status = 'pending' AND expires_at < now()`
    );
  }

  async createBuiltinTrigger(trigger: ProactiveTrigger): Promise<ProactiveTrigger> {
    const row = await this.queryOne<TriggerRow>(
      `INSERT INTO proactive.triggers (id, name, description, enabled, type, condition, action, approval_mode, cooldown_ms, limit_per_day, builtin)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, true)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         condition = EXCLUDED.condition,
         action = EXCLUDED.action,
         updated_at = now()
       RETURNING *`,
      [
        trigger.id,
        trigger.name,
        trigger.description ?? null,
        trigger.enabled,
        trigger.type,
        JSON.stringify(trigger.condition),
        JSON.stringify(trigger.action),
        trigger.approvalMode ?? 'suggest',
        trigger.cooldownMs ?? 0,
        trigger.limitPerDay ?? 0,
      ]
    );
    return triggerFromRow(row!);
  }
}
