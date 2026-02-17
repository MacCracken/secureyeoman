/**
 * BrainManager + Vector Memory Integration Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrainManager } from './manager.js';
import type { BrainStorage } from './storage.js';
import type { BrainManagerDeps, Memory, KnowledgeEntry } from './types.js';
import type { VectorMemoryManager } from './vector/manager.js';
import type { BrainConfig } from '@secureyeoman/shared';

function makeMemory(id: string, content: string): Memory {
  return {
    id,
    type: 'semantic',
    content,
    source: 'test',
    context: {},
    importance: 0.5,
    accessCount: 0,
    lastAccessedAt: null,
    expiresAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function makeKnowledge(id: string, topic: string, content: string): KnowledgeEntry {
  return {
    id,
    topic,
    content,
    source: 'test',
    confidence: 0.9,
    supersedes: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createMockStorage(): BrainStorage {
  return {
    createMemory: vi.fn(async (data) => makeMemory('new-mem', data.content)),
    getMemory: vi.fn(async (id) => makeMemory(id, `content for ${id}`)),
    queryMemories: vi.fn(async () => []),
    touchMemories: vi.fn(async () => {}),
    deleteMemory: vi.fn(async () => {}),
    getMemoryCount: vi.fn(async () => 0),
    decayMemories: vi.fn(async () => 0),
    pruneExpiredMemories: vi.fn(async () => 0),
    createKnowledge: vi.fn(async (data) => makeKnowledge('new-know', data.topic, data.content)),
    getKnowledge: vi.fn(async (id) => makeKnowledge(id, 'topic', `content for ${id}`)),
    queryKnowledge: vi.fn(async () => []),
    updateKnowledge: vi.fn(async (id, data) =>
      makeKnowledge(id, 'topic', data.content ?? 'updated')
    ),
    deleteKnowledge: vi.fn(async () => {}),
    getKnowledgeCount: vi.fn(async () => 0),
    createSkill: vi.fn(async () => ({}) as any),
    updateSkill: vi.fn(async () => ({}) as any),
    deleteSkill: vi.fn(async () => {}),
    getSkill: vi.fn(async () => null),
    listSkills: vi.fn(async () => []),
    getEnabledSkills: vi.fn(async () => []),
    getPendingSkills: vi.fn(async () => []),
    getSkillCount: vi.fn(async () => 0),
    incrementUsage: vi.fn(async () => {}),
    getStats: vi.fn(async () => ({
      memories: { total: 0, byType: {} },
      knowledge: { total: 0 },
      skills: { total: 0 },
    })),
    queryMemoriesBySimilarity: vi.fn(async () => []),
    queryKnowledgeBySimilarity: vi.fn(async () => []),
    updateMemoryEmbedding: vi.fn(async () => {}),
    updateKnowledgeEmbedding: vi.fn(async () => {}),
    close: vi.fn(),
  } as unknown as BrainStorage;
}

function createMockVectorManager(): VectorMemoryManager & Record<string, ReturnType<typeof vi.fn>> {
  return {
    indexMemory: vi.fn(async () => {}),
    indexKnowledge: vi.fn(async () => {}),
    searchMemories: vi.fn(async () => []),
    searchKnowledge: vi.fn(async () => []),
    removeMemory: vi.fn(async () => {}),
    removeKnowledge: vi.fn(async () => {}),
    reindexAll: vi.fn(async () => ({ indexed: 0 })),
    close: vi.fn(async () => {}),
  } as unknown as VectorMemoryManager & Record<string, ReturnType<typeof vi.fn>>;
}

const baseConfig: BrainConfig = {
  enabled: true,
  maxMemories: 1000,
  maxKnowledge: 500,
  memoryRetentionDays: 30,
  importanceDecayRate: 0.01,
  contextWindowMemories: 10,
  vector: {
    enabled: true,
    provider: 'local',
    backend: 'faiss',
    similarityThreshold: 0.7,
    maxResults: 10,
    local: { model: 'all-MiniLM-L6-v2' },
    api: { provider: 'openai', model: 'text-embedding-3-small' },
    faiss: { persistDir: '/tmp/test-faiss' },
    qdrant: { url: 'http://localhost:6333', collection: 'test' },
  },
} as BrainConfig;

describe('BrainManager + Vector Memory', () => {
  let storage: BrainStorage;
  let vectorManager: ReturnType<typeof createMockVectorManager>;
  let deps: BrainManagerDeps;
  let brain: BrainManager;

  beforeEach(() => {
    storage = createMockStorage();
    vectorManager = createMockVectorManager();
    deps = {
      auditChain: { append: vi.fn() } as any,
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
      vectorMemoryManager: vectorManager as unknown as VectorMemoryManager,
    };
    brain = new BrainManager(storage, baseConfig, deps);
  });

  describe('remember with vector', () => {
    it('indexes memory in vector store after creation', async () => {
      const memory = await brain.remember('semantic', 'test content', 'test');
      expect(vectorManager.indexMemory).toHaveBeenCalledWith(memory);
    });

    it('gracefully handles vector indexing failure', async () => {
      vectorManager.indexMemory.mockRejectedValue(new Error('Vector store down'));
      const memory = await brain.remember('semantic', 'test content', 'test');
      expect(memory).toBeDefined();
      expect(deps.logger.warn).toHaveBeenCalled();
    });
  });

  describe('recall with vector search', () => {
    it('uses semantic search when query.search is provided', async () => {
      vectorManager.searchMemories.mockResolvedValue([{ id: 'mem-1', score: 0.95 }]);

      const results = await brain.recall({ search: 'test query' });

      expect(vectorManager.searchMemories).toHaveBeenCalledWith('test query', 10, 0.7);
      expect(storage.getMemory as any).toHaveBeenCalledWith('mem-1');
    });

    it('falls back to text search on vector failure', async () => {
      vectorManager.searchMemories.mockRejectedValue(new Error('Vector error'));
      (storage.queryMemories as any).mockResolvedValue([makeMemory('m1', 'fallback')]);

      const results = await brain.recall({ search: 'test' });
      expect(storage.queryMemories).toHaveBeenCalled();
    });
  });

  describe('forget with vector', () => {
    it('removes from vector store on forget', async () => {
      await brain.forget('mem-1');
      expect(storage.deleteMemory).toHaveBeenCalledWith('mem-1');
      expect(vectorManager.removeMemory).toHaveBeenCalledWith('mem-1');
    });

    it('still deletes from storage if vector removal fails', async () => {
      vectorManager.removeMemory.mockRejectedValue(new Error('fail'));
      await brain.forget('mem-1');
      expect(storage.deleteMemory).toHaveBeenCalledWith('mem-1');
    });
  });

  describe('learn with vector', () => {
    it('indexes knowledge in vector store', async () => {
      const entry = await brain.learn('topic', 'content', 'test');
      expect(vectorManager.indexKnowledge).toHaveBeenCalledWith(entry);
    });
  });

  describe('deleteKnowledge with vector', () => {
    it('removes from vector store', async () => {
      await brain.deleteKnowledge('k1');
      expect(storage.deleteKnowledge).toHaveBeenCalledWith('k1');
      expect(vectorManager.removeKnowledge).toHaveBeenCalledWith('k1');
    });
  });

  describe('semanticSearch', () => {
    it('searches memories only', async () => {
      vectorManager.searchMemories.mockResolvedValue([{ id: 'm1', score: 0.9 }]);
      const results = await brain.semanticSearch('query', { type: 'memories' });
      expect(results).toHaveLength(1);
      expect(vectorManager.searchMemories).toHaveBeenCalled();
      expect(vectorManager.searchKnowledge).not.toHaveBeenCalled();
    });

    it('searches knowledge only', async () => {
      vectorManager.searchKnowledge.mockResolvedValue([{ id: 'k1', score: 0.9 }]);
      const results = await brain.semanticSearch('query', { type: 'knowledge' });
      expect(results).toHaveLength(1);
      expect(vectorManager.searchKnowledge).toHaveBeenCalled();
    });

    it('searches all and merges results', async () => {
      vectorManager.searchMemories.mockResolvedValue([{ id: 'm1', score: 0.9 }]);
      vectorManager.searchKnowledge.mockResolvedValue([{ id: 'k1', score: 0.95 }]);

      const results = await brain.semanticSearch('query', { type: 'all' });
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('k1'); // Higher score first
    });

    it('throws when vector is not enabled', async () => {
      const disabledConfig = {
        ...baseConfig,
        vector: { ...baseConfig.vector, enabled: false },
      } as BrainConfig;
      const disabledBrain = new BrainManager(storage, disabledConfig, deps);
      await expect(disabledBrain.semanticSearch('query')).rejects.toThrow(
        'Vector memory is not enabled'
      );
    });
  });

  describe('getRelevantContext with vector', () => {
    it('returns semantic context when vector results found', async () => {
      vectorManager.searchMemories.mockResolvedValue([{ id: 'mem-1', score: 0.95 }]);
      vectorManager.searchKnowledge.mockResolvedValue([{ id: 'know-1', score: 0.9 }]);

      const context = await brain.getRelevantContext('test input');
      expect(context).toContain('Brain');
      expect(context).toContain('semantic');
    });

    it('falls back to text search on vector failure', async () => {
      vectorManager.searchMemories.mockRejectedValue(new Error('fail'));
      (storage.queryMemories as any).mockResolvedValue([makeMemory('m1', 'fallback content')]);

      const context = await brain.getRelevantContext('test input');
      expect(context).toContain('fallback content');
    });
  });
});
