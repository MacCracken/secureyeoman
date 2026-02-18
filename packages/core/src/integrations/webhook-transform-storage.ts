/**
 * WebhookTransformStorage — PostgreSQL-backed CRUD for webhook transformation rules.
 *
 * Each rule describes how to reshape an inbound webhook payload (via JSONPath
 * extraction and an optional template) before it is normalized to UnifiedMessage.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';

// ─── Domain Types ─────────────────────────────────────────────

/** A single field extraction instruction. */
export interface ExtractRule {
  /** Target field in the UnifiedMessage (e.g. "text", "senderId", "chatId"). */
  field: string;
  /** JSONPath expression relative to the payload root, e.g. "$.pull_request.title". */
  path: string;
  /** Fallback value when the path yields no match. */
  default?: string;
}

export interface WebhookTransformRule {
  id: string;
  /** NULL means this rule applies to all webhook integrations. */
  integrationId: string | null;
  name: string;
  /** If set, only payloads whose event header matches this string are transformed. */
  matchEvent: string | null;
  /** Lower value = applied first when multiple rules match. */
  priority: number;
  enabled: boolean;
  extractRules: ExtractRule[];
  /** Optional mustache-style template: "{{action}} on {{repo}} by {{author}}" */
  template: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface WebhookTransformCreate {
  integrationId?: string | null;
  name: string;
  matchEvent?: string | null;
  priority?: number;
  enabled?: boolean;
  extractRules?: ExtractRule[];
  template?: string | null;
}

export interface WebhookTransformUpdate {
  name?: string;
  matchEvent?: string | null;
  priority?: number;
  enabled?: boolean;
  extractRules?: ExtractRule[];
  template?: string | null;
}

export interface WebhookTransformFilter {
  integrationId?: string | null;
  enabled?: boolean;
}

// ─── Row type ─────────────────────────────────────────────────

interface WebhookTransformRow {
  id: string;
  integration_id: string | null;
  name: string;
  match_event: string | null;
  priority: string;
  enabled: boolean;
  extract_rules: unknown;
  template: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRule(row: WebhookTransformRow): WebhookTransformRule {
  return {
    id: row.id,
    integrationId: row.integration_id,
    name: row.name,
    matchEvent: row.match_event,
    priority: Number(row.priority),
    enabled: row.enabled,
    extractRules: (row.extract_rules as ExtractRule[]) ?? [],
    template: row.template,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

// ─── Storage class ────────────────────────────────────────────

export class WebhookTransformStorage extends PgBaseStorage {
  /** Create a new transform rule. */
  async createRule(data: WebhookTransformCreate): Promise<WebhookTransformRule> {
    const pool = this.getPool();
    const now = Date.now();
    const result = await pool.query<WebhookTransformRow>(
      `INSERT INTO webhook_transform_rules
         (id, integration_id, name, match_event, priority, enabled, extract_rules, template, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $9)
       RETURNING *`,
      [
        uuidv7(),
        data.integrationId ?? null,
        data.name,
        data.matchEvent ?? null,
        data.priority ?? 100,
        data.enabled ?? true,
        JSON.stringify(data.extractRules ?? []),
        data.template ?? null,
        now,
      ]
    );
    return rowToRule(result.rows[0]!);
  }

  /** Fetch a single rule by ID. */
  async getRule(id: string): Promise<WebhookTransformRule | null> {
    const pool = this.getPool();
    const result = await pool.query<WebhookTransformRow>(
      'SELECT * FROM webhook_transform_rules WHERE id = $1',
      [id]
    );
    return result.rows[0] ? rowToRule(result.rows[0]) : null;
  }

  /**
   * List transform rules.
   *
   * When `filter.integrationId` is supplied, returns rules specific to that
   * integration **plus** rules where integration_id IS NULL (global rules).
   * When `filter.integrationId` is not set, returns all rules.
   */
  async listRules(filter?: WebhookTransformFilter): Promise<WebhookTransformRule[]> {
    const pool = this.getPool();
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filter?.integrationId !== undefined) {
      conditions.push(`(integration_id = $${idx} OR integration_id IS NULL)`);
      params.push(filter.integrationId);
      idx++;
    }

    if (filter?.enabled !== undefined) {
      conditions.push(`enabled = $${idx}`);
      params.push(filter.enabled);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query<WebhookTransformRow>(
      `SELECT * FROM webhook_transform_rules ${where} ORDER BY priority ASC, created_at ASC`,
      params
    );
    return result.rows.map(rowToRule);
  }

  /** Update a rule by ID. Returns null if not found. */
  async updateRule(
    id: string,
    update: WebhookTransformUpdate
  ): Promise<WebhookTransformRule | null> {
    const pool = this.getPool();
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (update.name !== undefined) {
      sets.push(`name = $${idx++}`);
      params.push(update.name);
    }
    if (update.matchEvent !== undefined) {
      sets.push(`match_event = $${idx++}`);
      params.push(update.matchEvent);
    }
    if (update.priority !== undefined) {
      sets.push(`priority = $${idx++}`);
      params.push(update.priority);
    }
    if (update.enabled !== undefined) {
      sets.push(`enabled = $${idx++}`);
      params.push(update.enabled);
    }
    if (update.extractRules !== undefined) {
      sets.push(`extract_rules = $${idx++}::jsonb`);
      params.push(JSON.stringify(update.extractRules));
    }
    if (update.template !== undefined) {
      sets.push(`template = $${idx++}`);
      params.push(update.template);
    }

    if (sets.length === 0) return this.getRule(id);

    sets.push(`updated_at = $${idx++}`);
    params.push(Date.now());
    params.push(id);

    const result = await pool.query<WebhookTransformRow>(
      `UPDATE webhook_transform_rules SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    return result.rows[0] ? rowToRule(result.rows[0]) : null;
  }

  /** Delete a rule. Returns true if a row was removed. */
  async deleteRule(id: string): Promise<boolean> {
    const pool = this.getPool();
    const result = await pool.query(
      'DELETE FROM webhook_transform_rules WHERE id = $1 RETURNING id',
      [id]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }
}
