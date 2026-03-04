/**
 * AnalyticsStorage — CRUD for all analytics schema tables (Phase 96).
 *
 * Handles turn sentiments, conversation summaries, entities,
 * key phrases, and usage anomalies. No cross-schema FKs — referential
 * integrity enforced at application level.
 */

import type { Pool } from 'pg';

// ── Row types ────────────────────────────────────────────────────────────────

export interface TurnSentimentRow {
  id: string;
  conversation_id: string;
  message_id: string;
  personality_id: string | null;
  sentiment: 'positive' | 'neutral' | 'negative';
  score: number;
  analyzed_at: string;
}

export interface ConversationSummaryRow {
  conversation_id: string;
  personality_id: string | null;
  summary: string;
  message_count: number;
  generated_at: string;
}

export interface ConversationEntityRow {
  id: string;
  conversation_id: string;
  personality_id: string | null;
  entity_type: string;
  entity_value: string;
  mention_count: number;
  first_seen_at: string;
}

export interface KeyPhraseRow {
  id: string;
  personality_id: string;
  phrase: string;
  frequency: number;
  window_start: string;
  window_end: string;
  updated_at: string;
}

export interface UsageAnomalyRow {
  id: string;
  anomaly_type: string;
  personality_id: string | null;
  user_id: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: Record<string, unknown>;
  detected_at: string;
}

export interface UnanalyzedMessage {
  id: string;
  conversation_id: string;
  personality_id: string | null;
  content: string;
}

export interface UnsummarizedConversation {
  id: string;
  personality_id: string | null;
  message_count: number;
  title: string | null;
}

export interface UnextractedConversation {
  id: string;
  personality_id: string | null;
  title: string | null;
}

// ── Storage class ────────────────────────────────────────────────────────────

export class AnalyticsStorage {
  constructor(private readonly pool: Pool) {}

  // ── Turn Sentiments ──────────────────────────────────────────────────────

  async insertSentiment(row: {
    conversationId: string;
    messageId: string;
    personalityId: string | null;
    sentiment: 'positive' | 'neutral' | 'negative';
    score: number;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO analytics.turn_sentiments
         (conversation_id, message_id, personality_id, sentiment, score)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (message_id) DO NOTHING`,
      [row.conversationId, row.messageId, row.personalityId, row.sentiment, row.score]
    );
  }

  async getSentimentsByConversation(conversationId: string): Promise<TurnSentimentRow[]> {
    const { rows } = await this.pool.query<TurnSentimentRow>(
      `SELECT * FROM analytics.turn_sentiments
       WHERE conversation_id = $1
       ORDER BY analyzed_at ASC`,
      [conversationId]
    );
    return rows;
  }

  async getSentimentTrend(
    personalityId: string,
    days: number
  ): Promise<
    { date: string; positive: number; neutral: number; negative: number; avg_score: number }[]
  > {
    const { rows } = await this.pool.query<{
      date: string;
      positive: string;
      neutral: string;
      negative: string;
      avg_score: number;
    }>(
      `SELECT
         DATE(analyzed_at) AS date,
         COUNT(*) FILTER (WHERE sentiment = 'positive') AS positive,
         COUNT(*) FILTER (WHERE sentiment = 'neutral')  AS neutral,
         COUNT(*) FILTER (WHERE sentiment = 'negative') AS negative,
         AVG(score) AS avg_score
       FROM analytics.turn_sentiments
       WHERE personality_id = $1
         AND analyzed_at >= NOW() - ($2 || ' days')::interval
       GROUP BY DATE(analyzed_at)
       ORDER BY date ASC`,
      [personalityId, days]
    );
    return rows.map((r) => ({
      date: r.date,
      positive: Number(r.positive),
      neutral: Number(r.neutral),
      negative: Number(r.negative),
      avg_score: r.avg_score,
    }));
  }

  async getAvgSentimentForConversation(conversationId: string): Promise<number | null> {
    const { rows } = await this.pool.query<{ avg: number | null }>(
      `SELECT AVG(score) AS avg FROM analytics.turn_sentiments WHERE conversation_id = $1`,
      [conversationId]
    );
    return rows[0]?.avg ?? null;
  }

  async getUnanalyzedMessages(limit: number): Promise<UnanalyzedMessage[]> {
    const { rows } = await this.pool.query<UnanalyzedMessage>(
      `SELECT m.id, m.conversation_id, c.personality_id, m.content
       FROM   chat.messages m
       JOIN   chat.conversations c ON c.id = m.conversation_id
       LEFT   JOIN analytics.turn_sentiments ts ON ts.message_id = m.id
       WHERE  ts.id IS NULL
         AND  m.role = 'assistant'
         AND  m.content IS NOT NULL
         AND  m.content != ''
       ORDER BY m.created_at ASC
       LIMIT  $1`,
      [limit]
    );
    return rows;
  }

  // ── Conversation Summaries ───────────────────────────────────────────────

  async upsertSummary(row: {
    conversationId: string;
    personalityId: string | null;
    summary: string;
    messageCount: number;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO analytics.conversation_summaries
         (conversation_id, personality_id, summary, message_count, generated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (conversation_id) DO UPDATE SET
         summary       = EXCLUDED.summary,
         message_count = EXCLUDED.message_count,
         generated_at  = NOW()`,
      [row.conversationId, row.personalityId, row.summary, row.messageCount]
    );
  }

