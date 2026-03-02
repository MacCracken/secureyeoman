/**
 * Conversation Analytics types (Phase 96)
 *
 * Zod schemas and inferred types for sentiment tracking, engagement metrics,
 * conversation summarization, entity/key-phrase extraction, and anomaly detection.
 */

import { z } from 'zod';

// ── Sentiment ────────────────────────────────────────────────────────────────

export const SentimentLabelSchema = z.enum(['positive', 'neutral', 'negative']);
export type SentimentLabel = z.infer<typeof SentimentLabelSchema>;

export const TurnSentimentSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  messageId: z.string(),
  personalityId: z.string().nullable(),
  sentiment: SentimentLabelSchema,
  score: z.number(),
  analyzedAt: z.string(),
});
export type TurnSentiment = z.infer<typeof TurnSentimentSchema>;

export const SentimentTrendPointSchema = z.object({
  date: z.string(),
  positive: z.number(),
  neutral: z.number(),
  negative: z.number(),
  avgScore: z.number(),
});
export type SentimentTrendPoint = z.infer<typeof SentimentTrendPointSchema>;

// ── Engagement ───────────────────────────────────────────────────────────────

export const EngagementMetricsSchema = z.object({
  personalityId: z.string().nullable(),
  periodDays: z.number(),
  avgConversationLength: z.number(),
  followUpRate: z.number(),
  abandonmentRate: z.number(),
  toolCallSuccessRate: z.number(),
  totalConversations: z.number(),
});
export type EngagementMetrics = z.infer<typeof EngagementMetricsSchema>;

// ── Summaries ────────────────────────────────────────────────────────────────

export const ConversationSummarySchema = z.object({
  conversationId: z.string(),
  personalityId: z.string().nullable(),
  summary: z.string(),
  messageCount: z.number(),
  generatedAt: z.string(),
});
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

// ── Entities ─────────────────────────────────────────────────────────────────

export const ConversationEntitySchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  personalityId: z.string().nullable(),
  entityType: z.string(),
  entityValue: z.string(),
  mentionCount: z.number(),
  firstSeenAt: z.string(),
});
export type ConversationEntity = z.infer<typeof ConversationEntitySchema>;

export const EntitySearchResultSchema = z.object({
  conversationId: z.string(),
  title: z.string().nullable(),
  mentionCount: z.number(),
});
export type EntitySearchResult = z.infer<typeof EntitySearchResultSchema>;

export const TopEntitySchema = z.object({
  entityType: z.string(),
  entityValue: z.string(),
  totalMentions: z.number(),
  conversationCount: z.number(),
});
export type TopEntity = z.infer<typeof TopEntitySchema>;

// ── Key Phrases ──────────────────────────────────────────────────────────────

export const KeyPhraseSchema = z.object({
  id: z.string(),
  personalityId: z.string(),
  phrase: z.string(),
  frequency: z.number(),
  windowStart: z.string(),
  windowEnd: z.string(),
  updatedAt: z.string(),
});
export type KeyPhrase = z.infer<typeof KeyPhraseSchema>;

// ── Anomalies ────────────────────────────────────────────────────────────────

export const AnomalySeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type AnomalySeverity = z.infer<typeof AnomalySeveritySchema>;

export const UsageAnomalySchema = z.object({
  id: z.string(),
  anomalyType: z.string(),
  personalityId: z.string().nullable(),
  userId: z.string().nullable(),
  severity: AnomalySeveritySchema,
  details: z.record(z.unknown()),
  detectedAt: z.string(),
});
export type UsageAnomaly = z.infer<typeof UsageAnomalySchema>;
