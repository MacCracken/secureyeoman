import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FaissVectorStore } from './faiss-store.js';

// ─── Hoisted mocks ────────────────────────────────────────────

const {
  mockIndex,
  MockIndexFlatL2,
  mockMkdirSync,
  mockExistsSync,
  mockReadFileSync,
  mockWriteFileSync,
} = vi.hoisted(() => {
  const mockIndex = {
    add: vi.fn(),
    ntotal: vi.fn().mockReturnValue(0),
    search: vi.fn().mockReturnValue({ distances: [], labels: [] }),
    write: vi.fn(),
    reconstruct: vi.fn().mockReturnValue([0.1, 0.2, 0.3]),
  };

  const MockIndexFlatL2 = vi.fn().mockImplementation(function () {
    return mockIndex;
  });
  (MockIndexFlatL2 as any).read = vi.fn().mockReturnValue(mockIndex);

  return {
    mockIndex,
    MockIndexFlatL2,
    mockMkdirSync: vi.fn(),
    mockExistsSync: vi.fn().mockReturnValue(false),
    mockReadFileSync: vi
      .fn()
      .mockReturnValue(JSON.stringify({ idToIndex: {}, indexToId: {}, nextIndex: 0 })),
    mockWriteFileSync: vi.fn(),
  };
});

vi.mock('faiss-node', () => ({ IndexFlatL2: MockIndexFlatL2 }));

vi.mock('fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('fs')>();
  return {
    ...original,
    mkdirSync: mockMkdirSync,
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
  };
});

// ─── Tests ────────────────────────────────────────────────────

