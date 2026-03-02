/**
 * ConversationSummarizer — background service that generates LLM summaries
 * for conversations above a message count threshold (Phase 96).
 */

import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';
import type { AIClient } from '../ai/client.js';
import type { AnalyticsStorage } from './analytics-storage.js';

const SUMMARIZE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

const SUMMARIZE_PROMPT = `Summarize the following conversation in 2-3 concise sentences.
Focus on the key topics discussed, decisions made, and outcomes.
Return ONLY the summary text with no additional formatting.

Conversation:
`;

export interface SummarizerConfig {
  minMessageCount: number;
  batchSize: number;
}

const DEFAULT_CONFIG: SummarizerConfig = {
  minMessageCount: 10,
  batchSize: 20,
};

export class ConversationSummarizer {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private readonly config: SummarizerConfig;

  constructor(
    private readonly pool: Pool,
    private readonly aiClient: AIClient,
    private readonly storage: AnalyticsStorage,
    private readonly logger: SecureLogger,
    config?: Partial<SummarizerConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async summarizeNew(): Promise<number> {
    const unsummarized = await this.storage.getUnsummarizedConversations(
      this.config.minMessageCount,
      this.config.batchSize
    );
    if (unsummarized.length === 0) return 0;

    let summarized = 0;
    for (const conv of unsummarized) {
      try {
        const messages = await this.getConversationMessages(conv.id);
        if (messages.length < this.config.minMessageCount) continue;

        const summary = await this.generateSummary(messages);
        await this.storage.upsertSummary({
          conversationId: conv.id,
          personalityId: conv.personality_id,
          summary,
          messageCount: messages.length,
        });
        summarized++;
      } catch (err) {
        this.logger.warn('ConversationSummarizer: failed to summarize', {
          conversationId: conv.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (summarized > 0) {
      this.logger.info('ConversationSummarizer: summarized conversations', { summarized });
    }
    return summarized;
  }

  async generateSummary(messages: { role: string; content: string }[]): Promise<string> {
    const transcript = messages
      .map((m) => `${m.role}: ${m.content.slice(0, 500)}`)
      .join('\n');
    const truncated = transcript.length > 4000 ? transcript.slice(0, 4000) + '\n...' : transcript;

    const response = await this.aiClient.chat({
      messages: [{ role: 'user', content: SUMMARIZE_PROMPT + truncated }],
    });

    return typeof response.content === 'string' ? response.content.trim() : '';
  }

  private async getConversationMessages(
    conversationId: string
  ): Promise<{ role: string; content: string }[]> {
    const { rows } = await this.pool.query<{ role: string; content: string }>(
      `SELECT role, content FROM chat.messages
       WHERE conversation_id = $1 AND content IS NOT NULL
       ORDER BY created_at ASC`,
      [conversationId]
    );
    return rows;
  }

  start(): void {
    if (this.intervalHandle) return;
    this.intervalHandle = setInterval(() => {
      void this.summarizeNew().catch((err: unknown) => {
        this.logger.error('ConversationSummarizer: interval error', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, SUMMARIZE_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }
}
