import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock pg-pool ─────────────────────────────────────────────

let mockQuery: ReturnType<typeof vi.fn>;
let mockConnect: ReturnType<typeof vi.fn>;
let mockClient: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };

vi.mock('./pg-pool.js', () => ({
  getPool: () => ({
    query: (...args: any[]) => mockQuery(...args),
    connect: () => mockConnect(),
  }),
}));

// ─── Tests ────────────────────────────────────────────────────

import { PgBaseStorage } from './pg-base.js';

// Expose protected methods via subclass
class TestStorage extends PgBaseStorage {
  testQuery<T>(text: string, values?: unknown[]) {
    return this.query<any>(text, values);
  }
  testQueryOne<T>(text: string, values?: unknown[]) {
    return this.queryOne<any>(text, values);
  }
  testQueryMany<T>(text: string, values?: unknown[]) {
    return this.queryMany<any>(text, values);
  }
  testExecute(text: string, values?: unknown[]) {
    return this.execute(text, values);
  }
  testWithTransaction<T>(fn: (client: any) => Promise<T>) {
    return this.withTransaction(fn);
  }
}

describe('PgBaseStorage', () => {
  let storage: TestStorage;

  beforeEach(() => {
    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: vi.fn(),
    };
    mockConnect = vi.fn().mockResolvedValue(mockClient);
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    storage = new TestStorage();
  });

  describe('query', () => {
    it('delegates to pool.query with text and values', async () => {
      await storage.testQuery('SELECT 1', [42]);
      expect(mockQuery).toHaveBeenCalledWith('SELECT 1', [42]);
    });

    it('returns the raw QueryResult', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 });
      const result = await storage.testQuery('SELECT * FROM foo');
      expect(result.rows[0]).toEqual({ id: 1 });
    });
  });

  describe('queryOne', () => {
    it('returns the first row when present', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'abc' }, { id: 'def' }], rowCount: 2 });
      const row = await storage.testQueryOne('SELECT * FROM foo WHERE id = $1', ['abc']);
      expect(row).toEqual({ id: 'abc' });
    });

    it('returns null when no rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const row = await storage.testQueryOne('SELECT * FROM foo WHERE id = $1', ['missing']);
      expect(row).toBeNull();
    });
  });

  describe('queryMany', () => {
    it('returns all rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }], rowCount: 2 });
      const rows = await storage.testQueryMany('SELECT * FROM foo');
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({ id: 1 });
    });

    it('returns empty array when no rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const rows = await storage.testQueryMany('SELECT * FROM foo WHERE 1=0');
      expect(rows).toEqual([]);
    });
  });

  describe('execute', () => {
    it('returns rowCount', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 3 });
      const count = await storage.testExecute('DELETE FROM foo WHERE active = false');
      expect(count).toBe(3);
    });

    it('returns 0 when rowCount is null', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: null });
      const count = await storage.testExecute('DELETE FROM foo');
      expect(count).toBe(0);
    });
  });

  describe('withTransaction', () => {
    it('calls BEGIN, runs fn, calls COMMIT, and releases client', async () => {
      const fn = vi.fn().mockResolvedValue('result');
      const result = await storage.testWithTransaction(fn);

      expect(mockConnect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(fn).toHaveBeenCalledWith(mockClient);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    it('calls ROLLBACK and rethrows when fn throws', async () => {
      const error = new Error('something went wrong');
      const fn = vi.fn().mockRejectedValue(error);

      await expect(storage.testWithTransaction(fn)).rejects.toThrow('something went wrong');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('releases client even when ROLLBACK throws', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(new Error('rollback error')); // ROLLBACK

      const fn = vi.fn().mockRejectedValue(new Error('fn error'));

      await expect(storage.testWithTransaction(fn)).rejects.toThrow();
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('is a no-op (pool lifecycle managed globally)', () => {
      expect(() => storage.close()).not.toThrow();
    });
  });
});
