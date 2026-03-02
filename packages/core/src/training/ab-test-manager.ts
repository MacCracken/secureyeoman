/**
 * AbTestManager — A/B model testing with traffic splitting.
 *
 * Routes conversations to model variants based on configured traffic
 * percentages, tracks quality scores per variant, and determines
 * winners when sufficient data is collected.
 */

import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';
import type {
  AbTest,
  AbTestCreate,
  AbTestAssignment,
  AbTestResolveResult,
} from '@secureyeoman/shared';

export interface AbTestManagerDeps {
  pool: Pool;
  logger: SecureLogger;
}

export class AbTestManager {
  constructor(private readonly deps: AbTestManagerDeps) {}

  async createTest(data: AbTestCreate): Promise<AbTest> {
    // Enforce at most one running test per personality
    const { rows: existing } = await this.deps.pool.query<{ id: string }>(
      `SELECT id FROM training.ab_tests WHERE personality_id = $1 AND status = 'running' LIMIT 1`,
      [data.personalityId]
    );
    if (existing.length > 0) {
      throw new Error('A running A/B test already exists for this personality');
    }

    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `INSERT INTO training.ab_tests
         (personality_id, name, model_a, model_b, traffic_pct_b, auto_promote, min_conversations)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        data.personalityId,
        data.name,
        data.modelA,
        data.modelB,
        data.trafficPctB,
        data.autoPromote ?? false,
        data.minConversations ?? 100,
      ]
    );
    return this.mapRow(rows[0]!);
  }

  async getTest(id: string): Promise<AbTest | null> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.ab_tests WHERE id = $1`,
      [id]
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async getActiveTest(personalityId: string): Promise<AbTest | null> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.ab_tests WHERE personality_id = $1 AND status = 'running' LIMIT 1`,
      [personalityId]
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async listTests(opts?: {
    personalityId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<AbTest[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (opts?.personalityId) {
      conditions.push(`personality_id = $${idx++}`);
      params.push(opts.personalityId);
    }
    if (opts?.status) {
      conditions.push(`status = $${idx++}`);
      params.push(opts.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(opts?.limit ?? 100, 1000);
    const offset = opts?.offset ?? 0;

    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.ab_tests ${where}
       ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );
    return rows.map((r) => this.mapRow(r));
  }

  async resolveModel(
    personalityId: string,
    conversationId: string
  ): Promise<AbTestResolveResult | null> {
    const test = await this.getActiveTest(personalityId);
    if (!test) return null;

    // Check existing assignment
    const { rows: assigned } = await this.deps.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.ab_test_assignments
       WHERE ab_test_id = $1 AND conversation_id = $2 LIMIT 1`,
      [test.id, conversationId]
    );

    if (assigned.length > 0) {
      const variant = assigned[0]!.assigned_model as 'a' | 'b';
      return {
        model: variant === 'a' ? test.modelA : test.modelB,
        variant,
        testId: test.id,
      };
    }

    // Random assignment based on traffic_pct_b
    const variant: 'a' | 'b' = Math.random() * 100 < test.trafficPctB ? 'b' : 'a';

    await this.deps.pool.query(
      `INSERT INTO training.ab_test_assignments (ab_test_id, conversation_id, assigned_model)
       VALUES ($1, $2, $3)
       ON CONFLICT (ab_test_id, conversation_id) DO NOTHING`,
      [test.id, conversationId, variant]
    );

    // Update conversation counts
    const countCol = variant === 'a' ? 'conversations_a' : 'conversations_b';
    await this.deps.pool.query(
      `UPDATE training.ab_tests SET ${countCol} = ${countCol} + 1 WHERE id = $1`,
      [test.id]
    );

    return {
      model: variant === 'a' ? test.modelA : test.modelB,
      variant,
      testId: test.id,
    };
  }

  async recordQualityScore(
    testId: string,
    conversationId: string,
    score: number
  ): Promise<void> {
    await this.deps.pool.query(
      `UPDATE training.ab_test_assignments SET quality_score = $1
       WHERE ab_test_id = $2 AND conversation_id = $3`,
      [score, testId, conversationId]
    );

    // Recompute test aggregates
    await this.recomputeAggregates(testId);
  }

  async evaluateTest(testId: string): Promise<{
    winner: string | null;
    avgQualityA: number | null;
    avgQualityB: number | null;
    totalA: number;
    totalB: number;
  }> {
    const test = await this.getTest(testId);
    if (!test) throw new Error('Test not found');

    await this.recomputeAggregates(testId);
    const updated = (await this.getTest(testId))!;

    const total = updated.conversationsA + updated.conversationsB;
    let winner: string | null = null;

    if (total >= updated.minConversations && updated.avgQualityA != null && updated.avgQualityB != null) {
      winner = updated.avgQualityA >= updated.avgQualityB ? 'a' : 'b';
    }

    return {
      winner,
      avgQualityA: updated.avgQualityA ?? null,
      avgQualityB: updated.avgQualityB ?? null,
      totalA: updated.conversationsA,
      totalB: updated.conversationsB,
    };
  }

  async completeTest(testId: string, winner: string): Promise<AbTest | null> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `UPDATE training.ab_tests
       SET status = 'completed', winner = $1, completed_at = now()
       WHERE id = $2 AND status = 'running'
       RETURNING *`,
      [winner, testId]
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async cancelTest(testId: string): Promise<AbTest | null> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `UPDATE training.ab_tests
       SET status = 'cancelled', completed_at = now()
       WHERE id = $1 AND status = 'running'
       RETURNING *`,
      [testId]
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  private async recomputeAggregates(testId: string): Promise<void> {
    await this.deps.pool.query(
      `UPDATE training.ab_tests SET
         avg_quality_a = (
           SELECT AVG(quality_score) FROM training.ab_test_assignments
           WHERE ab_test_id = $1 AND assigned_model = 'a' AND quality_score IS NOT NULL
         ),
         avg_quality_b = (
           SELECT AVG(quality_score) FROM training.ab_test_assignments
           WHERE ab_test_id = $1 AND assigned_model = 'b' AND quality_score IS NOT NULL
         )
       WHERE id = $1`,
      [testId]
    );
  }

  private mapRow(r: Record<string, unknown>): AbTest {
    return {
      id: r.id as string,
      personalityId: r.personality_id as string,
      name: r.name as string,
      modelA: r.model_a as string,
      modelB: r.model_b as string,
      trafficPctB: Number(r.traffic_pct_b),
      status: r.status as AbTest['status'],
      autoPromote: r.auto_promote as boolean,
      minConversations: Number(r.min_conversations),
      winner: (r.winner as string) ?? null,
      conversationsA: Number(r.conversations_a) || 0,
      conversationsB: Number(r.conversations_b) || 0,
      avgQualityA: r.avg_quality_a != null ? Number(r.avg_quality_a) : null,
      avgQualityB: r.avg_quality_b != null ? Number(r.avg_quality_b) : null,
      createdAt:
        r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ''),
      completedAt: r.completed_at
        ? r.completed_at instanceof Date
          ? r.completed_at.toISOString()
          : String(r.completed_at)
        : null,
    };
  }
}
