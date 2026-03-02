/**
 * entity-extractor.test.ts — Unit tests for EntityExtractor (Phase 96).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EntityExtractor } from './entity-extractor.js';

const mockQuery = vi.fn();
const mockPool = { query: mockQuery } as any;
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as any;

const mockStorage = {
  getUnextractedConversations: vi.fn(),
  upsertEntity: vi.fn(),
  upsertKeyPhrase: vi.fn(),
} as any;

const mockAiClient = {
  chat: vi.fn(),
} as any;

describe('EntityExtractor', () => {
  let extractor: EntityExtractor;

  beforeEach(() => {
    vi.clearAllMocks();
    extractor = new EntityExtractor(mockPool, mockAiClient, mockStorage, mockLogger);
  });

  afterEach(() => {
    extractor.stop();
  });

  describe('extractFromMessages', () => {
    it('extracts entities and key phrases from conversation', async () => {
      mockAiClient.chat.mockResolvedValueOnce({
        content: JSON.stringify({
          entities: [
            { type: 'person', value: 'Alice', mentionCount: 3 },
            { type: 'technology', value: 'React', mentionCount: 2 },
          ],
          keyPhrases: [{ phrase: 'machine learning', frequency: 4 }],
        }),
      });

      const result = await extractor.extractFromMessages([
        { role: 'user', content: 'Tell me about Alice and React' },
      ]);

      expect(result.entities).toHaveLength(2);
      expect(result.keyPhrases).toHaveLength(1);
      expect(result.entities[0]!.value).toBe('Alice');
    });

    it('returns empty arrays on parse failure', async () => {
      mockAiClient.chat.mockResolvedValueOnce({ content: 'Not JSON' });
      const result = await extractor.extractFromMessages([
        { role: 'user', content: 'test' },
      ]);
      expect(result.entities).toEqual([]);
      expect(result.keyPhrases).toEqual([]);
    });

    it('handles malformed JSON with missing arrays', async () => {
      mockAiClient.chat.mockResolvedValueOnce({ content: '{"entities": "bad"}' });
      const result = await extractor.extractFromMessages([
        { role: 'user', content: 'test' },
      ]);
      expect(result.entities).toEqual([]);
    });

    it('truncates long transcripts', async () => {
      const longMessages = Array.from({ length: 100 }, () => ({
        role: 'user',
        content: 'a'.repeat(200),
      }));
      mockAiClient.chat.mockResolvedValueOnce({
        content: '{"entities":[],"keyPhrases":[]}',
      });
      await extractor.extractFromMessages(longMessages);
      const prompt = mockAiClient.chat.mock.calls[0][0].messages[0].content;
      expect(prompt.length).toBeLessThanOrEqual(5000);
    });
  });

  describe('extractNew', () => {
    it('returns 0 when no unextracted conversations', async () => {
      mockStorage.getUnextractedConversations.mockResolvedValueOnce([]);
      const count = await extractor.extractNew();
      expect(count).toBe(0);
    });

    it('extracts entities and key phrases for conversations', async () => {
      mockStorage.getUnextractedConversations.mockResolvedValueOnce([
        { id: 'c1', personality_id: 'p1', title: 'Chat 1' },
      ]);
      mockQuery.mockResolvedValueOnce({
        rows: [{ role: 'user', content: 'Tell me about Bob.' }],
      });
      mockAiClient.chat.mockResolvedValueOnce({
        content: JSON.stringify({
          entities: [{ type: 'person', value: 'Bob', mentionCount: 1 }],
          keyPhrases: [{ phrase: 'tell me about', frequency: 1 }],
        }),
      });
      mockStorage.upsertEntity.mockResolvedValue(undefined);
      mockStorage.upsertKeyPhrase.mockResolvedValue(undefined);

      const count = await extractor.extractNew();
      expect(count).toBe(1);
      expect(mockStorage.upsertEntity).toHaveBeenCalledTimes(1);
      expect(mockStorage.upsertKeyPhrase).toHaveBeenCalledTimes(1);
    });

    it('skips conversations with no messages', async () => {
      mockStorage.getUnextractedConversations.mockResolvedValueOnce([
        { id: 'c1', personality_id: 'p1', title: 'Empty' },
      ]);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const count = await extractor.extractNew();
      expect(count).toBe(0);
      expect(mockAiClient.chat).not.toHaveBeenCalled();
    });

    it('skips key phrases when no personality_id', async () => {
      mockStorage.getUnextractedConversations.mockResolvedValueOnce([
        { id: 'c1', personality_id: null, title: 'Anon chat' },
      ]);
      mockQuery.mockResolvedValueOnce({
        rows: [{ role: 'user', content: 'Hello' }],
      });
      mockAiClient.chat.mockResolvedValueOnce({
        content: JSON.stringify({
          entities: [{ type: 'concept', value: 'greeting', mentionCount: 1 }],
          keyPhrases: [{ phrase: 'hello', frequency: 1 }],
        }),
      });
      mockStorage.upsertEntity.mockResolvedValue(undefined);

      const count = await extractor.extractNew();
      expect(count).toBe(1);
      expect(mockStorage.upsertEntity).toHaveBeenCalledTimes(1);
      expect(mockStorage.upsertKeyPhrase).not.toHaveBeenCalled();
    });

    it('continues on failure', async () => {
      mockStorage.getUnextractedConversations.mockResolvedValueOnce([
        { id: 'c1', personality_id: 'p1', title: 'Chat 1' },
        { id: 'c2', personality_id: 'p1', title: 'Chat 2' },
      ]);
      // First fails
      mockQuery
        .mockResolvedValueOnce({ rows: [{ role: 'user', content: 'test' }] })
        .mockResolvedValueOnce({ rows: [{ role: 'user', content: 'test' }] });
      mockAiClient.chat
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce({ content: '{"entities":[],"keyPhrases":[]}' });

      const count = await extractor.extractNew();
      expect(count).toBe(1);
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    });
  });

  describe('start/stop', () => {
    it('manages interval lifecycle', () => {
      vi.useFakeTimers();
      extractor.start();
      extractor.start(); // idempotent
      extractor.stop();
      extractor.stop(); // idempotent
      vi.useRealTimers();
    });
  });
});
