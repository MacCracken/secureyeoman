/**
 * CheckpointStore — CRUD for training.checkpoints table.
 */

import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';
import type { Checkpoint } from '@secureyeoman/shared';

export interface CheckpointStoreDeps {
  pool: Pool;
  logger: SecureLogger;
}

function rowToCheckpoint(row: Record<string, unknown>): Checkpoint {
  return {
    id: row.id as string,
    finetuneJobId: row.finetune_job_id as string,
    step: row.step as number,
    path: row.path as string,
    loss: (row.loss as number) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? ''),
  };
}

export class CheckpointStore {
  constructor(private readonly deps: CheckpointStoreDeps) {}

  async create(data: {
    finetuneJobId: string;
    step: number;
    path: string;
    loss?: number;
    metadata?: Record<string, unknown>;
  }): Promise<Checkpoint> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `INSERT INTO training.checkpoints (finetune_job_id, step, path, loss, metadata)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (finetune_job_id, step) DO UPDATE
         SET path = EXCLUDED.path, loss = EXCLUDED.loss, metadata = EXCLUDED.metadata
       RETURNING *`,
      [
        data.finetuneJobId,
        data.step,
        data.path,
        data.loss ?? null,
        JSON.stringify(data.metadata ?? {}),
      ]
    );
    return rowToCheckpoint(rows[0]!);
  }

  async listByJob(finetuneJobId: string): Promise<Checkpoint[]> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.checkpoints WHERE finetune_job_id = $1 ORDER BY step ASC`,
      [finetuneJobId]
    );
    return rows.map(rowToCheckpoint);
  }

  async getLatest(finetuneJobId: string): Promise<Checkpoint | null> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.checkpoints WHERE finetune_job_id = $1 ORDER BY step DESC LIMIT 1`,
      [finetuneJobId]
    );
    return rows[0] ? rowToCheckpoint(rows[0]) : null;
  }

  async get(id: string): Promise<Checkpoint | null> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.checkpoints WHERE id = $1`,
      [id]
    );
    return rows[0] ? rowToCheckpoint(rows[0]) : null;
  }

  async deleteByJob(finetuneJobId: string): Promise<number> {
    const { rowCount } = await this.deps.pool.query(
      `DELETE FROM training.checkpoints WHERE finetune_job_id = $1`,
      [finetuneJobId]
    );
    return rowCount ?? 0;
  }

  async countByJob(finetuneJobId: string): Promise<number> {
    const { rows } = await this.deps.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM training.checkpoints WHERE finetune_job_id = $1`,
      [finetuneJobId]
    );
    return parseInt(rows[0]?.count ?? '0', 10);
  }
}
