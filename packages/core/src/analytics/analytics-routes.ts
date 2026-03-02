/**
 * Analytics REST endpoints (Phase 96).
 *
 * 11 endpoints under /api/v1/analytics/* for sentiment, engagement,
 * summaries, entities, key phrases, and anomalies.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SecureYeoman } from '../secureyeoman.js';

export function registerAnalyticsRoutes(
  app: FastifyInstance,
  deps: { secureYeoman: SecureYeoman }
): void {
  const { secureYeoman } = deps;

  // ── Sentiment ──────────────────────────────────────────────────────────────

  app.get('/api/v1/analytics/sentiment/:conversationId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { conversationId } = request.params as { conversationId: string };
    const storage = secureYeoman.getAnalyticsStorage();
    if (!storage) return reply.code(503).send({ error: 'Analytics not available' });

    const sentiments = await storage.getSentimentsByConversation(conversationId);
    return sentiments.map((s) => ({
      id: s.id,
      conversationId: s.conversation_id,
      messageId: s.message_id,
      personalityId: s.personality_id,
      sentiment: s.sentiment,
      score: s.score,
      analyzedAt: s.analyzed_at,
    }));
  });

  app.get('/api/v1/analytics/sentiment/trend/:personalityId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { personalityId } = request.params as { personalityId: string };
    const { days = '30' } = request.query as { days?: string };
    const storage = secureYeoman.getAnalyticsStorage();
    if (!storage) return reply.code(503).send({ error: 'Analytics not available' });

    const trend = await storage.getSentimentTrend(personalityId, Number(days) || 30);
    return trend.map((t) => ({
      date: t.date,
      positive: t.positive,
      neutral: t.neutral,
      negative: t.negative,
      avgScore: t.avg_score,
    }));
  });

  // ── Engagement ─────────────────────────────────────────────────────────────

  app.get('/api/v1/analytics/engagement/:personalityId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { personalityId } = request.params as { personalityId: string };
    const { periodDays = '30' } = request.query as { periodDays?: string };
    const service = secureYeoman.getEngagementMetricsService();
    if (!service) return reply.code(503).send({ error: 'Analytics not available' });

    return service.getMetrics(personalityId, Number(periodDays) || 30);
  });

  app.get('/api/v1/analytics/engagement', async (request: FastifyRequest, reply: FastifyReply) => {
    const { periodDays = '30' } = request.query as { periodDays?: string };
    const service = secureYeoman.getEngagementMetricsService();
    if (!service) return reply.code(503).send({ error: 'Analytics not available' });

    return service.getMetrics(null, Number(periodDays) || 30);
  });

  // ── Summaries ──────────────────────────────────────────────────────────────

  app.get('/api/v1/analytics/summary/:conversationId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { conversationId } = request.params as { conversationId: string };
    const storage = secureYeoman.getAnalyticsStorage();
    if (!storage) return reply.code(503).send({ error: 'Analytics not available' });

    const row = await storage.getSummary(conversationId);
    if (!row) return null;
    return {
      conversationId: row.conversation_id,
      personalityId: row.personality_id,
      summary: row.summary,
      messageCount: row.message_count,
      generatedAt: row.generated_at,
    };
  });

  app.post('/api/v1/analytics/summarize', async (request: FastifyRequest, reply: FastifyReply) => {
    const summarizer = secureYeoman.getConversationSummarizer();
    if (!summarizer) return reply.code(503).send({ error: 'Summarizer not available' });

    const summarized = await summarizer.summarizeNew();
    return { summarized };
  });

  // ── Entities ───────────────────────────────────────────────────────────────

  app.get('/api/v1/analytics/entities/:conversationId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { conversationId } = request.params as { conversationId: string };
    const storage = secureYeoman.getAnalyticsStorage();
    if (!storage) return reply.code(503).send({ error: 'Analytics not available' });

    const entities = await storage.getEntitiesByConversation(conversationId);
    return entities.map((e) => ({
      id: e.id,
      conversationId: e.conversation_id,
      personalityId: e.personality_id,
      entityType: e.entity_type,
      entityValue: e.entity_value,
      mentionCount: e.mention_count,
      firstSeenAt: e.first_seen_at,
    }));
  });

  app.get('/api/v1/analytics/entities', async (request: FastifyRequest, reply: FastifyReply) => {
    const { entity, entityType = 'concept', limit = '20', offset = '0' } = request.query as {
      entity?: string;
      entityType?: string;
      limit?: string;
      offset?: string;
    };
    const storage = secureYeoman.getAnalyticsStorage();
    if (!storage) return reply.code(503).send({ error: 'Analytics not available' });

    if (!entity) return reply.code(400).send({ error: 'entity query param required' });

    const results = await storage.searchByEntity(entityType, entity, {
      limit: Number(limit) || 20,
      offset: Number(offset) || 0,
    });
    return results;
  });

  app.get('/api/v1/analytics/entities/top/:personalityId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { personalityId } = request.params as { personalityId: string };
    const { limit = '20' } = request.query as { limit?: string };
    const storage = secureYeoman.getAnalyticsStorage();
    if (!storage) return reply.code(503).send({ error: 'Analytics not available' });

    return storage.getTopEntities(personalityId, Number(limit) || 20);
  });

  // ── Key Phrases ────────────────────────────────────────────────────────────

  app.get('/api/v1/analytics/phrases/:personalityId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { personalityId } = request.params as { personalityId: string };
    const { limit = '50' } = request.query as { limit?: string };
    const storage = secureYeoman.getAnalyticsStorage();
    if (!storage) return reply.code(503).send({ error: 'Analytics not available' });

    const phrases = await storage.getKeyPhrases(personalityId, Number(limit) || 50);
    return phrases.map((p) => ({
      id: p.id,
      personalityId: p.personality_id,
      phrase: p.phrase,
      frequency: p.frequency,
      windowStart: p.window_start,
      windowEnd: p.window_end,
      updatedAt: p.updated_at,
    }));
  });

  // ── Anomalies ──────────────────────────────────────────────────────────────

  app.get('/api/v1/analytics/anomalies', async (request: FastifyRequest, reply: FastifyReply) => {
    const { limit = '50', anomalyType } = request.query as { limit?: string; anomalyType?: string };
    const storage = secureYeoman.getAnalyticsStorage();
    if (!storage) return reply.code(503).send({ error: 'Analytics not available' });

    const result = await storage.getAnomalies({
      limit: Number(limit) || 50,
      anomalyType,
    });
    return {
      anomalies: result.anomalies.map((a) => ({
        id: a.id,
        anomalyType: a.anomaly_type,
        personalityId: a.personality_id,
        userId: a.user_id,
        severity: a.severity,
        details: a.details,
        detectedAt: a.detected_at,
      })),
      total: result.total,
    };
  });
}
