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
import { trainingStream } from './training-stream.js';
import type { AlertManager } from '../telemetry/alert-manager.js';
import { emitJobCompletion } from '../telemetry/job-completion-events.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type DistillationStatus = 'pending' | 'running' | 'complete' | 'failed' | 'cancelled';
export type ExportFormat = 'sharegpt' | 'instruction';

export type PriorityMode = 'failure-first' | 'uniform' | 'success-first';

export interface DistillationJobConfig {
  name: string;
  teacherProvider: string;
  teacherModel: string;
  exportFormat?: ExportFormat;
  maxSamples?: number;
  personalityIds?: string[];
  outputPath: string;
  priorityMode?: PriorityMode;
  curriculumMode?: boolean;
  counterfactualMode?: boolean;
  maxCounterfactualSamples?: number;
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
  priorityMode: PriorityMode;
  curriculumMode: boolean;
  counterfactualMode: boolean;
  maxCounterfactualSamples: number;
  counterfactualCount: number;
}

export interface TeacherClient {
  chat(req: { messages: { role: string; content: string }[] }): Promise<{ content: string }>;
}

// ── Storage helpers ───────────────────────────────────────────────────────────

function rowToJob(row: Record<string, unknown>): DistillationJob {
  return {
    id: row.id as string,
    name: row.name as string,
    teacherProvider: row.teacher_provider as string,
    teacherModel: row.teacher_model as string,
    exportFormat: (row.export_format as ExportFormat) ?? 'sharegpt',
    maxSamples: (row.max_samples as number) ?? 500,
    personalityIds: (row.personality_ids as string[]) ?? [],
    outputPath: row.output_path as string,
    status: row.status as DistillationStatus,
    samplesGenerated: (row.samples_generated as number) ?? 0,
    errorMessage: (row.error_message as string | null) ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at.getTime() : Date.now(),
    completedAt: row.completed_at instanceof Date ? row.completed_at.getTime() : null,
    priorityMode: (row.priority_mode as PriorityMode) ?? 'uniform',
    curriculumMode: (row.curriculum_mode as boolean) ?? false,
    counterfactualMode: (row.counterfactual_mode as boolean) ?? false,
    maxCounterfactualSamples: (row.max_counterfactual_samples as number) ?? 50,
    counterfactualCount: (row.counterfactual_count as number) ?? 0,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function charJaccard(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a.toLowerCase());
  const setB = new Set(b.toLowerCase());
  let intersection = 0;
  for (const ch of setA) {
    if (setB.has(ch)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1 : intersection / union;
}

// ── Manager ───────────────────────────────────────────────────────────────────

export class DistillationManager {
  private runningJobs = new Set<string>();

  constructor(
    private readonly pool: Pool,
    private readonly logger: SecureLogger,
    private readonly getAlertManager?: () => AlertManager | null
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
      priorityMode = 'uniform',
      curriculumMode = false,
      counterfactualMode = false,
      maxCounterfactualSamples = 50,
    } = cfg;

    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO training.distillation_jobs
         (id, name, teacher_provider, teacher_model, export_format,
          max_samples, personality_ids, output_path,
          priority_mode, curriculum_mode, counterfactual_mode, max_counterfactual_samples)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        id,
        name,
        teacherProvider,
        teacherModel,
        exportFormat,
        maxSamples,
        personalityIds,
        outputPath,
        priorityMode,
        curriculumMode,
        counterfactualMode,
        maxCounterfactualSamples,
      ]
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
   *
   * Phase 92 additions:
   *  - Priority-weighted sampling: failure-first / success-first join on conversation_quality
   *  - Curriculum ordering: stage 1→4 quota-based processing
   *  - Counterfactual generation: re-submit failed conversations with recovery prompt
   *  - TrainingStream events: throughput + agreement emitted every 10 samples
   */
  async runJob(
    jobId: string,
    conversationStorage: ConversationStorage,
    teacherClient: TeacherClient
  ): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job) throw new Error(`Distillation job not found: ${jobId}`);
    if (job.status !== 'pending' && job.status !== 'failed') {
      throw new Error(`Job ${jobId} cannot be run (status=${job.status})`);
    }

    await this.pool.query(
      `UPDATE training.distillation_jobs SET status='running', error_message=NULL WHERE id=$1`,
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
    let totalSimilarity = 0;
    let counterfactualCount = 0;
    const batchStart = Date.now();

    try {
      // ── Collect ordered conversation IDs based on priorityMode + curriculumMode ──
      const orderedConvIds = await this._collectOrderedConvIds(job);

      // Batch-fetch messages in chunks of 50 conversations to reduce N+1 queries
      const BATCH_SIZE = 50;
      outer: for (let batchIdx = 0; batchIdx < orderedConvIds.length; batchIdx += BATCH_SIZE) {
        if (samplesWritten >= job.maxSamples) break outer;

        // Check for cancellation
        const current = await this.getJob(jobId);
        if (current?.status === 'cancelled') break outer;

        const batchIds = orderedConvIds.slice(batchIdx, batchIdx + BATCH_SIZE);
        const messagesByConv = await this._batchFetchMessages(batchIds);

        for (const convId of batchIds) {
          if (samplesWritten >= job.maxSamples) break outer;

          const messages = messagesByConv.get(convId) ?? [];
          if (messages.length < 2) continue;

          // Find user→assistant pairs
          for (let i = 0; i < messages.length - 1; i++) {
            if (samplesWritten >= job.maxSamples) break;
            const msg = messages[i]!;
            if (msg.role !== 'user') continue;

            const userContent = msg.content;
            if (!userContent.trim()) continue;

            // Get the gold assistant response for agreement metric
            const nextMsg = messages[i + 1];
            const goldResponse = nextMsg?.role === 'assistant' ? nextMsg.content : '';

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

            // Accumulate agreement (char Jaccard) for stream events
            if (goldResponse) {
              totalSimilarity += charJaccard(teacherResponse, goldResponse);
            }

            // Write to JSONL
            const line = this._formatLine(job.exportFormat, userContent, teacherResponse);
            appendFileSync(job.outputPath, line, 'utf-8');
            samplesWritten++;

            // Emit stream events every 10 samples
            if (samplesWritten % 10 === 0) {
              await this.pool.query(
                `UPDATE training.distillation_jobs SET samples_generated=$1 WHERE id=$2`,
                [samplesWritten, jobId]
              );
              const elapsedMin = (Date.now() - batchStart) / 60_000;
              const throughput = elapsedMin > 0 ? samplesWritten / elapsedMin : 0;
              trainingStream.broadcast({ type: 'throughput', value: throughput, ts: Date.now() });
              const avgAgreement = samplesWritten > 0 ? totalSimilarity / samplesWritten : 0;
              trainingStream.broadcast({ type: 'agreement', value: avgAgreement, ts: Date.now() });
            }
          }
        } // end for (const convId of batchIds)
      } // end outer: for (let batchIdx)

      // ── Counterfactual generation ───────────────────────────────────────────
      if (job.counterfactualMode && counterfactualCount < job.maxCounterfactualSamples) {
        counterfactualCount = await this._generateCounterfactuals(
          job,
          teacherClient,
          job.maxCounterfactualSamples,
          conversationStorage
        );
      }

      await this.pool.query(
        `UPDATE training.distillation_jobs
         SET status='complete', samples_generated=$1, counterfactual_count=$2, completed_at=NOW()
         WHERE id=$3`,
        [samplesWritten, counterfactualCount, jobId]
      );
      this.logger.info('Distillation job complete', { jobId, samplesWritten, counterfactualCount });

      emitJobCompletion(
        this.getAlertManager?.() ?? null,
        {
          jobType: 'distillation',
          status: 'completed',
          jobId,
          metrics: { samplesGenerated: samplesWritten, counterfactualCount },
        },
        this.logger
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      await this.pool.query(
        `UPDATE training.distillation_jobs
         SET status='failed', error_message=$1, completed_at=NOW()
         WHERE id=$2`,
        [msg, jobId]
      );
      this.logger.error('Distillation job failed', { jobId, error: msg });

      emitJobCompletion(
        this.getAlertManager?.() ?? null,
        {
          jobType: 'distillation',
          status: 'failed',
          jobId,
        },
        this.logger
      );
    } finally {
      this.runningJobs.delete(jobId);
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _formatLine(
    format: ExportFormat,
    userContent: string,
    response: string,
    meta?: Record<string, unknown>
  ): string {
    if (format === 'sharegpt') {
      return (
        JSON.stringify({
          conversations: [
            { from: 'human', value: userContent },
            { from: 'gpt', value: response },
          ],
          ...(meta ?? {}),
        }) + '\n'
      );
    }
    return JSON.stringify({ instruction: userContent, output: response, ...(meta ?? {}) }) + '\n';
  }

  /**
   * Batch-fetch messages for multiple conversations in a single query.
   * Groups results by conversation_id for efficient iteration.
   */
  private async _batchFetchMessages(
    convIds: string[]
  ): Promise<Map<string, { role: string; content: string }[]>> {
    if (convIds.length === 0) return new Map();
    const { rows } = await this.pool.query<{
      conversation_id: string;
      role: string;
      content: string;
    }>(
      `SELECT conversation_id, role, content FROM chat.messages
       WHERE conversation_id = ANY($1) AND content IS NOT NULL
       ORDER BY created_at ASC`,
      [convIds]
    );
    const map = new Map<string, { role: string; content: string }[]>();
    for (const msg of rows) {
      let arr = map.get(msg.conversation_id);
      if (!arr) {
        arr = [];
        map.set(msg.conversation_id, arr);
      }
      arr.push({ role: msg.role, content: msg.content });
    }
    return map;
  }

  /**
   * Collect conversation IDs ordered by priorityMode and optionally curriculum stage.
   */
  private async _collectOrderedConvIds(job: DistillationJob): Promise<string[]> {
    const pidFilter =
      job.personalityIds.length > 0
        ? `AND c.personality_id = ANY(ARRAY[${job.personalityIds.map((_, i) => `$${i + 1}`).join(',')}])`
        : '';
    const params: unknown[] = [...job.personalityIds];

    let orderClause = '';
    let joinClause = '';

    if (job.priorityMode === 'failure-first') {
      joinClause = `LEFT JOIN training.conversation_quality cq ON cq.conversation_id = c.id`;
      orderClause = `ORDER BY COALESCE(cq.quality_score, 0.5) ASC`;
    } else if (job.priorityMode === 'success-first') {
      joinClause = `LEFT JOIN training.conversation_quality cq ON cq.conversation_id = c.id`;
      orderClause = `ORDER BY COALESCE(cq.quality_score, 0.5) DESC`;
    } else {
      orderClause = `ORDER BY c.created_at ASC`;
    }

    const limitIdx = params.length + 1;
    params.push(job.maxSamples * 5); // fetch 5x; we'll sample down during processing

    const { rows } = await this.pool.query<{ id: string; message_count: number | null }>(
      `SELECT c.id,
              (SELECT COUNT(*) FROM chat.messages m WHERE m.conversation_id = c.id) AS message_count
       FROM   chat.conversations c
       ${joinClause}
       WHERE  1=1 ${pidFilter}
       ${orderClause}
       LIMIT  $${limitIdx}`,
      params
    );

    if (!job.curriculumMode) {
      return rows.map((r) => r.id);
    }

    // ── Curriculum ordering: stage 1 (25%), then 2, 3, 4 ─────────────────────
    return this._curriculumSort(rows, job.maxSamples);
  }

  /**
   * Sort conversations into curriculum stages and interleave quota.
   * Stage 1: ≤4 messages, no tool calls  → 25% of maxSamples first
   * Stage 2: multi-turn, no tools
   * Stage 3: tool-using
   * Stage 4: failed/recovered or multi-agent
   */
  private _curriculumSort(
    rows: { id: string; message_count: number | null }[],
    maxSamples: number
  ): string[] {
    const stage1: string[] = [];
    const stage2: string[] = [];
    const stage3: string[] = [];
    const stage4: string[] = [];

    for (const r of rows) {
      const mc = r.message_count ?? 0;
      if (mc <= 4) {
        stage1.push(r.id);
      } else if (mc <= 10) {
        stage2.push(r.id);
      } else if (mc <= 20) {
        stage3.push(r.id);
      } else {
        stage4.push(r.id);
      }
    }

    const s1Quota = Math.floor(maxSamples * 0.25);
    const result: string[] = [
      ...stage1.slice(0, s1Quota),
      ...stage2,
      ...stage3,
      ...stage4,
      ...stage1.slice(s1Quota),
    ];
    return result;
  }

  /**
   * For conversations linked to failed pipeline runs, re-submit to the teacher
   * with a recovery prompt and write synthetic samples.
   */
  private async _generateCounterfactuals(
    job: DistillationJob,
    teacherClient: TeacherClient,
    maxCount: number,
    conversationStorage: ConversationStorage
  ): Promise<number> {
    // Find failed conversation IDs from pipeline lineage
    const { rows } = await this.pool.query<{ conversation_ids: string[] }>(
      `SELECT conversation_ids
       FROM   training.pipeline_lineage
       WHERE  outcome = 'failed'
       LIMIT  50`
    );

    const failedConvIds = rows.flatMap((r) => r.conversation_ids ?? []);
    if (!failedConvIds.length) return 0;

    let generated = 0;
    const SYSTEM_PROMPT =
      'You are helping generate ideal training data. Given this conversation that ended poorly, provide the ideal assistant response for the final user turn.';

    for (const convId of failedConvIds) {
      if (generated >= maxCount) break;

      try {
        const messages = await conversationStorage.getMessages(convId, { limit: 1000 });
        if (messages.length < 2) continue;

        // Find the last user message
        const lastUser = [...messages].reverse().find((m) => m.role === 'user');
        if (!lastUser?.content?.trim()) continue;

        const resp = await teacherClient.chat({
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: lastUser.content },
          ],
        });

        const line = this._formatLine(job.exportFormat, lastUser.content, resp.content, {
          synthetic: true,
          source_conversation: convId,
        });
        appendFileSync(job.outputPath, line, 'utf-8');
        generated++;
      } catch {
        // skip individual failures
      }
    }

    this.logger.info('Distillation: counterfactuals generated', { jobId: job.id, generated });
    return generated;
  }

  isRunning(jobId: string): boolean {
    return this.runningJobs.has(jobId);
  }
}
