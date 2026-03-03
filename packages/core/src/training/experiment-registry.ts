/**
 * ExperimentRegistryManager — training run registry.
 *
 * Tracks experiments with hyperparameters, loss curves, eval metrics,
 * and links to finetune jobs and eval runs.
 */

import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';
import type {
  TrainingExperiment,
  TrainingExperimentCreate,
  TrainingExperimentStatus,
  LossCurvePoint,
  ExperimentDiff,
} from '@secureyeoman/shared';

export interface ExperimentRegistryManagerDeps {
  pool: Pool;
  logger: SecureLogger;
}

export class ExperimentRegistryManager {
  constructor(private readonly deps: ExperimentRegistryManagerDeps) {}

  async createExperiment(data: TrainingExperimentCreate): Promise<TrainingExperiment> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `INSERT INTO training.experiments
         (name, finetune_job_id, dataset_hash, hyperparameters, environment, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        data.name,
        data.finetuneJobId ?? null,
        data.datasetHash ?? null,
        JSON.stringify(data.hyperparameters ?? {}),
        JSON.stringify(data.environment ?? {}),
        data.status ?? 'draft',
        data.notes ?? null,
      ]
    );
    return this.mapRow(rows[0]!);
  }

  async updateExperiment(
    id: string,
    updates: {
      status?: TrainingExperimentStatus;
      notes?: string;
      hyperparameters?: Record<string, unknown>;
      environment?: Record<string, unknown>;
    }
  ): Promise<TrainingExperiment | null> {
    const setClauses: string[] = ['updated_at = now()'];
    const params: unknown[] = [];
    let idx = 1;

    if (updates.status !== undefined) {
      setClauses.push(`status = $${idx++}`);
      params.push(updates.status);
    }
    if (updates.notes !== undefined) {
      setClauses.push(`notes = $${idx++}`);
      params.push(updates.notes);
    }
    if (updates.hyperparameters !== undefined) {
      setClauses.push(`hyperparameters = $${idx++}`);
      params.push(JSON.stringify(updates.hyperparameters));
    }
    if (updates.environment !== undefined) {
      setClauses.push(`environment = $${idx++}`);
      params.push(JSON.stringify(updates.environment));
    }

    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `UPDATE training.experiments SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      [...params, id]
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async appendLossCurve(id: string, point: LossCurvePoint): Promise<TrainingExperiment | null> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `UPDATE training.experiments
       SET loss_curve = loss_curve || $1::jsonb, updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify([point]), id]
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async getExperiment(id: string): Promise<TrainingExperiment | null> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.experiments WHERE id = $1`,
      [id]
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async listExperiments(opts?: {
    status?: TrainingExperimentStatus;
    limit?: number;
    offset?: number;
  }): Promise<TrainingExperiment[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (opts?.status) {
      conditions.push(`status = $${idx++}`);
      params.push(opts.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(opts?.limit ?? 100, 1000);
    const offset = opts?.offset ?? 0;

    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.experiments ${where}
       ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );
    return rows.map((r) => this.mapRow(r));
  }

  async deleteExperiment(id: string): Promise<boolean> {
    const { rowCount } = await this.deps.pool.query(
      `DELETE FROM training.experiments WHERE id = $1`,
      [id]
    );
    return (rowCount ?? 0) > 0;
  }

  async diffExperiments(idA: string, idB: string): Promise<ExperimentDiff | null> {
    const a = await this.getExperiment(idA);
    const b = await this.getExperiment(idB);
    if (!a || !b) return null;

    const hyperparamDiffs: Record<string, { a: unknown; b: unknown }> = {};
    const allKeys = new Set([...Object.keys(a.hyperparameters), ...Object.keys(b.hyperparameters)]);
    for (const key of allKeys) {
      const va = a.hyperparameters[key];
      const vb = b.hyperparameters[key];
      if (JSON.stringify(va) !== JSON.stringify(vb)) {
        hyperparamDiffs[key] = { a: va ?? null, b: vb ?? null };
      }
    }

    const metricDiffs: Record<string, { a: number | null; b: number | null }> = {};
    const allMetricKeys = new Set([...Object.keys(a.evalMetrics), ...Object.keys(b.evalMetrics)]);
    for (const key of allMetricKeys) {
      const va = a.evalMetrics[key] ?? null;
      const vb = b.evalMetrics[key] ?? null;
      if (va !== vb) {
        metricDiffs[key] = { a: va, b: vb };
      }
    }

    return {
      hyperparamDiffs,
      metricDiffs,
      lossCurveA: a.lossCurve,
      lossCurveB: b.lossCurve,
    };
  }

  async linkEvalRun(
    experimentId: string,
    evalRunId: string,
    evalMetrics: Record<string, number>
  ): Promise<TrainingExperiment | null> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `UPDATE training.experiments
       SET eval_run_id = $1, eval_metrics = $2, updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [evalRunId, JSON.stringify(evalMetrics), experimentId]
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  private mapRow(r: Record<string, unknown>): TrainingExperiment {
    return {
      id: r.id as string,
      name: r.name as string,
      finetuneJobId: (r.finetune_job_id as string) ?? null,
      datasetHash: (r.dataset_hash as string) ?? null,
      hyperparameters: (r.hyperparameters as Record<string, unknown>) ?? {},
      environment: (r.environment as Record<string, unknown>) ?? {},
      lossCurve: (r.loss_curve as LossCurvePoint[]) ?? [],
      evalRunId: (r.eval_run_id as string) ?? null,
      evalMetrics: (r.eval_metrics as Record<string, number>) ?? {},
      status: r.status as TrainingExperimentStatus,
      notes: (r.notes as string) ?? null,
      createdAt:
        r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ''),
      updatedAt:
        r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at ?? ''),
    };
  }
}
