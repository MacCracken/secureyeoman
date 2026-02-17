/**
 * VectorMemoryManager Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VectorMemoryManager } from './manager.js';
import type { EmbeddingProvider } from '../../ai/embeddings/types.js';
import type { VectorStore, VectorResult } from './types.js';
import type { Memory, KnowledgeEntry } from '../types.js';

function mockEmbedding(): EmbeddingProvider {
  return {
    name: 'mock',
    dimensions: () => 3,
    embed: vi.fn(async (texts: string[]) =>
      texts.map(() => [Math.random(), Math.random(), Math.random()]),
    ),
  };
}

function mockVectorStore(): VectorStore & {
  insert: ReturnType<typeof vi.fn>;
  insertBatch: ReturnType<typeof vi.fn>;
  search: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  return {
    insert: vi.fn(async () => {}),
    insertBatch: vi.fn(async () => {}),
    search: vi.fn(async () => []),
    delete: vi.fn(async () => true),
    count: vi.fn(async () => 0),
    close: vi.fn(async () => {}),
  };
}

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: 'mem-1',
    type: 'semantic',
    content: 'Test memory content',
    source: 'test',
    context: {},
    importance: 0.5,
    accessCount: 0,
    lastAccessedAt: null,
    expiresAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeKnowledge(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: 'know-1',
    topic: 'test-topic',
    content: 'Test knowledge content',
    source: 'test',
    confidence: 0.9,
    supersedes: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('VectorMemoryManager', () => {
  let manager: VectorMemoryManager;
  let embedding: EmbeddingProvider;
  let store: ReturnType<typeof mockVectorStore>;

  beforeEach(() => {
    embedding = mockEmbedding();
    store = mockVectorStore();
    manager = new VectorMemoryManager({
      embeddingProvider: embedding,
      vectorStore: store,
    });
  });

  describe('indexMemory', () => {
    it('embeds and inserts a memory', async () => {
      const memory = makeMemory();
      await manager.indexMemory(memory);

      expect(embedding.embed).toHaveBeenCalledWith([memory.content]);
      expect(store.insert).toHaveBeenCalledWith(
        `memory:${memory.id}`,
        expect.any(Array),
        { type: 'memory', memoryType: 'semantic', source: 'test' },
      );
    });
  });

  describe('indexKnowledge', () => {
    it('embeds topic:content and inserts knowledge', async () => {
      const entry = makeKnowledge();
      await manager.indexKnowledge(entry);

      expect(embedding.embed).toHaveBeenCalledWith([`${entry.topic}: ${entry.content}`]);
      expect(store.insert).toHaveBeenCalledWith(
        `knowledge:${entry.id}`,
        expect.any(Array),
        { type: 'knowledge', topic: 'test-topic', source: 'test' },
      );
    });
  });

  describe('searchMemories', () => {
    it('returns only memory results with stripped prefixes', async () => {
      store.search.mockResolvedValue([
        { id: 'memory:m1', score: 0.95, metadata: { type: 'memory' } },
        { id: 'knowledge:k1', score: 0.90, metadata: { type: 'knowledge' } },
        { id: 'memory:m2', score: 0.80, metadata: { type: 'memory' } },
      ] satisfies VectorResult[]);

      const results = await manager.searchMemories('query', 5);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('m1');
      expect(results[1].id).toBe('m2');
    });

    it('respects limit', async () => {
      store.search.mockResolvedValue([
        { id: 'memory:m1', score: 0.95 },
        { id: 'memory:m2', score: 0.90 },
        { id: 'memory:m3', score: 0.85 },
      ] satisfies VectorResult[]);

      const results = await manager.searchMemories('query', 2);
      expect(results).toHaveLength(2);
    });

    it('passes threshold to store search', async () => {
      store.search.mockResolvedValue([]);
      await manager.searchMemories('query', 5, 0.7);

      expect(store.search).toHaveBeenCalledWith(expect.any(Array), 10, 0.7);
    });
  });

  describe('searchKnowledge', () => {
    it('returns only knowledge results with stripped prefixes', async () => {
      store.search.mockResolvedValue([
        { id: 'knowledge:k1', score: 0.95 },
        { id: 'memory:m1', score: 0.90 },
      ] satisfies VectorResult[]);

      const results = await manager.searchKnowledge('query', 5);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('k1');
    });
  });

  describe('removeMemory', () => {
    it('deletes with memory prefix', async () => {
      await manager.removeMemory('m1');
      expect(store.delete).toHaveBeenCalledWith('memory:m1');
    });
  });

  describe('removeKnowledge', () => {
    it('deletes with knowledge prefix', async () => {
      await manager.removeKnowledge('k1');
      expect(store.delete).toHaveBeenCalledWith('knowledge:k1');
    });
  });

  describe('reindexAll', () => {
    it('batch indexes memories and knowledge', async () => {
      const memories = [
        makeMemory({ id: 'm1', content: 'A' }),
        makeMemory({ id: 'm2', content: 'B' }),
      ];
      const knowledge = [
        makeKnowledge({ id: 'k1', topic: 'T1', content: 'C' }),
      ];

      const result = await manager.reindexAll(memories, knowledge);

      expect(result.indexed).toBe(3);
      expect(store.insertBatch).toHaveBeenCalledTimes(2);
    });

    it('returns zero when no items provided', async () => {
      const result = await manager.reindexAll([], []);
      expect(result.indexed).toBe(0);
      expect(store.insertBatch).not.toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('delegates to vector store', async () => {
      await manager.close();
      expect(store.close).toHaveBeenCalled();
    });
  });
});
