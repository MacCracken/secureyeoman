/**
 * QuotaStorage — PostgreSQL-backed storage for per-tenant rate limits and token budgets.
 *
 * Manages three tables in the `quotas` schema:
 *   - tenant_limits: per-tenant rate and token budget configuration
 *   - usage_counters: sliding-window request counters
 *   - token_usage: per-request token consumption records
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TenantLimits {
  tenantId: string;
  requestsPerMinute: number;
  requestsPerHour: number;
  tokensPerDay: number;
  tokensPerMonth: number;
  maxConcurrentRequests: number;
  customLimits: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

interface TenantLimitsRow {
  tenant_id: string;
  requests_per_minute: string;
  requests_per_hour: string;
  tokens_per_day: string;
  tokens_per_month: string;
  max_concurrent_requests: string;
  custom_limits: unknown;
  created_at: string;
  updated_at: string;
}

export interface UsageCounter {
  id: string;
  tenantId: string;
  counterType: string;
  windowStart: number;
  windowEnd: number;
  currentValue: number;
  maxValue: number;
}

interface UsageCounterRow {
  id: string;
  tenant_id: string;
  counter_type: string;
  window_start: string;
  window_end: string;
  current_value: string;
  max_value: string;
}

export interface TokenUsageRecord {
  id: string;
  tenantId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  recordedAt: number;
}

interface TokenUsageRow {
  id: string;
  tenant_id: string;
  model: string;
  input_tokens: string;
  output_tokens: string;
  total_tokens: string;
  recorded_at: string;
}

export interface TenantLimitsInput {
  requestsPerMinute?: number;
  requestsPerHour?: number;
  tokensPerDay?: number;
  tokensPerMonth?: number;
  maxConcurrentRequests?: number;
  customLimits?: Record<string, unknown>;
}

export interface TokenUsageQueryOpts {
  from?: number;
  to?: number;
  model?: string;
}

export interface TokenUsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  recordCount: number;
}

/* ------------------------------------------------------------------ */
/*  Row mappers                                                        */
/* ------------------------------------------------------------------ */

function limitsRowToRecord(row: TenantLimitsRow): TenantLimits {
  return {
    tenantId: row.tenant_id,
    requestsPerMinute: Number(row.requests_per_minute),
    requestsPerHour: Number(row.requests_per_hour),
    tokensPerDay: Number(row.tokens_per_day),
    tokensPerMonth: Number(row.tokens_per_month),
    maxConcurrentRequests: Number(row.max_concurrent_requests),
    customLimits:
      typeof row.custom_limits === 'object' && row.custom_limits !== null
        ? (row.custom_limits as Record<string, unknown>)
        : {},
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function counterRowToRecord(row: UsageCounterRow): UsageCounter {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    counterType: row.counter_type,
    windowStart: Number(row.window_start),
    windowEnd: Number(row.window_end),
    currentValue: Number(row.current_value),
    maxValue: Number(row.max_value),
  };
}

function tokenRowToRecord(row: TokenUsageRow): TokenUsageRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    model: row.model,
    inputTokens: Number(row.input_tokens),
    outputTokens: Number(row.output_tokens),
    totalTokens: Number(row.total_tokens),
    recordedAt: Number(row.recorded_at),
  };
}

/* ------------------------------------------------------------------ */
/*  Storage class                                                      */
/* ------------------------------------------------------------------ */

export class QuotaStorage extends PgBaseStorage {
  /* ---------- tenant_limits ---------------------------------------- */

  async getTenantLimits(tenantId: string): Promise<TenantLimits | null> {
    const row = await this.queryOne<TenantLimitsRow>(
      'SELECT * FROM quotas.tenant_limits WHERE tenant_id = $1',
      [tenantId]
    );
    return row ? limitsRowToRecord(row) : null;
  }

  async setTenantLimits(tenantId: string, limits: TenantLimitsInput): Promise<TenantLimits> {
    const now = Date.now();
    const row = await this.queryOne<TenantLimitsRow>(
      `INSERT INTO quotas.tenant_limits
         (tenant_id, requests_per_minute, requests_per_hour, tokens_per_day,
          tokens_per_month, max_concurrent_requests, custom_limits, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (tenant_id) DO UPDATE SET
         requests_per_minute = COALESCE($2, quotas.tenant_limits.requests_per_minute),
         requests_per_hour = COALESCE($3, quotas.tenant_limits.requests_per_hour),
         tokens_per_day = COALESCE($4, quotas.tenant_limits.tokens_per_day),
         tokens_per_month = COALESCE($5, quotas.tenant_limits.tokens_per_month),
         max_concurrent_requests = COALESCE($6, quotas.tenant_limits.max_concurrent_requests),
         custom_limits = COALESCE($7, quotas.tenant_limits.custom_limits),
         updated_at = $9
       RETURNING *`,
      [
        tenantId,
        limits.requestsPerMinute ?? 60,
        limits.requestsPerHour ?? 1000,
        limits.tokensPerDay ?? 1000000,
        limits.tokensPerMonth ?? 30000000,
        limits.maxConcurrentRequests ?? 10,
        JSON.stringify(limits.customLimits ?? {}),
        now,
        now,
      ]
    );
    return limitsRowToRecord(row!);
  }

