import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QdrantVectorStore } from './qdrant-store.js';

// ─── Hoisted mock for @qdrant/js-client-rest ──────────────────

const { mockQdrantClient, MockQdrantClient } = vi.hoisted(() => {
  const mockQdrantClient = {
    getCollection: vi.fn().mockResolvedValue({ points_count: 5 }),
    createCollection: vi.fn().mockResolvedValue({}),
    upsert: vi.fn().mockResolvedValue({}),
    search: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue({}),
  };

  const MockQdrantClient = vi.fn().mockImplementation(function() { return mockQdrantClient; });
  return { mockQdrantClient, MockQdrantClient };
});

vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: MockQdrantClient,
}));

// ─── Tests ────────────────────────────────────────────────────

describe('QdrantVectorStore', () => {
  let store: QdrantVectorStore;

  beforeEach(() => {
    mockQdrantClient.getCollection.mockClear().mockResolvedValue({ points_count: 5 });
    mockQdrantClient.createCollection.mockClear().mockResolvedValue({});
    mockQdrantClient.upsert.mockClear().mockResolvedValue({});
    mockQdrantClient.search.mockClear().mockResolvedValue([]);
    mockQdrantClient.delete.mockClear().mockResolvedValue({});
    MockQdrantClient.mockClear();

    store = new QdrantVectorStore({
      url: 'http://localhost:6333',
      collection: 'test-collection',
      dimensions: 3,
    });
  });

  describe('initialization', () => {
    it('does not create collection when it already exists', async () => {
      await store.insert('id-1', [0.1, 0.2, 0.3]);
      expect(mockQdrantClient.createCollection).not.toHaveBeenCalled();
    });

    it('creates collection if getCollection throws', async () => {
      mockQdrantClient.getCollection.mockRejectedValueOnce(new Error('Not found'));
      await store.insert('id-1', [0.1, 0.2, 0.3]);
      expect(mockQdrantClient.createCollection).toHaveBeenCalledWith(
        'test-collection',
        expect.objectContaining({ vectors: expect.any(Object) })
      );
    });
  });

  describe('healthCheck', () => {
    it('returns true when collection is accessible', async () => {
      const result = await store.healthCheck();
      expect(result).toBe(true);
    });

    it('returns false when unable to connect', async () => {
      mockQdrantClient.getCollection.mockRejectedValue(new Error('Connection refused'));
      const result = await store.healthCheck();
      expect(result).toBe(false);
    });
  });

  describe('insert', () => {
    it('upserts a point with metadata', async () => {
      await store.insert('id-1', [0.1, 0.2, 0.3], { source: 'test' });
      expect(mockQdrantClient.upsert).toHaveBeenCalledWith(
        'test-collection',
        expect.objectContaining({
          points: [{ id: 'id-1', vector: [0.1, 0.2, 0.3], payload: { source: 'test' } }],
        })
      );
    });

    it('uses empty payload when no metadata provided', async () => {
      await store.insert('id-1', [0.1, 0.2, 0.3]);
      const call = mockQdrantClient.upsert.mock.calls[0][1] as any;
      expect(call.points[0].payload).toEqual({});
    });

    it('retries once on connection error (withReconnect)', async () => {
      mockQdrantClient.upsert
        .mockRejectedValueOnce(new Error('Connection lost'))
        .mockResolvedValueOnce({});

      await store.insert('id-1', [0.1, 0.2, 0.3]);
      expect(mockQdrantClient.upsert).toHaveBeenCalledTimes(2);
    });
  });

  describe('insertBatch', () => {
    it('upserts multiple points in one call', async () => {
      await store.insertBatch([
        { id: 'a', vector: [1, 0, 0] },
        { id: 'b', vector: [0, 1, 0], metadata: { tag: 'x' } },
      ]);

      const call = mockQdrantClient.upsert.mock.calls[0][1] as any;
      expect(call.points).toHaveLength(2);
      expect(call.points[0]).toEqual({ id: 'a', vector: [1, 0, 0], payload: {} });
      expect(call.points[1]).toEqual({ id: 'b', vector: [0, 1, 0], payload: { tag: 'x' } });
    });
  });

  describe('search', () => {
    it('returns empty array when no results', async () => {
      mockQdrantClient.search.mockResolvedValueOnce([]);
      const results = await store.search([1, 0, 0], 5);
      expect(results).toEqual([]);
    });

    it('maps Qdrant results to VectorResult shape', async () => {
      mockQdrantClient.search.mockResolvedValueOnce([
        { id: 'id-1', score: 0.95, payload: { source: 'test' } },
        { id: 42, score: 0.80 },
      ]);

      const results = await store.search([1, 0, 0], 5);
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('id-1');
      expect(results[0].score).toBe(0.95);
      expect(results[0].metadata).toEqual({ source: 'test' });
      expect(results[1].id).toBe('42'); // numeric id converted to string
    });

    it('passes limit and score_threshold to Qdrant', async () => {
      await store.search([1, 0, 0], 10, 0.8);
      expect(mockQdrantClient.search).toHaveBeenCalledWith(
        'test-collection',
        expect.objectContaining({ limit: 10, score_threshold: 0.8 })
      );
    });

    it('retries once on connection error', async () => {
      mockQdrantClient.search
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce([]);

      const results = await store.search([1, 0, 0], 5);
      expect(results).toEqual([]);
      expect(mockQdrantClient.search).toHaveBeenCalledTimes(2);
    });
  });

  describe('delete', () => {
    it('returns true when delete succeeds', async () => {
      const result = await store.delete('id-1');
      expect(result).toBe(true);
      expect(mockQdrantClient.delete).toHaveBeenCalledWith(
        'test-collection',
        expect.objectContaining({ points: ['id-1'] })
      );
    });

    it('returns false when delete throws (after withReconnect exhausted)', async () => {
      // Both the original call and the retry fail
      mockQdrantClient.delete.mockRejectedValue(new Error('Not found'));
      // withReconnect also calls ensureInitialized again — mock getCollection for reconnect
      mockQdrantClient.getCollection.mockResolvedValue({ points_count: 0 });
      const result = await store.delete('id-1');
      expect(result).toBe(false);
    });
  });

  describe('count', () => {
    it('returns points_count from collection info', async () => {
      mockQdrantClient.getCollection
        .mockResolvedValueOnce({ points_count: 5 }) // ensureInitialized
        .mockResolvedValueOnce({ points_count: 7 }); // count query

      const count = await store.count();
      expect(count).toBe(7);
    });

    it('returns 0 when points_count is missing', async () => {
      mockQdrantClient.getCollection
        .mockResolvedValueOnce({ points_count: 5 }) // ensureInitialized
        .mockResolvedValueOnce({});                  // count query (no points_count)

      const count = await store.count();
      expect(count).toBe(0);
    });
  });

  describe('close', () => {
    it('resets client and initialized state so next call re-initializes', async () => {
      await store.healthCheck(); // Initialize
      await store.close();
      // After close, client is null → next call initializes again
      await store.healthCheck();
      expect(MockQdrantClient).toHaveBeenCalledTimes(2);
    });
  });
});
