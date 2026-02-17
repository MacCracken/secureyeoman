/**
 * ConversationManager — Maintains sliding window of recent messages per chat.
 *
 * Each conversation is keyed by `{platform}:{chatId}` and holds the most
 * recent N messages within a configurable time window. Stale entries are
 * cleaned up automatically via a periodic timer.
 */

import type { UnifiedMessage } from '@friday/shared';
import type { HistoryCompressor } from '../chat/compression/compressor.js';
import type { CompressedContext } from '../chat/compression/types.js';

export interface ConversationManagerOptions {
  /** Maximum messages to retain per conversation (default 10) */
  windowSize?: number;
  /** Maximum age in ms before messages are pruned (default 30min) */
  windowDurationMs?: number;
  /** How often to run the stale-cleanup sweep in ms (default 60s) */
  cleanupIntervalMs?: number;
  /** Optional history compressor for progressive compression */
  historyCompressor?: HistoryCompressor;
}

export interface ConversationContext {
  key: string;
  messages: UnifiedMessage[];
}

export class ConversationManager {
  private readonly windowSize: number;
  private readonly windowDurationMs: number;
  private readonly conversations = new Map<string, UnifiedMessage[]>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private readonly historyCompressor?: HistoryCompressor;

  constructor(options: ConversationManagerOptions = {}) {
    this.windowSize = options.windowSize ?? 10;
    this.windowDurationMs = options.windowDurationMs ?? 30 * 60 * 1000;
    this.historyCompressor = options.historyCompressor;

    const cleanupMs = options.cleanupIntervalMs ?? 60_000;
    this.cleanupTimer = setInterval(() => {
      this.clearStale();
    }, cleanupMs);
    // Don't block process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Build a conversation key from platform + chatId + optional threadId.
   * Thread IDs allow separate context per platform thread:
   *   - Telegram: reply chain message IDs
   *   - Discord: thread IDs
   *   - Slack: thread_ts values
   */
  private key(platform: string, chatId: string, threadId?: string): string {
    return threadId ? `${platform}:${chatId}:${threadId}` : `${platform}:${chatId}`;
  }

  /**
   * Add a message to its conversation window.
   * If the message has a threadId in its metadata, it's tracked in a separate thread context.
   */
  addMessage(message: UnifiedMessage): void {
    const threadId = message.metadata?.threadId as string | undefined;
    const k = this.key(message.platform, message.chatId, threadId);
    let window = this.conversations.get(k);
    if (!window) {
      window = [];
      this.conversations.set(k, window);
    }
    window.push(message);

    // Enforce size limit
    if (window.length > this.windowSize) {
      window.splice(0, window.length - this.windowSize);
    }

    // Feed compressor when available
    if (this.historyCompressor) {
      const conversationId = this.key(
        message.platform,
        message.chatId,
        message.metadata?.threadId as string | undefined
      );
      this.historyCompressor
        .addMessage(conversationId, {
          role: message.direction === 'inbound' ? 'user' : 'assistant',
          content: message.text,
          timestamp: message.timestamp,
        })
        .catch(() => {
          // Non-critical — don't block message handling
        });
    }
  }

  /**
   * Get the current conversation context for a chat (optionally thread-scoped).
   */
  getContext(platform: string, chatId: string, threadId?: string): ConversationContext {
    const k = this.key(platform, chatId, threadId);
    const now = Date.now();
    const window = this.conversations.get(k) ?? [];

    // Filter out expired messages
    const active = window.filter((m) => now - m.timestamp < this.windowDurationMs);

    return { key: k, messages: active };
  }

  /**
   * Remove expired messages from all conversations.
   * Drops empty conversations entirely.
   */
  clearStale(): void {
    const now = Date.now();
    for (const [key, window] of this.conversations) {
      const active = window.filter((m) => now - m.timestamp < this.windowDurationMs);
      if (active.length === 0) {
        this.conversations.delete(key);
      } else {
        this.conversations.set(key, active);
      }
    }
  }

  /**
   * Get compressed context for a conversation using the history compressor.
   */
  async getCompressedContext(
    platform: string,
    chatId: string,
    maxTokens: number
  ): Promise<CompressedContext | null> {
    if (!this.historyCompressor) return null;
    const conversationId = this.key(platform, chatId);
    return this.historyCompressor.getContext(conversationId, maxTokens);
  }

  /**
   * Get the number of active conversations.
   */
  getConversationCount(): number {
    return this.conversations.size;
  }

  /**
   * Shut down the cleanup timer.
   */
  close(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.conversations.clear();
  }
}
