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

const SENTIMENT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const BATCH_SIZE = 100;

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

    let analyzed = 0;
    for (const msg of unanalyzed) {
      try {
        const result = await this.classifyMessage(msg.content);
        await this.storage.insertSentiment({
          conversationId: msg.conversation_id,
          messageId: msg.id,
          personalityId: msg.personality_id,
          sentiment: result.sentiment,
          score: result.score,
        });
        analyzed++;
      } catch (err) {
        this.logger.warn('SentimentAnalyzer: failed to classify message', {
          messageId: msg.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (analyzed > 0) {
      this.logger.info('SentimentAnalyzer: analyzed messages', { analyzed });
    }
    return analyzed;
  }

  async classifyMessage(content: string): Promise<{ sentiment: 'positive' | 'neutral' | 'negative'; score: number }> {
    const truncated = content.length > 2000 ? content.slice(0, 2000) + '...' : content;
    const response = await this.aiClient.chat({
      messages: [{ role: 'user', content: SENTIMENT_PROMPT + truncated }],
    });

    const text = typeof response.content === 'string' ? response.content : '';
    const jsonMatch = text.match(/\{[^}]+\}/);
    if (!jsonMatch) {
      return { sentiment: 'neutral', score: 0.5 };
    }

    const parsed = JSON.parse(jsonMatch[0]) as { sentiment?: string; score?: number };
    const sentiment = ['positive', 'neutral', 'negative'].includes(parsed.sentiment ?? '')
      ? (parsed.sentiment as 'positive' | 'neutral' | 'negative')
      : 'neutral';
    const score = typeof parsed.score === 'number'
      ? Math.max(0, Math.min(1, parsed.score))
      : 0.5;

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
