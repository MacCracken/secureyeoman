/**
 * ConversationSummarizer — background service that generates LLM summaries
 * for conversations above a message count threshold (Phase 96).
 */

import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';
import type { AIClient } from '../ai/client.js';
import type { AnalyticsStorage } from './analytics-storage.js';

const SUMMARIZE_INTERVAL_MS = 600_000; // 10 minutes
const MESSAGE_PREVIEW_LENGTH = 500;
const TRANSCRIPT_TRUNCATION_LENGTH = 4_000;

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

    // Batch-fetch all messages for the batch in one query instead of N+1
    const convIds = unsummarized.map((c) => c.id);
    const messagesByConv = await this.batchFetchMessages(convIds);

    let summarized = 0;
    for (const conv of unsummarized) {
      try {
        const messages = messagesByConv.get(conv.id) ?? [];
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
    const transcript = messages.map((m) => `${m.role}: ${m.content.slice(0, MESSAGE_PREVIEW_LENGTH)}`).join('\n');
    const truncated = transcript.length > TRANSCRIPT_TRUNCATION_LENGTH ? transcript.slice(0, TRANSCRIPT_TRUNCATION_LENGTH) + '\n...' : transcript;

    const response = await this.aiClient.chat({
      messages: [{ role: 'user', content: SUMMARIZE_PROMPT + truncated }],
      stream: false,
    });

    return typeof response.content === 'string' ? response.content.trim() : '';
  }

  private async batchFetchMessages(
    convIds: string[]
  ): Promise<Map<string, { role: string; content: string }[]>> {
    if (convIds.length === 0) return new Map();
    const { rows } = await this.pool.query<{
      conversation_id: string;
      role: string;
      content: string;
    }>(
      `SELECT conversation_id, role, content FROM chat.messages
       WHERE conversation_id = ANY($1) AND content IS NOT NULL
       ORDER BY created_at ASC`,
      [convIds]
    );
    const map = new Map<string, { role: string; content: string }[]>();
    for (const msg of rows) {
      let arr = map.get(msg.conversation_id);
      if (!arr) {
        arr = [];
        map.set(msg.conversation_id, arr);
      }
      arr.push({ role: msg.role, content: msg.content });
    }
    return map;
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
