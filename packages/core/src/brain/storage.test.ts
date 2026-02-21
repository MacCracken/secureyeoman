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

const memoryRow = {
  id: 'mem-1',
  personality_id: null,
  type: 'semantic',
  content: 'Test memory',
  source: 'user',
  context: {},
  importance: 0.7,
  access_count: 2,
  last_accessed_at: 5000,
  expires_at: null,
  created_at: 1000,
  updated_at: 2000,
};

const knowledgeRow = {
  id: 'know-1',
  topic: 'Testing',
  content: 'How to write tests',
  source: 'user',
  confidence: 0.9,
  supersedes: null,
  created_at: 1000,
  updated_at: 2000,
};

const skillRow = {
  id: 'skill-1',
  name: 'Test Skill',
  description: 'Does testing',
  instructions: 'Run tests',
  tools: [],
  trigger_patterns: ['test'],
  enabled: true,
  source: 'user',
  status: 'active',
  usage_count: 5,
  last_used_at: 3000,
  personality_id: null,
  created_at: 1000,
  updated_at: 2000,
};

// ─── Tests ────────────────────────────────────────────────────

import { BrainStorage } from './storage.js';

describe('BrainStorage', () => {
  let storage: BrainStorage;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    storage = new BrainStorage();
  });

  // ── Memories ───────────────────────────────────────────────

  describe('createMemory', () => {
    it('inserts memory and returns the created record', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT
        .mockResolvedValueOnce({ rows: [memoryRow], rowCount: 1 }); // SELECT

      const memory = await storage.createMemory({
        type: 'semantic',
        content: 'Test memory',
        source: 'user',
      });

      expect(memory.id).toBe('mem-1');
      expect(memory.type).toBe('semantic');
      expect(memory.content).toBe('Test memory');
      expect(memory.accessCount).toBe(2);
    });

    it('throws when re-select fails', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(
        storage.createMemory({ type: 'semantic', content: 'x', source: 'user' })
      ).rejects.toThrow('Failed to retrieve memory after insert');
    });

    it('uses default importance of 0.5 when not provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [memoryRow], rowCount: 1 });

      await storage.createMemory({ type: 'semantic', content: 'x', source: 'user' });

      const insertCall = mockQuery.mock.calls[0][1];
      expect(insertCall[6]).toBe(0.5); // importance param
    });

    it('passes personalityId when provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [memoryRow], rowCount: 1 });

      await storage.createMemory({ type: 'semantic', content: 'x', source: 'user' }, 'pid-1');

      const params = mockQuery.mock.calls[0][1];
      expect(params[1]).toBe('pid-1');
    });
  });

  describe('getMemory', () => {
    it('returns memory when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [memoryRow], rowCount: 1 });
      const result = await storage.getMemory('mem-1');
      expect(result?.id).toBe('mem-1');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.getMemory('missing')).toBeNull();
    });
  });

  describe('deleteMemory', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      expect(await storage.deleteMemory('mem-1')).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.deleteMemory('missing')).toBe(false);
    });
  });

  describe('queryMemories', () => {
    it('returns all memories with no filters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [memoryRow], rowCount: 1 });
      const results = await storage.queryMemories();
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('mem-1');
    });

    it('adds type filter to SQL', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.queryMemories({ type: 'episodic' });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('type = $');
    });

    it('adds source filter to SQL', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.queryMemories({ source: 'system' });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('source = $');
    });

    it('adds minImportance filter to SQL', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.queryMemories({ minImportance: 0.5 });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('importance >= $');
    });

    it('adds keyword search to SQL', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.queryMemories({ search: 'testing query' });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('ILIKE');
    });

    it('throws on invalid context key', async () => {
      await expect(
        storage.queryMemories({ context: { 'bad key!': 'val' } })
      ).rejects.toThrow('Invalid context key');
    });

    it('adds LIMIT and OFFSET', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.queryMemories({ limit: 10, offset: 5 });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('LIMIT');
      expect(sql).toContain('OFFSET');
    });
  });

  describe('touchMemory', () => {
    it('updates access_count and last_accessed_at', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await storage.touchMemory('mem-1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('access_count = access_count + 1');
    });
  });

  describe('touchMemories', () => {
    it('is a no-op for empty array', async () => {
      await storage.touchMemories([]);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('updates multiple memories', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 2 });
      await storage.touchMemories(['a', 'b']);
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('ANY($2');
    });
  });

  describe('decayMemories', () => {
    it('returns count of affected rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 7 });
      const count = await storage.decayMemories(0.1);
      expect(count).toBe(7);
    });
  });

  describe('pruneExpiredMemories', () => {
    it('returns IDs of deleted memories', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'mem-1' }, { id: 'mem-2' }], rowCount: 2 });
      const ids = await storage.pruneExpiredMemories();
      expect(ids).toEqual(['mem-1', 'mem-2']);
    });
  });

  describe('pruneByImportanceFloor', () => {
    it('returns IDs of deleted low-importance memories', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'low-1' }], rowCount: 1 });
      const ids = await storage.pruneByImportanceFloor(0.1);
      expect(ids).toEqual(['low-1']);
    });
  });

  describe('getMemoryCount', () => {
    it('returns the total count', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '42' }], rowCount: 1 });
      expect(await storage.getMemoryCount()).toBe(42);
    });

    it('returns 0 when table is empty', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.getMemoryCount()).toBe(0);
    });
  });

  describe('getMemoryCountByType', () => {
    it('returns a map of type to count', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { type: 'semantic', count: '10' },
          { type: 'episodic', count: '5' },
        ],
        rowCount: 2,
      });
      const result = await storage.getMemoryCountByType();
      expect(result.semantic).toBe(10);
      expect(result.episodic).toBe(5);
    });
  });

  // ── Knowledge ──────────────────────────────────────────────

  describe('createKnowledge', () => {
    it('inserts and returns the knowledge entry', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [knowledgeRow], rowCount: 1 });

      const entry = await storage.createKnowledge({
        topic: 'Testing',
        content: 'How to write tests',
        source: 'user',
      });

      expect(entry.id).toBe('know-1');
      expect(entry.topic).toBe('Testing');
    });
  });

  describe('getKnowledge', () => {
    it('returns entry when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [knowledgeRow], rowCount: 1 });
      const entry = await storage.getKnowledge('know-1');
      expect(entry?.topic).toBe('Testing');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.getKnowledge('missing')).toBeNull();
    });
  });

  describe('queryKnowledge', () => {
    it('filters by topic', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.queryKnowledge({ topic: 'Testing' });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('topic = $');
    });

    it('filters by minConfidence', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.queryKnowledge({ minConfidence: 0.8 });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('confidence >= $');
    });
  });

  describe('updateKnowledge', () => {
    it('updates content and returns updated entry', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [knowledgeRow], rowCount: 1 }) // getKnowledge
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })              // UPDATE
        .mockResolvedValueOnce({ rows: [{ ...knowledgeRow, content: 'updated' }], rowCount: 1 }); // re-select

      const result = await storage.updateKnowledge('know-1', { content: 'updated' });
      expect(result.content).toBe('updated');
    });

    it('throws if knowledge not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(storage.updateKnowledge('missing', {})).rejects.toThrow('Knowledge not found');
    });
  });

  describe('deleteKnowledge', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      expect(await storage.deleteKnowledge('know-1')).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.deleteKnowledge('missing')).toBe(false);
    });
  });

  // ── Skills ─────────────────────────────────────────────────

  describe('createSkill', () => {
    it('inserts and returns the skill', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [skillRow], rowCount: 1 });

      const skill = await storage.createSkill({ name: 'Test Skill' });
      expect(skill.id).toBe('skill-1');
      expect(skill.name).toBe('Test Skill');
    });
  });

  describe('getSkill', () => {
    it('returns skill when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [skillRow], rowCount: 1 });
      const skill = await storage.getSkill('skill-1');
      expect(skill?.enabled).toBe(true);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.getSkill('missing')).toBeNull();
    });
  });

  describe('updateSkill', () => {
    it('throws if skill not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(storage.updateSkill('missing', { name: 'x' })).rejects.toThrow('Skill not found');
    });

    it('updates and returns the updated skill', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [skillRow], rowCount: 1 }) // getSkill
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })          // UPDATE
        .mockResolvedValueOnce({ rows: [{ ...skillRow, name: 'Updated' }], rowCount: 1 }); // re-select

      const skill = await storage.updateSkill('skill-1', { name: 'Updated' });
      expect(skill.name).toBe('Updated');
    });
  });

  describe('deleteSkill', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      expect(await storage.deleteSkill('skill-1')).toBe(true);
    });
  });

  describe('listSkills', () => {
    it('returns skills with no filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [skillRow], rowCount: 1 });
      const skills = await storage.listSkills();
      expect(skills).toHaveLength(1);
    });

    it('filters by status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.listSkills({ status: 'active' });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('status = $');
    });

    it('filters by enabled flag', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.listSkills({ enabled: true });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('enabled = $');
    });

    it('filters by personalityId = null', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.listSkills({ personalityId: null });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('personality_id IS NULL');
    });

    it('filters by specific personalityId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.listSkills({ personalityId: 'pid-1' });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('personality_id = $');
    });
  });

  describe('getEnabledSkills', () => {
    it('queries for enabled active skills', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [skillRow], rowCount: 1 });
      const skills = await storage.getEnabledSkills();
      expect(skills).toHaveLength(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("enabled = true AND status = 'active'");
    });

    it('scopes by personalityId when provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.getEnabledSkills('pid-1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('personality_id = $1 OR personality_id IS NULL');
    });
  });

  describe('incrementUsage', () => {
    it('updates usage_count and last_used_at', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await storage.incrementUsage('skill-1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('usage_count = usage_count + 1');
    });
  });

  // ── Vector similarity ──────────────────────────────────────

  describe('queryMemoriesBySimilarity', () => {
    it('builds vector query and returns memories with similarity', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...memoryRow, similarity: 0.95 }],
        rowCount: 1,
      });
      const results = await storage.queryMemoriesBySimilarity([0.1, 0.2], 5, 0.8);
      expect(results).toHaveLength(1);
      expect(results[0].similarity).toBe(0.95);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('<=>');
    });
  });

  describe('updateMemoryEmbedding', () => {
    it('calls UPDATE with vector format', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await storage.updateMemoryEmbedding('mem-1', [0.1, 0.2, 0.3]);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('embedding = $1::vector');
      const params = mockQuery.mock.calls[0][1];
      expect(params[0]).toBe('[0.1,0.2,0.3]');
    });
  });

  // ── Meta ───────────────────────────────────────────────────

  describe('getMeta', () => {
    it('returns value when key exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ value: 'v1' }], rowCount: 1 });
      expect(await storage.getMeta('key')).toBe('v1');
    });

    it('returns null when key not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.getMeta('missing')).toBeNull();
    });
  });

  describe('setMeta', () => {
    it('performs an upsert', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await storage.setMeta('key', 'value');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('ON CONFLICT(key)');
    });
  });

  // ── Stats ──────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns combined stats from all counts', async () => {
      // getMemoryCount + getMemoryCountByType + getKnowledgeCount + getSkillCount
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ type: 'semantic', count: '10' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 });

      const stats = await storage.getStats();
      expect(stats.memories.total).toBe(10);
      expect(stats.knowledge.total).toBe(5);
      expect(stats.skills.total).toBe(3);
    });
  });
});
