import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CompressionStorage } from './storage.js';

// ─── Mock pg-pool ─────────────────────────────────────────────

let mockQuery: ReturnType<typeof vi.fn>;

vi.mock('../../storage/pg-pool.js', () => ({
  getPool: () => ({ query: (...args: any[]) => mockQuery(...args) }),
}));

// ─── Test Data ────────────────────────────────────────────────

const historyRow = {
  id: 'hist-1',
  conversation_id: 'conv-1',
  tier: 'message',
  content: 'Hello there',
  token_count: 5,
  sequence: 0,
  created_at: 1000,
  sealed_at: null,
};

// ─── Tests ────────────────────────────────────────────────────

describe('CompressionStorage', () => {
  let storage: CompressionStorage;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    storage = new CompressionStorage();
  });

  describe('createEntry', () => {
    it('inserts and returns an entry object', async () => {
      const result = await storage.createEntry({
        conversationId: 'conv-1',
        tier: 'message',
        content: 'Hello there',
        tokenCount: 5,
        sequence: 0,
      });

      expect(result.id).toBeDefined();
      expect(result.conversationId).toBe('conv-1');
      expect(result.tier).toBe('message');
      expect(result.content).toBe('Hello there');
      expect(result.tokenCount).toBe(5);
      expect(result.sequence).toBe(0);
      expect(result.sealedAt).toBeNull();
    });

    it('passes correct params to INSERT', async () => {
      await storage.createEntry({
        conversationId: 'conv-1',
        tier: 'topic',
        content: 'Summary',
        tokenCount: 10,
        sequence: 2,
      });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[1]).toBe('conv-1');
      expect(params[2]).toBe('topic');
      expect(params[3]).toBe('Summary');
      expect(params[4]).toBe(10);
      expect(params[5]).toBe(2);
    });
  });

  describe('getEntriesByConversation', () => {
    it('returns entries without tier filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [historyRow], rowCount: 1 });
      const result = await storage.getEntriesByConversation('conv-1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('hist-1');
      expect(result[0].tier).toBe('message');
      expect(result[0].tokenCount).toBe(5);
    });

    it('filters by tier when provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.getEntriesByConversation('conv-1', 'topic');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('tier = $2');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[1]).toBe('topic');
    });

    it('does not filter by tier when not provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.getEntriesByConversation('conv-1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).not.toContain('tier = $2');
    });

    it('maps sealedAt when present', async () => {
      const sealedRow = { ...historyRow, sealed_at: 9999 };
      mockQuery.mockResolvedValueOnce({ rows: [sealedRow], rowCount: 1 });
      const result = await storage.getEntriesByConversation('conv-1');
      expect(result[0].sealedAt).toBe(9999);
    });
  });

  describe('sealEntry', () => {
    it('updates sealed_at for the entry', async () => {
      await storage.sealEntry('hist-1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('sealed_at');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[1]).toBe('hist-1');
    });
  });

  describe('deleteOldestBulk', () => {
    it('deletes oldest bulk entry for conversation', async () => {
      await storage.deleteOldestBulk('conv-1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("tier = 'bulk'");
      expect(sql).toContain('DELETE FROM chat.conversation_history');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('conv-1');
    });
  });

  describe('getTokenCountByTier', () => {
    it('returns zero counts for all tiers when no rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getTokenCountByTier('conv-1');
      expect(result.message).toBe(0);
      expect(result.topic).toBe(0);
      expect(result.bulk).toBe(0);
    });

    it('maps tier totals from rows', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { tier: 'message', total: '100' },
          { tier: 'topic', total: '50' },
          { tier: 'bulk', total: '200' },
        ],
        rowCount: 3,
      });
      const result = await storage.getTokenCountByTier('conv-1');
      expect(result.message).toBe(100);
      expect(result.topic).toBe(50);
      expect(result.bulk).toBe(200);
    });

    it('leaves unset tiers at 0', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ tier: 'message', total: '75' }],
        rowCount: 1,
      });
      const result = await storage.getTokenCountByTier('conv-1');
      expect(result.message).toBe(75);
      expect(result.topic).toBe(0);
      expect(result.bulk).toBe(0);
    });
  });

  describe('getNextSequence', () => {
    it('returns 0 when no entries exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ max_seq: null }], rowCount: 1 });
      const result = await storage.getNextSequence('conv-1', 'message');
      expect(result).toBe(0);
    });

    it('returns max_seq + 1 when entries exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ max_seq: 4 }], rowCount: 1 });
      const result = await storage.getNextSequence('conv-1', 'topic');
      expect(result).toBe(5);
    });

    it('queries for the correct tier', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ max_seq: 0 }], rowCount: 1 });
      await storage.getNextSequence('conv-1', 'bulk');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('conv-1');
      expect(params[1]).toBe('bulk');
    });
  });

  describe('deleteEntriesByConversation', () => {
    it('deletes all entries for a conversation', async () => {
      await storage.deleteEntriesByConversation('conv-1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('DELETE FROM chat.conversation_history');
      expect(sql).toContain('conversation_id = $1');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('conv-1');
    });
  });
});
