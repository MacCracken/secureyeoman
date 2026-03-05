/**
 * BatchInferenceManager — creates batch jobs, processes prompts with p-limit
 * concurrency, calls AIClient.chat() per prompt, tracks progress.
 */

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';
import type { AIClient } from './client.js';
import type { BatchInferenceJob, BatchPrompt, BatchResult } from '@secureyeoman/shared';

function rowToJob(row: Record<string, unknown>): BatchInferenceJob {
  return {
    id: row.id as string,
    name: (row.name as string) ?? null,
    prompts: (row.prompts as BatchPrompt[]) ?? [],
    concurrency: (row.concurrency as number) ?? 5,
    status: row.status as BatchInferenceJob['status'],
    results: (row.results as BatchResult[]) ?? [],
    totalPrompts: (row.total_prompts as number) ?? 0,
    completedPrompts: (row.completed_prompts as number) ?? 0,
    failedPrompts: (row.failed_prompts as number) ?? 0,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? ''),
    completedAt: row.completed_at instanceof Date ? row.completed_at.toISOString() : null,
    createdBy: (row.created_by as string) ?? null,
  };
}

export interface BatchInferenceManagerDeps {
  pool: Pool;
  logger: SecureLogger;
  aiClient: AIClient;
  maxConcurrency?: number;
  timeoutMs?: number;
}

export class BatchInferenceManager {
  private readonly maxConcurrency: number;
  private readonly timeoutMs: number;

  constructor(private readonly deps: BatchInferenceManagerDeps) {
    this.maxConcurrency = deps.maxConcurrency ?? 5;
    this.timeoutMs = deps.timeoutMs ?? 120_000;
  }

  async createJob(data: {
    name?: string;
    prompts: BatchPrompt[];
    concurrency?: number;
    createdBy?: string;
  }): Promise<BatchInferenceJob> {
    const concurrency = Math.min(data.concurrency ?? this.maxConcurrency, this.maxConcurrency);
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `INSERT INTO ai.batch_inference_jobs
         (name, prompts, concurrency, total_prompts, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        data.name ?? null,
        JSON.stringify(data.prompts),
        concurrency,
        data.prompts.length,
        data.createdBy ?? null,
      ]
    );
    return rowToJob(rows[0]!);
  }

  async getJob(id: string): Promise<BatchInferenceJob | null> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `SELECT * FROM ai.batch_inference_jobs WHERE id = $1`,
      [id]
    );
    return rows[0] ? rowToJob(rows[0]) : null;
  }

  async listJobs(): Promise<BatchInferenceJob[]> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `SELECT * FROM ai.batch_inference_jobs ORDER BY created_at DESC LIMIT 100`
    );
    return rows.map(rowToJob);
  }

  async cancelJob(id: string): Promise<boolean> {
    const { rowCount } = await this.deps.pool.query(
      `UPDATE ai.batch_inference_jobs SET status='cancelled', completed_at=NOW()
       WHERE id=$1 AND status IN ('pending','running')`,
      [id]
    );
    return (rowCount ?? 0) > 0;
  }

  /**
   * Execute batch job. Processes prompts with limited concurrency.
   * Updates progress in DB as prompts complete.
   */
  async executeJob(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job) throw new Error(`Batch job not found: ${jobId}`);
    if (job.status !== 'pending') throw new Error(`Batch job ${jobId} is not pending`);

    await this.deps.pool.query(`UPDATE ai.batch_inference_jobs SET status='running' WHERE id=$1`, [
      jobId,
    ]);

    const results: BatchResult[] = [];
    let completed = 0;
    let failed = 0;

    // Simple p-limit implementation
    const concurrency = Math.min(job.concurrency, this.maxConcurrency);
    const queue = [...job.prompts];
    const active: Promise<void>[] = [];

    const processPrompt = async (prompt: BatchPrompt): Promise<void> => {
      const start = Date.now();
      try {
        const response = await this.deps.aiClient.chat({
          messages: [
            ...(prompt.systemPrompt
              ? [{ role: 'system' as const, content: prompt.systemPrompt }]
              : []),
            { role: 'user' as const, content: prompt.prompt },
          ],
          stream: false,
        });
        completed++;
        results.push({
          promptId: prompt.id,
          response: response.content,
          latencyMs: Date.now() - start,
        });
      } catch (err) {
        failed++;
        results.push({
          promptId: prompt.id,
          error: err instanceof Error ? err.message : String(err),
          latencyMs: Date.now() - start,
        });
      }

      // Update progress periodically (every 10 prompts or at end)
      if ((completed + failed) % 10 === 0 || completed + failed >= job.totalPrompts) {
        await this.deps.pool
          .query(
            `UPDATE ai.batch_inference_jobs
           SET completed_prompts=$1, failed_prompts=$2, results=$3
           WHERE id=$4`,
            [completed, failed, JSON.stringify(results), jobId]
          )
          .catch(() => {
            /* ignore progress update failures */
          });
      }
    };

    // Process with concurrency limit
    for (const prompt of queue) {
      // Check cancellation
      const current = await this.getJob(jobId);
      if (current?.status === 'cancelled') return;

      const task = processPrompt(prompt);
      active.push(task);

      if (active.length >= concurrency) {
        await Promise.race(active);
        // Remove completed tasks
        for (let i = active.length - 1; i >= 0; i--) {
          const settled = await Promise.race([active[i]!.then(() => true), Promise.resolve(false)]);
          if (settled) active.splice(i, 1);
        }
      }
    }

    // Wait for remaining
    await Promise.allSettled(active);

    // Final update
    const finalStatus = failed > 0 && completed === 0 ? 'failed' : 'completed';
    await this.deps.pool.query(
      `UPDATE ai.batch_inference_jobs
       SET status=$1, completed_prompts=$2, failed_prompts=$3, results=$4, completed_at=NOW()
       WHERE id=$5`,
      [finalStatus, completed, failed, JSON.stringify(results), jobId]
    );

    this.deps.logger.info('Batch inference job completed', { jobId, completed, failed });
  }
}
