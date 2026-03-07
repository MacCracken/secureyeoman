/**
 * PipelineLineageStorage — records the end-to-end chain for ML pipeline runs.
 *
 * Every ML pipeline workflow run writes lineage records so users can query:
 *   "which pipeline produced this model?"
 *   "what dataset went into this training run?"
 *
 * Storage: training.pipeline_lineage (migration 063).
 */

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DatasetLineageInfo {
  datasetId: string;
  path: string;
  sampleCount: number;
  filters?: Record<string, unknown>;
  snapshotAt: number;
}

export interface TrainingJobLineageInfo {
  jobId: string;
  jobType: 'distillation' | 'finetune';
  jobStatus: string;
}

export interface EvalLineageInfo {
  evalId: string;
  metrics: Record<string, number>;
  completedAt: number;
}

export interface DeploymentLineageInfo {
  modelVersion: string;
  personalityId: string;
  deployedAt: number;
}

export interface PipelineLineage {
  id: string;
  workflowRunId: string;
  workflowId: string;
  dataset: DatasetLineageInfo | null;
  trainingJob: TrainingJobLineageInfo | null;
  evaluation: EvalLineageInfo | null;
  deployment: DeploymentLineageInfo | null;
  createdAt: number;
  updatedAt: number;
}

// ── Row mapping ───────────────────────────────────────────────────────────────

function rowToLineage(row: Record<string, unknown>): PipelineLineage {
  const dataset: DatasetLineageInfo | null = row.dataset_id
    ? {
        datasetId: row.dataset_id as string,
        path: (row.dataset_path as string) ?? '',
        sampleCount: (row.dataset_sample_count as number) ?? 0,
        filters: (row.dataset_filters as Record<string, unknown> | null) ?? undefined,
        snapshotAt:
          row.dataset_snapshotted_at instanceof Date ? row.dataset_snapshotted_at.getTime() : 0,
      }
    : null;

  const trainingJob: TrainingJobLineageInfo | null = row.training_job_id
    ? {
        jobId: row.training_job_id as string,
        jobType: (row.training_job_type as 'distillation' | 'finetune') ?? 'distillation',
        jobStatus: (row.training_job_status as string) ?? 'unknown',
      }
    : null;

  const evaluation: EvalLineageInfo | null = row.eval_id
    ? {
        evalId: row.eval_id as string,
        metrics: (row.eval_metrics as Record<string, number>) ?? {},
        completedAt: row.eval_completed_at instanceof Date ? row.eval_completed_at.getTime() : 0,
      }
    : null;

  const deployment: DeploymentLineageInfo | null = row.deployed_model_version
    ? {
        modelVersion: row.deployed_model_version as string,
        personalityId: (row.deployed_personality_id as string) ?? '',
        deployedAt: row.deployed_at instanceof Date ? row.deployed_at.getTime() : 0,
      }
    : null;

  return {
    id: row.id as string,
    workflowRunId: row.workflow_run_id as string,
    workflowId: row.workflow_id as string,
    dataset,
    trainingJob,
    evaluation,
    deployment,
    createdAt: row.created_at instanceof Date ? row.created_at.getTime() : Date.now(),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.getTime() : Date.now(),
  };
}

// ── Storage ───────────────────────────────────────────────────────────────────

export class PipelineLineageStorage {
  constructor(
    private readonly pool: Pool,
    private readonly logger: SecureLogger
  ) {}

  /** Create or get the lineage record for a workflow run. */
  async ensureRecord(workflowRunId: string, workflowId: string): Promise<PipelineLineage> {
    // Upsert on workflow_run_id
    const result = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO training.pipeline_lineage (id, workflow_run_id, workflow_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (workflow_run_id) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [randomUUID(), workflowRunId, workflowId]
    );
    // ON CONFLICT doesn't return on update with RETURNING * in all cases;
    // fallback to SELECT
    if (!result.rows[0]) {
      return this.getByRunId(workflowRunId) as Promise<PipelineLineage>;
    }
    return rowToLineage(result.rows[0]);
  }

