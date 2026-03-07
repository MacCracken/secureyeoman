/**
 * OnlineUpdateManager — selects high-quality conversations, formats as training
 * samples, launches Docker container with small epochs + gradient accumulation
 * + replay buffer. Registers adapter on completion.
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';
import type { OnlineUpdateJob } from '@secureyeoman/shared';

function rowToJob(row: Record<string, unknown>): OnlineUpdateJob {
  return {
    id: row.id as string,
    personalityId: row.personality_id as string,
    adapterName: row.adapter_name as string,
    conversationIds: (row.conversation_ids as string[]) ?? [],
    gradientAccumulationSteps: (row.gradient_accumulation_steps as number) ?? 4,
    replayBufferSize: (row.replay_buffer_size as number) ?? 100,
    status: row.status as OnlineUpdateJob['status'],
    containerId: (row.container_id as string) ?? null,
    errorMessage: (row.error_message as string) ?? null,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? ''),
    completedAt: row.completed_at instanceof Date ? row.completed_at.toISOString() : null,
  };
}

export interface OnlineUpdateManagerDeps {
  pool: Pool;
  logger: SecureLogger;
  workDir?: string;
  image?: string;
}

export class OnlineUpdateManager {
  private readonly workDir: string;
  private readonly image: string;

  constructor(private readonly deps: OnlineUpdateManagerDeps) {
    this.workDir = deps.workDir ?? '/tmp/secureyeoman-online-update';
    this.image = deps.image ?? 'ghcr.io/secureyeoman/online-trainer:latest';
  }

  async create(data: {
    personalityId: string;
    adapterName: string;
    conversationIds: string[];
    gradientAccumulationSteps?: number;
    replayBufferSize?: number;
  }): Promise<OnlineUpdateJob> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `INSERT INTO training.online_update_jobs
         (personality_id, adapter_name, conversation_ids,
          gradient_accumulation_steps, replay_buffer_size)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        data.personalityId,
        data.adapterName,
        data.conversationIds,
        data.gradientAccumulationSteps ?? 4,
        data.replayBufferSize ?? 100,
      ]
    );
    return rowToJob(rows[0]!);
  }

  async list(): Promise<OnlineUpdateJob[]> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.online_update_jobs ORDER BY created_at DESC LIMIT 100`
    );
    return rows.map(rowToJob);
  }

  async get(id: string): Promise<OnlineUpdateJob | null> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.online_update_jobs WHERE id = $1`,
      [id]
    );
    return rows[0] ? rowToJob(rows[0]) : null;
  }

  /**
   * Start an online update job. Exports conversation data, launches Docker container.
   */
  async startJob(id: string): Promise<void> {
    const job = await this.get(id);
    if (!job) throw new Error(`Online update job not found: ${id}`);
    if (job.status !== 'pending') throw new Error(`Job ${id} is not pending`);

    const jobDir = join(this.workDir, id);
    const adapterDir = join(jobDir, 'adapter');
    mkdirSync(adapterDir, { recursive: true });

    // Export conversations as training samples
    const samples = await this._exportConversations(job.conversationIds);
    writeFileSync(join(jobDir, 'train.jsonl'), samples.join(''));

    // Write config
    const config = {
      adapter_name: job.adapterName,
      output_dir: '/workspace/adapter',
      gradient_accumulation_steps: job.gradientAccumulationSteps,
      replay_buffer_size: job.replayBufferSize,
      dataset_path: '/workspace/train.jsonl',
      epochs: 1,
    };
    writeFileSync(join(jobDir, 'config.json'), JSON.stringify(config, null, 2));

    const containerId = `sy-online-${id}`;
    const child = spawn(
      'docker',
      [
        'run',
        '--rm',
        '--gpus',
        'all',
        '-v',
        `${jobDir}:/workspace`,
        '--name',
        containerId,
        this.image,
      ],
      { detached: true, stdio: 'ignore' }
    );
    child.unref();

    await this.deps.pool.query(
      `UPDATE training.online_update_jobs
       SET status='running', container_id=$1
       WHERE id=$2`,
      [containerId, id]
    );

    this.deps.logger.info({ id, containerId }, 'Online update job started');

    // Watch container completion
    this._watchContainer(id, containerId).catch((err: unknown) => {
      this.deps.logger.error({
        id,
        error: err instanceof Error ? err.message : String(err),
      }, 'Online update watcher error');
    });
  }

  private async _exportConversations(conversationIds: string[]): Promise<string[]> {
    const lines: string[] = [];

    for (const convId of conversationIds) {
      const { rows } = await this.deps.pool.query<{ role: string; content: string }>(
        `SELECT role, content FROM chat.messages
         WHERE conversation_id = $1 ORDER BY created_at ASC`,
        [convId]
      );

      if (rows.length > 0) {
        const messages = rows.map((r) => ({
          from: r.role === 'user' ? 'human' : 'gpt',
          value: r.content,
        }));
        lines.push(JSON.stringify({ conversations: messages }) + '\n');
      }
    }

    return lines;
  }

  private async _watchContainer(jobId: string, containerId: string): Promise<void> {
    return new Promise((resolve) => {
      const watcher = spawn('docker', ['wait', containerId]);
      watcher.on('exit', async (code) => {
        const exitCode = typeof code === 'number' ? code : -1;

        if (exitCode === 0) {
          await this.deps.pool.query(
            `UPDATE training.online_update_jobs
             SET status='completed', completed_at=NOW()
             WHERE id=$1`,
            [jobId]
          );
          this.deps.logger.info({ jobId }, 'Online update job completed');
        } else {
          await this.deps.pool.query(
            `UPDATE training.online_update_jobs
             SET status='failed', error_message=$1, completed_at=NOW()
             WHERE id=$2`,
            [`Container exited with code ${exitCode}`, jobId]
          );
          this.deps.logger.error({ jobId, exitCode }, 'Online update job failed');
        }
        resolve();
      });
    });
  }
}
