import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RotationStorage } from './rotation-storage.js';

// ─── Mock pg-pool ─────────────────────────────────────────────

let mockQuery: ReturnType<typeof vi.fn>;

vi.mock('../../storage/pg-pool.js', () => ({
  getPool: () => ({ query: (...args: any[]) => mockQuery(...args) }),
}));

// ─── Test Data ────────────────────────────────────────────────

const metaRow = {
  name: 'DB_PASSWORD',
  created_at: 1000,
  expires_at: 90000000,
  rotated_at: 5000,
  rotation_interval_days: 30,
  auto_rotate: true,
  source: 'internal',
  category: 'database',
};

// ─── Tests ────────────────────────────────────────────────────

describe('RotationStorage', () => {
  let storage: RotationStorage;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    storage = new RotationStorage();
  });

  describe('upsert', () => {
    it('inserts or updates secret metadata', async () => {
      await storage.upsert({
        name: 'DB_PASSWORD',
        createdAt: 1000,
        expiresAt: 90000000,
        rotatedAt: 5000,
        rotationIntervalDays: 30,
        autoRotate: true,
        source: 'internal',
        category: 'database',
      });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO rotation.secret_metadata');
      expect(sql).toContain('ON CONFLICT');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('DB_PASSWORD');
      expect(params[5]).toBe(true); // autoRotate
    });
  });

  describe('get', () => {
    it('returns metadata when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [metaRow], rowCount: 1 });
      const result = await storage.get('DB_PASSWORD');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('DB_PASSWORD');
      expect(result!.createdAt).toBe(1000);
      expect(result!.expiresAt).toBe(90000000);
      expect(result!.rotatedAt).toBe(5000);
      expect(result!.rotationIntervalDays).toBe(30);
      expect(result!.autoRotate).toBe(true);
      expect(result!.source).toBe('internal');
      expect(result!.category).toBe('database');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.get('NONEXISTENT');
      expect(result).toBeNull();
    });

    it('maps null optional fields', async () => {
      const row = { ...metaRow, expires_at: null, rotated_at: null, rotation_interval_days: null };
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });
      const result = await storage.get('DB_PASSWORD');
      expect(result!.expiresAt).toBeNull();
      expect(result!.rotatedAt).toBeNull();
      expect(result!.rotationIntervalDays).toBeNull();
    });
  });

  describe('getAll', () => {
    it('returns all metadata records', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [metaRow], rowCount: 1 });
      const result = await storage.getAll();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('DB_PASSWORD');
    });

    it('returns empty array when none', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getAll();
      expect(result).toEqual([]);
    });

    it('queries ordered by name', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.getAll();
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('ORDER BY name');
    });
  });

  describe('updateRotation', () => {
    it('updates rotated_at and expires_at', async () => {
      await storage.updateRotation('DB_PASSWORD', 9999, 99999999);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('rotated_at');
      expect(sql).toContain('expires_at');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe(9999);
      expect(params[1]).toBe(99999999);
      expect(params[2]).toBe('DB_PASSWORD');
    });

    it('accepts null expiresAt', async () => {
      await storage.updateRotation('DB_PASSWORD', 9999, null);
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[1]).toBeNull();
    });
  });

  describe('storePreviousValue', () => {
    it('upserts previous value with expiry', async () => {
      await storage.storePreviousValue('DB_PASSWORD', 'old-secret', 3600000);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO rotation.previous_values');
      expect(sql).toContain('ON CONFLICT');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('DB_PASSWORD');
      expect(params[1]).toBe('old-secret');
      // params[3] should be params[2] + 3600000
      expect(typeof params[2]).toBe('number');
      expect(typeof params[3]).toBe('number');
      expect((params[3] as number) - (params[2] as number)).toBe(3600000);
    });
  });

  describe('getPreviousValue', () => {
    it('returns value when found and not expired', async () => {
      const futureExpiry = Date.now() + 100_000;
      mockQuery.mockResolvedValueOnce({
        rows: [{ value: 'old-secret', expires_at: futureExpiry }],
        rowCount: 1,
      });
      const result = await storage.getPreviousValue('DB_PASSWORD');
      expect(result).toBe('old-secret');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getPreviousValue('NONEXISTENT');
      expect(result).toBeNull();
    });

    it('returns null and clears when expired', async () => {
      const pastExpiry = Date.now() - 1000;
      mockQuery.mockResolvedValueOnce({
        rows: [{ value: 'stale-secret', expires_at: pastExpiry }],
        rowCount: 1,
      });

      const result = await storage.getPreviousValue('DB_PASSWORD');
      expect(result).toBeNull();
      // clearPreviousValue should be called
      const deleteSql = mockQuery.mock.calls[1][0] as string;
      expect(deleteSql).toContain('DELETE FROM rotation.previous_values');
    });
  });

  describe('clearPreviousValue', () => {
    it('deletes previous value for a secret', async () => {
      await storage.clearPreviousValue('DB_PASSWORD');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('DELETE FROM rotation.previous_values');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('DB_PASSWORD');
    });
  });
});
