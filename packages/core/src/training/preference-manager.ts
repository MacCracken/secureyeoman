/**
 * PreferenceManager — DPO preference pair annotation storage.
 *
 * Records chosen/rejected response pairs from human annotations,
 * side-by-side comparisons, and multi-turn preference signals.
 * Supports JSONL export for DPO fine-tuning pipelines.
 */

import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';
import type {
  PreferencePair,
  PreferencePairCreate,
  PreferencePairSource,
} from '@secureyeoman/shared';

export interface PreferenceManagerDeps {
  pool: Pool;
  logger: SecureLogger;
}

export class PreferenceManager {
  constructor(private readonly deps: PreferenceManagerDeps) {}

  async recordAnnotation(data: PreferencePairCreate): Promise<PreferencePair> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `INSERT INTO training.preference_pairs
         (prompt, chosen, rejected, source, conversation_id, message_id, personality_id, annotator_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        data.prompt,
        data.chosen,
        data.rejected,
        data.source,
        data.conversationId ?? null,
        data.messageId ?? null,
        data.personalityId ?? null,
        data.annotatorId ?? null,
        JSON.stringify(data.metadata ?? {}),
      ]
    );
    return this.mapRow(rows[0]!);
  }

  async listAnnotations(opts?: {
    personalityId?: string;
    source?: PreferencePairSource;
    limit?: number;
    offset?: number;
  }): Promise<PreferencePair[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (opts?.personalityId) {
      conditions.push(`personality_id = $${idx++}`);
      params.push(opts.personalityId);
    }
    if (opts?.source) {
      conditions.push(`source = $${idx++}`);
      params.push(opts.source);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(opts?.limit ?? 100, 1000);
    const offset = opts?.offset ?? 0;

    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.preference_pairs ${where}
       ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );
    return rows.map((r) => this.mapRow(r));
  }

  async getAnnotation(id: string): Promise<PreferencePair | null> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.preference_pairs WHERE id = $1`,
      [id]
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async deleteAnnotation(id: string): Promise<boolean> {
    const { rowCount } = await this.deps.pool.query(
      `DELETE FROM training.preference_pairs WHERE id = $1`,
      [id]
    );
    return (rowCount ?? 0) > 0;
  }

  async countByPersonality(personalityId: string): Promise<number> {
    const { rows } = await this.deps.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM training.preference_pairs WHERE personality_id = $1`,
      [personalityId]
    );
    return parseInt(rows[0]?.count ?? '0', 10);
  }

  async *exportAsDpo(opts?: {
    personalityId?: string;
    source?: PreferencePairSource;
  }): AsyncGenerator<string> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (opts?.personalityId) {
      conditions.push(`personality_id = $${idx++}`);
      params.push(opts.personalityId);
    }
    if (opts?.source) {
      conditions.push(`source = $${idx++}`);
      params.push(opts.source);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const BATCH = 500;
    let offset = 0;

    while (true) {
      const { rows } = await this.deps.pool.query<Record<string, unknown>>(
        `SELECT * FROM training.preference_pairs ${where}
         ORDER BY created_at ASC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, BATCH, offset]
      );
      if (rows.length === 0) break;

      for (const row of rows) {
        yield JSON.stringify({
          prompt: row.prompt,
          chosen: row.chosen,
          rejected: row.rejected,
        }) + '\n';
      }

      offset += BATCH;
      if (rows.length < BATCH) break;
    }
  }

  private mapRow(r: Record<string, unknown>): PreferencePair {
    return {
      id: r.id as string,
      prompt: r.prompt as string,
      chosen: r.chosen as string,
      rejected: r.rejected as string,
      source: r.source as PreferencePairSource,
      conversationId: (r.conversation_id as string) ?? null,
      messageId: (r.message_id as string) ?? null,
      personalityId: (r.personality_id as string) ?? null,
      annotatorId: (r.annotator_id as string) ?? null,
      metadata: (r.metadata as Record<string, unknown>) ?? null,
      createdAt:
        r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ''),
    };
  }
}
