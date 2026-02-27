/**
 * DistillationManager — runs model distillation jobs as background tasks.
 *
 * A distillation job:
 *   1. Loads existing conversation data from ConversationStorage
 *   2. For each user-turn, calls a "teacher" LLM (e.g. claude-opus-4-6 or gpt-4o)
 *   3. Writes (prompt, completion) pairs as JSONL to outputPath
 *
 * Jobs are stored in training.distillation_jobs (migration 060).
 */

import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Pool } from 'pg';
import type { ConversationStorage } from '../chat/conversation-storage.js';
import type { SecureLogger } from '../logging/logger.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type DistillationStatus = 'pending' | 'running' | 'complete' | 'failed' | 'cancelled';
export type ExportFormat = 'sharegpt' | 'instruction';

export interface DistillationJobConfig {
  name: string;
  teacherProvider: string;
  teacherModel: string;
  exportFormat?: ExportFormat;
  maxSamples?: number;
  personalityIds?: string[];
  outputPath: string;
}

export interface DistillationJob {
  id: string;
  name: string;
  teacherProvider: string;
  teacherModel: string;
  exportFormat: ExportFormat;
  maxSamples: number;
  personalityIds: string[];
  outputPath: string;
  status: DistillationStatus;
  samplesGenerated: number;
  errorMessage: string | null;
  createdAt: number;
  completedAt: number | null;
}

export interface TeacherClient {
  chat(req: { messages: { role: string; content: string }[] }): Promise<{ content: string }>;
}

// ── Storage helpers ───────────────────────────────────────────────────────────

function rowToJob(row: Record<string, unknown>): DistillationJob {
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    teacherProvider: row['teacher_provider'] as string,
    teacherModel: row['teacher_model'] as string,
    exportFormat: (row['export_format'] as ExportFormat) ?? 'sharegpt',
    maxSamples: (row['max_samples'] as number) ?? 500,
    personalityIds: (row['personality_ids'] as string[]) ?? [],
    outputPath: row['output_path'] as string,
    status: row['status'] as DistillationStatus,
    samplesGenerated: (row['samples_generated'] as number) ?? 0,
    errorMessage: (row['error_message'] as string | null) ?? null,
    createdAt: row['created_at'] instanceof Date ? (row['created_at'] as Date).getTime() : Date.now(),
    completedAt:
      row['completed_at'] instanceof Date ? (row['completed_at'] as Date).getTime() : null,
  };
}

// ── Manager ───────────────────────────────────────────────────────────────────

export class DistillationManager {
  private runningJobs = new Set<string>();

  constructor(
    private readonly pool: Pool,
    private readonly logger: SecureLogger
  ) {}

  // ── CRUD ───────────────────────────────────────────────────────────────────

