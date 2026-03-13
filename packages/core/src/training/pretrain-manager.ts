/**
 * PretrainManager — Orchestrates pre-training jobs for small language models.
 *
 * Manages the lifecycle of pre-training from scratch: corpus validation,
 * job creation, Docker-based training execution, checkpoint tracking,
 * and progress monitoring. Scoped to models ≤3B parameters.
 */

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';
import type {
  PretrainJob,
  PretrainJobCreate,
  PretrainStatus,
  PretrainingConfig,
} from '@secureyeoman/shared';
import type { CorpusLoader } from './corpus-loader.js';
import type { SynapseManager } from '../integrations/synapse/synapse-manager.js';

// ── Storage helpers ───────────────────────────────────────────────────────────

function rowToJob(row: Record<string, unknown>): PretrainJob {
  return {
    id: row.id as string,
    name: row.name as string,
    status: (row.status as PretrainStatus) ?? 'pending',
    architecture: (row.architecture as PretrainJob['architecture']) ?? 'llama',
    parameterCount: (row.parameter_count as string) ?? '125M',
    vocabSize: Number(row.vocab_size ?? 32000),
    contextLength: Number(row.context_length ?? 2048),
    hiddenSize: Number(row.hidden_size ?? 768),
    numLayers: Number(row.num_layers ?? 12),
    numHeads: Number(row.num_heads ?? 12),
    intermediateSize: Number(row.intermediate_size ?? 3072),
    corpusSourceIds: (row.corpus_source_ids as string[]) ?? [],
    totalTokens: Number(row.total_tokens ?? 0),
    tokensProcessed: Number(row.tokens_processed ?? 0),
    batchSize: Number(row.batch_size ?? 32),
    gradientAccumulationSteps: Number(row.gradient_accumulation_steps ?? 4),
    learningRate: Number(row.learning_rate ?? 3e-4),
    lrSchedule: (row.lr_schedule as PretrainJob['lrSchedule']) ?? 'cosine',
    warmupSteps: Number(row.warmup_steps ?? 1000),
    weightDecay: Number(row.weight_decay ?? 0.01),
    maxSteps: Number(row.max_steps ?? 100000),
    currentStep: Number(row.current_step ?? 0),
    checkpointSteps: Number(row.checkpoint_steps ?? 5000),
    evalSteps: Number(row.eval_steps ?? 1000),
    trainingLoss: row.training_loss != null ? Number(row.training_loss) : undefined,
    validationLoss: row.validation_loss != null ? Number(row.validation_loss) : undefined,
    validationPerplexity:
      row.validation_perplexity != null ? Number(row.validation_perplexity) : undefined,
    image: (row.image as string) ?? 'ghcr.io/secureyeoman/pretrain-runner:latest',
    containerId: (row.container_id as string | null) ?? null,
    outputPath: (row.output_path as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    numGpus: Number(row.num_gpus ?? 1),
    createdAt:
      row.created_at instanceof Date ? row.created_at.getTime() : Number(row.created_at ?? 0),
    startedAt:
      row.started_at instanceof Date ? row.started_at.getTime() : Number(row.started_at ?? 0),
    completedAt:
      row.completed_at instanceof Date ? row.completed_at.getTime() : Number(row.completed_at ?? 0),
    tenantId: (row.tenant_id as string) ?? 'default',
    backend: (row.backend as 'local' | 'synapse') ?? 'local',
    synapseDelegatedJobId: (row.synapse_delegated_job_id as string | null) ?? null,
  };
}

// Size parsing: "125M" → 125_000_000, "3B" → 3_000_000_000
function parseParamCount(s: string): number {
  const match = /^([\d.]+)\s*([BMK])?$/i.exec(s);
  if (!match) return 0;
  const num = parseFloat(match[1]!);
  const unit = (match[2] ?? '').toUpperCase();
  if (unit === 'B') return num * 1e9;
  if (unit === 'M') return num * 1e6;
  if (unit === 'K') return num * 1e3;
  return num;
}

const MAX_PARAMS = 3e9; // 3B

export class PretrainManager {
  constructor(
    private readonly pool: Pool,
    private readonly logger: SecureLogger,
    private readonly config: PretrainingConfig,
    private readonly corpusLoader?: CorpusLoader,
    private readonly getSynapseManager?: () => SynapseManager | null
  ) {}

  async createJob(input: PretrainJobCreate): Promise<PretrainJob> {
    // Validate model size
    const paramCount = parseParamCount(input.parameterCount ?? '125M');
    const maxAllowed = parseParamCount(this.config.maxModelParams);
    if (paramCount > maxAllowed) {
      throw new Error(
        `Model size ${input.parameterCount} exceeds maximum ${this.config.maxModelParams}`
      );
    }
    if (paramCount > MAX_PARAMS) {
      throw new Error(`Model size exceeds absolute maximum of 3B parameters`);
    }

    // Check concurrent job limit
    const running = await this.listJobs('training');
    if (running.length >= this.config.maxConcurrentJobs) {
      throw new Error(
        `Max concurrent pre-training jobs (${this.config.maxConcurrentJobs}) reached`
      );
    }

    // Validate corpus sources exist
    if (this.corpusLoader && input.corpusSourceIds.length > 0) {
      for (const id of input.corpusSourceIds) {
        if (!this.corpusLoader.getSource(id)) {
          throw new Error(`Corpus source not found: ${id}`);
        }
      }
    }

    const id = `pt-${randomUUID().slice(0, 8)}`;
    const now = Date.now();

    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO training.pretrain_jobs (
        id, name, status, architecture, parameter_count,
        vocab_size, context_length, hidden_size, num_layers, num_heads,
        intermediate_size, corpus_source_ids, total_tokens,
        batch_size, gradient_accumulation_steps, learning_rate,
        lr_schedule, warmup_steps, weight_decay, max_steps,
        checkpoint_steps, eval_steps, image, num_gpus, tenant_id, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
      RETURNING *`,
      [
        id,
        input.name,
        'pending',
        input.architecture ?? 'llama',
        input.parameterCount ?? '125M',
        input.vocabSize ?? 32000,
        input.contextLength ?? 2048,
        input.hiddenSize ?? 768,
        input.numLayers ?? 12,
        input.numHeads ?? 12,
        input.intermediateSize ?? 3072,
        JSON.stringify(input.corpusSourceIds ?? []),
        input.totalTokens ?? 0,
        input.batchSize ?? 32,
        input.gradientAccumulationSteps ?? 4,
        input.learningRate ?? 3e-4,
        input.lrSchedule ?? 'cosine',
        input.warmupSteps ?? 1000,
        input.weightDecay ?? 0.01,
        input.maxSteps ?? 100000,
        input.checkpointSteps ?? 5000,
        input.evalSteps ?? 1000,
        input.image ?? this.config.defaultImage,
        input.numGpus ?? 1,
        input.tenantId ?? 'default',
        now,
      ]
    );

    const job = rowToJob(rows[0]!);
    this.logger.info(
      {
        jobId: id,
        name: input.name,
        architecture: input.architecture,
      },
      'Pre-training job created'
    );
    return job;
  }

  async getJob(id: string): Promise<PretrainJob | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      'SELECT * FROM training.pretrain_jobs WHERE id = $1',
      [id]
    );
    return rows.length ? rowToJob(rows[0]!) : null;
  }

  async listJobs(status?: string): Promise<PretrainJob[]> {
    if (status) {
      const { rows } = await this.pool.query<Record<string, unknown>>(
        'SELECT * FROM training.pretrain_jobs WHERE status = $1 ORDER BY created_at DESC LIMIT 100',
        [status]
      );
      return rows.map(rowToJob);
    }
    const { rows } = await this.pool.query<Record<string, unknown>>(
      'SELECT * FROM training.pretrain_jobs ORDER BY created_at DESC LIMIT 100'
    );
    return rows.map(rowToJob);
  }

  async updateProgress(
    jobId: string,
    updates: {
      currentStep?: number;
      tokensProcessed?: number;
      trainingLoss?: number;
      validationLoss?: number;
      validationPerplexity?: number;
      status?: PretrainStatus;
    }
  ): Promise<PretrainJob | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (updates.currentStep != null) {
      sets.push(`current_step = $${idx++}`);
      values.push(updates.currentStep);
    }
    if (updates.tokensProcessed != null) {
      sets.push(`tokens_processed = $${idx++}`);
      values.push(updates.tokensProcessed);
    }
    if (updates.trainingLoss != null) {
      sets.push(`training_loss = $${idx++}`);
      values.push(updates.trainingLoss);
    }
    if (updates.validationLoss != null) {
      sets.push(`validation_loss = $${idx++}`);
      values.push(updates.validationLoss);
    }
    if (updates.validationPerplexity != null) {
      sets.push(`validation_perplexity = $${idx++}`);
      values.push(updates.validationPerplexity);
    }
    if (updates.status) {
      sets.push(`status = $${idx++}`);
      values.push(updates.status);
    }

    if (sets.length === 0) return this.getJob(jobId);

    values.push(jobId);
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `UPDATE training.pretrain_jobs SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return rows.length ? rowToJob(rows[0]!) : null;
  }

  async cancelJob(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE training.pretrain_jobs SET status = 'cancelled', completed_at = $1
       WHERE id = $2 AND status IN ('pending', 'validating', 'tokenizing', 'training')`,
      [Date.now(), id]
    );
    if ((rowCount ?? 0) > 0) {
      this.logger.info({ jobId: id }, 'Pre-training job cancelled');
      return true;
    }
    return false;
  }

  async deleteJob(id: string): Promise<boolean> {
    await this.cancelJob(id);
    const { rowCount } = await this.pool.query('DELETE FROM training.pretrain_jobs WHERE id = $1', [
      id,
    ]);
    return (rowCount ?? 0) > 0;
  }

  /**
   * Start a pre-training job. If backend=synapse, delegates to Synapse;
   * otherwise falls through to the existing local Docker path.
   */
  async startJob(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job) throw new Error(`Pretrain job not found: ${jobId}`);
    if (job.status !== 'pending') {
      throw new Error(`Job ${jobId} is not pending (status=${job.status})`);
    }

    if (job.backend === 'synapse') {
      const synapse = this.getSynapseManager?.();
      if (!synapse?.isAvailable()) {
        throw new Error('Synapse backend requested but no healthy Synapse instance is available');
      }

      const { response, delegatedJob } = await synapse.delegateTrainingJob(
        {
          baseModel: `pretrain:${job.architecture}:${job.parameterCount}`,
          datasetPath: job.corpusSourceIds.join(','),
          method: 'pretrain',
          configJson: JSON.stringify({
            vocab_size: job.vocabSize,
            context_length: job.contextLength,
            hidden_size: job.hiddenSize,
            num_layers: job.numLayers,
            num_heads: job.numHeads,
            intermediate_size: job.intermediateSize,
            batch_size: job.batchSize,
            learning_rate: job.learningRate,
            lr_schedule: job.lrSchedule,
            warmup_steps: job.warmupSteps,
            weight_decay: job.weightDecay,
            max_steps: job.maxSteps,
          }),
        },
        { syJobId: jobId, syJobType: 'pretrain' }
      );

      await this.pool.query(
        `UPDATE training.pretrain_jobs
         SET status = 'training', container_id = $1, synapse_delegated_job_id = $2, started_at = $3
         WHERE id = $4`,
        [`synapse:${response.jobId}`, delegatedJob?.id ?? null, Date.now(), jobId]
      );

      this.logger.info(
        { jobId, synapseJobId: response.jobId },
        'Pre-training job delegated to Synapse'
      );
      return;
    }

    // Local Docker execution is handled by the caller (routes or scheduler)
    await this.updateProgress(jobId, { status: 'training' });
  }

  /** Estimate parameter count from architecture config. */
  estimateParams(config: {
    vocabSize: number;
    hiddenSize: number;
    numLayers: number;
    intermediateSize: number;
  }): number {
    // Transformer param estimate: embedding + layers * (attn + ffn)
    const embedding = config.vocabSize * config.hiddenSize;
    const attnPerLayer = 4 * config.hiddenSize * config.hiddenSize; // Q, K, V, O
    const ffnPerLayer = 2 * config.hiddenSize * config.intermediateSize;
    const layerNorm = 2 * config.hiddenSize * config.numLayers;
    return embedding + config.numLayers * (attnPerLayer + ffnPerLayer) + layerNorm;
  }
}
