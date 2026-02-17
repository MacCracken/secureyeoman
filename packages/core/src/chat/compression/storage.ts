/**
 * Compression Storage — PostgreSQL-backed storage for compressed history entries.
 */

import { PgBaseStorage } from '../../storage/pg-base.js';
import type { HistoryEntry, CompressionTier } from './types.js';
import { uuidv7 } from '../../utils/crypto.js';

interface HistoryRow {
  id: string;
  conversation_id: string;
  tier: string;
  content: string;
  token_count: number;
  sequence: number;
  created_at: number;
  sealed_at: number | null;
}

function rowToEntry(row: HistoryRow): HistoryEntry {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    tier: row.tier as CompressionTier,
    content: row.content,
    tokenCount: row.token_count,
    sequence: row.sequence,
    createdAt: row.created_at,
    sealedAt: row.sealed_at,
  };
}

export class CompressionStorage extends PgBaseStorage {
  async createEntry(data: {
    conversationId: string;
    tier: CompressionTier;
    content: string;
    tokenCount: number;
    sequence: number;
  }): Promise<HistoryEntry> {
    const id = uuidv7();
    const now = Date.now();

    await this.query(
      `INSERT INTO chat.conversation_history (id, conversation_id, tier, content, token_count, sequence, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, data.conversationId, data.tier, data.content, data.tokenCount, data.sequence, now],
    );

    return {
      id,
      conversationId: data.conversationId,
      tier: data.tier,
      content: data.content,
      tokenCount: data.tokenCount,
      sequence: data.sequence,
      createdAt: now,
      sealedAt: null,
    };
  }

  async getEntriesByConversation(
    conversationId: string,
    tier?: CompressionTier,
  ): Promise<HistoryEntry[]> {
    let sql = 'SELECT * FROM chat.conversation_history WHERE conversation_id = $1';
    const params: unknown[] = [conversationId];

    if (tier) {
      sql += ' AND tier = $2';
      params.push(tier);
    }

    sql += ' ORDER BY tier, sequence ASC';

    const rows = await this.queryMany<HistoryRow>(sql, params);
    return rows.map(rowToEntry);
  }

  async sealEntry(id: string): Promise<void> {
    await this.execute(
      'UPDATE chat.conversation_history SET sealed_at = $1 WHERE id = $2',
      [Date.now(), id],
    );
  }

  async deleteOldestBulk(conversationId: string): Promise<void> {
    await this.execute(
      `DELETE FROM chat.conversation_history
       WHERE id = (
         SELECT id FROM chat.conversation_history
         WHERE conversation_id = $1 AND tier = 'bulk'
         ORDER BY sequence ASC
         LIMIT 1
       )`,
      [conversationId],
    );
  }

  async getTokenCountByTier(conversationId: string): Promise<Record<CompressionTier, number>> {
    const rows = await this.queryMany<{ tier: string; total: string }>(
      `SELECT tier, COALESCE(SUM(token_count), 0) as total
       FROM chat.conversation_history
       WHERE conversation_id = $1
       GROUP BY tier`,
      [conversationId],
    );

    const result: Record<CompressionTier, number> = {
      message: 0,
      topic: 0,
      bulk: 0,
    };

    for (const row of rows) {
      result[row.tier as CompressionTier] = Number(row.total);
    }

    return result;
  }

  async getNextSequence(conversationId: string, tier: CompressionTier): Promise<number> {
    const row = await this.queryOne<{ max_seq: number | null }>(
      'SELECT MAX(sequence) as max_seq FROM chat.conversation_history WHERE conversation_id = $1 AND tier = $2',
      [conversationId, tier],
    );
    return (row?.max_seq ?? -1) + 1;
  }

  async deleteEntriesByConversation(conversationId: string): Promise<void> {
    await this.execute(
      'DELETE FROM chat.conversation_history WHERE conversation_id = $1',
      [conversationId],
    );
  }
}
