/**
 * EventSubscriptionStore — PostgreSQL-backed CRUD for event subscriptions
 * and webhook delivery records.
 *
 * Uses the events.subscriptions and events.deliveries tables created by
 * migration 008_event_subscriptions.sql.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { buildWhere, buildSet, parseCount } from '../storage/query-helpers.js';
import { uuidv7 } from '../utils/crypto.js';
import type { EventType, EventPayload, EventSubscription, EventDelivery } from './types.js';

// ─── Row types ──────────────────────────────────────────────

interface SubscriptionRow {
  id: string;
  name: string;
  event_types: string[];
  webhook_url: string;
  secret: string | null;
  enabled: boolean;
  headers: Record<string, string>;
  retry_policy: { maxRetries: number; backoffMs: number };
  created_at: string;
  updated_at: string | null;
  tenant_id: string;
}

interface DeliveryRow {
  id: string;
  subscription_id: string;
  event_type: string;
  payload: EventPayload;
  status: string;
  attempts: string;
  max_attempts: string;
  last_attempt_at: string | null;
  next_retry_at: string | null;
  response_status: string | null;
  response_body: string | null;
  error: string | null;
  created_at: string;
  tenant_id: string;
}

// ─── Row mappers ────────────────────────────────────────────

function rowToSubscription(row: SubscriptionRow): EventSubscription {
  return {
    id: row.id,
    name: row.name,
    eventTypes: row.event_types as EventType[],
    webhookUrl: row.webhook_url,
    secret: row.secret,
    enabled: row.enabled,
    headers: row.headers ?? {},
    retryPolicy: row.retry_policy ?? { maxRetries: 3, backoffMs: 1000 },
    createdAt: Number(row.created_at),
    updatedAt: row.updated_at !== null ? Number(row.updated_at) : null,
    tenantId: row.tenant_id,
  };
}

function rowToDelivery(row: DeliveryRow): EventDelivery {
  return {
    id: row.id,
    subscriptionId: row.subscription_id,
    eventType: row.event_type as EventType,
    payload: row.payload,
    status: row.status as EventDelivery['status'],
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    lastAttemptAt: row.last_attempt_at !== null ? Number(row.last_attempt_at) : null,
    nextRetryAt: row.next_retry_at !== null ? Number(row.next_retry_at) : null,
    responseStatus: row.response_status !== null ? Number(row.response_status) : null,
    responseBody: row.response_body,
    error: row.error,
    createdAt: Number(row.created_at),
    tenantId: row.tenant_id,
  };
}

// ─── Storage class ──────────────────────────────────────────

export interface CreateSubscriptionInput {
  name: string;
  eventTypes: EventType[];
  webhookUrl: string;
  secret?: string | null;
  enabled?: boolean;
  headers?: Record<string, string>;
  retryPolicy?: { maxRetries: number; backoffMs: number };
  tenantId?: string;
}

export interface UpdateSubscriptionInput {
  name?: string;
  eventTypes?: EventType[];
  webhookUrl?: string;
  secret?: string | null;
  enabled?: boolean;
  headers?: Record<string, string>;
  retryPolicy?: { maxRetries: number; backoffMs: number };
}

export interface CreateDeliveryInput {
  subscriptionId: string;
  eventType: EventType;
  payload: EventPayload;
  maxAttempts: number;
  tenantId: string;
}

export interface UpdateDeliveryInput {
  status?: EventDelivery['status'];
  attempts?: number;
  lastAttemptAt?: number | null;
  nextRetryAt?: number | null;
  responseStatus?: number | null;
  responseBody?: string | null;
  error?: string | null;
}

export class EventSubscriptionStore extends PgBaseStorage {
  // ── Subscriptions ─────────────────────────────────────────

  async createSubscription(input: CreateSubscriptionInput): Promise<string> {
    const id = uuidv7();
    const now = Date.now();
    await this.execute(
      `INSERT INTO events.subscriptions
         (id, name, event_types, webhook_url, secret, enabled, headers, retry_policy, created_at, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)`,
      [
        id,
        input.name,
        input.eventTypes,
        input.webhookUrl,
        input.secret ?? null,
        input.enabled ?? true,
        JSON.stringify(input.headers ?? {}),
        JSON.stringify(input.retryPolicy ?? { maxRetries: 3, backoffMs: 1000 }),
        now,
        input.tenantId ?? 'default',
      ]
    );
    return id;
  }

  async getSubscription(id: string): Promise<EventSubscription | null> {
    const row = await this.queryOne<SubscriptionRow>(
      'SELECT * FROM events.subscriptions WHERE id = $1',
      [id]
    );
    return row ? rowToSubscription(row) : null;
  }

  async listSubscriptions(opts?: {
    tenantId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ subscriptions: EventSubscription[]; total: number }> {
    const { where, values, nextIdx } = buildWhere([{ column: 'tenant_id', value: opts?.tenantId }]);

    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;

    const countResult = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM events.subscriptions ${where}`,
      values
    );
    const total = parseCount(countResult);

    let idx = nextIdx;
    const rows = await this.queryMany<SubscriptionRow>(
      `SELECT * FROM events.subscriptions ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...values, limit, offset]
    );

    return { subscriptions: rows.map(rowToSubscription), total };
  }

  async updateSubscription(id: string, changes: UpdateSubscriptionInput): Promise<number> {
    const { setClause, values, nextIdx, hasUpdates } = buildSet([
      { column: 'name', value: changes.name },
      { column: 'event_types', value: changes.eventTypes },
      { column: 'webhook_url', value: changes.webhookUrl },
      { column: 'secret', value: changes.secret },
      { column: 'enabled', value: changes.enabled },
      { column: 'headers', value: changes.headers, json: true },
      { column: 'retry_policy', value: changes.retryPolicy, json: true },
    ]);

    if (!hasUpdates) return 0;

    let idx = nextIdx;
    values.push(Date.now());
    values.push(id);

    return this.execute(
      `UPDATE events.subscriptions SET ${setClause}, updated_at = $${idx++} WHERE id = $${idx}`,
      values
    );
  }

  async deleteSubscription(id: string): Promise<number> {
    return this.execute('DELETE FROM events.subscriptions WHERE id = $1', [id]);
  }

  async getSubscriptionsForEvent(
    eventType: EventType,
    tenantId: string
  ): Promise<EventSubscription[]> {
    const rows = await this.queryMany<SubscriptionRow>(
      `SELECT * FROM events.subscriptions
       WHERE enabled = true AND tenant_id = $1 AND $2 = ANY(event_types)
       ORDER BY created_at ASC`,
      [tenantId, eventType]
    );
    return rows.map(rowToSubscription);
  }

  // ── Deliveries ────────────────────────────────────────────

  async createDelivery(input: CreateDeliveryInput): Promise<string> {
    const id = uuidv7();
    const now = Date.now();
    await this.execute(
      `INSERT INTO events.deliveries
         (id, subscription_id, event_type, payload, status, max_attempts, created_at, tenant_id)
       VALUES ($1, $2, $3, $4::jsonb, 'pending', $5, $6, $7)`,
      [
        id,
        input.subscriptionId,
        input.eventType,
        JSON.stringify(input.payload),
        input.maxAttempts,
        now,
        input.tenantId,
      ]
    );
    return id;
  }

  async updateDelivery(id: string, changes: UpdateDeliveryInput): Promise<number> {
    const { setClause, values, nextIdx, hasUpdates } = buildSet([
      { column: 'status', value: changes.status },
      { column: 'attempts', value: changes.attempts },
      { column: 'last_attempt_at', value: changes.lastAttemptAt },
      { column: 'next_retry_at', value: changes.nextRetryAt },
      { column: 'response_status', value: changes.responseStatus },
      { column: 'response_body', value: changes.responseBody },
      { column: 'error', value: changes.error },
    ]);

    if (!hasUpdates) return 0;

    values.push(id);
    return this.execute(`UPDATE events.deliveries SET ${setClause} WHERE id = $${nextIdx}`, values);
  }

  async getPendingRetries(now: number): Promise<EventDelivery[]> {
    const rows = await this.queryMany<DeliveryRow>(
      `SELECT * FROM events.deliveries
       WHERE status = 'retrying' AND next_retry_at <= $1
       ORDER BY next_retry_at ASC
       LIMIT 100`,
      [now]
    );
    return rows.map(rowToDelivery);
  }

  async getDelivery(id: string): Promise<EventDelivery | null> {
    const row = await this.queryOne<DeliveryRow>('SELECT * FROM events.deliveries WHERE id = $1', [
      id,
    ]);
    return row ? rowToDelivery(row) : null;
  }

  async listDeliveries(
    subscriptionId: string,
    opts?: { limit?: number; offset?: number }
  ): Promise<{ deliveries: EventDelivery[]; total: number }> {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;

    const countResult = await this.queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM events.deliveries WHERE subscription_id = $1',
      [subscriptionId]
    );
    const total = Number(countResult?.count ?? 0);

    const rows = await this.queryMany<DeliveryRow>(
      `SELECT * FROM events.deliveries
       WHERE subscription_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [subscriptionId, limit, offset]
    );

    return { deliveries: rows.map(rowToDelivery), total };
  }
}
