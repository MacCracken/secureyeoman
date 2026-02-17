/**
 * MultimodalStorage — PostgreSQL-backed storage for multimodal job tracking.
 *
 * Extends PgBaseStorage (same pattern as ProactiveStorage).
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';
import type { MultimodalJob, MultimodalJobType, MultimodalJobStatus } from '@secureyeoman/shared';

// ─── Row types ──────────────────────────────────────────────────────

interface JobRow {
  id: string;
  type: string;
  status: string;
  input: string;
  output: string | null;
  error: string | null;
  duration_ms: number | null;
  source_platform: string | null;
  source_message_id: string | null;
  created_at: string;
  completed_at: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────

function jobFromRow(row: JobRow): MultimodalJob {
  return {
    id: row.id,
    type: row.type as MultimodalJobType,
    status: row.status as MultimodalJobStatus,
    input: typeof row.input === 'string' ? JSON.parse(row.input) : row.input,
    output: row.output
      ? typeof row.output === 'string'
        ? JSON.parse(row.output)
        : row.output
      : null,
    error: row.error,
    durationMs: row.duration_ms,
    sourcePlatform: row.source_platform,
    sourceMessageId: row.source_message_id,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

// ─── Storage ────────────────────────────────────────────────────────

export class MultimodalStorage extends PgBaseStorage {
  async ensureTables(): Promise<void> {
    await this.execute(`CREATE SCHEMA IF NOT EXISTS multimodal`);
    await this.execute(`
      CREATE TABLE IF NOT EXISTS multimodal.jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        input JSONB NOT NULL,
        output JSONB,
        error TEXT,
        duration_ms INTEGER,
        source_platform TEXT,
        source_message_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      )
    `);
    await this.execute(
      `CREATE INDEX IF NOT EXISTS idx_multimodal_jobs_type ON multimodal.jobs(type)`
    );
    await this.execute(
      `CREATE INDEX IF NOT EXISTS idx_multimodal_jobs_status ON multimodal.jobs(status)`
    );
    await this.execute(
      `CREATE INDEX IF NOT EXISTS idx_multimodal_jobs_created ON multimodal.jobs(created_at DESC)`
    );
  }

  async createJob(
    type: MultimodalJobType,
    input: Record<string, unknown>,
    opts?: { sourcePlatform?: string; sourceMessageId?: string }
  ): Promise<string> {
    const id = uuidv7();
    await this.execute(
      `INSERT INTO multimodal.jobs (id, type, status, input, source_platform, source_message_id)
       VALUES ($1, $2, 'running', $3, $4, $5)`,
      [id, type, JSON.stringify(input), opts?.sourcePlatform ?? null, opts?.sourceMessageId ?? null]
    );
    return id;
  }

  async completeJob(
    id: string,
    output: Record<string, unknown>,
    durationMs: number
  ): Promise<void> {
    await this.execute(
      `UPDATE multimodal.jobs
       SET status = 'completed', output = $2, duration_ms = $3, completed_at = NOW()
       WHERE id = $1`,
      [id, JSON.stringify(output), durationMs]
    );
  }

  async failJob(id: string, error: string): Promise<void> {
    await this.execute(
      `UPDATE multimodal.jobs
       SET status = 'failed', error = $2, completed_at = NOW()
       WHERE id = $1`,
      [id, error]
    );
  }

  async getJob(id: string): Promise<MultimodalJob | null> {
    const row = await this.queryOne<JobRow>(`SELECT * FROM multimodal.jobs WHERE id = $1`, [id]);
    return row ? jobFromRow(row) : null;
  }

  async listJobs(filter?: {
    type?: MultimodalJobType;
    status?: MultimodalJobStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ jobs: MultimodalJob[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (filter?.type) {
      conditions.push(`type = $${paramIdx++}`);
      values.push(filter.type);
    }
    if (filter?.status) {
      conditions.push(`status = $${paramIdx++}`);
      values.push(filter.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Math.max(filter?.limit ?? 50, 1), 200);
    const offset = Math.max(filter?.offset ?? 0, 0);

    const countResult = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM multimodal.jobs ${where}`,
      values
    );
    const total = parseInt(countResult?.count ?? '0', 10);

    const rows = await this.queryMany<JobRow>(
      `SELECT * FROM multimodal.jobs ${where} ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      [...values, limit, offset]
    );

    return { jobs: rows.map(jobFromRow), total };
  }

  async getJobStats(): Promise<Record<string, Record<string, number>>> {
    const rows = await this.queryMany<{ type: string; status: string; count: string }>(
      `SELECT type, status, COUNT(*) as count FROM multimodal.jobs GROUP BY type, status`
    );

    const stats: Record<string, Record<string, number>> = {};
    for (const row of rows) {
      if (!stats[row.type]) stats[row.type] = {};
      stats[row.type]![row.status] = parseInt(row.count, 10);
    }
    return stats;
  }
}
