/**
 * OutboundWebhookStorage — PostgreSQL-backed CRUD for outbound webhook subscriptions.
 *
 * Each record configures an HTTP endpoint that SecureYeoman will POST to
 * when matching integration events occur.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { buildWhere, buildSet } from '../storage/query-helpers.js';
import { uuidv7 } from '../utils/crypto.js';

// ─── Event Types ──────────────────────────────────────────────

/**
 * Enumeration of subscribable event types.
 *
 * - `message.inbound`    — a message was received from any integration
 * - `message.outbound`   — a message was sent via any integration
 * - `integration.started`  — an integration's adapter started successfully
 * - `integration.stopped`  — an integration's adapter was stopped
 * - `integration.error`    — an integration encountered a runtime error
 */
export type OutboundWebhookEvent =
  | 'message.inbound'
  | 'message.outbound'
  | 'integration.started'
  | 'integration.stopped'
  | 'integration.error';

export const ALL_OUTBOUND_EVENTS: OutboundWebhookEvent[] = [
  'message.inbound',
  'message.outbound',
  'integration.started',
  'integration.stopped',
  'integration.error',
];

// ─── Domain Types ─────────────────────────────────────────────

export interface OutboundWebhook {
  id: string;
  name: string;
  url: string;
  secret: string | null;
  events: OutboundWebhookEvent[];
  enabled: boolean;
  lastFiredAt: number | null;
  lastStatusCode: number | null;
  consecutiveFailures: number;
  createdAt: number;
  updatedAt: number;
}

export interface OutboundWebhookCreate {
  name: string;
  url: string;
  secret?: string | null;
  events?: OutboundWebhookEvent[];
  enabled?: boolean;
}

export interface OutboundWebhookUpdate {
  name?: string;
  url?: string;
  secret?: string | null;
  events?: OutboundWebhookEvent[];
  enabled?: boolean;
}

// ─── Row type ─────────────────────────────────────────────────

interface OutboundWebhookRow {
  id: string;
  name: string;
  url: string;
  secret: string | null;
  events: unknown;
  enabled: boolean;
  last_fired_at: string | null;
  last_status_code: string | null;
  consecutive_failures: string;
  created_at: string;
  updated_at: string;
}

function rowToWebhook(row: OutboundWebhookRow): OutboundWebhook {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    secret: row.secret,
    events: (row.events as OutboundWebhookEvent[]) ?? [],
    enabled: row.enabled,
    lastFiredAt: row.last_fired_at !== null ? Number(row.last_fired_at) : null,
    lastStatusCode: row.last_status_code !== null ? Number(row.last_status_code) : null,
    consecutiveFailures: Number(row.consecutive_failures),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

// ─── Storage class ────────────────────────────────────────────

export class OutboundWebhookStorage extends PgBaseStorage {
  /** Create a new outbound webhook subscription. */
  async createWebhook(data: OutboundWebhookCreate): Promise<OutboundWebhook> {
    const pool = this.getPool();
    const now = Date.now();
    const result = await pool.query<OutboundWebhookRow>(
      `INSERT INTO outbound_webhooks
         (id, name, url, secret, events, enabled, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $7)
       RETURNING *`,
      [
        uuidv7(),
        data.name,
        data.url,
        data.secret ?? null,
        JSON.stringify(data.events ?? []),
        data.enabled ?? true,
        now,
      ]
    );
    return rowToWebhook(result.rows[0]!);
  }

  /** Fetch a single webhook by ID. */
  async getWebhook(id: string): Promise<OutboundWebhook | null> {
    const pool = this.getPool();
    const result = await pool.query<OutboundWebhookRow>(
      'SELECT * FROM outbound_webhooks WHERE id = $1',
      [id]
    );
    return result.rows[0] ? rowToWebhook(result.rows[0]) : null;
  }

  /**
   * List all webhooks, optionally filtered by enabled state.
   */
  async listWebhooks(filter?: { enabled?: boolean }): Promise<OutboundWebhook[]> {
    const pool = this.getPool();

    const { where, values } = buildWhere([
      { column: 'enabled', value: filter?.enabled },
    ]);

    const result = await pool.query<OutboundWebhookRow>(
      `SELECT * FROM outbound_webhooks ${where} ORDER BY created_at ASC`,
      values
    );
    return result.rows.map(rowToWebhook);
  }

  /**
   * Return only enabled webhooks that subscribe to the given event.
   * Used by OutboundWebhookDispatcher to fetch delivery targets.
   */
  async listForEvent(event: OutboundWebhookEvent): Promise<OutboundWebhook[]> {
    const pool = this.getPool();
    const result = await pool.query<OutboundWebhookRow>(
      `SELECT * FROM outbound_webhooks
       WHERE enabled = true AND events @> $1::jsonb
       ORDER BY created_at ASC`,
      [JSON.stringify([event])]
    );
    return result.rows.map(rowToWebhook);
  }

  /** Update a webhook. Returns null if not found. */
  async updateWebhook(id: string, update: OutboundWebhookUpdate): Promise<OutboundWebhook | null> {
    const pool = this.getPool();

    const { setClause, values, nextIdx, hasUpdates } = buildSet([
      { column: 'name', value: update.name },
      { column: 'url', value: update.url },
      { column: 'secret', value: update.secret },
      { column: 'events', value: update.events, json: true },
      { column: 'enabled', value: update.enabled },
    ]);

    if (!hasUpdates) return this.getWebhook(id);

    values.push(Date.now(), id);
    const result = await pool.query<OutboundWebhookRow>(
      `UPDATE outbound_webhooks SET ${setClause}, updated_at = $${nextIdx} WHERE id = $${nextIdx + 1} RETURNING *`,
      values
    );
    return result.rows[0] ? rowToWebhook(result.rows[0]) : null;
  }

  /** Delete a webhook. Returns true if a row was removed. */
  async deleteWebhook(id: string): Promise<boolean> {
    const pool = this.getPool();
    const result = await pool.query('DELETE FROM outbound_webhooks WHERE id = $1 RETURNING id', [
      id,
    ]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  /** Record a successful delivery attempt. */
  async recordSuccess(id: string, statusCode: number): Promise<void> {
    const pool = this.getPool();
    await pool.query(
      `UPDATE outbound_webhooks
       SET last_fired_at = $1, last_status_code = $2,
           consecutive_failures = 0, updated_at = $1
       WHERE id = $3`,
      [Date.now(), statusCode, id]
    );
  }

  /** Record a failed delivery attempt. */
  async recordFailure(id: string, statusCode: number | null): Promise<void> {
    const pool = this.getPool();
    await pool.query(
      `UPDATE outbound_webhooks
       SET last_status_code = $1,
           consecutive_failures = consecutive_failures + 1,
           updated_at = $2
       WHERE id = $3`,
      [statusCode, Date.now(), id]
    );
  }
}
