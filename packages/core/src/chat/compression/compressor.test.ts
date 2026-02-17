/**
 * HistoryCompressor Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HistoryCompressor } from './compressor.js';
import type { CompressionStorage } from './storage.js';
import type { HistoryEntry, HistoryCompressorConfig } from './types.js';

let entryCounter = 0;

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: `entry-${++entryCounter}`,
    conversationId: 'conv-1',
    tier: 'message',
    content: 'user: hello',
    tokenCount: 10,
    sequence: 1,
    createdAt: Date.now(),
    sealedAt: null,
    ...overrides,
  };
}

function createMockStorage(): CompressionStorage {
  const entries: HistoryEntry[] = [];

  return {
    createEntry: vi.fn(async (data) => {
      const entry = makeEntry({
        conversationId: data.conversationId,
        tier: data.tier,
        content: data.content,
        tokenCount: data.tokenCount,
        sequence: data.sequence,
      });
      entries.push(entry);
      return entry;
    }),
    getEntriesByConversation: vi.fn(async (id, tier?) => {
      return entries.filter(
        (e) => e.conversationId === id && (!tier || e.tier === tier),
      );
    }),
    getNextSequence: vi.fn(async () => entries.length + 1),
    sealEntry: vi.fn(async (id) => {
      const entry = entries.find((e) => e.id === id);
      if (entry) entry.sealedAt = Date.now();
    }),
    getTokenCountByTier: vi.fn(async () => ({
      message: 0,
      topic: 0,
      bulk: 0,
    })),
    deleteOldestBulk: vi.fn(async () => {}),
  } as unknown as CompressionStorage;
}

const defaultConfig: HistoryCompressorConfig = {
  enabled: true,
  tiers: { messagePct: 50, topicPct: 30, bulkPct: 20 },
  maxMessageChars: 8000,
  topicSummaryTokens: 200,
  bulkSummaryTokens: 300,
  bulkMergeSize: 3,
  topicBoundary: {
    keywords: ['new topic', "let's move on"],
    silenceMinutes: 15,
    tokenThreshold: 2000,
  },
  model: null,
};

describe('HistoryCompressor', () => {
  let storage: ReturnType<typeof createMockStorage>;
  let compressor: HistoryCompressor;

  beforeEach(() => {
    entryCounter = 0;
    storage = createMockStorage();
    compressor = new HistoryCompressor(defaultConfig, {
      storage: storage as unknown as CompressionStorage,
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
    });
  });

  describe('addMessage', () => {
    it('stores a message entry', async () => {
      await compressor.addMessage('conv-1', { role: 'user', content: 'Hello!' });

      expect(storage.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv-1',
          tier: 'message',
          content: 'user: Hello!',
        }),
      );
    });

    it('stores multiple messages sequentially', async () => {
      await compressor.addMessage('conv-1', { role: 'user', content: 'First' });
      await compressor.addMessage('conv-1', { role: 'assistant', content: 'Second' });

      expect(storage.createEntry).toHaveBeenCalledTimes(2);
    });
  });

  describe('getContext', () => {
    it('returns compressed context with tier budgets', async () => {
      // Add some messages first
      await compressor.addMessage('conv-1', { role: 'user', content: 'Hello' });
      await compressor.addMessage('conv-1', { role: 'assistant', content: 'Hi there' });

      const context = await compressor.getContext('conv-1', 1000);

      expect(context.tokenBudget).toEqual({
        messages: 500, // 50% of 1000
        topics: 300,   // 30% of 1000
        bulk: 200,     // 20% of 1000
      });
    });

    it('returns empty context for unknown conversation', async () => {
      const context = await compressor.getContext('unknown', 1000);
      expect(context.messages).toEqual([]);
      expect(context.topics).toEqual([]);
      expect(context.bulk).toEqual([]);
      expect(context.totalTokens).toBe(0);
    });
  });

  describe('sealCurrentTopic', () => {
    it('seals current topic and resets token count', async () => {
      // Without a summarizer, compressCurrentTopic returns early
      // but sealCurrentTopic still resets the tracking
      await compressor.addMessage('conv-1', { role: 'user', content: 'Hello' });
      await compressor.sealCurrentTopic('conv-1');

      // Adding another message should start fresh topic tracking
      await compressor.addMessage('conv-1', { role: 'user', content: 'New topic msg' });
      expect(storage.createEntry).toHaveBeenCalledTimes(2);
    });
  });

  describe('getHistory', () => {
    it('returns all entries for a conversation', async () => {
      await compressor.addMessage('conv-1', { role: 'user', content: 'One' });
      await compressor.addMessage('conv-1', { role: 'user', content: 'Two' });

      const history = await compressor.getHistory('conv-1');
      expect(history).toHaveLength(2);
    });
  });

  describe('topic boundary detection', () => {
    it('detects keyword boundary', async () => {
      const summarizer = {
        aiProvider: {
          chat: vi.fn(async () => ({ content: 'Summary of previous messages' })),
        },
      };

      const compressorWithSummarizer = new HistoryCompressor(defaultConfig, {
        storage: storage as unknown as CompressionStorage,
        summarizer: summarizer as any,
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
      });

      // Add initial messages
      await compressorWithSummarizer.addMessage('conv-1', { role: 'user', content: 'First msg' });
      await compressorWithSummarizer.addMessage('conv-1', { role: 'assistant', content: 'Response' });

      // Trigger keyword boundary
      await compressorWithSummarizer.addMessage('conv-1', {
        role: 'user',
        content: "Let's move on to deployment",
      });

      // The summarizer should have been called to compress the previous topic
      expect(summarizer.aiProvider.chat).toHaveBeenCalled();
    });
  });

  describe('tier budget allocation', () => {
    it('allocates 50/30/20 budget split', async () => {
      const context = await compressor.getContext('conv-1', 10000);
      expect(context.tokenBudget.messages).toBe(5000);
      expect(context.tokenBudget.topics).toBe(3000);
      expect(context.tokenBudget.bulk).toBe(2000);
    });

    it('handles small budgets with rounding', async () => {
      const context = await compressor.getContext('conv-1', 7);
      expect(context.tokenBudget.messages).toBe(3); // floor(7 * 50/100)
      expect(context.tokenBudget.topics).toBe(2);   // floor(7 * 30/100)
      expect(context.tokenBudget.bulk).toBe(1);      // floor(7 * 20/100)
    });
  });
});
