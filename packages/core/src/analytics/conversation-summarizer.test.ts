/**
 * conversation-summarizer.test.ts — Unit tests for ConversationSummarizer (Phase 96).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConversationSummarizer } from './conversation-summarizer.js';

const mockQuery = vi.fn();
const mockPool = { query: mockQuery } as any;
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as any;

const mockStorage = {
  getUnsummarizedConversations: vi.fn(),
  upsertSummary: vi.fn(),
} as any;

const mockAiClient = {
  chat: vi.fn(),
} as any;

describe('ConversationSummarizer', () => {
  let summarizer: ConversationSummarizer;

  beforeEach(() => {
    vi.clearAllMocks();
    summarizer = new ConversationSummarizer(mockPool, mockAiClient, mockStorage, mockLogger, {
      minMessageCount: 5,
      batchSize: 10,
    });
  });

  afterEach(() => {
    summarizer.stop();
  });

  describe('generateSummary', () => {
    it('generates a summary from messages', async () => {
      mockAiClient.chat.mockResolvedValueOnce({
        content: 'The user asked about security best practices.',
      });
      const summary = await summarizer.generateSummary([
        { role: 'user', content: 'Tell me about security.' },
        { role: 'assistant', content: 'Security is important.' },
      ]);
      expect(summary).toBe('The user asked about security best practices.');
    });

    it('truncates long transcripts', async () => {
      const longMessages = Array.from({ length: 50 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: 'a'.repeat(200),
      }));
      mockAiClient.chat.mockResolvedValueOnce({ content: 'Summary.' });
      await summarizer.generateSummary(longMessages);
      const prompt = mockAiClient.chat.mock.calls[0][0].messages[0].content;
      expect(prompt.length).toBeLessThanOrEqual(5000);
    });

    it('handles non-string response', async () => {
      mockAiClient.chat.mockResolvedValueOnce({ content: 42 });
      const summary = await summarizer.generateSummary([{ role: 'user', content: 'test' }]);
      expect(summary).toBe('');
    });
  });

  describe('summarizeNew', () => {
    it('returns 0 when no unsummarized conversations', async () => {
      mockStorage.getUnsummarizedConversations.mockResolvedValueOnce([]);
      const count = await summarizer.summarizeNew();
      expect(count).toBe(0);
    });

    it('summarizes eligible conversations via batch fetch', async () => {
      mockStorage.getUnsummarizedConversations.mockResolvedValueOnce([
        { id: 'c1', personality_id: 'p1', message_count: 15, title: 'Chat 1' },
      ]);
      // Batch fetch returns messages tagged with conversation_id
      mockQuery.mockResolvedValueOnce({
        rows: Array.from({ length: 15 }, (_, i) => ({
          conversation_id: 'c1',
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`,
        })),
      });
      mockAiClient.chat.mockResolvedValueOnce({ content: 'Summary of conversation.' });
      mockStorage.upsertSummary.mockResolvedValueOnce(undefined);

      const count = await summarizer.summarizeNew();
      expect(count).toBe(1);
      expect(mockStorage.upsertSummary).toHaveBeenCalledWith({
        conversationId: 'c1',
        personalityId: 'p1',
        summary: 'Summary of conversation.',
        messageCount: 15,
      });
    });

    it('skips conversations under minMessageCount', async () => {
      mockStorage.getUnsummarizedConversations.mockResolvedValueOnce([
        { id: 'c1', personality_id: 'p1', message_count: 3, title: 'Short chat' },
      ]);
      // Batch fetch returns only 2 messages
      mockQuery.mockResolvedValueOnce({
        rows: [
          { conversation_id: 'c1', role: 'user', content: 'Hi' },
          { conversation_id: 'c1', role: 'assistant', content: 'Hello' },
        ],
      });

      const count = await summarizer.summarizeNew();
      expect(count).toBe(0);
      expect(mockAiClient.chat).not.toHaveBeenCalled();
    });

    it('continues when one conversation fails', async () => {
      mockStorage.getUnsummarizedConversations.mockResolvedValueOnce([
        { id: 'c1', personality_id: 'p1', message_count: 10, title: 'Chat 1' },
        { id: 'c2', personality_id: 'p1', message_count: 12, title: 'Chat 2' },
      ]);
      // Batch fetch returns messages for both conversations
      mockQuery.mockResolvedValueOnce({
        rows: [
          ...Array.from({ length: 10 }, () => ({
            conversation_id: 'c1',
            role: 'user',
            content: 'msg',
          })),
          ...Array.from({ length: 12 }, () => ({
            conversation_id: 'c2',
            role: 'user',
            content: 'msg',
          })),
        ],
      });
      mockAiClient.chat
        .mockRejectedValueOnce(new Error('LLM error'))
        .mockResolvedValueOnce({ content: 'Summary 2.' });
      mockStorage.upsertSummary.mockResolvedValue(undefined);

      const count = await summarizer.summarizeNew();
      expect(count).toBe(1);
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    });
  });

  describe('start/stop', () => {
    it('starts and stops idempotently', () => {
      vi.useFakeTimers();
      summarizer.start();
      summarizer.start(); // no-op
      summarizer.stop();
      summarizer.stop(); // no-op
      vi.useRealTimers();
    });

    it('runs summarization on interval tick', async () => {
      vi.useFakeTimers();
      mockStorage.getUnsummarizedConversations.mockResolvedValue([]);
      summarizer.start();
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
      expect(mockStorage.getUnsummarizedConversations).toHaveBeenCalled();
      summarizer.stop();
      vi.useRealTimers();
    });
  });

  describe('config defaults', () => {
    it('uses default config when none provided', () => {
      const s = new ConversationSummarizer(mockPool, mockAiClient, mockStorage, mockLogger);
      // Should not throw
      expect(s).toBeDefined();
    });
  });
});