  async deleteTenantLimits(tenantId: string): Promise<boolean> {
    const n = await this.execute('DELETE FROM quotas.tenant_limits WHERE tenant_id = $1', [
      tenantId,
    ]);
    return n > 0;
  }

  /* ---------- usage_counters --------------------------------------- */

  async getCounter(
    tenantId: string,
    counterType: string,
    windowStart: number
  ): Promise<UsageCounter | null> {
    const row = await this.queryOne<UsageCounterRow>(
      `SELECT * FROM quotas.usage_counters
       WHERE tenant_id = $1 AND counter_type = $2 AND window_start = $3`,
      [tenantId, counterType, windowStart]
    );
    return row ? counterRowToRecord(row) : null;
  }

  async incrementCounter(
    tenantId: string,
    counterType: string,
    windowStart: number,
    windowEnd: number,
    maxValue: number,
    incrementBy = 1
  ): Promise<UsageCounter> {
    const id = uuidv7();
    const row = await this.queryOne<UsageCounterRow>(
      `INSERT INTO quotas.usage_counters
         (id, tenant_id, counter_type, window_start, window_end, current_value, max_value)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tenant_id, counter_type, window_start) DO UPDATE SET
         current_value = quotas.usage_counters.current_value + $6,
         max_value = $7
       RETURNING *`,
      [id, tenantId, counterType, windowStart, windowEnd, incrementBy, maxValue]
    );
    return counterRowToRecord(row!);
  }

  async resetExpiredCounters(): Promise<number> {
    const now = Date.now();
    return this.execute('DELETE FROM quotas.usage_counters WHERE window_end <= $1', [now]);
  }

  async clearTenantCounters(tenantId: string): Promise<number> {
    return this.execute('DELETE FROM quotas.usage_counters WHERE tenant_id = $1', [tenantId]);
  }

  /* ---------- token_usage ------------------------------------------ */

  async recordTokenUsage(
    tenantId: string,
    model: string,
    inputTokens: number,
    outputTokens: number
  ): Promise<TokenUsageRecord> {
    const id = uuidv7();
    const now = Date.now();
    const totalTokens = inputTokens + outputTokens;
    const row = await this.queryOne<TokenUsageRow>(
      `INSERT INTO quotas.token_usage
         (id, tenant_id, model, input_tokens, output_tokens, total_tokens, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, tenantId, model, inputTokens, outputTokens, totalTokens, now]
    );
    return tokenRowToRecord(row!);
  }

  async getTokenUsage(
    tenantId: string,
    opts: TokenUsageQueryOpts = {}
  ): Promise<TokenUsageRecord[]> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let idx = 2;

    if (opts.from !== undefined) {
      conditions.push(`recorded_at >= $${idx++}`);
      params.push(opts.from);
    }
    if (opts.to !== undefined) {
      conditions.push(`recorded_at <= $${idx++}`);
      params.push(opts.to);
    }
    if (opts.model !== undefined) {
      conditions.push(`model = $${idx++}`);
      params.push(opts.model);
    }

    const rows = await this.queryMany<TokenUsageRow>(
      `SELECT * FROM quotas.token_usage
       WHERE ${conditions.join(' AND ')}
       ORDER BY recorded_at DESC
       LIMIT 1000`,
      params
    );
    return rows.map(tokenRowToRecord);
  }

  async getTokenUsageSummary(
    tenantId: string,
    opts: TokenUsageQueryOpts = {}
  ): Promise<TokenUsageSummary> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let idx = 2;

    if (opts.from !== undefined) {
      conditions.push(`recorded_at >= $${idx++}`);
      params.push(opts.from);
    }
    if (opts.to !== undefined) {
      conditions.push(`recorded_at <= $${idx++}`);
      params.push(opts.to);
    }
    if (opts.model !== undefined) {
      conditions.push(`model = $${idx++}`);
      params.push(opts.model);
    }

    const row = await this.queryOne<{
      total_input: string;
      total_output: string;
      total_tokens: string;
      record_count: string;
    }>(
      `SELECT
         COALESCE(SUM(input_tokens), 0) AS total_input,
         COALESCE(SUM(output_tokens), 0) AS total_output,
         COALESCE(SUM(total_tokens), 0) AS total_tokens,
         COUNT(*) AS record_count
       FROM quotas.token_usage
       WHERE ${conditions.join(' AND ')}`,
      params
    );

    return {
      totalInputTokens: Number(row?.total_input ?? 0),
      totalOutputTokens: Number(row?.total_output ?? 0),
      totalTokens: Number(row?.total_tokens ?? 0),
      recordCount: Number(row?.record_count ?? 0),
    };
  }
}
