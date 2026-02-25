/**
 * IntentStorage — PostgreSQL-backed storage for OrgIntent documents
 * and the intent enforcement log.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';
import type {
  OrgIntentDoc,
  OrgIntentRecord,
  EnforcementLogEntry,
  EnforcementEventType,
} from './schema.js';

// ─── Row types ────────────────────────────────────────────────────────────────

interface IntentRow {
  id: string;
  name: string;
  api_version: string;
  doc: OrgIntentDoc;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface EnforcementLogRow {
  id: string;
  event_type: string;
  item_id: string | null;
  rule: string;
  rationale: string | null;
  action_attempted: string | null;
  agent_id: string | null;
  session_id: string | null;
  personality_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ─── Row → Record mappers ─────────────────────────────────────────────────────

function rowToRecord(row: IntentRow): OrgIntentRecord {
  const doc = row.doc as OrgIntentDoc;
  return {
    id: row.id,
    apiVersion: row.api_version,
    name: row.name,
    isActive: row.is_active,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    goals: doc.goals ?? [],
    signals: doc.signals ?? [],
    dataSources: doc.dataSources ?? [],
    authorizedActions: doc.authorizedActions ?? [],
    tradeoffProfiles: doc.tradeoffProfiles ?? [],
    hardBoundaries: doc.hardBoundaries ?? [],
    policies: doc.policies ?? [],
    delegationFramework: doc.delegationFramework ?? { tenants: [] },
    context: doc.context ?? [],
  };
}

function rowToLogEntry(row: EnforcementLogRow): EnforcementLogEntry {
  const entry: EnforcementLogEntry = {
    id: row.id,
    eventType: row.event_type as EnforcementEventType,
    rule: row.rule,
    createdAt: Number(row.created_at),
  };
  if (row.item_id != null) entry.itemId = row.item_id;
  if (row.rationale != null) entry.rationale = row.rationale;
  if (row.action_attempted != null) entry.actionAttempted = row.action_attempted;
  if (row.agent_id != null) entry.agentId = row.agent_id;
  if (row.session_id != null) entry.sessionId = row.session_id;
  if (row.personality_id != null) entry.personalityId = row.personality_id;
  if (row.metadata != null) entry.metadata = row.metadata;
  return entry;
}

// ─── IntentStorage ────────────────────────────────────────────────────────────

export interface EnforcementLogQueryOpts {
  eventType?: EnforcementEventType;
  agentId?: string;
  since?: number; // unix ms
  limit?: number;
}

export class IntentStorage extends PgBaseStorage {
  // ── Intent CRUD ─────────────────────────────────────────────────────────────

  async createIntent(doc: OrgIntentDoc): Promise<OrgIntentRecord> {
    const id = uuidv7();
    const now = Date.now();
    await this.execute(
      `INSERT INTO org_intents (id, name, api_version, doc, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, FALSE, $5, $6)`,
      [id, doc.name, doc.apiVersion ?? 'v1', JSON.stringify(doc), now, now]
    );
    const row = await this.queryOne<IntentRow>(
      'SELECT * FROM org_intents WHERE id = $1',
      [id]
    );
    return rowToRecord(row!);
  }

  async updateIntent(id: string, patch: Partial<OrgIntentDoc>): Promise<OrgIntentRecord | null> {
    const existing = await this.queryOne<IntentRow>(
      'SELECT * FROM org_intents WHERE id = $1',
      [id]
    );
    if (!existing) return null;

    const merged: OrgIntentDoc = { ...(existing.doc as OrgIntentDoc), ...patch };
    const now = Date.now();
    await this.execute(
      `UPDATE org_intents SET name = $1, api_version = $2, doc = $3, updated_at = $4
       WHERE id = $5`,
      [merged.name, merged.apiVersion ?? 'v1', JSON.stringify(merged), now, id]
    );
    const updated = await this.queryOne<IntentRow>(
      'SELECT * FROM org_intents WHERE id = $1',
      [id]
    );
    return updated ? rowToRecord(updated) : null;
  }

  async deleteIntent(id: string): Promise<boolean> {
    const count = await this.execute('DELETE FROM org_intents WHERE id = $1', [id]);
    return count > 0;
  }

  async getIntentDoc(id: string): Promise<OrgIntentRecord | null> {
    const row = await this.queryOne<IntentRow>(
      'SELECT * FROM org_intents WHERE id = $1',
      [id]
    );
    return row ? rowToRecord(row) : null;
  }

  /** Returns all intent docs (metadata only — doc JSONB omitted for speed). */
  async listIntents(): Promise<Omit<OrgIntentRecord, keyof OrgIntentDoc>[]> {
    const rows = await this.queryMany<{
      id: string;
      name: string;
      api_version: string;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, name, api_version, is_active, created_at, updated_at
       FROM org_intents ORDER BY created_at DESC`
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      apiVersion: r.api_version,
      isActive: r.is_active,
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
    }));
  }

  async getActiveIntent(): Promise<OrgIntentRecord | null> {
    const row = await this.queryOne<IntentRow>(
      'SELECT * FROM org_intents WHERE is_active = TRUE LIMIT 1'
    );
    return row ? rowToRecord(row) : null;
  }

  async setActiveIntent(id: string): Promise<void> {
    await this.withTransaction(async (client) => {
      await client.query('UPDATE org_intents SET is_active = FALSE WHERE is_active = TRUE');
      await client.query(
        'UPDATE org_intents SET is_active = TRUE, updated_at = $1 WHERE id = $2',
        [Date.now(), id]
      );
    });
  }

  // ── Enforcement log ──────────────────────────────────────────────────────────

  async logEnforcement(entry: EnforcementLogEntry): Promise<void> {
    const id = entry.id ?? uuidv7();
    const now = entry.createdAt ?? Date.now();
    await this.execute(
      `INSERT INTO intent_enforcement_log
         (id, event_type, item_id, rule, rationale, action_attempted,
          agent_id, session_id, personality_id, metadata, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id,
        entry.eventType,
        entry.itemId ?? null,
        entry.rule,
        entry.rationale ?? null,
        entry.actionAttempted ?? null,
        entry.agentId ?? null,
        entry.sessionId ?? null,
        entry.personalityId ?? null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        now,
      ]
    );
  }

  async queryEnforcementLog(opts: EnforcementLogQueryOpts = {}): Promise<EnforcementLogEntry[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (opts.eventType) {
      conditions.push(`event_type = $${idx++}`);
      values.push(opts.eventType);
    }
    if (opts.agentId) {
      conditions.push(`agent_id = $${idx++}`);
      values.push(opts.agentId);
    }
    if (opts.since) {
      conditions.push(`created_at >= $${idx++}`);
      values.push(opts.since);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = opts.limit ? `LIMIT $${idx}` : 'LIMIT 200';
    if (opts.limit) values.push(opts.limit);

    const rows = await this.queryMany<EnforcementLogRow>(
      `SELECT * FROM intent_enforcement_log ${where} ORDER BY created_at DESC ${limitClause}`,
      values
    );
    return rows.map(rowToLogEntry);
  }
}
