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
  personality_id: null,
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

const documentRow = {
  id: 'doc-1',
  personality_id: null,
  title: 'Test Doc',
  filename: 'test.txt',
  format: 'txt',
  source_url: null,
  visibility: 'private',
  status: 'ready',
  chunk_count: 3,
  error_message: null,
  source_quality: null,
  trust_score: 0.7,
  created_at: 1000,
  updated_at: 2000,
};

// ─── Tests ────────────────────────────────────────────────────

import { BrainStorage } from './storage.js';

describe('BrainStorage (extended)', () => {
  let storage: BrainStorage;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    storage = new BrainStorage();
  });

  // ── Memories — getMemoryBatch ──────────────────────────────

  describe('getMemoryBatch', () => {
    it('returns empty array for empty ids', async () => {
      const result = await storage.getMemoryBatch([]);
      expect(result).toEqual([]);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns mapped memories for given ids', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [memoryRow], rowCount: 1 });
      const result = await storage.getMemoryBatch(['mem-1']);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('mem-1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('ANY($1)');
    });
  });

  // ── Memories — updateMemory ────────────────────────────────

  describe('updateMemory', () => {
    it('returns null when no fields provided', async () => {
      const result = await storage.updateMemory('mem-1', {});
      expect(result).toBeNull();
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('updates content and returns memory', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...memoryRow, content: 'Updated' }],
        rowCount: 1,
      });
      const result = await storage.updateMemory('mem-1', { content: 'Updated' });
      expect(result?.content).toBe('Updated');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('content = $');
      expect(sql).toContain('RETURNING *');
    });

    it('updates importance', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...memoryRow, importance: 0.9 }], rowCount: 1 });
      const result = await storage.updateMemory('mem-1', { importance: 0.9 });
      expect(result?.importance).toBe(0.9);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('importance = $');
    });

    it('updates type', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...memoryRow, type: 'episodic' }], rowCount: 1 });
      const result = await storage.updateMemory('mem-1', { type: 'episodic' });
      expect(result?.type).toBe('episodic');
    });

    it('updates context', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [memoryRow], rowCount: 1 });
      await storage.updateMemory('mem-1', { context: { key: 'val' } });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe(JSON.stringify({ key: 'val' }));
    });

    it('updates expiresAt', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [memoryRow], rowCount: 1 });
      await storage.updateMemory('mem-1', { expiresAt: 99999 });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('expires_at = $');
    });

    it('returns null when row not found after update', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.updateMemory('mem-1', { content: 'x' });
      expect(result).toBeNull();
    });

    it('updates multiple fields at once', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [memoryRow], rowCount: 1 });
      await storage.updateMemory('mem-1', { content: 'new', importance: 0.3, type: 'procedural' });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('content = $');
      expect(sql).toContain('importance = $');
      expect(sql).toContain('type = $');
    });
  });

  // ── Memories — queryMemories additional branches ───────────

  describe('queryMemories — asc sort direction', () => {
    it('uses ASC ordering when sortDirection is asc', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.queryMemories({ sortDirection: 'asc' });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('ORDER BY importance ASC');
    });
  });

  describe('queryMemories — context filter with valid keys', () => {
    it('adds context filter for valid key', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.queryMemories({ context: { topic: 'test' } });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('context::jsonb');
    });
  });

  describe('queryMemories — caps limit at 1000', () => {
    it('caps limit to 1000 when higher value provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.queryMemories({ limit: 5000 });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params).toContain(1000);
    });
  });

  // ── Memories — getMemoryCount with personalityId ──────────

  describe('getMemoryCount — with personalityId', () => {
    it('filters by personalityId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '10' }], rowCount: 1 });
      const count = await storage.getMemoryCount('pid-1');
      expect(count).toBe(10);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('personality_id = $1');
    });
  });

  // ── Knowledge — queryKnowledge personalityId ───────────────

  describe('queryKnowledge — personalityId filter', () => {
    it('adds personalityId filter including NULL entries', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.queryKnowledge({ personalityId: 'pid-1' });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('personality_id = $');
      expect(sql).toContain('personality_id IS NULL');
    });
  });

  // ── Knowledge — isBaseKnowledgeSeeded ──────────────────────

  describe('isBaseKnowledgeSeeded', () => {
    it('returns false when global topics are missing', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ cnt: '2' }], rowCount: 1 });
      const result = await storage.isBaseKnowledgeSeeded([]);
      expect(result).toBe(false);
    });

    it('returns true when all global topics present and no personalities', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ cnt: '3' }], rowCount: 1 });
      const result = await storage.isBaseKnowledgeSeeded([]);
      expect(result).toBe(true);
    });

    it('returns false when scoped self-identity entries are missing', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ cnt: '3' }], rowCount: 1 }) // global OK
        .mockResolvedValueOnce({ rows: [{ cnt: '0' }], rowCount: 1 }); // scoped missing
      const result = await storage.isBaseKnowledgeSeeded(['pid-1']);
      expect(result).toBe(false);
    });

    it('returns true when all seeded', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ cnt: '3' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ cnt: '2' }], rowCount: 1 });
      const result = await storage.isBaseKnowledgeSeeded(['pid-1', 'pid-2']);
      expect(result).toBe(true);
    });

    it('handles null cnt gracefully', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.isBaseKnowledgeSeeded([]);
      expect(result).toBe(false);
    });
  });

  // ── Knowledge — updateKnowledge re-select failure ─────────

  describe('updateKnowledge — re-select failure', () => {
    it('throws when re-select returns null', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [knowledgeRow], rowCount: 1 }) // getKnowledge
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // re-select fails
      await expect(storage.updateKnowledge('know-1', { content: 'x' })).rejects.toThrow(
        'Failed to retrieve knowledge after update'
      );
    });
  });

  // ── Knowledge — getKnowledgeCount with personalityId ──────

  describe('getKnowledgeCount — with personalityId', () => {
    it('filters by personalityId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '7' }], rowCount: 1 });
      const count = await storage.getKnowledgeCount('pid-1');
      expect(count).toBe(7);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('personality_id = $1');
    });
  });

  // ── Knowledge — createKnowledge re-select failure ─────────

  describe('createKnowledge — re-select failure', () => {
    it('throws when re-select returns null', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // re-select fails
      await expect(
        storage.createKnowledge({ topic: 'T', content: 'C', source: 's' })
      ).rejects.toThrow('Failed to retrieve knowledge after insert');
    });
  });

  // ── Skills — createSkill re-select failure ────────────────

  describe('createSkill — re-select failure', () => {
    it('throws when re-select returns null', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(storage.createSkill({ name: 'x' })).rejects.toThrow(
        'Failed to retrieve skill after insert'
      );
    });
  });

  // ── Skills — updateSkill re-select failure ────────────────

  describe('updateSkill — re-select failure', () => {
    it('throws when re-select returns null', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [skillRow], rowCount: 1 }) // getSkill
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // re-select fails
      await expect(storage.updateSkill('skill-1', { name: 'x' })).rejects.toThrow(
        'Failed to retrieve skill after update'
      );
    });
  });

  // ── Skills — updateSkill outputSchema branches ────────────

  describe('updateSkill — outputSchema handling', () => {
    it('serializes outputSchema when provided', async () => {
      const schema = { type: 'object' };
      mockQuery
        .mockResolvedValueOnce({ rows: [skillRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ ...skillRow, output_schema: schema }], rowCount: 1 });
      await storage.updateSkill('skill-1', { outputSchema: schema });
      const params = mockQuery.mock.calls[1][1] as unknown[];
      // outputSchema is param index 11 (0-based)
      expect(params[11]).toBe(JSON.stringify(schema));
    });

    it('sets outputSchema to null when explicitly null', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [skillRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [skillRow], rowCount: 1 });
      await storage.updateSkill('skill-1', { outputSchema: null });
      const params = mockQuery.mock.calls[1][1] as unknown[];
      expect(params[11]).toBeNull();
    });

    it('preserves existing outputSchema when undefined in update', async () => {
      const existingSchema = { type: 'string' };
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ ...skillRow, output_schema: existingSchema }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [skillRow], rowCount: 1 });
      await storage.updateSkill('skill-1', { name: 'Updated' });
      const params = mockQuery.mock.calls[1][1] as unknown[];
      expect(params[11]).toBe(JSON.stringify(existingSchema));
    });
  });

  // ── Skills — getSkillCount ────────────────────────────────

  describe('getSkillCount', () => {
    it('returns count from query', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '15' }], rowCount: 1 });
      expect(await storage.getSkillCount()).toBe(15);
    });

    it('returns 0 when no rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.getSkillCount()).toBe(0);
    });
  });

  // ── Skills — listSkills source filter ─────────────────────

  describe('listSkills — source filter', () => {
    it('adds source filter to SQL', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.listSkills({ source: 'builtin' });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('source = $');
    });
  });

  // ── RRF — personalityId branches ──────────────────────────

  describe('queryMemoriesByRRF — personalityId scope', () => {
    it('adds personality clause when personalityId provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.queryMemoriesByRRF('test query', null, 5, 1.0, 1.0, 'pid-1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('personality_id = $');
      expect(sql).toContain('personality_id IS NULL');
    });
  });

  describe('queryKnowledgeByRRF — personalityId scope', () => {
    it('adds personality clause when personalityId provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.queryKnowledgeByRRF('test query', null, 5, 1.0, 1.0, 'pid-1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('personality_id = $');
      expect(sql).toContain('personality_id IS NULL');
    });
  });

  // ── Document Chunks ───────────────────────────────────────

  describe('createChunks', () => {
    it('is a no-op for empty chunks', async () => {
      await storage.createChunks('src-1', 'memories', []);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('inserts each chunk', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
      await storage.createChunks('src-1', 'memories', [
        { id: 'c1', content: 'chunk1', chunkIndex: 0 },
        { id: 'c2', content: 'chunk2', chunkIndex: 1 },
      ]);
      expect(mockQuery).toHaveBeenCalledTimes(2);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO brain.document_chunks');
      expect(sql).toContain('ON CONFLICT');
    });
  });

  describe('deleteChunksForSource', () => {
    it('deletes chunks by source_id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 3 });
      await storage.deleteChunksForSource('src-1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('DELETE FROM brain.document_chunks');
      expect(sql).toContain('source_id = $1');
    });
  });

  describe('updateChunkEmbedding', () => {
    it('updates embedding with vector format', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await storage.updateChunkEmbedding('c1', [0.1, 0.2]);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('embedding = $1::vector');
      const params = mockQuery.mock.calls[0][1];
      expect(params[0]).toBe('[0.1,0.2]');
    });
  });

  describe('queryChunksByRRF', () => {
    it('returns empty for special-char-only query', async () => {
      const result = await storage.queryChunksByRRF('!!!', null, 5);
      expect(result).toEqual([]);
    });

    it('runs FTS-only when no embedding', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ source_id: 's1', source_table: 'memories', content: 'chunk', rrf_score: 0.5 }],
        rowCount: 1,
      });
      const results = await storage.queryChunksByRRF('test chunk', null, 5);
      expect(results).toHaveLength(1);
      expect(results[0].sourceId).toBe('s1');
      expect(results[0].rrfScore).toBe(0.5);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('WHERE FALSE');
    });

    it('includes vector subquery when embedding provided', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ source_id: 's1', source_table: 'knowledge', content: 'c', rrf_score: 0.9 }],
        rowCount: 1,
      });
      const results = await storage.queryChunksByRRF('test', [0.1, 0.2], 5);
      expect(results).toHaveLength(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('<=>');
    });
  });

  // ── Vector Similarity ─────────────────────────────────────

  describe('queryKnowledgeBySimilarity', () => {
    it('returns knowledge entries with similarity', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...knowledgeRow, similarity: 0.88 }],
        rowCount: 1,
      });
      const results = await storage.queryKnowledgeBySimilarity([0.1, 0.2], 5, 0.7);
      expect(results).toHaveLength(1);
      expect(results[0].similarity).toBe(0.88);
      expect(results[0].topic).toBe('Testing');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('<=>');
    });
  });

  describe('updateKnowledgeEmbedding', () => {
    it('updates embedding with vector format', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await storage.updateKnowledgeEmbedding('know-1', [0.5, 0.6]);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('embedding = $1::vector');
      const params = mockQuery.mock.calls[0][1];
      expect(params[0]).toBe('[0.5,0.6]');
    });
  });

  // ── Meta — deleteMeta ────────────────────────────────────

  describe('deleteMeta', () => {
    it('deletes meta by key', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await storage.deleteMeta('mykey');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('DELETE FROM brain.meta');
      expect(mockQuery.mock.calls[0][1]).toEqual(['mykey']);
    });
  });

  // ── Stats with personalityId ──────────────────────────────

  describe('getStats — with personalityId', () => {
    it('passes personalityId to sub-queries', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 }) // getMemoryCount
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // getMemoryCountByType
        .mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 }) // getKnowledgeCount
        .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 }); // getSkillCount

      const stats = await storage.getStats('pid-1');
      expect(stats.memories.total).toBe(5);
      expect(stats.knowledge.total).toBe(3);
      // memory count query should scope by personality
      const memorySql = mockQuery.mock.calls[0][0] as string;
      expect(memorySql).toContain('personality_id = $1');
    });
  });

  // ── Documents ─────────────────────────────────────────────

  describe('createDocument', () => {
    it('inserts and returns document', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [documentRow], rowCount: 1 });

      const doc = await storage.createDocument({
        personalityId: null,
        title: 'Test Doc',
        visibility: 'private',
        status: 'ready',
      });
      expect(doc.id).toBe('doc-1');
      expect(doc.title).toBe('Test Doc');
    });

    it('throws when re-select fails', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(
        storage.createDocument({
          personalityId: null,
          title: 'x',
          visibility: 'private',
          status: 'pending',
        })
      ).rejects.toThrow('Failed to retrieve document after insert');
    });

    it('passes optional fields', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [documentRow], rowCount: 1 });
      await storage.createDocument({
        personalityId: 'pid-1',
        title: 'With opts',
        filename: 'file.md',
        format: 'md',
        sourceUrl: 'https://example.com',
        visibility: 'shared',
        status: 'processing',
      });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[1]).toBe('pid-1');
      expect(params[3]).toBe('file.md');
      expect(params[4]).toBe('md');
      expect(params[5]).toBe('https://example.com');
    });
  });

  describe('getDocument', () => {
    it('returns document when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [documentRow], rowCount: 1 });
      const doc = await storage.getDocument('doc-1');
      expect(doc?.id).toBe('doc-1');
      expect(doc?.trustScore).toBe(0.7);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.getDocument('missing')).toBeNull();
    });

    it('defaults trustScore to 0.5 when null', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...documentRow, trust_score: null }],
        rowCount: 1,
      });
      const doc = await storage.getDocument('doc-1');
      expect(doc?.trustScore).toBe(0.5);
    });

    it('parses source_quality from JSON string', async () => {
      const prov = { authority: 0.8, recency: 0.9 };
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...documentRow, source_quality: JSON.stringify(prov) }],
        rowCount: 1,
      });
      const doc = await storage.getDocument('doc-1');
      expect(doc?.sourceQuality).toEqual(prov);
    });

    it('handles source_quality as object directly', async () => {
      const prov = { authority: 0.8 };
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...documentRow, source_quality: prov }],
        rowCount: 1,
      });
      const doc = await storage.getDocument('doc-1');
      expect(doc?.sourceQuality).toEqual(prov);
    });

    it('handles invalid JSON in source_quality', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...documentRow, source_quality: 'not-json' }],
        rowCount: 1,
      });
      const doc = await storage.getDocument('doc-1');
      expect(doc?.sourceQuality).toBeNull();
    });
  });

  describe('updateDocument', () => {
    it('updates and returns document', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [documentRow], rowCount: 1 }) // getDocument
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE
        .mockResolvedValueOnce({ rows: [{ ...documentRow, title: 'New' }], rowCount: 1 });
      const doc = await storage.updateDocument('doc-1', { title: 'New' });
      expect(doc.title).toBe('New');
    });

    it('throws when document not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(storage.updateDocument('missing', {})).rejects.toThrow('Document not found');
    });

    it('throws when re-select fails', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [documentRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(storage.updateDocument('doc-1', { title: 'x' })).rejects.toThrow(
        'Failed to retrieve document after update'
      );
    });

    it('preserves existing fields when partial update', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [documentRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [documentRow], rowCount: 1 });
      await storage.updateDocument('doc-1', { chunkCount: 10 });
      const params = mockQuery.mock.calls[1][1] as unknown[];
      expect(params[0]).toBe('Test Doc'); // title preserved
      expect(params[2]).toBe(10); // chunkCount updated
    });

    it('handles errorMessage set to null', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ ...documentRow, error_message: 'old error' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [documentRow], rowCount: 1 });
      await storage.updateDocument('doc-1', { errorMessage: null });
      const params = mockQuery.mock.calls[1][1] as unknown[];
      expect(params[3]).toBeNull();
    });
  });

  describe('deleteDocument', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      expect(await storage.deleteDocument('doc-1')).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.deleteDocument('missing')).toBe(false);
    });
  });

  describe('listDocuments', () => {
    it('lists all documents without filters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [documentRow], rowCount: 1 });
      const docs = await storage.listDocuments();
      expect(docs).toHaveLength(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('ORDER BY created_at DESC');
    });

    it('filters by personalityId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.listDocuments({ personalityId: 'pid-1' });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('personality_id = $');
      expect(sql).toContain('personality_id IS NULL');
    });

    it('filters by visibility', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.listDocuments({ visibility: 'shared' });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('visibility = $');
    });
  });

  describe('deleteKnowledgeBySourcePrefix', () => {
    it('deletes knowledge by source prefix', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 5 });
      const count = await storage.deleteKnowledgeBySourcePrefix('document:doc-1');
      expect(count).toBe(5);
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('document:doc-1%');
    });
  });

  // ── getAllDocumentChunks ───────────────────────────────────

  describe('getAllDocumentChunks', () => {
    it('returns empty array when no rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getAllDocumentChunks();
      expect(result).toEqual([]);
    });

    it('groups chunks by document and sorts by index', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            content: 'chunk2',
            source: 'document:d1:chunk1',
            doc_id: 'd1',
            doc_title: 'Doc 1',
            doc_format: 'txt',
            chunk_count: 2,
          },
          {
            content: 'chunk1',
            source: 'document:d1:chunk0',
            doc_id: 'd1',
            doc_title: 'Doc 1',
            doc_format: 'txt',
            chunk_count: 2,
          },
        ],
        rowCount: 2,
      });
      const result = await storage.getAllDocumentChunks();
      expect(result).toHaveLength(1);
      expect(result[0].docId).toBe('d1');
      expect(result[0].text).toBe('chunk1\n\nchunk2');
      expect(result[0].chunkCount).toBe(2);
      expect(result[0].estimatedTokens).toBeGreaterThan(0);
    });

    it('scopes by personalityId when provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.getAllDocumentChunks('pid-1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('k.personality_id = $1');
      expect(sql).toContain('k.personality_id IS NULL');
    });

    it('returns all chunks when personalityId is null', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.getAllDocumentChunks(null);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).not.toContain('k.personality_id = $1');
    });

    it('handles chunk source without index', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            content: 'text',
            source: 'document:d1:chunkX',
            doc_id: 'd1',
            doc_title: 'D',
            doc_format: null,
            chunk_count: '1',
          },
        ],
        rowCount: 1,
      });
      const result = await storage.getAllDocumentChunks();
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('text');
    });
  });

  // ── Knowledge Query Log ───────────────────────────────────

  describe('logKnowledgeQuery', () => {
    it('inserts a query log entry', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await storage.logKnowledgeQuery({
        personalityId: 'pid-1',
        queryText: 'how to test',
        resultsCount: 5,
        topScore: 0.9,
      });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO brain.knowledge_query_log');
    });

    it('handles missing topScore', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await storage.logKnowledgeQuery({
        personalityId: null,
        queryText: 'test',
        resultsCount: 0,
      });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[4]).toBeNull(); // topScore
    });
  });

  // ── getKnowledgeHealthStats ───────────────────────────────

  describe('getKnowledgeHealthStats', () => {
    it('returns health stats without personalityId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '10', total_chunks: '50' }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [
            { format: 'txt', cnt: '5' },
            { format: null, cnt: '2' },
          ],
          rowCount: 2,
        })
        .mockResolvedValueOnce({ rows: [{ cnt: '15', avg_score: 0.8 }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ cnt: '3' }], rowCount: 1 });

      const stats = await storage.getKnowledgeHealthStats();
      expect(stats.totalDocuments).toBe(10);
      expect(stats.totalChunks).toBe(50);
      expect(stats.byFormat).toEqual({ txt: 5, unknown: 2 });
      expect(stats.recentQueryCount).toBe(15);
      expect(stats.avgTopScore).toBe(0.8);
      expect(stats.lowCoverageQueries).toBe(3);
    });

    it('scopes by personalityId when provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '0', total_chunks: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ cnt: '0', avg_score: null }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ cnt: '0' }], rowCount: 1 });

      const stats = await storage.getKnowledgeHealthStats('pid-1');
      expect(stats.totalDocuments).toBe(0);
      // Verify personality filters were added
      const docSql = mockQuery.mock.calls[0][0] as string;
      expect(docSql).toContain('personality_id = $1');
    });

    it('handles null rows gracefully', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const stats = await storage.getKnowledgeHealthStats();
      expect(stats.totalDocuments).toBe(0);
      expect(stats.totalChunks).toBe(0);
      expect(stats.avgTopScore).toBeNull();
    });
  });

  // ── Provenance ────────────────────────────────────────────

  describe('updateDocumentProvenance', () => {
    it('updates source_quality and trust_score', async () => {
      const prov = { authority: 0.9 } as any;
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE
        .mockResolvedValueOnce({
          rows: [{ ...documentRow, source_quality: prov, trust_score: 0.9 }],
          rowCount: 1,
        });
      const doc = await storage.updateDocumentProvenance('doc-1', prov, 0.9);
      expect(doc?.trustScore).toBe(0.9);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('source_quality = $1');
      expect(sql).toContain('trust_score = $2');
    });

    it('returns null when document does not exist', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // UPDATE
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // getDocument
      const doc = await storage.updateDocumentProvenance('missing', {} as any, 0.5);
      expect(doc).toBeNull();
    });
  });

  describe('getDocumentTrustScore', () => {
    it('returns trust_score when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ trust_score: 0.9 }], rowCount: 1 });
      expect(await storage.getDocumentTrustScore('doc-1')).toBe(0.9);
    });

    it('returns default 0.5 when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await storage.getDocumentTrustScore('missing')).toBe(0.5);
    });

    it('returns default 0.5 when trust_score is null', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ trust_score: null }], rowCount: 1 });
      expect(await storage.getDocumentTrustScore('doc-1')).toBe(0.5);
    });
  });

  describe('getDocumentsByIds', () => {
    it('returns empty for empty ids', async () => {
      const result = await storage.getDocumentsByIds([]);
      expect(result).toEqual([]);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns mapped documents', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [documentRow], rowCount: 1 });
      const docs = await storage.getDocumentsByIds(['doc-1']);
      expect(docs).toHaveLength(1);
      expect(docs[0].id).toBe('doc-1');
    });
  });

  // ── Citation Feedback ─────────────────────────────────────

  describe('addCitationFeedback', () => {
    it('inserts feedback and returns id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await storage.addCitationFeedback({
        messageId: 'msg-1',
        citationIndex: 0,
        sourceId: 'src-1',
        relevant: true,
      });
      expect(result.id).toBe('test-uuid');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO chat.citation_feedback');
    });
  });

  describe('getCitationFeedback', () => {
    it('returns mapped feedback entries', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'fb-1', citation_index: 0, source_id: 'src-1', relevant: true, created_at: 1000 },
          { id: 'fb-2', citation_index: 1, source_id: 'src-2', relevant: false, created_at: 2000 },
        ],
        rowCount: 2,
      });
      const feedback = await storage.getCitationFeedback('msg-1');
      expect(feedback).toHaveLength(2);
      expect(feedback[0].citationIndex).toBe(0);
      expect(feedback[0].sourceId).toBe('src-1');
      expect(feedback[0].relevant).toBe(true);
      expect(feedback[1].relevant).toBe(false);
    });

    it('returns empty array when no feedback', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const feedback = await storage.getCitationFeedback('msg-none');
      expect(feedback).toEqual([]);
    });
  });

  // ── Grounding Score ───────────────────────────────────────

  describe('getAverageGroundingScore', () => {
    it('returns stats from query', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ avg_score: 0.75, total: '100', low_count: '10' }],
        rowCount: 1,
      });
      const result = await storage.getAverageGroundingScore('pid-1');
      expect(result.averageScore).toBe(0.75);
      expect(result.totalMessages).toBe(100);
      expect(result.lowGroundingCount).toBe(10);
    });

    it('returns defaults when no data', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getAverageGroundingScore('pid-1');
      expect(result.averageScore).toBeNull();
      expect(result.totalMessages).toBe(0);
      expect(result.lowGroundingCount).toBe(0);
    });

    it('uses custom windowDays', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ avg_score: null, total: '0', low_count: '0' }],
        rowCount: 1,
      });
      await storage.getAverageGroundingScore('pid-1', 7);
      const params = mockQuery.mock.calls[0][1] as unknown[];
      // The second param is the "since" timestamp based on 7 days
      const since = params[1] as number;
      const now = Date.now();
      const sevenDaysMs = 7 * 86_400_000;
      expect(now - since).toBeGreaterThanOrEqual(sevenDaysMs - 1000);
      expect(now - since).toBeLessThanOrEqual(sevenDaysMs + 1000);
    });
  });
});
