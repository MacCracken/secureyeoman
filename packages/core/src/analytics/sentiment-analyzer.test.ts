/**
 * sentiment-analyzer.test.ts — Unit tests for SentimentAnalyzer (Phase 96).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SentimentAnalyzer } from './sentiment-analyzer.js';

const mockPool = {} as any;
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as any;

const mockStorage = {
  getUnanalyzedMessages: vi.fn(),
  insertSentiment: vi.fn(),
  insertSentimentBatch: vi.fn(),
} as any;

const mockAiClient = {
  chat: vi.fn(),
} as any;

describe('SentimentAnalyzer', () => {
  let analyzer: SentimentAnalyzer;

  beforeEach(() => {
    vi.clearAllMocks();
    analyzer = new SentimentAnalyzer(mockPool, mockAiClient, mockStorage, mockLogger);
  });

  afterEach(() => {
    analyzer.stop();
  });

  describe('classifyMessage', () => {
    it('classifies a positive message', async () => {
      mockAiClient.chat.mockResolvedValueOnce({
        content: '{"sentiment":"positive","score":0.9}',
      });
      const result = await analyzer.classifyMessage('Great job, everything worked perfectly!');
      expect(result.sentiment).toBe('positive');
      expect(result.score).toBe(0.9);
    });

    it('classifies a negative message', async () => {
      mockAiClient.chat.mockResolvedValueOnce({
        content: '{"sentiment":"negative","score":0.15}',
      });
      const result = await analyzer.classifyMessage('This is broken and terrible.');
      expect(result.sentiment).toBe('negative');
      expect(result.score).toBe(0.15);
    });

    it('defaults to neutral on parse failure', async () => {
      mockAiClient.chat.mockResolvedValueOnce({
        content: 'I cannot classify this.',
      });
      const result = await analyzer.classifyMessage('random text');
      expect(result.sentiment).toBe('neutral');
      expect(result.score).toBe(0.5);
    });

    it('clamps score to [0, 1]', async () => {
      mockAiClient.chat.mockResolvedValueOnce({
        content: '{"sentiment":"positive","score":1.5}',
      });
      const result = await analyzer.classifyMessage('Amazing!');
      expect(result.score).toBe(1);
    });

    it('handles invalid sentiment label gracefully', async () => {
      mockAiClient.chat.mockResolvedValueOnce({
        content: '{"sentiment":"happy","score":0.8}',
      });
      const result = await analyzer.classifyMessage('Yay!');
      expect(result.sentiment).toBe('neutral');
    });

    it('truncates long messages', async () => {
      const longMessage = 'a'.repeat(3000);
      mockAiClient.chat.mockResolvedValueOnce({
        content: '{"sentiment":"neutral","score":0.5}',
      });
      await analyzer.classifyMessage(longMessage);
      const prompt = mockAiClient.chat.mock.calls[0][0].messages[0].content;
      expect(prompt.length).toBeLessThan(3000);
    });
  });

  describe('analyzeNewMessages', () => {
    it('returns 0 when no unanalyzed messages', async () => {
      mockStorage.getUnanalyzedMessages.mockResolvedValueOnce([]);
      const count = await analyzer.analyzeNewMessages();
      expect(count).toBe(0);
    });

    it('analyzes and stores sentiments', async () => {
      mockStorage.getUnanalyzedMessages.mockResolvedValueOnce([
        { id: 'm1', conversation_id: 'c1', personality_id: 'p1', content: 'Hello!' },
        { id: 'm2', conversation_id: 'c1', personality_id: 'p1', content: 'Goodbye.' },
      ]);
      mockAiClient.chat
        .mockResolvedValueOnce({ content: '{"sentiment":"positive","score":0.8}' })
        .mockResolvedValueOnce({ content: '{"sentiment":"neutral","score":0.5}' });
      mockStorage.insertSentimentBatch.mockResolvedValue(undefined);

      const count = await analyzer.analyzeNewMessages();
      expect(count).toBe(2);
      expect(mockStorage.insertSentimentBatch).toHaveBeenCalledTimes(1);
      expect(mockStorage.insertSentimentBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ messageId: 'm1', sentiment: 'positive' }),
          expect.objectContaining({ messageId: 'm2', sentiment: 'neutral' }),
        ])
      );
    });

    it('continues processing when one message fails', async () => {
      mockStorage.getUnanalyzedMessages.mockResolvedValueOnce([
        { id: 'm1', conversation_id: 'c1', personality_id: 'p1', content: 'ok' },
        { id: 'm2', conversation_id: 'c1', personality_id: 'p1', content: 'ok' },
      ]);
      mockAiClient.chat
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce({ content: '{"sentiment":"neutral","score":0.5}' });
      mockStorage.insertSentimentBatch.mockResolvedValue(undefined);

      const count = await analyzer.analyzeNewMessages();
      expect(count).toBe(1);
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    });
  });

  describe('start/stop', () => {
    it('starts and stops the interval', () => {
      vi.useFakeTimers();
      analyzer.start();
      // calling start again is idempotent
      analyzer.start();
      analyzer.stop();
      // calling stop again is idempotent
      analyzer.stop();
      vi.useRealTimers();
    });

    it('runs analysis on interval tick', async () => {
      vi.useFakeTimers();
      mockStorage.getUnanalyzedMessages.mockResolvedValue([]);
      analyzer.start();
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      expect(mockStorage.getUnanalyzedMessages).toHaveBeenCalled();
      analyzer.stop();
      vi.useRealTimers();
    });
  });
});