  async createJob(cfg: DistillationJobConfig): Promise<DistillationJob> {
    const id = randomUUID();
    const {
      name,
      teacherProvider,
      teacherModel,
      exportFormat = 'sharegpt',
      maxSamples = 500,
      personalityIds = [],
      outputPath,
    } = cfg;

    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO training.distillation_jobs
         (id, name, teacher_provider, teacher_model, export_format,
          max_samples, personality_ids, output_path)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [id, name, teacherProvider, teacherModel, exportFormat, maxSamples, personalityIds, outputPath]
    );
    return rowToJob(rows[0]!);
  }

  async listJobs(): Promise<DistillationJob[]> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.distillation_jobs ORDER BY created_at DESC`
    );
    return rows.map(rowToJob);
  }

  async getJob(id: string): Promise<DistillationJob | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.distillation_jobs WHERE id = $1`,
      [id]
    );
    return rows.length ? rowToJob(rows[0]!) : null;
  }

  async cancelJob(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE training.distillation_jobs SET status = 'cancelled', completed_at = NOW()
       WHERE id = $1 AND status IN ('pending','running')`,
      [id]
    );
    this.runningJobs.delete(id);
    return (rowCount ?? 0) > 0;
  }

  async deleteJob(id: string): Promise<boolean> {
    await this.cancelJob(id);
    const { rowCount } = await this.pool.query(
      `DELETE FROM training.distillation_jobs WHERE id = $1`,
      [id]
    );
    return (rowCount ?? 0) > 0;
  }

  // ── Worker ─────────────────────────────────────────────────────────────────

  /**
   * Run a distillation job in the background.
   * Reads conversations, calls the teacher LLM for each user-turn, writes JSONL.
   */
  async runJob(
    jobId: string,
    conversationStorage: ConversationStorage,
    teacherClient: TeacherClient
  ): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job) throw new Error(`Distillation job not found: ${jobId}`);
    if (job.status !== 'pending') {
      throw new Error(`Job ${jobId} is not pending (status=${job.status})`);
    }

    await this.pool.query(
      `UPDATE training.distillation_jobs SET status='running' WHERE id=$1`,
      [jobId]
    );
    this.runningJobs.add(jobId);

    // Ensure output directory exists
    try {
      mkdirSync(dirname(job.outputPath), { recursive: true });
    } catch {
      /* ignore EEXIST */
    }

    let samplesWritten = 0;

    try {
      const pids = job.personalityIds.length ? job.personalityIds : [undefined];

      outer: for (const pid of pids) {
        let offset = 0;
        const BATCH = 50;

        while (samplesWritten < job.maxSamples) {
          // Check for cancellation
          const current = await this.getJob(jobId);
          if (current?.status === 'cancelled') break outer;

          const { conversations } = await conversationStorage.listConversations({
            limit: BATCH,
            offset,
            ...(pid !== undefined ? { personalityId: pid } : {}),
          });

          if (conversations.length === 0) break;

          for (const conv of conversations) {
            if (samplesWritten >= job.maxSamples) break outer;

            const current2 = await this.getJob(jobId);
            if (current2?.status === 'cancelled') break outer;

            const messages = await conversationStorage.getMessages(conv.id, { limit: 1000 });
            if (messages.length < 2) continue;

            // Find user→assistant pairs
            for (let i = 0; i < messages.length - 1; i++) {
              if (samplesWritten >= job.maxSamples) break;
              const msg = messages[i]!;
              if (msg.role !== 'user') continue;

              const userContent = msg.content;
              if (!userContent.trim()) continue;

              // Call teacher LLM
              let teacherResponse: string;
              try {
                const resp = await teacherClient.chat({
                  messages: [{ role: 'user', content: userContent }],
                });
                teacherResponse = resp.content;
              } catch (err) {
                this.logger.warn('Teacher LLM call failed', {
                  jobId,
                  error: err instanceof Error ? err.message : 'unknown',
                });
                continue;
              }

              // Write to JSONL
              let line: string;
              if (job.exportFormat === 'sharegpt') {
                line =
                  JSON.stringify({
                    conversations: [
                      { from: 'human', value: userContent },
                      { from: 'gpt', value: teacherResponse },
                    ],
                  }) + '\n';
              } else {
                line =
                  JSON.stringify({ instruction: userContent, output: teacherResponse }) + '\n';
              }

              appendFileSync(job.outputPath, line, 'utf-8');
              samplesWritten++;

              // Persist progress every 10 samples
              if (samplesWritten % 10 === 0) {
                await this.pool.query(
                  `UPDATE training.distillation_jobs SET samples_generated=$1 WHERE id=$2`,
                  [samplesWritten, jobId]
                );
              }
            }

            offset++;
          }

          offset += BATCH - conversations.length;
          if (conversations.length < BATCH) break;
        }
      }

      await this.pool.query(
        `UPDATE training.distillation_jobs
         SET status='complete', samples_generated=$1, completed_at=NOW()
         WHERE id=$2`,
        [samplesWritten, jobId]
      );
      this.logger.info('Distillation job complete', { jobId, samplesWritten });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      await this.pool.query(
        `UPDATE training.distillation_jobs
         SET status='failed', error_message=$1, completed_at=NOW()
         WHERE id=$2`,
        [msg, jobId]
      );
      this.logger.error('Distillation job failed', { jobId, error: msg });
    } finally {
      this.runningJobs.delete(jobId);
    }
  }

  isRunning(jobId: string): boolean {
    return this.runningJobs.has(jobId);
  }
}
