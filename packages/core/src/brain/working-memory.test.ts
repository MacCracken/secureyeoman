/**
 * Tests for Working Memory Buffer / Predictive Pre-Fetch (Phase 125-B)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkingMemoryBuffer, DEFAULT_WORKING_MEMORY_CONFIG } from './working-memory.js';
import type { EmbeddingProvider } from '../ai/embeddings/types.js';
import type { VectorStore, VectorResult } from './vector/types.js';

function createMockEmbedding(): EmbeddingProvider {
  let callCount = 0;
  return {
    name: 'test',
    dimensions: () => 3,
    embed: vi.fn(async (texts: string[]) => {
      return texts.map(() => {
        callCount++;
        const angle = (callCount * Math.PI) / 8;
        return [Math.cos(angle), Math.sin(angle), 0];
      });
    }),
  };
}

function createMockVectorStore(results: VectorResult[] = []): VectorStore {
  return {
    insert: vi.fn(async () => {}),
    insertBatch: vi.fn(async () => {}),
    search: vi.fn(async () => results),
    delete: vi.fn(async () => true),
    count: vi.fn(async () => 0),
    close: vi.fn(async () => {}),
  };
}

describe('WorkingMemoryBuffer', () => {
  let buffer: WorkingMemoryBuffer;
  let mockEmbed: EmbeddingProvider;
  let mockStore: VectorStore;

  beforeEach(() => {
    mockEmbed = createMockEmbedding();
    mockStore = createMockVectorStore();
    buffer = new WorkingMemoryBuffer(mockEmbed, mockStore);
  });

  describe('addItems', () => {
    it('adds items to the buffer', () => {
      buffer.addItems([
        { id: 'a', content: 'alpha', score: 0.9 },
        { id: 'b', content: 'beta', score: 0.8 },
      ]);
      expect(buffer.size).toBe(2);
    });

    it('deduplicates items by ID', () => {
      buffer.addItems([{ id: 'a', content: 'alpha', score: 0.9 }]);
      buffer.addItems([{ id: 'a', content: 'alpha updated', score: 0.95 }]);
      expect(buffer.size).toBe(1);
    });

    it('evicts lowest-score items when over capacity', () => {
      const items = Array.from({ length: 10 }, (_, i) => ({
        id: `item-${i}`,
        content: `content ${i}`,
        score: i * 0.1,
      }));
      buffer = new WorkingMemoryBuffer(mockEmbed, mockStore, { capacity: 5 });
      buffer.addItems(items);
      expect(buffer.size).toBe(5);

      // Should keep highest scoring items
      const ids = buffer.getActiveIds();
      expect(ids).toContain('item-9');
      expect(ids).toContain('item-8');
      expect(ids).not.toContain('item-0');
    });
  });

  describe('recordQuery', () => {
    it('records query embedding in trajectory', async () => {
      await buffer.recordQuery('test query');
      expect(buffer.trajectorySize).toBe(1);
      expect(mockEmbed.embed).toHaveBeenCalledWith(['test query']);
    });

    it('bounds trajectory size', async () => {
      buffer = new WorkingMemoryBuffer(mockEmbed, mockStore, {
        minQueriesForPrediction: 2,
      });
      // maxTrajectory = minQueriesForPrediction * 3 = 6
      for (let i = 0; i < 10; i++) {
        await buffer.recordQuery(`query ${i}`);
      }
      expect(buffer.trajectorySize).toBe(6);
    });
  });

  describe('predictAndPrefetch', () => {
    it('returns 0 when trajectory is too short', async () => {
      const result = await buffer.predictAndPrefetch();
      expect(result).toBe(0);
      expect(mockStore.search).not.toHaveBeenCalled();
    });

    it('searches vector store when trajectory is sufficient', async () => {
      const mockResults: VectorResult[] = [
        { id: 'memory:predicted-1', score: 0.8 },
        { id: 'memory:predicted-2', score: 0.6 },
      ];
      mockStore = createMockVectorStore(mockResults);
      buffer = new WorkingMemoryBuffer(mockEmbed, mockStore, {
        minQueriesForPrediction: 2,
      });

      await buffer.recordQuery('query 1');
      await buffer.recordQuery('query 2');

      const cached = await buffer.predictAndPrefetch();
      expect(mockStore.search).toHaveBeenCalled();
      expect(cached).toBe(2);
      expect(buffer.prefetchSize).toBe(2);
    });

    it('skips items already in the buffer', async () => {
      const mockResults: VectorResult[] = [
        { id: 'memory:existing', score: 0.8 },
        { id: 'memory:new-item', score: 0.6 },
      ];
      mockStore = createMockVectorStore(mockResults);
      buffer = new WorkingMemoryBuffer(mockEmbed, mockStore, {
        minQueriesForPrediction: 2,
      });

      buffer.addItems([{ id: 'existing', content: 'already here', score: 0.9 }]);
      await buffer.recordQuery('q1');
      await buffer.recordQuery('q2');

      const cached = await buffer.predictAndPrefetch();
      expect(cached).toBe(1); // Only new-item, not existing
    });
  });

  describe('has / getActiveIds / getItems', () => {
    it('has() returns true for buffered items', () => {
      buffer.addItems([{ id: 'x', content: 'test', score: 0.5 }]);
      expect(buffer.has('x')).toBe(true);
      expect(buffer.has('y')).toBe(false);
    });

    it('getActiveIds returns all IDs', () => {
      buffer.addItems([
        { id: 'a', content: 'a', score: 0.5 },
        { id: 'b', content: 'b', score: 0.6 },
      ]);
      expect(buffer.getActiveIds()).toEqual(['a', 'b']);
    });

    it('getItems returns copies', () => {
      buffer.addItems([{ id: 'a', content: 'a', score: 0.5 }]);
      const items = buffer.getItems();
      expect(items).toHaveLength(1);
      expect(items[0]!.id).toBe('a');
      expect(items[0]!.source).toBe('retrieval');
    });
  });

  describe('promote', () => {
    it('promotes prefetched item to buffer', async () => {
      const mockResults: VectorResult[] = [
        { id: 'memory:prefetched-1', score: 0.7 },
      ];
      mockStore = createMockVectorStore(mockResults);
      buffer = new WorkingMemoryBuffer(mockEmbed, mockStore, {
        minQueriesForPrediction: 2,
      });

      await buffer.recordQuery('q1');
      await buffer.recordQuery('q2');
      await buffer.predictAndPrefetch();

      expect(buffer.prefetchSize).toBe(1);
      const promoted = buffer.promote('prefetched-1');
      expect(promoted).toBe(true);
      expect(buffer.has('prefetched-1')).toBe(true);
      expect(buffer.prefetchSize).toBe(0);
    });

    it('returns false for unknown ID', () => {
      expect(buffer.promote('nonexistent')).toBe(false);
    });
  });

  describe('clear', () => {
    it('clears buffer, trajectory, and cache', async () => {
      buffer.addItems([{ id: 'a', content: 'a', score: 0.5 }]);
      await buffer.recordQuery('q');
      buffer.clear();
      expect(buffer.size).toBe(0);
      expect(buffer.trajectorySize).toBe(0);
      expect(buffer.prefetchSize).toBe(0);
    });
  });
});
