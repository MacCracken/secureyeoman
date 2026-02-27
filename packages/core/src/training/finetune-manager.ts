/**
 * FinetuneManager — orchestrates LoRA/QLoRA fine-tuning jobs via Docker.
 *
 * Each job:
 *   1. Writes a config JSON to a workspace directory
 *   2. Starts a Docker container (unsloth-trainer image) that reads the config
 *   3. Streams logs from the container
 *   4. On completion, records the adapter path and optionally registers with Ollama
 *
 * Jobs are stored in training.finetune_jobs (migration 061).
 * Docker is invoked via shell-out to `docker run` to avoid adding dockerode as a dependency.
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, execSync } from 'node:child_process';
import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type FinetuneStatus = 'pending' | 'running' | 'complete' | 'failed' | 'cancelled';

export interface FinetuneJobConfig {
  name: string;
  baseModel: string;
  adapterName: string;
  datasetPath: string;
  loraRank?: number;
  loraAlpha?: number;
  batchSize?: number;
  epochs?: number;
  vramBudgetGb?: number;
  image?: string;
}

export interface FinetuneJob {
  id: string;
  name: string;
  baseModel: string;
  adapterName: string;
  datasetPath: string;
  loraRank: number;
  loraAlpha: number;
  batchSize: number;
  epochs: number;
  vramBudgetGb: number;
  image: string;
  containerId: string | null;
  status: FinetuneStatus;
  adapterPath: string | null;
  errorMessage: string | null;
  createdAt: number;
  completedAt: number | null;
}

// ── Storage helpers ───────────────────────────────────────────────────────────

function rowToJob(row: Record<string, unknown>): FinetuneJob {
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    baseModel: row['base_model'] as string,
    adapterName: row['adapter_name'] as string,
    datasetPath: row['dataset_path'] as string,
    loraRank: (row['lora_rank'] as number) ?? 16,
    loraAlpha: (row['lora_alpha'] as number) ?? 32,
    batchSize: (row['batch_size'] as number) ?? 4,
    epochs: (row['epochs'] as number) ?? 3,
    vramBudgetGb: (row['vram_budget_gb'] as number) ?? 12,
    image:
      (row['image'] as string) ?? 'ghcr.io/secureyeoman/unsloth-trainer:latest',
    containerId: (row['container_id'] as string | null) ?? null,
    status: row['status'] as FinetuneStatus,
    adapterPath: (row['adapter_path'] as string | null) ?? null,
    errorMessage: (row['error_message'] as string | null) ?? null,
    createdAt: row['created_at'] instanceof Date ? (row['created_at'] as Date).getTime() : Date.now(),
    completedAt:
      row['completed_at'] instanceof Date ? (row['completed_at'] as Date).getTime() : null,
  };
}

// ── Manager ───────────────────────────────────────────────────────────────────

export class FinetuneManager {
  private readonly workDir: string;

  constructor(
    private readonly pool: Pool,
    private readonly logger: SecureLogger,
    workDir: string = '/tmp/secureyeoman-finetune'
  ) {
    this.workDir = workDir;
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  async createJob(cfg: FinetuneJobConfig): Promise<FinetuneJob> {
    const id = randomUUID();
    const {
      name,
      baseModel,
      adapterName,
      datasetPath,
      loraRank = 16,
      loraAlpha = 32,
      batchSize = 4,
      epochs = 3,
      vramBudgetGb = 12,
      image = 'ghcr.io/secureyeoman/unsloth-trainer:latest',
    } = cfg;

    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO training.finetune_jobs
         (id, name, base_model, adapter_name, dataset_path,
          lora_rank, lora_alpha, batch_size, epochs, vram_budget_gb, image)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [id, name, baseModel, adapterName, datasetPath, loraRank, loraAlpha, batchSize, epochs, vramBudgetGb, image]
    );
    return rowToJob(rows[0]!);
  }

  async listJobs(): Promise<FinetuneJob[]> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.finetune_jobs ORDER BY created_at DESC`
    );
    return rows.map(rowToJob);
  }

  async getJob(id: string): Promise<FinetuneJob | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.finetune_jobs WHERE id = $1`,
      [id]
    );
    return rows.length ? rowToJob(rows[0]!) : null;
  }

  async cancelJob(id: string): Promise<boolean> {
    const job = await this.getJob(id);
    if (!job) return false;

    // Stop Docker container if running
    if (job.containerId) {
      try {
        execSync(`docker stop ${job.containerId}`, { stdio: 'ignore' });
      } catch {
        /* container may already be stopped */
      }
    }

    const { rowCount } = await this.pool.query(
      `UPDATE training.finetune_jobs SET status='cancelled', completed_at=NOW()
       WHERE id=$1 AND status IN ('pending','running')`,
      [id]
    );
    return (rowCount ?? 0) > 0;
  }

  async deleteJob(id: string): Promise<boolean> {
    await this.cancelJob(id);
    const { rowCount } = await this.pool.query(
      `DELETE FROM training.finetune_jobs WHERE id=$1`,
      [id]
    );
    return (rowCount ?? 0) > 0;
  }

  // ── Docker execution ───────────────────────────────────────────────────────

  /**
   * Start a fine-tuning job. Writes config JSON, launches Docker container.
   * Returns immediately; container runs in background.
   */
  async startJob(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job) throw new Error(`Finetune job not found: ${jobId}`);
    if (job.status !== 'pending') {
      throw new Error(`Job ${jobId} is not pending (status=${job.status})`);
    }

    const jobDir = join(this.workDir, jobId);
    const adapterDir = join(jobDir, 'adapter');
    mkdirSync(adapterDir, { recursive: true });

    const configPath = join(jobDir, 'config.json');
    const trainConfig = {
      base_model: job.baseModel,
      adapter_name: job.adapterName,
      dataset_path: job.datasetPath,
      output_dir: '/workspace/adapter',
      lora_rank: job.loraRank,
      lora_alpha: job.loraAlpha,
      batch_size: job.batchSize,
      epochs: job.epochs,
      vram_budget_gb: job.vramBudgetGb,
    };
    writeFileSync(configPath, JSON.stringify(trainConfig, null, 2));

    // Launch Docker container
    const dockerArgs = [
      'run',
      '--rm',
      '--gpus', 'all',
      '-v', `${jobDir}:/workspace`,
      '--name', `sy-finetune-${jobId}`,
      job.image,
    ];

    const child = spawn('docker', dockerArgs, { detached: true, stdio: 'ignore' });
    const containerId = `sy-finetune-${jobId}`;
    child.unref();

    await this.pool.query(
      `UPDATE training.finetune_jobs
       SET status='running', container_id=$1
       WHERE id=$2`,
      [containerId, jobId]
    );

    this.logger.info('Finetune job started', { jobId, containerId, image: job.image });

    // Watch container completion in background
    this._watchContainer(jobId, containerId, adapterDir).catch((err) => {
      this.logger.error('Finetune watcher error', {
        jobId,
        error: err instanceof Error ? err.message : 'unknown',
      });
    });
  }

  private async _watchContainer(
    jobId: string,
    containerId: string,
    adapterDir: string
  ): Promise<void> {
    return new Promise((resolve) => {
      const watcher = spawn('docker', ['wait', containerId]);
      watcher.on('exit', async (code) => {
        const exitCode = typeof code === 'number' ? code : -1;
        const job = await this.getJob(jobId);
        if (!job || job.status === 'cancelled') {
          resolve();
          return;
        }

        if (exitCode === 0) {
          await this.pool.query(
            `UPDATE training.finetune_jobs
             SET status='complete', adapter_path=$1, completed_at=NOW()
             WHERE id=$2`,
            [adapterDir, jobId]
          );
          this.logger.info('Finetune job completed', { jobId });
        } else {
          await this.pool.query(
            `UPDATE training.finetune_jobs
             SET status='failed', error_message=$1, completed_at=NOW()
             WHERE id=$2`,
            [`Container exited with code ${exitCode}`, jobId]
          );
          this.logger.error('Finetune job failed', { jobId, exitCode });
        }
        resolve();
      });
    });
  }

  /**
   * Stream Docker logs for a job as an AsyncGenerator.
   */
  async *streamLogs(jobId: string): AsyncGenerator<string> {
    const job = await this.getJob(jobId);
    if (!job?.containerId) {
      throw new Error(`No container for job ${jobId}`);
    }

    const child = spawn('docker', ['logs', '--follow', job.containerId], { stdio: 'pipe' });

    const lines: string[] = [];
    let resolve: (() => void) | null = null;
    let done = false;

    function enqueue(data: Buffer) {
      for (const line of data.toString().split('\n')) {
        if (line) lines.push(line);
      }
      resolve?.();
    }

    child.stdout?.on('data', enqueue);
    child.stderr?.on('data', enqueue);
    child.on('exit', () => {
      done = true;
      resolve?.();
    });

    while (true) {
      while (lines.length > 0) {
        yield lines.shift()!;
      }
      if (done) break;
      await new Promise<void>((r) => {
        resolve = r;
      });
    }
  }

  /**
   * Register a completed adapter with Ollama via `ollama create`.
   */
  async registerWithOllama(jobId: string, ollamaBaseUrl: string): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);
    if (job.status !== 'complete') {
      throw new Error(`Job ${jobId} is not complete (status=${job.status})`);
    }
    if (!job.adapterPath) throw new Error(`Job ${jobId} has no adapter path`);

    // Write a minimal Modelfile
    const modelfile = `FROM ${job.baseModel}\nADAPTER ${job.adapterPath}\n`;
    const modelfilePath = join(job.adapterPath, 'Modelfile');
    writeFileSync(modelfilePath, modelfile);

    execSync(`ollama create ${job.adapterName} -f ${modelfilePath}`, {
      env: { ...process.env, OLLAMA_HOST: ollamaBaseUrl },
    });

    this.logger.info('Adapter registered with Ollama', {
      jobId,
      adapterName: job.adapterName,
    });
  }
}