  async getByRunId(workflowRunId: string): Promise<PipelineLineage | null> {
    const result = await this.pool.query<Record<string, unknown>>(
      'SELECT * FROM training.pipeline_lineage WHERE workflow_run_id = $1',
      [workflowRunId]
    );
    return result.rows[0] ? rowToLineage(result.rows[0]) : null;
  }

  async getByTrainingJobId(trainingJobId: string): Promise<PipelineLineage | null> {
    const result = await this.pool.query<Record<string, unknown>>(
      'SELECT * FROM training.pipeline_lineage WHERE training_job_id = $1',
      [trainingJobId]
    );
    return result.rows[0] ? rowToLineage(result.rows[0]) : null;
  }

  async list(limit = 50): Promise<PipelineLineage[]> {
    const result = await this.pool.query<Record<string, unknown>>(
      'SELECT * FROM training.pipeline_lineage ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return result.rows.map(rowToLineage);
  }

  async recordDataset(
    workflowRunId: string,
    workflowId: string,
    info: DatasetLineageInfo
  ): Promise<void> {
    await this.ensureRecord(workflowRunId, workflowId);
    await this.pool.query(
      `UPDATE training.pipeline_lineage
       SET dataset_id = $2,
           dataset_path = $3,
           dataset_sample_count = $4,
           dataset_filters = $5,
           dataset_snapshotted_at = to_timestamp($6 / 1000.0),
           updated_at = NOW()
       WHERE workflow_run_id = $1`,
      [
        workflowRunId,
        info.datasetId,
        info.path,
        info.sampleCount,
        info.filters ? JSON.stringify(info.filters) : null,
        info.snapshotAt,
      ]
    );
    this.logger.debug({
      workflowRunId,
      datasetId: info.datasetId,
    }, 'PipelineLineage: recorded dataset');
  }

  async recordTrainingJob(
    workflowRunId: string,
    workflowId: string,
    info: TrainingJobLineageInfo
  ): Promise<void> {
    await this.ensureRecord(workflowRunId, workflowId);
    await this.pool.query(
      `UPDATE training.pipeline_lineage
       SET training_job_id = $2,
           training_job_type = $3,
           training_job_status = $4,
           updated_at = NOW()
       WHERE workflow_run_id = $1`,
      [workflowRunId, info.jobId, info.jobType, info.jobStatus]
    );
    this.logger.debug({
      workflowRunId,
      jobId: info.jobId,
    }, 'PipelineLineage: recorded training job');
  }

  async recordEvaluation(
    workflowRunId: string,
    workflowId: string,
    info: EvalLineageInfo
  ): Promise<void> {
    await this.ensureRecord(workflowRunId, workflowId);
    await this.pool.query(
      `UPDATE training.pipeline_lineage
       SET eval_id = $2,
           eval_metrics = $3,
           eval_completed_at = to_timestamp($4 / 1000.0),
           updated_at = NOW()
       WHERE workflow_run_id = $1`,
      [workflowRunId, info.evalId, JSON.stringify(info.metrics), info.completedAt]
    );
    this.logger.debug({
      workflowRunId,
      evalId: info.evalId,
    }, 'PipelineLineage: recorded evaluation');
  }

  async recordDeployment(
    workflowRunId: string,
    workflowId: string,
    info: DeploymentLineageInfo
  ): Promise<void> {
    await this.ensureRecord(workflowRunId, workflowId);
    await this.pool.query(
      `UPDATE training.pipeline_lineage
       SET deployed_model_version = $2,
           deployed_personality_id = $3,
           deployed_at = to_timestamp($4 / 1000.0),
           updated_at = NOW()
       WHERE workflow_run_id = $1`,
      [workflowRunId, info.modelVersion, info.personalityId, info.deployedAt]
    );
    this.logger.debug({
      workflowRunId,
      modelVersion: info.modelVersion,
    }, 'PipelineLineage: recorded deployment');
  }

  close(): void {
    // No-op: shared pg pool is closed separately
  }
}
