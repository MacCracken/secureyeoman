/**
 * analytics-storage.test.ts — Unit tests for AnalyticsStorage (Phase 96).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyticsStorage } from './analytics-storage.js';

const mockQuery = vi.fn();
const mockPool = { query: mockQuery } as any;

describe('AnalyticsStorage', () => {
  let storage: AnalyticsStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new AnalyticsStorage(mockPool);
  });

  // ── Turn Sentiments ──────────────────────────────────────────────────────

  describe('insertSentiment', () => {
    it('inserts a sentiment record', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await storage.insertSentiment({
        conversationId: 'c1',
        messageId: 'm1',
        personalityId: 'p1',
        sentiment: 'positive',
        score: 0.9,
      });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO analytics.turn_sentiments'),
        ['c1', 'm1', 'p1', 'positive', 0.9]
      );
    });

    it('handles null personality_id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await storage.insertSentiment({
        conversationId: 'c1',
        messageId: 'm2',
        personalityId: null,
        sentiment: 'neutral',
        score: 0.5,
      });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (message_id) DO NOTHING'),
        ['c1', 'm2', null, 'neutral', 0.5]
      );
    });
  });

  describe('getSentimentsByConversation', () => {
    it('returns sentiments ordered by analyzed_at', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: '1', conversation_id: 'c1', message_id: 'm1', personality_id: 'p1', sentiment: 'positive', score: 0.8, analyzed_at: '2026-01-01' },
          { id: '2', conversation_id: 'c1', message_id: 'm2', personality_id: 'p1', sentiment: 'negative', score: 0.2, analyzed_at: '2026-01-02' },
        ],
      });
      const results = await storage.getSentimentsByConversation('c1');
      expect(results).toHaveLength(2);
      expect(results[0]!.sentiment).toBe('positive');
    });
  });

  describe('getSentimentTrend', () => {
    it('aggregates by date', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { date: '2026-01-01', positive: '5', neutral: '3', negative: '2', avg_score: 0.65 },
        ],
      });
      const trend = await storage.getSentimentTrend('p1', 30);
      expect(trend).toHaveLength(1);
      expect(trend[0]!.positive).toBe(5);
      expect(trend[0]!.neutral).toBe(3);
      expect(trend[0]!.negative).toBe(2);
      expect(trend[0]!.avg_score).toBe(0.65);
    });
  });

  describe('getAvgSentimentForConversation', () => {
    it('returns average score', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ avg: 0.7 }] });
      const avg = await storage.getAvgSentimentForConversation('c1');
      expect(avg).toBe(0.7);
    });

    it('returns null when no sentiments', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ avg: null }] });
      const avg = await storage.getAvgSentimentForConversation('c1');
      expect(avg).toBeNull();
    });
  });

  describe('getUnanalyzedMessages', () => {
    it('returns messages without sentiment records', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'm1', conversation_id: 'c1', personality_id: 'p1', content: 'Hello' },
        ],
      });
      const messages = await storage.getUnanalyzedMessages(100);
      expect(messages).toHaveLength(1);
      expect(messages[0]!.content).toBe('Hello');
    });
  });

  // ── Conversation Summaries ───────────────────────────────────────────────

  describe('upsertSummary', () => {
    it('inserts or updates a summary', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await storage.upsertSummary({
        conversationId: 'c1',
        personalityId: 'p1',
        summary: 'Discussion about security.',
        messageCount: 15,
      });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO analytics.conversation_summaries'),
        ['c1', 'p1', 'Discussion about security.', 15]
      );
    });
  });

  describe('getSummary', () => {
    it('returns a summary for existing conversation', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ conversation_id: 'c1', personality_id: 'p1', summary: 'A chat.', message_count: 10, generated_at: '2026-01-01' }],
      });
      const summary = await storage.getSummary('c1');
      expect(summary?.summary).toBe('A chat.');
    });

    it('returns null for non-existent conversation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const summary = await storage.getSummary('missing');
      expect(summary).toBeNull();
    });
  });

  describe('getUnsummarizedConversations', () => {
    it('returns conversations without summaries', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'c1', personality_id: 'p1', title: 'Conv 1', message_count: 20 }],
      });
      const convs = await storage.getUnsummarizedConversations(10, 20);
      expect(convs).toHaveLength(1);
      expect(convs[0]!.message_count).toBe(20);
    });
  });

  // ── Entities ─────────────────────────────────────────────────────────────

  describe('upsertEntity', () => {
    it('inserts an entity record', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await storage.upsertEntity({
        conversationId: 'c1',
        personalityId: 'p1',
        entityType: 'person',
        entityValue: 'Alice',
        mentionCount: 3,
      });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO analytics.conversation_entities'),
        ['c1', 'p1', 'person', 'Alice', 3]
      );
    });
  });

  describe('getEntitiesByConversation', () => {
    it('returns entities ordered by mention count', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'e1', conversation_id: 'c1', personality_id: 'p1', entity_type: 'person', entity_value: 'Alice', mention_count: 5, first_seen_at: '2026-01-01' },
        ],
      });
      const entities = await storage.getEntitiesByConversation('c1');
      expect(entities).toHaveLength(1);
      expect(entities[0]!.entity_value).toBe('Alice');
    });
  });

  describe('searchByEntity', () => {
    it('searches by entity type and value', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ conversation_id: 'c1', title: 'Chat about Alice', mention_count: 3 }],
      });
      const results = await storage.searchByEntity('person', 'Alice', { limit: 20, offset: 0 });
      expect(results).toHaveLength(1);
      expect(results[0]!.conversationId).toBe('c1');
    });
  });

  describe('getTopEntities', () => {
    it('aggregates entities by personality', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ entity_type: 'technology', entity_value: 'React', total_mentions: '10', conversation_count: '3' }],
      });
      const top = await storage.getTopEntities('p1', 10);
      expect(top[0]!.totalMentions).toBe(10);
      expect(top[0]!.conversationCount).toBe(3);
    });
  });

  // ── Key Phrases ──────────────────────────────────────────────────────────

  describe('upsertKeyPhrase', () => {
    it('inserts or updates a key phrase', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await storage.upsertKeyPhrase({
        personalityId: 'p1',
        phrase: 'machine learning',
        frequency: 5,
        windowStart: '2026-01-01',
        windowEnd: '2026-01-31',
      });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO analytics.key_phrases'),
        ['p1', 'machine learning', 5, '2026-01-01', '2026-01-31']
      );
    });
  });

  describe('getKeyPhrases', () => {
    it('returns key phrases ordered by frequency', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'kp1', personality_id: 'p1', phrase: 'AI safety', frequency: 12, window_start: '2026-01-01', window_end: '2026-01-31', updated_at: '2026-01-15' }],
      });
      const phrases = await storage.getKeyPhrases('p1', 50);
      expect(phrases).toHaveLength(1);
      expect(phrases[0]!.phrase).toBe('AI safety');
    });
  });

  // ── Usage Anomalies ──────────────────────────────────────────────────────

  describe('insertAnomaly', () => {
    it('inserts an anomaly record', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await storage.insertAnomaly({
        anomalyType: 'message_rate_spike',
        personalityId: 'p1',
        userId: 'u1',
        severity: 'high',
        details: { recentCount: 20 },
      });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO analytics.usage_anomalies'),
        ['message_rate_spike', 'p1', 'u1', 'high', JSON.stringify({ recentCount: 20 })]
      );
    });
  });

  describe('getAnomalies', () => {
    it('returns paginated anomalies', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 'a1', anomaly_type: 'message_rate_spike', personality_id: 'p1', user_id: 'u1', severity: 'high', details: {}, detected_at: '2026-01-01' },
          ],
        });
      const result = await storage.getAnomalies({ limit: 10 });
      expect(result.total).toBe(5);
      expect(result.anomalies).toHaveLength(1);
    });

    it('filters by anomalyType', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await storage.getAnomalies({ limit: 10, anomalyType: 'off_hours_activity' });
      expect(result.total).toBe(2);
      // Count query
      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('anomaly_type = $1'),
        ['off_hours_activity']
      );
      // Data query includes both anomalyType and limit
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('anomaly_type = $1'),
        ['off_hours_activity', 10]
      );
    });
  });
});