describe('FaissVectorStore', () => {
  let store: FaissVectorStore;

  beforeEach(() => {
    // Reset mock state
    mockIndex.add.mockClear();
    mockIndex.ntotal.mockClear().mockReturnValue(0);
    mockIndex.search.mockClear().mockReturnValue({ distances: [], labels: [] });
    mockIndex.write.mockClear();
    mockIndex.reconstruct.mockClear().mockReturnValue([0.1, 0.2, 0.3]);
    MockIndexFlatL2.mockClear();
    (MockIndexFlatL2 as any).read.mockClear().mockReturnValue(mockIndex);
    mockMkdirSync.mockClear();
    mockExistsSync.mockClear().mockReturnValue(false);
    mockReadFileSync
      .mockClear()
      .mockReturnValue(JSON.stringify({ idToIndex: {}, indexToId: {}, nextIndex: 0 }));
    mockWriteFileSync.mockClear();

    store = new FaissVectorStore(3, '/tmp/test-faiss');
  });

  describe('initialization', () => {
    it('creates new index when no persisted files exist', async () => {
      mockExistsSync.mockReturnValue(false);
      await store.insert('id-1', [0.1, 0.2, 0.3]);
      expect(MockIndexFlatL2).toHaveBeenCalledWith(3);
      expect((MockIndexFlatL2 as any).read).not.toHaveBeenCalled();
    });

    it('loads from disk when index and sidecar exist', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ idToIndex: { 'id-1': 0 }, indexToId: { '0': 'id-1' }, nextIndex: 1 })
      );

      const diskStore = new FaissVectorStore(3, '/tmp/test-faiss');
      await diskStore.count();
      expect((MockIndexFlatL2 as any).read).toHaveBeenCalled();
    });
  });

  describe('insert', () => {
    it('inserts a vector and persists to disk', async () => {
      await store.insert('id-1', [1, 0, 0]);
      expect(mockIndex.add).toHaveBeenCalledWith(expect.any(Array));
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it('normalizes the vector before adding (magnitude 5 → 0.6, 0.8)', async () => {
      await store.insert('id-1', [3, 4, 0]);
      const addedVector = mockIndex.add.mock.calls[0][0] as number[];
      expect(addedVector[0]).toBeCloseTo(0.6);
      expect(addedVector[1]).toBeCloseTo(0.8);
    });

    it('does not normalize zero vector', async () => {
      await store.insert('id-1', [0, 0, 0]);
      const addedVector = mockIndex.add.mock.calls[0][0] as number[];
      expect(addedVector).toEqual([0, 0, 0]);
    });

    it('deletes existing entry before re-inserting same id', async () => {
      await store.insert('id-1', [1, 0, 0]);
      // Second insert with same id — should not error
      await store.insert('id-1', [0, 1, 0]);
      expect(mockIndex.add).toHaveBeenCalledTimes(2);
    });
  });

  describe('insertBatch', () => {
    it('inserts multiple vectors and persists once', async () => {
      await store.insertBatch([
        { id: 'a', vector: [1, 0, 0] },
        { id: 'b', vector: [0, 1, 0] },
      ]);
      expect(mockIndex.add).toHaveBeenCalledTimes(2);
      expect(mockWriteFileSync).toHaveBeenCalled();
    });
  });

  describe('search', () => {
    it('returns empty array when no vectors in index', async () => {
      mockIndex.ntotal.mockReturnValue(0);
      await store.insert('id-1', [1, 0, 0]); // initialize
      mockIndex.ntotal.mockReturnValue(0); // but report 0
      const results = await store.search([1, 0, 0], 5);
      expect(results).toEqual([]);
    });

    it('returns results mapped from FAISS output', async () => {
      await store.insert('id-1', [1, 0, 0]);
      mockIndex.ntotal.mockReturnValue(1);
      mockIndex.search.mockReturnValue({ distances: [0.1], labels: [0] });

      const results = await store.search([1, 0, 0], 5);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('id-1');
      expect(results[0].score).toBeCloseTo(0.95); // 1 - 0.1/2
    });

    it('filters out results below threshold', async () => {
      await store.insert('id-1', [1, 0, 0]);
      mockIndex.ntotal.mockReturnValue(1);
      mockIndex.search.mockReturnValue({ distances: [2.0], labels: [0] }); // similarity = 0

      const results = await store.search([1, 0, 0], 5, 0.5);
      expect(results).toHaveLength(0);
    });

    it('skips -1 labels (FAISS padding for empty slots)', async () => {
      await store.insert('id-1', [1, 0, 0]);
      mockIndex.ntotal.mockReturnValue(1);
      mockIndex.search.mockReturnValue({ distances: [0.1], labels: [-1] });

      const results = await store.search([1, 0, 0], 5);
      expect(results).toHaveLength(0);
    });

    it('sorts results by score descending', async () => {
      await store.insert('id-1', [1, 0, 0]);
      await store.insert('id-2', [0, 1, 0]);
      mockIndex.ntotal.mockReturnValue(2);
      mockIndex.search.mockReturnValue({ distances: [0.5, 0.1], labels: [0, 1] });

      const results = await store.search([1, 0, 0], 5);
      expect(results.length).toBe(2);
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });
  });

  describe('delete', () => {
    it('returns false when id does not exist in sidecar', async () => {
      // delete() doesn't need ensureInitialized since it checks sidecar first
      const result = await store.delete('nonexistent');
      expect(result).toBe(false);
    });

    it('returns true and marks deleted in sidecar', async () => {
      await store.insert('id-1', [1, 0, 0]);
      const result = await store.delete('id-1');
      expect(result).toBe(true);
      expect(mockWriteFileSync).toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('resets index and sidecar to empty state', async () => {
      await store.insert('id-1', [1, 0, 0]);
      await store.clear();
      // One call for init, one for insert, one for clear
      expect(MockIndexFlatL2).toHaveBeenCalledWith(3);
      const count = await store.count();
      expect(count).toBe(0);
    });
  });

  describe('compact', () => {
    it('rebuilds index with only live (non-deleted) vectors', async () => {
      await store.insert('id-1', [1, 0, 0]);
      await store.insert('id-2', [0, 1, 0]);
      await store.delete('id-1');
      await store.compact();
      // After compact, deleted count resets
      expect(store.getDeletedCount()).toBe(0);
    });

    it('handles reconstruct errors gracefully without throwing', async () => {
      await store.insert('id-1', [1, 0, 0]);
      mockIndex.reconstruct.mockImplementationOnce(() => {
        throw new Error('reconstruct failed');
      });
      await expect(store.compact()).resolves.not.toThrow();
    });
  });

  describe('count', () => {
    it('returns 0 for empty store', async () => {
      await store.insert('id-1', [1, 0, 0]); // initialize
      await store.delete('id-1');
      const count = await store.count();
      expect(count).toBe(0);
    });

    it('returns number of live vectors', async () => {
      await store.insert('id-1', [1, 0, 0]);
      await store.insert('id-2', [0, 1, 0]);
      const count = await store.count();
      expect(count).toBe(2);
    });
  });

  describe('close', () => {
    it('persists to disk and nullifies index', async () => {
      await store.insert('id-1', [1, 0, 0]);
      const writeCallsBefore = mockWriteFileSync.mock.calls.length;
      await store.close();
      expect(mockWriteFileSync.mock.calls.length).toBeGreaterThan(writeCallsBefore);
    });

    it('is no-op when not yet initialized', async () => {
      await store.close(); // should not throw
    });
  });

  describe('getDeletedCount', () => {
    it('returns 0 before any deletions', async () => {
      expect(store.getDeletedCount()).toBe(0);
    });

    it('increments with each delete', async () => {
      await store.insert('id-1', [1, 0, 0]);
      await store.delete('id-1');
      expect(store.getDeletedCount()).toBe(1);
    });

    it('resets to 0 after compact', async () => {
      await store.insert('id-1', [1, 0, 0]);
      await store.delete('id-1');
      await store.compact();
      expect(store.getDeletedCount()).toBe(0);
    });
  });
});