  async getSummary(conversationId: string): Promise<ConversationSummaryRow | null> {
    const { rows } = await this.pool.query<ConversationSummaryRow>(
      `SELECT * FROM analytics.conversation_summaries WHERE conversation_id = $1`,
      [conversationId]
    );
    return rows[0] ?? null;
  }

  async getUnsummarizedConversations(
    minMessages: number,
    limit: number
  ): Promise<UnsummarizedConversation[]> {
    const { rows } = await this.pool.query<UnsummarizedConversation>(
      `WITH conv_counts AS (
         SELECT c.id, c.personality_id, c.title,
                (SELECT COUNT(*)::int FROM chat.messages WHERE conversation_id = c.id) AS message_count,
                c.updated_at
         FROM   chat.conversations c
         LEFT   JOIN analytics.conversation_summaries cs ON cs.conversation_id = c.id
         WHERE  cs.conversation_id IS NULL
       )
       SELECT id, personality_id, title, message_count
       FROM   conv_counts
       WHERE  message_count >= $1
       ORDER  BY updated_at DESC
       LIMIT  $2`,
      [minMessages, limit]
    );
    return rows;
  }

  // ── Entities ─────────────────────────────────────────────────────────────

  async upsertEntity(row: {
    conversationId: string;
    personalityId: string | null;
    entityType: string;
    entityValue: string;
    mentionCount: number;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO analytics.conversation_entities
         (conversation_id, personality_id, entity_type, entity_value, mention_count)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [row.conversationId, row.personalityId, row.entityType, row.entityValue, row.mentionCount]
    );
  }

  async getEntitiesByConversation(conversationId: string): Promise<ConversationEntityRow[]> {
    const { rows } = await this.pool.query<ConversationEntityRow>(
      `SELECT * FROM analytics.conversation_entities
       WHERE conversation_id = $1
       ORDER BY mention_count DESC`,
      [conversationId]
    );
    return rows;
  }

  async searchByEntity(
    entityType: string,
    entityValue: string,
    opts: { limit: number; offset: number }
  ): Promise<{ conversationId: string; title: string | null; mentionCount: number }[]> {
    const { rows } = await this.pool.query<{
      conversation_id: string;
      title: string | null;
      mention_count: number;
    }>(
      `SELECT ce.conversation_id, c.title, ce.mention_count
       FROM   analytics.conversation_entities ce
       JOIN   chat.conversations c ON c.id = ce.conversation_id
       WHERE  ce.entity_type  = $1
         AND  LOWER(ce.entity_value) LIKE LOWER($2)
       ORDER  BY ce.mention_count DESC
       LIMIT  $3 OFFSET $4`,
      [entityType, `%${entityValue}%`, opts.limit, opts.offset]
    );
    return rows.map((r) => ({
      conversationId: r.conversation_id,
      title: r.title,
      mentionCount: r.mention_count,
    }));
  }

