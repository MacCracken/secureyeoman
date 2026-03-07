/**
 * EntityExtractor — background service that extracts entities and key phrases
 * from conversations using a single LLM call per conversation (Phase 96).
 */

import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';
import type { AIClient } from '../ai/client.js';
import type { AnalyticsStorage } from './analytics-storage.js';

const EXTRACT_INTERVAL_MS = 900_000; // 15 minutes
const BATCH_SIZE = 30;
const MESSAGE_PREVIEW_LENGTH = 500;
const TRANSCRIPT_TRUNCATION_LENGTH = 4_000;

const EXTRACT_PROMPT = `Extract entities and key phrases from the following conversation.
Return ONLY valid JSON with no additional text:
{
  "entities": [{"type":"person|organization|technology|location|product|concept","value":"...","mentionCount":N}],
  "keyPhrases": [{"phrase":"...","frequency":N}]
}
Limit to top 10 entities and top 10 key phrases.

Conversation:
`;

interface ExtractResult {
  entities: { type: string; value: string; mentionCount: number }[];
  keyPhrases: { phrase: string; frequency: number }[];
}

export class EntityExtractor {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly pool: Pool,
    private readonly aiClient: AIClient,
    private readonly storage: AnalyticsStorage,
    private readonly logger: SecureLogger
  ) {}

  async extractNew(): Promise<number> {
    const unextracted = await this.storage.getUnextractedConversations(BATCH_SIZE);
    if (unextracted.length === 0) return 0;

    let extracted = 0;
    for (const conv of unextracted) {
      try {
        const messages = await this.getConversationMessages(conv.id);
        if (messages.length === 0) continue;

        const result = await this.extractFromMessages(messages);
        const now = new Date().toISOString();

        await this.storage.upsertEntityBatch(
          result.entities.map((entity) => ({
            conversationId: conv.id,
            personalityId: conv.personality_id,
            entityType: entity.type,
            entityValue: entity.value,
            mentionCount: entity.mentionCount,
          }))
        );

        if (conv.personality_id) {
          await this.storage.upsertKeyPhraseBatch(
            result.keyPhrases.map((kp) => ({
              personalityId: conv.personality_id!,
              phrase: kp.phrase,
              frequency: kp.frequency,
              windowStart: now,
              windowEnd: now,
            }))
          );
        }

        extracted++;
      } catch (err) {
        this.logger.warn({
          conversationId: conv.id,
          error: err instanceof Error ? err.message : String(err),
        }, 'EntityExtractor: failed to extract');
      }
    }

    if (extracted > 0) {
      this.logger.info({ extracted }, 'EntityExtractor: extracted from conversations');
    }
    return extracted;
  }

  async extractFromMessages(messages: { role: string; content: string }[]): Promise<ExtractResult> {
    const transcript = messages
      .map((m) => `${m.role}: ${m.content.slice(0, MESSAGE_PREVIEW_LENGTH)}`)
      .join('\n');
    const truncated =
      transcript.length > TRANSCRIPT_TRUNCATION_LENGTH
        ? transcript.slice(0, TRANSCRIPT_TRUNCATION_LENGTH) + '\n...'
        : transcript;

    const response = await this.aiClient.chat({
      messages: [{ role: 'user', content: EXTRACT_PROMPT + truncated }],
      stream: false,
    });

    const text = typeof response.content === 'string' ? response.content : '';
    const jsonMatch = /\{[\s\S]*\}/.exec(text);
    if (!jsonMatch) {
      return { entities: [], keyPhrases: [] };
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]) as ExtractResult;
      return {
        entities: Array.isArray(parsed.entities) ? parsed.entities : [],
        keyPhrases: Array.isArray(parsed.keyPhrases) ? parsed.keyPhrases : [],
      };
    } catch {
      return { entities: [], keyPhrases: [] };
    }
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
      void this.extractNew().catch((err: unknown) => {
        this.logger.error({
          error: err instanceof Error ? err.message : String(err),
        }, 'EntityExtractor: interval error');
      });
    }, EXTRACT_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }
}
