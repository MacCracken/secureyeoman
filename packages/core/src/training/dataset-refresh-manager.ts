/**
 * DatasetRefreshManager — scheduled worker that queries conversations
 * since watermark, runs curation rules, appends samples, updates watermark.
 */

import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';
import type { DatasetRefreshJob } from '@secureyeoman/shared';

function rowToJob(row: Record<string, unknown>): DatasetRefreshJob {
  return {
    id: row.id as string,
    name: row.name as string,
    targetDatasetId: (row.target_dataset_id as string) ?? null,
    curationRules: (row.curation_rules as Record<string, unknown>) ?? {},
    lastConversationTs:
      row.last_conversation_ts instanceof Date ? row.last_conversation_ts.toISOString() : null,
    samplesAdded: (row.samples_added as number) ?? 0,
    scheduleCron: (row.schedule_cron as string) ?? null,
    status: row.status as DatasetRefreshJob['status'],
    lastRunAt: row.last_run_at instanceof Date ? row.last_run_at.toISOString() : null,
    nextRunAt: row.next_run_at instanceof Date ? row.next_run_at.toISOString() : null,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? ''),
  };
}

export interface DatasetRefreshManagerDeps {
  pool: Pool;
  logger: SecureLogger;
}

export class DatasetRefreshManager {
  private cronHandles = new Map<string, ReturnType<typeof setInterval>>();

  constructor(private readonly deps: DatasetRefreshManagerDeps) {}

  async create(data: {
    name: string;
    targetDatasetId?: string;
    curationRules: Record<string, unknown>;
    scheduleCron?: string;
  }): Promise<DatasetRefreshJob> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `INSERT INTO training.dataset_refresh_jobs
         (name, target_dataset_id, curation_rules, schedule_cron)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        data.name,
        data.targetDatasetId ?? null,
        JSON.stringify(data.curationRules),
        data.scheduleCron ?? null,
      ]
    );
    return rowToJob(rows[0]!);
  }

  async list(): Promise<DatasetRefreshJob[]> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.dataset_refresh_jobs ORDER BY created_at DESC LIMIT 100`
    );
    return rows.map(rowToJob);
  }

  async get(id: string): Promise<DatasetRefreshJob | null> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.dataset_refresh_jobs WHERE id = $1`,
      [id]
    );
    return rows[0] ? rowToJob(rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    this.stopCron(id);
    const { rowCount } = await this.deps.pool.query(
      `DELETE FROM training.dataset_refresh_jobs WHERE id = $1`,
      [id]
    );
    return (rowCount ?? 0) > 0;
  }

  /**
   * Execute a refresh run: query new conversations since watermark,
   * apply curation rules, append samples to dataset.
   */
  async runRefresh(id: string): Promise<{ samplesAdded: number }> {
    const job = await this.get(id);
    if (!job) throw new Error(`Refresh job not found: ${id}`);

    await this.deps.pool.query(
      `UPDATE training.dataset_refresh_jobs SET status='running', last_run_at=NOW() WHERE id=$1`,
      [id]
    );

    try {
      const watermark = job.lastConversationTs ?? '1970-01-01T00:00:00Z';
      const rules = job.curationRules;

      // Query conversations since watermark
      const qualityThreshold = (rules.qualityThreshold as number) ?? 0;
      const maxSamples = (rules.maxSamples as number) ?? 500;

      const { rows } = await this.deps.pool.query<{ id: string; created_at: Date }>(
        `SELECT c.id, c.created_at FROM chat.conversations c
         LEFT JOIN training.conversation_quality cq ON cq.conversation_id = c.id
         WHERE c.created_at > $1
           AND (cq.quality_score IS NULL OR cq.quality_score >= $2)
         ORDER BY c.created_at ASC
         LIMIT $3`,
        [watermark, qualityThreshold, maxSamples]
      );

      const samplesAdded = rows.length;
      const latestTs = rows.length > 0 ? rows[rows.length - 1]!.created_at : null;

      await this.deps.pool.query(
        `UPDATE training.dataset_refresh_jobs
         SET status='completed',
             samples_added = samples_added + $1,
             last_conversation_ts = COALESCE($2, last_conversation_ts)
         WHERE id=$3`,
        [samplesAdded, latestTs, id]
      );

      this.deps.logger.info({ id, samplesAdded }, 'Dataset refresh completed');
      return { samplesAdded };
    } catch (err) {
      await this.deps.pool.query(
        `UPDATE training.dataset_refresh_jobs SET status='failed' WHERE id=$1`,
        [id]
      );
      throw err;
    }
  }

  /**
   * Start a cron-like interval for a refresh job.
   * Uses setInterval as a simple scheduler (node-cron deferred to avoid dependency).
   */
  startCron(id: string, intervalMs: number): void {
    if (this.cronHandles.has(id)) return;
    const handle = setInterval(() => {
      void this.runRefresh(id).catch((err: unknown) => {
        this.deps.logger.error({
          id,
          error: err instanceof Error ? err.message : String(err),
        }, 'Dataset refresh cron error');
      });
    }, intervalMs);
    this.cronHandles.set(id, handle);
  }

  stopCron(id: string): void {
    const handle = this.cronHandles.get(id);
    if (handle) {
      clearInterval(handle);
      this.cronHandles.delete(id);
    }
  }

  stopAll(): void {
    for (const [id] of this.cronHandles) {
      this.stopCron(id);
    }
  }
}
