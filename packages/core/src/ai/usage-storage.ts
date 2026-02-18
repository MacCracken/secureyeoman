/**
 * UsageStorage — PostgreSQL-backed persistence for AI usage records.
 *
 * Records are written fire-and-forget on each AI call and loaded back on
 * startup so cost/token totals survive process restarts.
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
        recorded_at  BIGINT           NOT NULL
      )
    `);
    await this.execute(
      `CREATE INDEX IF NOT EXISTS usage_records_recorded_at_idx ON usage_records (recorded_at)`
    );
  }

  async insert(record: UsageRecord): Promise<void> {
    await this.execute(
      `INSERT INTO usage_records
         (provider, model, input_tokens, output_tokens, cached_tokens, total_tokens, cost_usd, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        record.provider,
        record.model,
        record.usage.inputTokens,
        record.usage.outputTokens,
        record.usage.cachedTokens,
        record.usage.totalTokens,
        record.costUsd,
        record.timestamp,
      ]
    );
  }

  /** Load all records within the retention window. */
  async loadRecent(): Promise<UsageRecord[]> {
    const since = Date.now() - RETENTION_MS;
    const rows = await this.queryMany<UsageRow>(
      `SELECT provider, model, input_tokens, output_tokens, cached_tokens, total_tokens, cost_usd, recorded_at
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
    }));
  }

  /** Prune records older than the retention window (call periodically). */
  async prune(): Promise<void> {
    const cutoff = Date.now() - RETENTION_MS;
    await this.execute(`DELETE FROM usage_records WHERE recorded_at < $1`, [cutoff]);
  }
}
