import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────

let mockQuery: ReturnType<typeof vi.fn>;

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: (...args: any[]) => mockQuery(...args) }),
}));

// ─── Tests ────────────────────────────────────────────────────

import { SystemPreferencesStorage } from './system-preferences-storage.js';

describe('SystemPreferencesStorage', () => {
  let storage: SystemPreferencesStorage;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    storage = new SystemPreferencesStorage();
  });

  describe('init', () => {
    it('creates the system_preferences table if not exists', async () => {
      await storage.init();
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS system_preferences');
    });
  });

  describe('get', () => {
    it('returns value when key exists', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ key: 'model.provider', value: 'anthropic', updated_at: '1000' }],
        rowCount: 1,
      });
      const value = await storage.get('model.provider');
      expect(value).toBe('anthropic');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('WHERE key = $1');
    });

    it('returns null when key does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const value = await storage.get('nonexistent');
      expect(value).toBeNull();
    });
  });

  describe('set', () => {
    it('performs upsert with key and value', async () => {
      await storage.set('model.provider', 'anthropic');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO system_preferences');
      expect(sql).toContain('ON CONFLICT (key)');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('model.provider');
      expect(params[1]).toBe('anthropic');
    });

    it('stores the current timestamp', async () => {
      const before = Date.now();
      await storage.set('key', 'val');
      const after = Date.now();
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[2]).toBeGreaterThanOrEqual(before);
      expect(params[2]).toBeLessThanOrEqual(after);
    });
  });

  describe('delete', () => {
    it('deletes the given key', async () => {
      await storage.delete('model.provider');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('DELETE FROM system_preferences');
      expect(sql).toContain('WHERE key = $1');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('model.provider');
    });
  });

  describe('list', () => {
    it('returns all preferences sorted by key', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { key: 'a', value: '1', updated_at: '1000' },
          { key: 'b', value: '2', updated_at: '2000' },
        ],
        rowCount: 2,
      });

      const result = await storage.list();
      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('a');
      expect(result[0].value).toBe('1');
      expect(result[0].updatedAt).toBe(1000);
      expect(result[1].key).toBe('b');
    });

    it('returns empty array when table is empty', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.list()).toEqual([]);
    });

    it('queries with ORDER BY key ASC', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.list();
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('ORDER BY key ASC');
    });
  });
});
