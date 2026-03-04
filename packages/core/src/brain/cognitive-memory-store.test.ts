import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: mockQuery }),
}));

const { CognitiveMemoryStorage } = await import('./cognitive-memory-store.js');

describe('CognitiveMemoryStorage', () => {
  let store: InstanceType<typeof CognitiveMemoryStorage>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new CognitiveMemoryStorage();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  describe('recordDocumentAccess', () => {
    it('increments access_count and updates last_accessed', async () => {
      await store.recordDocumentAccess('doc-1');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE brain.documents'),
        expect.arrayContaining(['doc-1'])
      );
    });
  });

  describe('recordSkillAccess', () => {
    it('increments access_count and updates last_accessed', async () => {
      await store.recordSkillAccess('skill-1');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE brain.skills'),
        expect.arrayContaining(['skill-1'])
      );
    });
  });

  describe('recordMemoryAccess', () => {
    it('increments access_count and updates last_accessed_at', async () => {
      await store.recordMemoryAccess('mem-1');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE brain.memories'),
        expect.arrayContaining(['mem-1'])
      );
    });
  });

  describe('recordCoActivation', () => {
    it('upserts association with consistent ordering', async () => {
      await store.recordCoActivation('b-id', 'a-id', 0.1);
      // Should order: a-id < b-id
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO brain.associations'),
        expect.arrayContaining(['a-id', 'b-id', 0.1])
      );
    });

    it('caps weight at 1.0 via SQL LEAST', async () => {
      await store.recordCoActivation('x', 'y', 0.5);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('LEAST');
    });
  });

  describe('getAssociations', () => {
    it('returns mapped associations', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            source_id: 'a',
            target_id: 'b',
            weight: 0.8,
            co_activation_count: 5,
            updated_at: '1709500000000',
          },
        ],
        rowCount: 1,
      });

      const result = await store.getAssociations('a', { limit: 10, minWeight: 0.1 });
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        sourceId: 'a',
        targetId: 'b',
        weight: 0.8,
        coActivationCount: 5,
        updatedAt: 1709500000000,
      });
    });

    it('uses default limit and minWeight', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      await store.getAssociations('x');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['x', 0, 20]
      );
    });
  });

  describe('getTopAssociatedIds', () => {
    it('returns empty map for empty sourceIds', async () => {
      const result = await store.getTopAssociatedIds([], 10);
      expect(result.size).toBe(0);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns aggregated weights', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { related_id: 'r1', total_weight: 1.5 },
          { related_id: 'r2', total_weight: 0.8 },
        ],
        rowCount: 2,
      });

      const result = await store.getTopAssociatedIds(['a', 'b'], 10);
      expect(result.get('r1')).toBe(1.5);
      expect(result.get('r2')).toBe(0.8);
    });
  });

  describe('decayAssociations', () => {
    it('multiplies weights and deletes near-zero', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // UPDATE
        .mockResolvedValueOnce({ rows: [], rowCount: 3 });  // DELETE

      const deleted = await store.decayAssociations(0.9);
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery.mock.calls[0][0]).toContain('UPDATE');
      expect(mockQuery.mock.calls[1][0]).toContain('DELETE');
      expect(deleted).toBe(3);
    });
  });

  describe('updateDocumentConfidence', () => {
    it('updates confidence column', async () => {
      await store.updateDocumentConfidence('doc-1', 0.75);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE brain.documents SET confidence'),
        ['doc-1', 0.75]
      );
    });
  });

  describe('getDocumentActivation', () => {
    it('returns activation score', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ score: 2.5 }],
        rowCount: 1,
      });
      const score = await store.getDocumentActivation('doc-1');
      expect(score).toBe(2.5);
    });

    it('returns null for missing document', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const score = await store.getDocumentActivation('missing');
      expect(score).toBeNull();
    });
  });

  describe('getMemoryActivation', () => {
    it('returns activation score', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ score: 1.8 }],
        rowCount: 1,
      });
      const score = await store.getMemoryActivation('mem-1');
      expect(score).toBe(1.8);
    });
  });

  describe('getCognitiveStats', () => {
    it('returns aggregated stats', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'm1', activation: 3.0 }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'd1', activation: 2.0 }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ cnt: '42', avg_weight: 0.65 }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{ day: '2026-03-01', count: '10' }],
          rowCount: 1,
        });

      const stats = await store.getCognitiveStats();
      expect(stats.topMemories).toEqual([{ id: 'm1', activation: 3.0 }]);
      expect(stats.topDocuments).toEqual([{ id: 'd1', activation: 2.0 }]);
      expect(stats.associationCount).toBe(42);
      expect(stats.avgAssociationWeight).toBe(0.65);
      expect(stats.accessTrend).toEqual([{ day: '2026-03-01', count: 10 }]);
    });

    it('filters by personalityId when provided', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      await store.getCognitiveStats('pid-1');

      // First two queries should include personality filter
      const q1 = mockQuery.mock.calls[0][0] as string;
      expect(q1).toContain('personality_id');
    });
  });
});
