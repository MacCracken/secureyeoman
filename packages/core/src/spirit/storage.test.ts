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

  // ── Additional branch coverage ─────────────────────────────────

  describe('createPassion — default values', () => {
    it('uses default intensity and description when not provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [passionRow], rowCount: 1 });

      await storage.createPassion({ name: 'Test', isActive: false });
      const params = mockQuery.mock.calls[0][1];
      expect(params[3]).toBe(''); // description defaults to ''
      expect(params[4]).toBe(0.5); // intensity defaults to 0.5
      expect(params[5]).toBe(false); // isActive passed through
    });
  });

  describe('updatePassion — partial updates', () => {
    it('preserves existing values when not provided in update', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [passionRow], rowCount: 1 }) // get existing
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // execute update
        .mockResolvedValueOnce({ rows: [passionRow], rowCount: 1 }); // get after update

      await storage.updatePassion('passion-1', {}); // empty update
      const params = mockQuery.mock.calls[1][1];
      expect(params[0]).toBe('Music'); // existing name preserved
      expect(params[1]).toBe('Loves music'); // existing description preserved
      expect(params[2]).toBe(0.9); // existing intensity preserved
      expect(params[3]).toBe(true); // existing isActive preserved
    });

    it('throws when re-select after update fails', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [passionRow], rowCount: 1 }) // get existing
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // execute update
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // re-select fails

      await expect(storage.updatePassion('passion-1', { name: 'New' })).rejects.toThrow(
        'Failed to retrieve passion after update'
      );
    });

    it('updates isActive to false when explicitly provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [passionRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ ...passionRow, is_active: false }], rowCount: 1 });

      await storage.updatePassion('passion-1', { isActive: false });
      const params = mockQuery.mock.calls[1][1];
      expect(params[3]).toBe(false);
    });
  });

  describe('listPassions — pagination', () => {
    it('uses custom limit and offset', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await storage.listPassions(undefined, { limit: 20, offset: 10 });
      const params = mockQuery.mock.calls[1][1];
      expect(params[0]).toBe(20);
      expect(params[1]).toBe(10);
    });

    it('returns 0 total when count is null', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{}], rowCount: 1 }) // count is undefined
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await storage.listPassions();
      expect(result.total).toBe(0);
    });
  });

  describe('getPassionCount', () => {
    it('returns count', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '42' }], rowCount: 1 });
      expect(await storage.getPassionCount()).toBe(42);
    });

    it('returns 0 when no rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.getPassionCount()).toBe(0);
    });
  });

  // ── Inspiration branch coverage ────────────────────────────────

  describe('createInspiration — defaults', () => {
    it('uses default impact and description', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [inspirationRow], rowCount: 1 });

      await storage.createInspiration({ source: 'Art', isActive: true });
      const params = mockQuery.mock.calls[0][1];
      expect(params[3]).toBe(''); // description
      expect(params[4]).toBe(0.5); // impact
    });

    it('passes personalityId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [inspirationRow], rowCount: 1 });

      await storage.createInspiration({ source: 'Art', isActive: true }, 'pid-2');
      const params = mockQuery.mock.calls[0][1];
      expect(params[1]).toBe('pid-2');
    });

    it('throws when re-select fails', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(storage.createInspiration({ source: 'x', isActive: true })).rejects.toThrow(
        'Failed to retrieve inspiration after insert'
      );
    });
  });

  describe('getInspiration — not found', () => {
    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.getInspiration('missing')).toBeNull();
    });
  });

  describe('updateInspiration — partial updates', () => {
    it('updates and returns the updated inspiration', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [inspirationRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ ...inspirationRow, source: 'Art' }], rowCount: 1 });

      const result = await storage.updateInspiration('insp-1', { source: 'Art' });
      expect(result.source).toBe('Art');
    });

    it('preserves existing values with empty update', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [inspirationRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [inspirationRow], rowCount: 1 });

      await storage.updateInspiration('insp-1', {});
      const params = mockQuery.mock.calls[1][1];
      expect(params[0]).toBe('Nature'); // existing source preserved
      expect(params[3]).toBe(true); // existing isActive preserved
    });

    it('throws when re-select after update fails', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [inspirationRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(storage.updateInspiration('insp-1', { source: 'New' })).rejects.toThrow(
        'Failed to retrieve inspiration after update'
      );
    });

    it('updates isActive to false', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [inspirationRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ ...inspirationRow, is_active: false }], rowCount: 1 });

      await storage.updateInspiration('insp-1', { isActive: false });
      const params = mockQuery.mock.calls[1][1];
      expect(params[3]).toBe(false);
    });
  });

  describe('deleteInspiration — not found', () => {
    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.deleteInspiration('missing')).toBe(false);
    });
  });

  describe('listInspirations — with personalityId', () => {
    it('filters by personalityId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [inspirationRow], rowCount: 1 });

      await storage.listInspirations('pid-1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('personality_id = $1');
    });

    it('uses custom limit and offset', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await storage.listInspirations(undefined, { limit: 5, offset: 2 });
      const params = mockQuery.mock.calls[1][1];
      expect(params[0]).toBe(5);
      expect(params[1]).toBe(2);
    });
  });

  describe('getActiveInspirations', () => {
    it('filters by personalityId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.getActiveInspirations('pid-1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('personality_id = $1');
    });
  });

  describe('getInspirationCount', () => {
    it('returns count', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '7' }], rowCount: 1 });
      expect(await storage.getInspirationCount()).toBe(7);
    });

    it('returns 0 when no rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.getInspirationCount()).toBe(0);
    });
  });

  // ── Pain branch coverage ───────────────────────────────────────

  describe('createPain — defaults', () => {
    it('uses default severity and description', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [painRow], rowCount: 1 });

      await storage.createPain({ trigger: 'Noise', isActive: true });
      const params = mockQuery.mock.calls[0][1];
      expect(params[3]).toBe(''); // description
      expect(params[4]).toBe(0.5); // severity
    });

    it('passes personalityId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [painRow], rowCount: 1 });

      await storage.createPain({ trigger: 'Noise', isActive: true }, 'pid-3');
      const params = mockQuery.mock.calls[0][1];
      expect(params[1]).toBe('pid-3');
    });

    it('throws when re-select fails', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(storage.createPain({ trigger: 'x', isActive: true })).rejects.toThrow(
        'Failed to retrieve pain after insert'
      );
    });
  });

  describe('getPain — not found', () => {
    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.getPain('missing')).toBeNull();
    });
  });

  describe('updatePain — partial updates', () => {
    it('updates and returns', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [painRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ ...painRow, trigger_name: 'Silence' }], rowCount: 1 });

      const result = await storage.updatePain('pain-1', { trigger: 'Silence' });
      expect(result.trigger).toBe('Silence');
    });

    it('preserves existing values with empty update', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [painRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [painRow], rowCount: 1 });

      await storage.updatePain('pain-1', {});
      const params = mockQuery.mock.calls[1][1];
      expect(params[0]).toBe('Loud noises'); // existing trigger
      expect(params[3]).toBe(true); // existing isActive
    });

    it('throws when re-select after update fails', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [painRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(storage.updatePain('pain-1', { trigger: 'New' })).rejects.toThrow(
        'Failed to retrieve pain after update'
      );
    });

    it('updates isActive to false', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [painRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ ...painRow, is_active: false }], rowCount: 1 });

      await storage.updatePain('pain-1', { isActive: false });
      const params = mockQuery.mock.calls[1][1];
      expect(params[3]).toBe(false);
    });
  });

  describe('deletePain — not found', () => {
    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.deletePain('missing')).toBe(false);
    });
  });

  describe('listPains — with personalityId', () => {
    it('filters by personalityId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [painRow], rowCount: 1 });

      await storage.listPains('pid-1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('personality_id = $1');
    });

    it('uses custom limit and offset', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await storage.listPains(undefined, { limit: 3, offset: 1 });
      const params = mockQuery.mock.calls[1][1];
      expect(params[0]).toBe(3);
      expect(params[1]).toBe(1);
    });
  });

  describe('getActivePains — with personalityId', () => {
    it('filters by personalityId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.getActivePains('pid-1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('personality_id = $1');
    });
  });

  describe('getPainCount', () => {
    it('returns count', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '15' }], rowCount: 1 });
      expect(await storage.getPainCount()).toBe(15);
    });

    it('returns 0 when no rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.getPainCount()).toBe(0);
    });
  });
});
