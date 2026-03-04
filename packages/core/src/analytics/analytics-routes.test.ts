/**
 * analytics-routes.test.ts — Unit tests for analytics REST endpoints (Phase 96).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerAnalyticsRoutes } from './analytics-routes.js';

const mockAnalyticsStorage = {
  getSentimentsByConversation: vi.fn(),
  getSentimentTrend: vi.fn(),
  getSummary: vi.fn(),
  getEntitiesByConversation: vi.fn(),
  searchByEntity: vi.fn(),
  getTopEntities: vi.fn(),
  getKeyPhrases: vi.fn(),
  getAnomalies: vi.fn(),
};

const mockEngagementService = {
  getMetrics: vi.fn(),
};

const mockSummarizer = {
  summarizeNew: vi.fn(),
};

const mockSecureYeoman = {
  getAnalyticsStorage: vi.fn(() => mockAnalyticsStorage),
  getEngagementMetricsService: vi.fn(() => mockEngagementService),
  getConversationSummarizer: vi.fn(() => mockSummarizer),
} as any;

describe('Analytics Routes', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    registerAnalyticsRoutes(app, { secureYeoman: mockSecureYeoman });
    await app.ready();
  });

  // ── Sentiment ──────────────────────────────────────────────────────────────

  describe('GET /api/v1/analytics/sentiment/:conversationId', () => {
    it('returns sentiments for a conversation', async () => {
      mockAnalyticsStorage.getSentimentsByConversation.mockResolvedValueOnce([
        {
          id: '1',
          conversation_id: 'c1',
          message_id: 'm1',
          personality_id: 'p1',
          sentiment: 'positive',
          score: 0.8,
          analyzed_at: '2026-01-01',
        },
      ]);
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/sentiment/c1' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.sentiments).toHaveLength(1);
      expect(body.sentiments[0].sentiment).toBe('positive');
    });

    it('returns 503 when storage unavailable', async () => {
      mockSecureYeoman.getAnalyticsStorage.mockReturnValueOnce(null);
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/sentiment/c1' });
      expect(res.statusCode).toBe(503);
    });
  });

  describe('GET /api/v1/analytics/sentiment/trend/:personalityId', () => {
    it('returns trend data', async () => {
      mockAnalyticsStorage.getSentimentTrend.mockResolvedValueOnce([
        { date: '2026-01-01', positive: 5, neutral: 3, negative: 2, avg_score: 0.65 },
      ]);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/sentiment/trend/p1?days=7',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.trend[0].avgScore).toBe(0.65);
    });
  });

  // ── Engagement ─────────────────────────────────────────────────────────────

  describe('GET /api/v1/analytics/engagement/:personalityId', () => {
    it('returns engagement metrics for a personality', async () => {
      mockEngagementService.getMetrics.mockResolvedValueOnce({
        personalityId: 'p1',
        periodDays: 30,
        avgConversationLength: 8.5,
        followUpRate: 0.6,
        abandonmentRate: 0.15,
        toolCallSuccessRate: 0.9,
        totalConversations: 100,
      });
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/engagement/p1' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.avgConversationLength).toBe(8.5);
    });
  });

  describe('GET /api/v1/analytics/engagement', () => {
    it('returns global engagement metrics', async () => {
      mockEngagementService.getMetrics.mockResolvedValueOnce({
        personalityId: null,
        periodDays: 30,
        avgConversationLength: 5,
        followUpRate: 0.4,
        abandonmentRate: 0.2,
        toolCallSuccessRate: 0.8,
        totalConversations: 50,
      });
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/engagement?periodDays=14',
      });
      expect(res.statusCode).toBe(200);
    });
  });

  // ── Summaries ──────────────────────────────────────────────────────────────

  describe('GET /api/v1/analytics/summary/:conversationId', () => {
    it('returns summary for existing conversation', async () => {
      mockAnalyticsStorage.getSummary.mockResolvedValueOnce({
        conversation_id: 'c1',
        personality_id: 'p1',
        summary: 'A conversation about security.',
        message_count: 15,
        generated_at: '2026-01-01',
      });
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/summary/c1' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.summary).toBe('A conversation about security.');
    });

    it('returns null for non-existent summary', async () => {
      mockAnalyticsStorage.getSummary.mockResolvedValueOnce(null);
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/summary/missing' });
      expect(res.statusCode).toBe(200);
      expect(res.payload).toBe('null');
    });
  });

  describe('POST /api/v1/analytics/summarize', () => {
    it('triggers manual summarization', async () => {
      mockSummarizer.summarizeNew.mockResolvedValueOnce(5);
      const res = await app.inject({ method: 'POST', url: '/api/v1/analytics/summarize' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.summarized).toBe(5);
    });
  });

  // ── Entities ───────────────────────────────────────────────────────────────

  describe('GET /api/v1/analytics/entities/:conversationId', () => {
    it('returns entities for a conversation', async () => {
      mockAnalyticsStorage.getEntitiesByConversation.mockResolvedValueOnce([
        {
          id: 'e1',
          conversation_id: 'c1',
          personality_id: 'p1',
          entity_type: 'person',
          entity_value: 'Alice',
          mention_count: 3,
          first_seen_at: '2026-01-01',
        },
      ]);
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/entities/c1' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.entities[0].entityValue).toBe('Alice');
    });
  });

  describe('GET /api/v1/analytics/entities', () => {
    it('searches by entity', async () => {
      mockAnalyticsStorage.searchByEntity.mockResolvedValueOnce([
        { conversationId: 'c1', title: 'Chat', mentionCount: 2 },
      ]);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/entities?entity=Alice&entityType=person',
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns 400 when entity param missing', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/entities' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/analytics/entities/top/:personalityId', () => {
    it('returns top entities', async () => {
      mockAnalyticsStorage.getTopEntities.mockResolvedValueOnce([
        { entityType: 'technology', entityValue: 'React', totalMentions: 10, conversationCount: 3 },
      ]);
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/entities/top/p1' });
      expect(res.statusCode).toBe(200);
    });
  });

  // ── Key Phrases ────────────────────────────────────────────────────────────

  describe('GET /api/v1/analytics/phrases/:personalityId', () => {
    it('returns key phrases', async () => {
      mockAnalyticsStorage.getKeyPhrases.mockResolvedValueOnce([
        {
          id: 'kp1',
          personality_id: 'p1',
          phrase: 'AI safety',
          frequency: 12,
          window_start: '2026-01-01',
          window_end: '2026-01-31',
          updated_at: '2026-01-15',
        },
      ]);
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/phrases/p1?limit=25' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.phrases[0].phrase).toBe('AI safety');
    });
  });

  // ── Anomalies ──────────────────────────────────────────────────────────────

  describe('GET /api/v1/analytics/anomalies', () => {
    it('returns anomalies with total', async () => {
      mockAnalyticsStorage.getAnomalies.mockResolvedValueOnce({
        anomalies: [
          {
            id: 'a1',
            anomaly_type: 'message_rate_spike',
            personality_id: 'p1',
            user_id: 'u1',
            severity: 'high',
            details: {},
            detected_at: '2026-01-01',
          },
        ],
        total: 1,
      });
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/anomalies?limit=10' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.total).toBe(1);
      expect(body.anomalies[0].anomalyType).toBe('message_rate_spike');
    });
  });

  // ── Phase 105: 503 guard branches ─────────────────────────────────────────

  describe('503 when services unavailable (Phase 105)', () => {
    it('sentiment/trend returns 503 when storage null', async () => {
      mockSecureYeoman.getAnalyticsStorage.mockReturnValueOnce(null);
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/sentiment/trend/p1' });
      expect(res.statusCode).toBe(503);
    });

    it('engagement/:personalityId returns 503 when service null', async () => {
      mockSecureYeoman.getEngagementMetricsService.mockReturnValueOnce(null);
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/engagement/p1' });
      expect(res.statusCode).toBe(503);
    });

    it('engagement (global) returns 503 when service null', async () => {
      mockSecureYeoman.getEngagementMetricsService.mockReturnValueOnce(null);
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/engagement' });
      expect(res.statusCode).toBe(503);
    });

    it('summary/:conversationId returns 503 when storage null', async () => {
      mockSecureYeoman.getAnalyticsStorage.mockReturnValueOnce(null);
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/summary/c1' });
      expect(res.statusCode).toBe(503);
    });

    it('summarize returns 503 when summarizer null', async () => {
      mockSecureYeoman.getConversationSummarizer.mockReturnValueOnce(null);
      const res = await app.inject({ method: 'POST', url: '/api/v1/analytics/summarize' });
      expect(res.statusCode).toBe(503);
    });

    it('entities/:conversationId returns 503 when storage null', async () => {
      mockSecureYeoman.getAnalyticsStorage.mockReturnValueOnce(null);
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/entities/c1' });
      expect(res.statusCode).toBe(503);
    });

    it('entities (search) returns 503 when storage null', async () => {
      mockSecureYeoman.getAnalyticsStorage.mockReturnValueOnce(null);
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/entities?entity=foo' });
      expect(res.statusCode).toBe(503);
    });

    it('entities/top/:personalityId returns 503 when storage null', async () => {
      mockSecureYeoman.getAnalyticsStorage.mockReturnValueOnce(null);
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/entities/top/p1' });
      expect(res.statusCode).toBe(503);
    });

    it('phrases/:personalityId returns 503 when storage null', async () => {
      mockSecureYeoman.getAnalyticsStorage.mockReturnValueOnce(null);
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/phrases/p1' });
      expect(res.statusCode).toBe(503);
    });

    it('anomalies returns 503 when storage null', async () => {
      mockSecureYeoman.getAnalyticsStorage.mockReturnValueOnce(null);
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/anomalies' });
      expect(res.statusCode).toBe(503);
    });
  });
});
