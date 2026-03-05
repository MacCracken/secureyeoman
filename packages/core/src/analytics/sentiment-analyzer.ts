/**
 * SentimentAnalyzer — background service that classifies assistant messages
 * into positive/neutral/negative sentiment using AIClient (Phase 96).
 *
 * Follows the ConversationQualityScorer interval pattern.
 */

import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';
import type { AIClient } from '../ai/client.js';
import type { AnalyticsStorage } from './analytics-storage.js';

const SENTIMENT_INTERVAL_MS = 300_000; // 5 minutes
const BATCH_SIZE = 100;
const CONTENT_TRUNCATION_LENGTH = 2_000;
const DEFAULT_SENTIMENT_SCORE = 0.5;

const SENTIMENT_PROMPT = `Classify the sentiment of the following assistant message.
Return ONLY valid JSON with no additional text: {"sentiment":"positive"|"neutral"|"negative","score":0.0-1.0}
where score 1.0 = strongly positive, 0.5 = neutral, 0.0 = strongly negative.

Message:
`;

export class SentimentAnalyzer {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly pool: Pool,
    private readonly aiClient: AIClient,
    private readonly storage: AnalyticsStorage,
    private readonly logger: SecureLogger
  ) {}

  async analyzeNewMessages(): Promise<number> {
    const unanalyzed = await this.storage.getUnanalyzedMessages(BATCH_SIZE);
    if (unanalyzed.length === 0) return 0;

    const classified: {
      conversationId: string;
      messageId: string;
      personalityId: string | null;
      sentiment: 'positive' | 'neutral' | 'negative';
      score: number;
    }[] = [];

    for (const msg of unanalyzed) {
      try {
        const result = await this.classifyMessage(msg.content);
        classified.push({
          conversationId: msg.conversation_id,
          messageId: msg.id,
          personalityId: msg.personality_id,
          sentiment: result.sentiment,
          score: result.score,
        });
      } catch (err) {
        this.logger.warn('SentimentAnalyzer: failed to classify message', {
          messageId: msg.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (classified.length > 0) {
      await this.storage.insertSentimentBatch(classified);
      this.logger.info('SentimentAnalyzer: analyzed messages', { analyzed: classified.length });
    }
    return classified.length;
  }

  async classifyMessage(
    content: string
  ): Promise<{ sentiment: 'positive' | 'neutral' | 'negative'; score: number }> {
    const truncated =
      content.length > CONTENT_TRUNCATION_LENGTH
        ? content.slice(0, CONTENT_TRUNCATION_LENGTH) + '...'
        : content;
    const response = await this.aiClient.chat({
      messages: [{ role: 'user', content: SENTIMENT_PROMPT + truncated }],
      stream: false,
    });

    const text = typeof response.content === 'string' ? response.content : '';
    const jsonMatch = /\{[^}]+\}/.exec(text);
    if (!jsonMatch) {
      return { sentiment: 'neutral', score: DEFAULT_SENTIMENT_SCORE };
    }

    const parsed = JSON.parse(jsonMatch[0]) as { sentiment?: string; score?: number };
    const sentiment = ['positive', 'neutral', 'negative'].includes(parsed.sentiment ?? '')
      ? (parsed.sentiment as 'positive' | 'neutral' | 'negative')
      : 'neutral';
    const score =
      typeof parsed.score === 'number'
        ? Math.max(0, Math.min(1, parsed.score))
        : DEFAULT_SENTIMENT_SCORE;

    return { sentiment, score };
  }

  start(): void {
    if (this.intervalHandle) return;
    this.intervalHandle = setInterval(() => {
      void this.analyzeNewMessages().catch((err: unknown) => {
        this.logger.error('SentimentAnalyzer: interval error', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, SENTIMENT_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }
}
