import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────

let mockQuery: ReturnType<typeof vi.fn>;

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: (...args: any[]) => mockQuery(...args) }),
}));

vi.mock('../utils/crypto.js', () => ({
  uuidv7: vi.fn().mockReturnValue('test-uuid'),
}));

// ─── Test Data ────────────────────────────────────────────────

const passionRow = {
  id: 'passion-1',
  personality_id: null,
  name: 'Music',
  description: 'Loves music',
  intensity: 0.9,
  is_active: true,
  created_at: 1000,
  updated_at: 2000,
};

const inspirationRow = {
  id: 'insp-1',
  personality_id: null,
  source: 'Nature',
  description: 'Inspired by sunsets',
  impact: 0.8,
  is_active: true,
  created_at: 1000,
  updated_at: 2000,
};

const painRow = {
  id: 'pain-1',
  personality_id: null,
  trigger_name: 'Loud noises',
  description: 'Dislikes loud noises',
  severity: 0.6,
  is_active: true,
  created_at: 1000,
  updated_at: 2000,
};

// ─── Tests ────────────────────────────────────────────────────

import { SpiritStorage } from './storage.js';

describe('SpiritStorage', () => {
  let storage: SpiritStorage;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    storage = new SpiritStorage();
  });

  // ── Passions ──────────────────────────────────────────────

  describe('createPassion', () => {
    it('inserts and returns the passion', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [passionRow], rowCount: 1 });

      const p = await storage.createPassion({ name: 'Music', isActive: true });
      expect(p.id).toBe('passion-1');
      expect(p.name).toBe('Music');
      expect(p.isActive).toBe(true);
    });

    it('throws when re-select fails', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(storage.createPassion({ name: 'x', isActive: true })).rejects.toThrow(
        'Failed to retrieve passion after insert'
      );
    });

    it('passes personalityId when provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [passionRow], rowCount: 1 });

      await storage.createPassion({ name: 'Music', isActive: true }, 'pid-1');
      const params = mockQuery.mock.calls[0][1];
      expect(params[1]).toBe('pid-1');
    });
  });

  describe('getPassion', () => {
    it('returns passion when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [passionRow], rowCount: 1 });
      const p = await storage.getPassion('passion-1');
      expect(p?.name).toBe('Music');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.getPassion('missing')).toBeNull();
    });
  });

  describe('updatePassion', () => {
    it('throws if passion not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(storage.updatePassion('missing', { name: 'x' })).rejects.toThrow(
        'Passion not found'
      );
    });

    it('updates and returns the updated passion', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [passionRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ ...passionRow, name: 'Art' }], rowCount: 1 });

      const p = await storage.updatePassion('passion-1', { name: 'Art' });
      expect(p.name).toBe('Art');
    });
  });

  describe('deletePassion', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      expect(await storage.deletePassion('passion-1')).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.deletePassion('missing')).toBe(false);
    });
  });

  describe('listPassions', () => {
    it('returns all passions without personalityId filter', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [passionRow], rowCount: 1 });

      const result = await storage.listPassions();
      expect(result.total).toBe(1);
      expect(result.passions[0].name).toBe('Music');
    });

    it('filters by personalityId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [passionRow], rowCount: 1 });

      await storage.listPassions('pid-1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('personality_id = $1');
    });
  });

  describe('getActivePassions', () => {
    it('returns active passions', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [passionRow], rowCount: 1 });
      const passions = await storage.getActivePassions();
      expect(passions).toHaveLength(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('is_active = true');
    });

    it('filters by personalityId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.getActivePassions('pid-1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('personality_id = $1');
    });
  });

  // ── Inspirations ──────────────────────────────────────────

  describe('createInspiration', () => {
    it('inserts and returns the inspiration', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [inspirationRow], rowCount: 1 });

      const i = await storage.createInspiration({ source: 'Nature', isActive: true });
      expect(i.source).toBe('Nature');
    });
  });

  describe('getInspiration', () => {
    it('returns inspiration when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [inspirationRow], rowCount: 1 });
      expect((await storage.getInspiration('insp-1'))?.source).toBe('Nature');
    });
  });

  describe('updateInspiration', () => {
    it('throws if not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(storage.updateInspiration('missing', {})).rejects.toThrow(
        'Inspiration not found'
      );
    });
  });

  describe('deleteInspiration', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      expect(await storage.deleteInspiration('insp-1')).toBe(true);
    });
  });

  describe('listInspirations', () => {
    it('returns inspirations and total', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [inspirationRow], rowCount: 1 });

      const result = await storage.listInspirations();
      expect(result.total).toBe(1);
    });
  });

  // ── Pains ─────────────────────────────────────────────────

  describe('createPain', () => {
    it('inserts and returns the pain', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [painRow], rowCount: 1 });

      const p = await storage.createPain({ trigger: 'Loud noises', isActive: true });
      expect(p.trigger).toBe('Loud noises');
    });
  });

  describe('getPain', () => {
    it('returns pain when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [painRow], rowCount: 1 });
      expect((await storage.getPain('pain-1'))?.trigger).toBe('Loud noises');
    });
  });

  describe('updatePain', () => {
    it('throws if not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(storage.updatePain('missing', {})).rejects.toThrow('Pain not found');
    });
  });

  describe('deletePain', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      expect(await storage.deletePain('pain-1')).toBe(true);
    });
  });

  describe('listPains', () => {
    it('returns pains and total', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [painRow], rowCount: 1 });

      const result = await storage.listPains();
      expect(result.total).toBe(1);
      expect(result.pains[0].trigger).toBe('Loud noises');
    });
  });

  describe('getActivePains', () => {
    it('returns active pains', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [painRow], rowCount: 1 });
      const pains = await storage.getActivePains();
      expect(pains).toHaveLength(1);
    });
  });

  // ── Spirit Meta ───────────────────────────────────────────

  describe('getMeta', () => {
    it('returns value when key exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ value: 'test-val' }], rowCount: 1 });
      expect(await storage.getMeta('some-key')).toBe('test-val');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.getMeta('missing')).toBeNull();
    });
  });

  describe('setMeta', () => {
    it('upserts the meta value', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await storage.setMeta('key', 'value');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('ON CONFLICT(key)');
    });
  });
});
