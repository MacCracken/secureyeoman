/**
 * CognitiveMemoryStorage — PostgreSQL-backed storage for ACT-R activation
 * tracking and Hebbian associative links (Phase 124).
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import type { Association, CognitiveStats } from './types.js';

interface AssociationRow {
  source_id: string;
  target_id: string;
  weight: number;
  co_activation_count: number;
  updated_at: string;
}

function rowToAssociation(row: AssociationRow): Association {
  return {
    sourceId: row.source_id,
    targetId: row.target_id,
    weight: row.weight,
    coActivationCount: row.co_activation_count,
    updatedAt: Number(row.updated_at),
  };
}

export class CognitiveMemoryStorage extends PgBaseStorage {
  // ── Access Recording ────────────────────────────────────────

  async recordDocumentAccess(docId: string): Promise<void> {
    await this.execute(
      `UPDATE brain.documents
         SET access_count = access_count + 1, last_accessed = $2
       WHERE id = $1`,
      [docId, Date.now()]
    );
  }

  async recordSkillAccess(skillId: string): Promise<void> {
    await this.execute(
      `UPDATE brain.skills
         SET access_count = access_count + 1, last_accessed = $2
       WHERE id = $1`,
      [skillId, Date.now()]
    );
  }

  async recordMemoryAccess(memoryId: string): Promise<void> {
    await this.execute(
      `UPDATE brain.memories
         SET access_count = access_count + 1, last_accessed_at = $2
       WHERE id = $1`,
      [memoryId, Date.now()]
    );
  }

  // ── Hebbian Co-Activation ───────────────────────────────────

  /**
   * Record a bidirectional co-activation between two items.
   * Weight is capped at 1.0, delta is added to existing weight.
   */
  async recordCoActivation(sourceId: string, targetId: string, delta: number): Promise<void> {
    const now = Date.now();
    // Ensure consistent ordering to avoid deadlocks on bidirectional upsert
    const [a, b] = sourceId < targetId ? [sourceId, targetId] : [targetId, sourceId];

    await this.execute(
      `INSERT INTO brain.associations (source_id, target_id, weight, co_activation_count, updated_at)
       VALUES ($1, $2, LEAST($3, 1.0), 1, $4)
       ON CONFLICT (source_id, target_id) DO UPDATE
         SET weight = LEAST(brain.associations.weight + $3, 1.0),
             co_activation_count = brain.associations.co_activation_count + 1,
             updated_at = $4`,
      [a, b, delta, now]
    );
  }

  /**
   * Fetch associations for an item, ordered by weight descending.
   */
  async getAssociations(
    sourceId: string,
    opts?: { limit?: number; minWeight?: number }
  ): Promise<Association[]> {
    const limit = opts?.limit ?? 20;
    const minWeight = opts?.minWeight ?? 0;
    const rows = await this.queryMany<AssociationRow>(
      `SELECT * FROM brain.associations
       WHERE (source_id = $1 OR target_id = $1)
         AND weight >= $2
       ORDER BY weight DESC
       LIMIT $3`,
      [sourceId, minWeight, limit]
    );
    return rows.map(rowToAssociation);
  }

  /**
   * Spreading activation: given a set of source IDs, return the top associated
   * IDs with their summed weights.
   */
  async getTopAssociatedIds(
    sourceIds: string[],
    limit: number
  ): Promise<Map<string, number>> {
    if (sourceIds.length === 0) return new Map();

    const rows = await this.queryMany<{ related_id: string; total_weight: number }>(
      `SELECT
         CASE WHEN source_id = ANY($1) THEN target_id ELSE source_id END AS related_id,
         SUM(weight) AS total_weight
       FROM brain.associations
       WHERE source_id = ANY($1) OR target_id = ANY($1)
       GROUP BY related_id
       ORDER BY total_weight DESC
       LIMIT $2`,
      [sourceIds, limit]
    );

    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.related_id, row.total_weight);
    }
    return map;
  }

  // ── Decay & Maintenance ─────────────────────────────────────

  /**
   * Multiply all association weights by decayFactor, delete near-zero entries.
   */
  async decayAssociations(decayFactor: number): Promise<number> {
    await this.execute(
      `UPDATE brain.associations SET weight = weight * $1`,
      [decayFactor]
    );
    return this.execute(
      `DELETE FROM brain.associations WHERE weight < 0.001`
    );
  }

  // ── Confidence ──────────────────────────────────────────────

  async updateDocumentConfidence(docId: string, confidence: number): Promise<void> {
    await this.execute(
      `UPDATE brain.documents SET confidence = $2 WHERE id = $1`,
      [docId, confidence]
    );
  }

  // ── Activation Queries ──────────────────────────────────────

  async getDocumentActivation(docId: string): Promise<number | null> {
    const row = await this.queryOne<{ score: number }>(
      `SELECT brain.activation_score(access_count, last_accessed, $2) AS score
       FROM brain.documents WHERE id = $1`,
      [docId, Date.now()]
    );
    return row?.score ?? null;
  }

  async getMemoryActivation(memoryId: string): Promise<number | null> {
    const row = await this.queryOne<{ score: number }>(
      `SELECT brain.activation_score(access_count, last_accessed_at, $2) AS score
       FROM brain.memories WHERE id = $1`,
      [memoryId, Date.now()]
    );
    return row?.score ?? null;
  }

  // ── Stats ───────────────────────────────────────────────────

  async getCognitiveStats(personalityId?: string): Promise<CognitiveStats> {
    const now = Date.now();

    const pidFilter = personalityId
      ? `WHERE personality_id = $2 OR personality_id IS NULL`
      : '';
    const pidParams = personalityId ? [now, personalityId] : [now];

    const topMemories = await this.queryMany<{ id: string; activation: number }>(
      `SELECT id, brain.activation_score(access_count, last_accessed_at, $1) AS activation
       FROM brain.memories ${pidFilter}
       ORDER BY activation DESC NULLS LAST
       LIMIT 5`,
      pidParams
    );

    const topDocuments = await this.queryMany<{ id: string; activation: number }>(
      `SELECT id, brain.activation_score(access_count, last_accessed, $1) AS activation
       FROM brain.documents ${pidFilter}
       ORDER BY activation DESC NULLS LAST
       LIMIT 5`,
      pidParams
    );

    const assocStats = await this.queryOne<{ cnt: string; avg_weight: number }>(
      `SELECT COUNT(*)::TEXT AS cnt, COALESCE(AVG(weight), 0) AS avg_weight
       FROM brain.associations`
    );

    // 7-day access trend from memories
    const trend = await this.queryMany<{ day: string; count: string }>(
      `SELECT
         TO_CHAR(TO_TIMESTAMP(last_accessed_at / 1000.0), 'YYYY-MM-DD') AS day,
         COUNT(*)::TEXT AS count
       FROM brain.memories
       WHERE last_accessed_at > $1
       GROUP BY day
       ORDER BY day`,
      [now - 7 * 86_400_000]
    );

    return {
      topMemories: topMemories.map((r) => ({ id: r.id, activation: r.activation })),
      topDocuments: topDocuments.map((r) => ({ id: r.id, activation: r.activation })),
      associationCount: Number(assocStats?.cnt ?? 0),
      avgAssociationWeight: assocStats?.avg_weight ?? 0,
      accessTrend: trend.map((r) => ({ day: r.day, count: Number(r.count) })),
    };
  }
}
