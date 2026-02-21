import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VectorMemoryManager } from './manager.js';

// ─── Mocks ────────────────────────────────────────────────────

const mockEmbeddingProvider = {
  embed: vi.fn(),
};

const mockVectorStore = {
  insert: vi.fn(),
  insertBatch: vi.fn(),
  search: vi.fn(),
  delete: vi.fn(),
  close: vi.fn(),
};

// ─── Helpers ──────────────────────────────────────────────────

const makeMemory = (id: string) => ({
  id,
  type: 'semantic' as const,
  content: `Content for ${id}`,
  source: 'user',
  context: {},
  importance: 0.7,
  accessCount: 0,
  lastAccessedAt: null,
  expiresAt: null,
  createdAt: 1000,
  updatedAt: 2000,
});

const makeKnowledge = (id: string) => ({
  id,
  topic: 'Testing',
  content: `Knowledge for ${id}`,
  source: 'user',
  confidence: 0.9,
  supersedes: null,
  createdAt: 1000,
  updatedAt: 2000,
});

// ─── Tests ────────────────────────────────────────────────────

describe('VectorMemoryManager', () => {
  let manager: VectorMemoryManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEmbeddingProvider.embed.mockResolvedValue([[0.1, 0.2, 0.3]]);
    mockVectorStore.insert.mockResolvedValue(undefined);
    mockVectorStore.insertBatch.mockResolvedValue(undefined);
    mockVectorStore.search.mockResolvedValue([]);
    mockVectorStore.delete.mockResolvedValue(true);
    mockVectorStore.close.mockResolvedValue(undefined);

    manager = new VectorMemoryManager({
      embeddingProvider: mockEmbeddingProvider as any,
      vectorStore: mockVectorStore as any,
    });
  });

  describe('indexMemory', () => {
    it('embeds memory content and inserts with memory: prefix', async () => {
      const memory = makeMemory('mem-1');
      await manager.indexMemory(memory);

      expect(mockEmbeddingProvider.embed).toHaveBeenCalledWith([memory.content]);
      expect(mockVectorStore.insert).toHaveBeenCalledWith(
        'memory:mem-1',
        [0.1, 0.2, 0.3],
        expect.objectContaining({ type: 'memory', memoryType: 'semantic', source: 'user' })
      );
    });
  });

  describe('indexKnowledge', () => {
    it('embeds "topic: content" text and inserts with knowledge: prefix', async () => {
      const entry = makeKnowledge('know-1');
      await manager.indexKnowledge(entry);

      expect(mockEmbeddingProvider.embed).toHaveBeenCalledWith([
        `${entry.topic}: ${entry.content}`,
      ]);
      expect(mockVectorStore.insert).toHaveBeenCalledWith(
        'knowledge:know-1',
        [0.1, 0.2, 0.3],
        expect.objectContaining({ type: 'knowledge', topic: 'Testing' })
      );
    });
  });

  describe('searchMemories', () => {
    it('embeds query, searches, filters memory: results', async () => {
      mockVectorStore.search.mockResolvedValue([
        { id: 'memory:mem-1', score: 0.95 },
        { id: 'knowledge:know-1', score: 0.90 }, // should be filtered out
        { id: 'memory:mem-2', score: 0.80 },
      ]);

      const results = await manager.searchMemories('test query', 5);
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('mem-1');
      expect(results[1].id).toBe('mem-2');
    });

    it('strips memory: prefix from result ids', async () => {
      mockVectorStore.search.mockResolvedValue([{ id: 'memory:abc-123', score: 0.9 }]);
      const results = await manager.searchMemories('query', 5);
      expect(results[0].id).toBe('abc-123');
    });

    it('respects the limit', async () => {
      mockVectorStore.search.mockResolvedValue([
        { id: 'memory:1', score: 0.9 },
        { id: 'memory:2', score: 0.8 },
        { id: 'memory:3', score: 0.7 },
      ]);
      const results = await manager.searchMemories('query', 2);
      expect(results).toHaveLength(2);
    });

    it('searches with limit*2 to account for filtering', async () => {
      mockVectorStore.search.mockResolvedValue([]);
      await manager.searchMemories('query', 5, 0.8);
      expect(mockVectorStore.search).toHaveBeenCalledWith(
        expect.any(Array),
        10, // limit * 2
        0.8
      );
    });
  });

  describe('searchKnowledge', () => {
    it('filters knowledge: results and strips prefix', async () => {
      mockVectorStore.search.mockResolvedValue([
        { id: 'knowledge:know-1', score: 0.95 },
        { id: 'memory:mem-1', score: 0.90 }, // filtered out
      ]);

      const results = await manager.searchKnowledge('query', 5);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('know-1');
    });
  });

  describe('removeMemory', () => {
    it('deletes with memory: prefix', async () => {
      await manager.removeMemory('mem-1');
      expect(mockVectorStore.delete).toHaveBeenCalledWith('memory:mem-1');
    });
  });

  describe('removeKnowledge', () => {
    it('deletes with knowledge: prefix', async () => {
      await manager.removeKnowledge('know-1');
      expect(mockVectorStore.delete).toHaveBeenCalledWith('knowledge:know-1');
    });
  });

  describe('reindexAll', () => {
    it('returns indexed count of 0 for empty arrays', async () => {
      const result = await manager.reindexAll([], []);
      expect(result.indexed).toBe(0);
    });

    it('batch embeds and inserts memories', async () => {
      const memories = [makeMemory('m1'), makeMemory('m2')];
      mockEmbeddingProvider.embed.mockResolvedValue([
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ]);

      const result = await manager.reindexAll(memories, []);
      expect(result.indexed).toBe(2);
      expect(mockVectorStore.insertBatch).toHaveBeenCalledTimes(1);
    });

    it('batch embeds and inserts knowledge entries', async () => {
      const knowledge = [makeKnowledge('k1'), makeKnowledge('k2')];
      mockEmbeddingProvider.embed.mockResolvedValue([
        [0.1, 0.2],
        [0.3, 0.4],
      ]);

      const result = await manager.reindexAll([], knowledge);
      expect(result.indexed).toBe(2);
      expect(mockVectorStore.insertBatch).toHaveBeenCalled();
    });

    it('handles both memories and knowledge in one call', async () => {
      const memories = [makeMemory('m1')];
      const knowledge = [makeKnowledge('k1')];
      mockEmbeddingProvider.embed.mockResolvedValue([[0.1, 0.2, 0.3]]);

      const result = await manager.reindexAll(memories, knowledge);
      expect(result.indexed).toBe(2);
    });
  });

  describe('close', () => {
    it('closes the vector store', async () => {
      await manager.close();
      expect(mockVectorStore.close).toHaveBeenCalled();
    });
  });
});