  async getTopEntities(
    personalityId: string,
    limit: number
  ): Promise<
    { entityType: string; entityValue: string; totalMentions: number; conversationCount: number }[]
  > {
    const { rows } = await this.pool.query<{
      entity_type: string;
      entity_value: string;
      total_mentions: string;
      conversation_count: string;
    }>(
      `SELECT entity_type, entity_value,
              SUM(mention_count)::text AS total_mentions,
              COUNT(DISTINCT conversation_id)::text AS conversation_count
       FROM   analytics.conversation_entities
       WHERE  personality_id = $1
       GROUP  BY entity_type, entity_value
       ORDER  BY SUM(mention_count) DESC
       LIMIT  $2`,
      [personalityId, limit]
    );
    return rows.map((r) => ({
      entityType: r.entity_type,
      entityValue: r.entity_value,
      totalMentions: Number(r.total_mentions),
      conversationCount: Number(r.conversation_count),
    }));
  }

  async getUnextractedConversations(limit: number): Promise<UnextractedConversation[]> {
    const { rows } = await this.pool.query<UnextractedConversation>(
      `SELECT c.id, c.personality_id, c.title
       FROM   chat.conversations c
       LEFT   JOIN analytics.conversation_entities ce ON ce.conversation_id = c.id
       WHERE  ce.id IS NULL
       ORDER  BY c.updated_at DESC
       LIMIT  $1`,
      [limit]
    );
    return rows;
  }

  // ── Key Phrases ──────────────────────────────────────────────────────────

  async upsertKeyPhrase(row: {
    personalityId: string;
    phrase: string;
    frequency: number;
    windowStart: string;
    windowEnd: string;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO analytics.key_phrases
         (personality_id, phrase, frequency, window_start, window_end, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (personality_id, phrase, window_start)
       DO UPDATE SET frequency = EXCLUDED.frequency, updated_at = NOW()`,
      [row.personalityId, row.phrase, row.frequency, row.windowStart, row.windowEnd]
    );
  }

  async getKeyPhrases(personalityId: string, limit: number): Promise<KeyPhraseRow[]> {
    const { rows } = await this.pool.query<KeyPhraseRow>(
      `SELECT * FROM analytics.key_phrases
       WHERE personality_id = $1
       ORDER BY frequency DESC
       LIMIT $2`,
      [personalityId, limit]
    );
    return rows;
  }

  // ── Usage Anomalies ──────────────────────────────────────────────────────

  async insertAnomaly(row: {
    anomalyType: string;
    personalityId: string | null;
    userId: string | null;
    severity: 'low' | 'medium' | 'high' | 'critical';
    details: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO analytics.usage_anomalies
         (anomaly_type, personality_id, user_id, severity, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [row.anomalyType, row.personalityId, row.userId, row.severity, JSON.stringify(row.details)]
    );
  }

  async getAnomalies(opts: {
    limit: number;
    anomalyType?: string;
  }): Promise<{ anomalies: UsageAnomalyRow[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (opts.anomalyType) {
      params.push(opts.anomalyType);
      conditions.push(`anomaly_type = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM analytics.usage_anomalies ${where}`,
      [...params]
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    params.push(opts.limit);
    const { rows } = await this.pool.query<UsageAnomalyRow>(
      `SELECT * FROM analytics.usage_anomalies ${where}
       ORDER BY detected_at DESC
       LIMIT $${params.length}`,
      params
    );

    return { anomalies: rows, total };
  }

  close(): void {
    // No-op: shared pg pool is closed separately
  }
}
