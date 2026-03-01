/**
 * ConversationQualityScorer — background service that assigns quality scores
 * to conversations for use in priority-weighted distillation sampling.
 *
 * Score formula (starts at 0.5):
 *   - -0.30 if any linked pipeline run ended in 'failed'
 *   - -0.15 per correction phrase found in any subsequent user message
 *   - -0.10 * (injection_score - 0.5) when injection_score > 0.5
 *   - Clamped to [0.0, 1.0]
 *
 * Lower score → higher priority in failure-first sampling mode.
 */

import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QualityScore {
  conversationId: string;
  qualityScore: number;
  signalSource: string;
  scoredAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CORRECTION_PHRASES = [
  "that's wrong",
  'try again',
  'no,',
  'incorrect',
  "that's not",
  'wrong answer',
];

const SCORE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ── Scorer ────────────────────────────────────────────────────────────────────

export class ConversationQualityScorer {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly pool: Pool,
    private readonly logger: SecureLogger
  ) {}

  /**
   * Score all conversations that don't yet have a quality record.
   * Returns the number of conversations scored.
   */
  async scoreNewConversations(pool: Pool): Promise<number> {
    // Find conversations with no existing quality record
    const { rows: unscored } = await pool.query<{
      id: string;
      pipeline_outcome: string | null;
    }>(`
      SELECT c.id,
             pl.outcome AS pipeline_outcome
      FROM   chat.conversations c
      LEFT   JOIN training.conversation_quality cq ON cq.conversation_id = c.id
      LEFT   JOIN training.pipeline_lineage      pl ON pl.conversation_ids @> ARRAY[c.id]
      WHERE  cq.conversation_id IS NULL
      LIMIT  200
    `);

    if (unscored.length === 0) return 0;

    let scored = 0;

    for (const row of unscored) {
      try {
        const score = await this._computeScore(pool, row.id, row.pipeline_outcome);
        await pool.query(
          `INSERT INTO training.conversation_quality
             (conversation_id, quality_score, signal_source, scored_at)
           VALUES ($1, $2, 'auto', NOW())
           ON CONFLICT (conversation_id) DO NOTHING`,
          [row.id, score]
        );
        scored++;
      } catch (err) {
        this.logger.warn('ConversationQualityScorer: failed to score conversation', {
          conversationId: row.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this.logger.info('ConversationQualityScorer: scored conversations', { scored });
    return scored;
  }

  /**
   * Called after a pipeline run ends in 'failed'.
   * Boosts (lowers) quality score for linked conversations so they get
   * sampled first in failure-first mode.
   */
  async applyPrefailureBoost(pool: Pool, workflowRunId: string): Promise<void> {
    // Find conversation_ids referenced in the lineage for this run
    const { rows } = await pool.query<{ conversation_ids: string[] }>(
      `SELECT conversation_ids FROM training.pipeline_lineage WHERE workflow_run_id = $1`,
      [workflowRunId]
    );
    if (!rows.length || !rows[0]!.conversation_ids?.length) return;

    const convIds = rows[0]!.conversation_ids;

    await pool.query(
      `UPDATE training.conversation_quality
       SET    quality_score = LEAST(quality_score * 0.5, 0.25),
              signal_source = 'prefailure_boost',
              scored_at     = NOW()
       WHERE  conversation_id = ANY($1)`,
      [convIds]
    );

    this.logger.info('ConversationQualityScorer: applied prefailure boost', {
      workflowRunId,
      conversationCount: convIds.length,
    });
  }

  /** Start the background scoring interval. */
  start(): void {
    if (this.intervalHandle) return;
    this.intervalHandle = setInterval(() => {
      void this.scoreNewConversations(this.pool).catch((err: unknown) => {
        this.logger.error('ConversationQualityScorer: interval error', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, SCORE_INTERVAL_MS);
  }

  /** Stop the background scoring interval. */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async _computeScore(
    pool: Pool,
    conversationId: string,
    pipelineOutcome: string | null
  ): Promise<number> {
    let score = 0.5;

    // Penalty for failed pipeline outcome
    if (pipelineOutcome === 'failed') {
      score -= 0.3;
    }

    // Penalty per correction phrase found in user messages
    const { rows: msgs } = await pool.query<{ content: string; injection_score: number | null }>(
      `SELECT content, injection_score
       FROM   chat.messages
       WHERE  conversation_id = $1
         AND  role = 'user'`,
      [conversationId]
    );

    for (const msg of msgs) {
      const lower = msg.content.toLowerCase();
      for (const phrase of CORRECTION_PHRASES) {
        if (lower.includes(phrase)) {
          score -= 0.15;
          break; // one penalty per message
        }
      }

      // Injection score penalty
      const inj = msg.injection_score ?? 0;
      if (inj > 0.5) {
        score -= 0.1 * (inj - 0.5);
      }
    }

    return Math.max(0.0, Math.min(1.0, score));
  }
}
