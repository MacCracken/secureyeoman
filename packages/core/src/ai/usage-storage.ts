/**
 * UsageStorage — PostgreSQL-backed persistence for AI usage records.
 *
 * Records are written fire-and-forget on each AI call and loaded back on
 * startup so cost/token totals survive process restarts.
 *
 * Schema:
 *   usage_records       — one row per successful AI call (includes latency_ms)
 *   usage_error_records — one row per failed AI call
 *   usage_resets        — reset timestamps per stat (errors | latency)
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import type { UsageRecord } from './usage-tracker.js';
import type { AIProviderName } from '@secureyeoman/shared';

interface UsageRow {
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  total_tokens: number;
  cost_usd: number;
  recorded_at: string; // BIGINT comes back as string from pg driver
  personality_id: string | null;
  latency_ms: number;
}

export interface HistoryRow {
  date: string;
  provider: string;
  model: string;
  personalityId: string | null;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  costUsd: number;
  calls: number;
}

export interface HistoryFilter {
  from?: number;
  to?: number;
  provider?: string;
  model?: string;
  personalityId?: string;
  groupBy?: 'day' | 'hour';
}

export interface LoadedStats {
  errorCount: number;
  latencyTotalMs: number;
  latencyCallCount: number;
}

// Keep 90 days of history — enough for monthly rollups with headroom.
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export class UsageStorage extends PgBaseStorage {
  async init(): Promise<void> {
    await this.execute(`
      CREATE TABLE IF NOT EXISTS usage_records (
        id           BIGSERIAL PRIMARY KEY,
        provider     TEXT             NOT NULL,
        model        TEXT             NOT NULL,
        input_tokens INTEGER          NOT NULL DEFAULT 0,
        output_tokens INTEGER         NOT NULL DEFAULT 0,
        cached_tokens INTEGER         NOT NULL DEFAULT 0,
        total_tokens INTEGER          NOT NULL DEFAULT 0,
        cost_usd     DOUBLE PRECISION NOT NULL DEFAULT 0,
        recorded_at  BIGINT           NOT NULL,
        personality_id TEXT,
        latency_ms   INTEGER          NOT NULL DEFAULT 0
      )
    `);
    // Add latency_ms to existing tables that predate this column
    await this.execute(
      `ALTER TABLE usage_records ADD COLUMN IF NOT EXISTS latency_ms INTEGER NOT NULL DEFAULT 0`
    );
    await this.execute(
      `CREATE INDEX IF NOT EXISTS usage_records_recorded_at_idx ON usage_records (recorded_at)`
    );
    await this.execute(
      `CREATE INDEX IF NOT EXISTS usage_records_personality_idx ON usage_records (personality_id)`
    );

    await this.execute(`
      CREATE TABLE IF NOT EXISTS usage_error_records (
        id          BIGSERIAL PRIMARY KEY,
        provider    TEXT   NOT NULL DEFAULT '',
        model       TEXT   NOT NULL DEFAULT '',
        recorded_at BIGINT NOT NULL
      )
    `);
    await this.execute(
      `CREATE INDEX IF NOT EXISTS usage_error_records_at_idx ON usage_error_records (recorded_at)`
    );

    await this.execute(`
      CREATE TABLE IF NOT EXISTS usage_resets (
        stat     TEXT   PRIMARY KEY,
        reset_at BIGINT NOT NULL
      )
    `);

    // Prune expired records on startup so the retention window is enforced
    await this.prune();
  }

  async insert(record: UsageRecord): Promise<void> {
    await this.execute(
      `INSERT INTO usage_records
         (provider, model, input_tokens, output_tokens, cached_tokens, total_tokens, cost_usd, recorded_at, personality_id, latency_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        record.provider,
        record.model,
        record.usage.inputTokens,
        record.usage.outputTokens,
        record.usage.cachedTokens,
        record.usage.totalTokens,
        record.costUsd,
        record.timestamp,
        record.personalityId ?? null,
        record.latencyMs ?? 0,
      ]
    );
  }

  async insertError(provider: string, model: string, timestamp: number): Promise<void> {
    await this.execute(
      `INSERT INTO usage_error_records (provider, model, recorded_at) VALUES ($1, $2, $3)`,
      [provider, model, timestamp]
    );
  }

  /** Load all records within the retention window. */
  async loadRecent(): Promise<UsageRecord[]> {
    const since = Date.now() - RETENTION_MS;
    const rows = await this.queryMany<UsageRow>(
      `SELECT provider, model, input_tokens, output_tokens, cached_tokens, total_tokens, cost_usd, recorded_at, personality_id, latency_ms
         FROM usage_records
        WHERE recorded_at >= $1
        ORDER BY recorded_at ASC`,
      [since]
    );

    return rows.map((row) => ({
      provider: row.provider as AIProviderName,
      model: row.model,
      usage: {
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        cachedTokens: row.cached_tokens,
        totalTokens: row.total_tokens,
      },
      costUsd: row.cost_usd,
      timestamp: Number(row.recorded_at),
      personalityId: row.personality_id ?? undefined,
      latencyMs: row.latency_ms,
    }));
  }

  /**
   * Load aggregate error count and latency stats from DB using reset timestamps
   * as lower bounds so the counters reflect values since the last reset.
   */
  async loadStats(errorsResetAt: number, latencyResetAt: number): Promise<LoadedStats> {
    const errorRow = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) AS count FROM usage_error_records WHERE recorded_at > $1`,
      [errorsResetAt]
    );

    const latencyRow = await this.queryOne<{ total: string | null; cnt: string }>(
      `SELECT SUM(latency_ms) AS total, COUNT(*) AS cnt
         FROM usage_records
        WHERE recorded_at > $1 AND latency_ms > 0`,
      [latencyResetAt]
    );

    return {
      errorCount: Number(errorRow?.count ?? 0),
      latencyTotalMs: Number(latencyRow?.total ?? 0),
      latencyCallCount: Number(latencyRow?.cnt ?? 0),
    };
  }

  /** Get the reset timestamp for a stat (0 if never reset). */
  async getResetAt(stat: string): Promise<number> {
    const row = await this.queryOne<{ reset_at: string }>(
      `SELECT reset_at FROM usage_resets WHERE stat = $1`,
      [stat]
    );
    return Number(row?.reset_at ?? 0);
  }

  /** Record a reset for a stat — queries will only count records after this timestamp. */
  async setResetAt(stat: string, at: number): Promise<void> {
    await this.execute(
      `INSERT INTO usage_resets (stat, reset_at) VALUES ($1, $2)
       ON CONFLICT (stat) DO UPDATE SET reset_at = $2`,
      [stat, at]
    );
  }

  /**
   * Query aggregated cost history with optional filters and grouping.
   * Returns one row per (date-bucket, provider, model, personality_id).
   */
  async queryHistory(filter: HistoryFilter = {}): Promise<HistoryRow[]> {
    const { from, to, provider, model, personalityId, groupBy = 'day' } = filter;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (from !== undefined) {
      params.push(from);
      conditions.push(`recorded_at >= $${params.length}`);
    }
    if (to !== undefined) {
      params.push(to);
      conditions.push(`recorded_at <= $${params.length}`);
    }
    if (provider) {
      params.push(provider);
      conditions.push(`provider = $${params.length}`);
    }
    if (model) {
      params.push(`%${model}%`);
      conditions.push(`model ILIKE $${params.length}`);
    }
    if (personalityId) {
      params.push(personalityId);
      conditions.push(`personality_id = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Truncate epoch-ms timestamp to day or hour bucket using integer arithmetic
    const bucketExpr =
      groupBy === 'hour'
        ? `to_char(to_timestamp(recorded_at / 1000), 'YYYY-MM-DD"T"HH24":00:00"')`
        : `to_char(to_timestamp(recorded_at / 1000), 'YYYY-MM-DD')`;

    const sql = `
      SELECT
        ${bucketExpr}                   AS date,
        provider,
        model,
        personality_id,
        SUM(input_tokens)::INTEGER      AS input_tokens,
        SUM(output_tokens)::INTEGER     AS output_tokens,
        SUM(cached_tokens)::INTEGER     AS cached_tokens,
        SUM(total_tokens)::INTEGER      AS total_tokens,
        SUM(cost_usd)                   AS cost_usd,
        COUNT(*)::INTEGER               AS calls
      FROM usage_records
      ${where}
      GROUP BY 1, provider, model, personality_id
      ORDER BY 1 ASC, provider, model
    `;

    const rows = await this.queryMany<{
      date: string;
      provider: string;
      model: string;
      personality_id: string | null;
      input_tokens: number;
      output_tokens: number;
      cached_tokens: number;
      total_tokens: number;
      cost_usd: number;
      calls: number;
    }>(sql, params);

    return rows.map((row) => ({
      date: row.date,
      provider: row.provider,
      model: row.model,
      personalityId: row.personality_id,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      cachedTokens: row.cached_tokens,
      totalTokens: row.total_tokens,
      costUsd: row.cost_usd,
      calls: row.calls,
    }));
  }

  /** Prune records older than the retention window (call periodically). */
  async prune(): Promise<void> {
    const cutoff = Date.now() - RETENTION_MS;
    await this.execute(`DELETE FROM usage_records WHERE recorded_at < $1`, [cutoff]);
    await this.execute(`DELETE FROM usage_error_records WHERE recorded_at < $1`, [cutoff]);
  }
}
