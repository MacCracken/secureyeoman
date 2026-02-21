import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsageStorage } from './usage-storage.js';

// ─── Mock pg-pool ─────────────────────────────────────────────

let mockQuery: ReturnType<typeof vi.fn>;

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: (...args: any[]) => mockQuery(...args) }),
}));

// ─── Test Data ────────────────────────────────────────────────

const usageRow = {
  provider: 'anthropic',
  model: 'claude-3-opus',
  input_tokens: 100,
  output_tokens: 200,
  cached_tokens: 50,
  total_tokens: 300,
  cost_usd: 0.015,
  recorded_at: '1700000000000',
  personality_id: null,
  latency_ms: 350,
};

const makeRecord = () => ({
  provider: 'anthropic' as const,
  model: 'claude-3-opus',
  usage: { inputTokens: 100, outputTokens: 200, cachedTokens: 50, totalTokens: 300 },
  costUsd: 0.015,
  timestamp: 1700000000000,
  latencyMs: 350,
});

// ─── Tests ────────────────────────────────────────────────────

describe('UsageStorage', () => {
  let storage: UsageStorage;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    storage = new UsageStorage();
  });

  describe('init', () => {
    it('creates tables and indexes then prunes', async () => {
      await storage.init();
      const calls = mockQuery.mock.calls.map((c: any[]) => c[0] as string);
      expect(calls.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS usage_records'))).toBe(
        true
      );
      expect(
        calls.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS usage_error_records'))
      ).toBe(true);
      expect(calls.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS usage_resets'))).toBe(
        true
      );
      // prune() is called at end of init
      expect(calls.some((sql) => sql.includes('DELETE FROM usage_records'))).toBe(true);
    });
  });

  describe('insert', () => {
    it('inserts a usage record', async () => {
      await storage.insert(makeRecord());

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO usage_records');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('anthropic');
      expect(params[1]).toBe('claude-3-opus');
      expect(params[2]).toBe(100);
      expect(params[3]).toBe(200);
      expect(params[4]).toBe(50);
      expect(params[6]).toBe(0.015);
      expect(params[9]).toBe(350); // latencyMs
    });

    it('uses null for personalityId when not provided', async () => {
      await storage.insert(makeRecord());
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[8]).toBeNull(); // personality_id
    });

    it('includes personalityId when provided', async () => {
      await storage.insert({ ...makeRecord(), personalityId: 'pers-1' });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[8]).toBe('pers-1');
    });

    it('defaults latencyMs to 0 when not provided', async () => {
      const rec = makeRecord();
      delete (rec as any).latencyMs;
      await storage.insert(rec);
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[9]).toBe(0);
    });
  });

  describe('insertError', () => {
    it('inserts an error record', async () => {
      await storage.insertError('anthropic', 'claude-3-opus', 1700000000000);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO usage_error_records');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('anthropic');
      expect(params[1]).toBe('claude-3-opus');
      expect(params[2]).toBe(1700000000000);
    });
  });

  describe('loadRecent', () => {
    it('returns mapped usage records', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [usageRow], rowCount: 1 });
      const result = await storage.loadRecent();
      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe('anthropic');
      expect(result[0].model).toBe('claude-3-opus');
      expect(result[0].usage.inputTokens).toBe(100);
      expect(result[0].usage.cachedTokens).toBe(50);
      expect(result[0].timestamp).toBe(1700000000000);
      expect(result[0].latencyMs).toBe(350);
    });

    it('maps personality_id to personalityId', async () => {
      const withPersonality = { ...usageRow, personality_id: 'pers-1' };
      mockQuery.mockResolvedValueOnce({ rows: [withPersonality], rowCount: 1 });
      const result = await storage.loadRecent();
      expect(result[0].personalityId).toBe('pers-1');
    });

    it('maps null personality_id to undefined', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [usageRow], rowCount: 1 });
      const result = await storage.loadRecent();
      expect(result[0].personalityId).toBeUndefined();
    });

    it('returns empty array when no records', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.loadRecent();
      expect(result).toEqual([]);
    });

    it('includes WHERE recorded_at >= in query', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.loadRecent();
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('recorded_at >=');
    });
  });

  describe('loadStats', () => {
    it('returns error count and latency stats', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ total: '3500', cnt: '10' }], rowCount: 1 });

      const result = await storage.loadStats(1000, 2000);
      expect(result.errorCount).toBe(5);
      expect(result.latencyTotalMs).toBe(3500);
      expect(result.latencyCallCount).toBe(10);
    });

    it('returns zeros when no data', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await storage.loadStats(0, 0);
      expect(result.errorCount).toBe(0);
      expect(result.latencyTotalMs).toBe(0);
      expect(result.latencyCallCount).toBe(0);
    });

    it('handles null total from SUM', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ total: null, cnt: '0' }], rowCount: 1 });

      const result = await storage.loadStats(0, 0);
      expect(result.latencyTotalMs).toBe(0);
    });
  });

  describe('getResetAt', () => {
    it('returns the reset timestamp when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ reset_at: '9999' }], rowCount: 1 });
      const result = await storage.getResetAt('errors');
      expect(result).toBe(9999);
    });

    it('returns 0 when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getResetAt('latency');
      expect(result).toBe(0);
    });
  });

  describe('setResetAt', () => {
    it('upserts the reset timestamp', async () => {
      await storage.setResetAt('errors', 12345);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO usage_resets');
      expect(sql).toContain('ON CONFLICT');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('errors');
      expect(params[1]).toBe(12345);
    });
  });

  describe('queryHistory', () => {
    const histRow = {
      date: '2024-01-01',
      provider: 'anthropic',
      model: 'claude-3-opus',
      personality_id: null,
      input_tokens: 1000,
      output_tokens: 500,
      cached_tokens: 100,
      total_tokens: 1500,
      cost_usd: 0.1,
      calls: 5,
    };

    it('returns mapped history rows without filters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [histRow], rowCount: 1 });
      const result = await storage.queryHistory();
      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2024-01-01');
      expect(result[0].provider).toBe('anthropic');
      expect(result[0].inputTokens).toBe(1000);
      expect(result[0].calls).toBe(5);
    });

    it('filters by from and to timestamps', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.queryHistory({ from: 1000, to: 9999 });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('recorded_at >=');
      expect(sql).toContain('recorded_at <=');
    });

    it('filters by provider', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.queryHistory({ provider: 'openai' });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('provider =');
    });

    it('filters by model (ILIKE)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.queryHistory({ model: 'gpt' });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('ILIKE');
    });

    it('filters by personalityId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.queryHistory({ personalityId: 'pers-1' });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('personality_id =');
    });

    it('uses hour groupBy', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.queryHistory({ groupBy: 'hour' });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('HH24');
    });

    it('defaults to day groupBy', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.queryHistory({});
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("'YYYY-MM-DD'");
    });
  });

  describe('prune', () => {
    it('deletes old records and errors', async () => {
      await storage.prune();
      const calls = mockQuery.mock.calls.map((c: any[]) => c[0] as string);
      expect(calls.some((sql) => sql.includes('DELETE FROM usage_records'))).toBe(true);
      expect(calls.some((sql) => sql.includes('DELETE FROM usage_error_records'))).toBe(true);
    });
  });
});
