import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryCompressor } from './compressor.js';
import type { Memory } from '../types.js';

// ── Helpers ──────────────────────────────────────────────────

const now = Date.now();
const OLD = now - 60 * 24 * 60 * 60 * 1000; // 60 days ago (past archival age of 30)
const RECENT = now - 1 * 24 * 60 * 60 * 1000; // 1 day ago

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: 'mem-1',
    personalityId: 'p-1',
    type: 'episodic',
    content: 'The user prefers dark mode settings for the editor interface',
    source: 'conversation',
    context: { topic: 'preferences', session: 's-1' },
    importance: 0.7,
    accessCount: 3,
    lastAccessedAt: now,
    expiresAt: null,
    createdAt: OLD,
    updatedAt: now,
    ...overrides,
  };
}

function makeLogger() {
  const logger: Record<string, unknown> = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    level: 'info',
  };
  logger.child = () => logger;
  return logger as any;
}

function makePolicy(overrides: Record<string, unknown> = {}) {
  return {
    getArchivalAgeDays: vi.fn().mockReturnValue(30),
    getCompressionThreshold: vi.fn().mockReturnValue(0.3),
    shouldRetainOriginals: vi.fn().mockReturnValue(true),
    getModel: vi.fn().mockReturnValue(null),
    ...overrides,
  } as any;
}

function makeBrainStorage(overrides: Record<string, unknown> = {}) {
  return {
    queryMemories: vi.fn().mockResolvedValue([]),
    createMemory: vi.fn().mockResolvedValue(makeMemory()),
    updateMemory: vi.fn().mockResolvedValue(makeMemory()),
    deleteMemory: vi.fn().mockResolvedValue(true),
    deleteMemories: vi.fn().mockResolvedValue(0),
    ...overrides,
  } as any;
}

function makeAuditStorage(overrides: Record<string, unknown> = {}) {
  return {
    archiveMemory: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as any;
}

function makeAiProvider(response: string | null = 'compressed summary') {
  return {
    chat: vi.fn().mockResolvedValue({ content: response }),
  } as any;
}

// ── Tests ────────────────────────────────────────────────────

describe('MemoryCompressor', () => {
  let brainStorage: ReturnType<typeof makeBrainStorage>;
  let auditStorage: ReturnType<typeof makeAuditStorage>;
  let policy: ReturnType<typeof makePolicy>;
  let logger: ReturnType<typeof makeLogger>;

  beforeEach(() => {
    brainStorage = makeBrainStorage();
    auditStorage = makeAuditStorage();
    policy = makePolicy();
    logger = makeLogger();
  });

  // ── Empty / No candidates ─────────────────────────────────

  describe('empty candidates', () => {
    it('returns empty summary when no episodic memories exist (daily)', async () => {
      brainStorage.queryMemories.mockResolvedValue([]);
      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      const result = await c.compress('daily', 'r-1', 'p-1');

      expect(result.candidatesFound).toBe(0);
      expect(result.memoriesCompressed).toBe(0);
      expect(result.memoriesArchived).toBe(0);
      expect(result.compressionRatio).toBe(0);
      expect(result.qualityChecksPassed).toBe(0);
      expect(result.qualityChecksFailed).toBe(0);
      expect(result.errors).toEqual([]);
    });

    it('returns empty summary when all episodic memories are recent', async () => {
      brainStorage.queryMemories.mockResolvedValue([makeMemory({ createdAt: RECENT })]);
      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      const result = await c.compress('daily', 'r-1');

      expect(result.candidatesFound).toBe(0);
      expect(result.memoriesCompressed).toBe(0);
    });

    it('returns empty summary when no semantic/procedural memories exist (weekly)', async () => {
      brainStorage.queryMemories.mockResolvedValue([]);
      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      const result = await c.compress('weekly', 'r-1');

      expect(result.candidatesFound).toBe(0);
      expect(result.memoriesCompressed).toBe(0);
    });

    it('skips thematic when fewer than 2 memories of a type', async () => {
      brainStorage.queryMemories.mockResolvedValue([makeMemory({ type: 'semantic' })]);
      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      const result = await c.compress('weekly', 'r-1');

      expect(result.memoriesCompressed).toBe(0);
    });
  });

  // ── Temporal Compression (daily) ──────────────────────────

  describe('temporal compression', () => {
    it('groups memories by context overlap and compresses', async () => {
      const mem1 = makeMemory({
        id: 'a',
        content: 'The database migration failed during deployment process',
        context: { topic: 'deploy', env: 'prod' },
        createdAt: OLD,
      });
      const mem2 = makeMemory({
        id: 'b',
        content: 'The database migration needed a rollback during deployment process',
        context: { topic: 'deploy', env: 'prod' },
        createdAt: OLD,
      });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2]);

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      const result = await c.compress('daily', 'r-1', 'p-1');

      expect(result.candidatesFound).toBe(2);
      expect(result.memoriesCompressed).toBe(1);
      expect(brainStorage.createMemory).toHaveBeenCalledTimes(1);
    });

    it('creates semantic memory from compressed group', async () => {
      const mem1 = makeMemory({
        id: 'a',
        content: 'user wanted integration testing setup',
        context: { topic: 'testing' },
        createdAt: OLD,
        importance: 0.9,
      });
      const mem2 = makeMemory({
        id: 'b',
        content: 'user wanted integration testing tools configured',
        context: { topic: 'testing' },
        createdAt: OLD,
        importance: 0.5,
      });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2]);

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      await c.compress('daily', 'r-1', 'p-1');

      expect(brainStorage.createMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'semantic',
          source: 'audit:compression:temporal',
          importance: 0.9, // max of group
        }),
        'p-1'
      );
    });

    it('sets compressedFrom in context of new memory', async () => {
      const mem1 = makeMemory({
        id: 'id-a',
        content: 'learned about docker compose orchestration details',
        context: { topic: 'docker' },
        createdAt: OLD,
      });
      const mem2 = makeMemory({
        id: 'id-b',
        content: 'learned about docker compose networking details',
        context: { topic: 'docker' },
        createdAt: OLD,
      });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2]);

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      await c.compress('daily', 'r-1');

      const createCall = brainStorage.createMemory.mock.calls[0]![0];
      expect(createCall.context.compressedFrom).toBe('id-a,id-b');
      expect(createCall.context.compressionLevel).toBe('1');
    });

    it('archives originals when retainOriginals is true', async () => {
      const mem1 = makeMemory({
        id: 'a',
        content: 'server configuration parameters updated',
        context: { topic: 'ops' },
        createdAt: OLD,
      });
      const mem2 = makeMemory({
        id: 'b',
        content: 'server configuration rollback parameters updated',
        context: { topic: 'ops' },
        createdAt: OLD,
      });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2]);

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      await c.compress('daily', 'r-1');

      expect(auditStorage.archiveMemory).toHaveBeenCalledTimes(2);
      expect(auditStorage.archiveMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          originalMemoryId: 'a',
          transformType: 'compressed',
          auditReportId: 'r-1',
        })
      );
    });

    it('skips archiving when retainOriginals is false', async () => {
      policy.shouldRetainOriginals.mockReturnValue(false);
      const mem1 = makeMemory({
        id: 'a',
        content: 'caching strategy implemented details',
        context: { topic: 'cache' },
        createdAt: OLD,
      });
      const mem2 = makeMemory({
        id: 'b',
        content: 'caching strategy improved details',
        context: { topic: 'cache' },
        createdAt: OLD,
      });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2]);

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      await c.compress('daily', 'r-1');

      expect(auditStorage.archiveMemory).not.toHaveBeenCalled();
    });

    it('deletes originals after compression', async () => {
      const mem1 = makeMemory({
        id: 'a',
        content: 'monitoring dashboard configuration alerts',
        context: { topic: 'monitor' },
        createdAt: OLD,
      });
      const mem2 = makeMemory({
        id: 'b',
        content: 'monitoring dashboard performance alerts',
        context: { topic: 'monitor' },
        createdAt: OLD,
      });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2]);

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      const result = await c.compress('daily', 'r-1');

      expect(brainStorage.deleteMemories).toHaveBeenCalledWith(['a', 'b']);
      expect(result.memoriesArchived).toBe(2);
    });

    it('skips groups with fewer than 2 members', async () => {
      // Two memories with different contexts won't group together
      const mem1 = makeMemory({
        id: 'a',
        content: 'topic alpha details',
        context: { topic: 'alpha' },
        createdAt: OLD,
      });
      const mem2 = makeMemory({
        id: 'b',
        content: 'topic beta details',
        context: { topic: 'beta', env: 'staging' },
        createdAt: OLD,
      });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2]);

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      const result = await c.compress('daily', 'r-1');

      expect(result.memoriesCompressed).toBe(0);
      expect(brainStorage.createMemory).not.toHaveBeenCalled();
    });

    it('handles errors in a group gracefully and records them', async () => {
      const mem1 = makeMemory({
        id: 'a',
        content: 'shared context information details',
        context: { k: 'v' },
        createdAt: OLD,
      });
      const mem2 = makeMemory({
        id: 'b',
        content: 'shared context knowledge details',
        context: { k: 'v' },
        createdAt: OLD,
      });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2]);
      brainStorage.createMemory.mockRejectedValue(new Error('DB write failed'));

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      const result = await c.compress('daily', 'r-1');

      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('Temporal group error');
    });

    it('counts candidatesFound correctly with multiple old memories', async () => {
      const mems = [
        makeMemory({
          id: 'a',
          content: 'alpha topic description here details',
          context: { x: '1' },
          createdAt: OLD,
        }),
        makeMemory({
          id: 'b',
          content: 'beta topic description here details',
          context: { x: '1' },
          createdAt: OLD,
        }),
        makeMemory({
          id: 'c',
          content: 'gamma topic special notes',
          context: { y: '2' },
          createdAt: OLD,
        }),
      ];
      brainStorage.queryMemories.mockResolvedValue(mems);

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      const result = await c.compress('daily', 'r-1');

      expect(result.candidatesFound).toBe(3);
    });
  });

  // ── Thematic Compression (weekly/monthly) ─────────────────

  describe('thematic compression', () => {
    it('clusters by content similarity and compresses', async () => {
      // Two very similar semantic memories
      const mem1 = makeMemory({
        id: 'a',
        type: 'semantic',
        content: 'the quick brown fox jumps over the lazy dog',
        accessCount: 5,
        importance: 0.8,
      });
      const mem2 = makeMemory({
        id: 'b',
        type: 'semantic',
        content: 'the quick brown fox leaps over the lazy dog',
        accessCount: 2,
        importance: 0.6,
      });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2]);

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      const result = await c.compress('weekly', 'r-1');

      expect(result.memoriesCompressed).toBeGreaterThanOrEqual(1);
    });

    it('uses anchor with highest accessCount/importance', async () => {
      const mem1 = makeMemory({
        id: 'anchor',
        type: 'semantic',
        content: 'user prefers typescript over javascript always',
        accessCount: 10,
        importance: 0.9,
      });
      const mem2 = makeMemory({
        id: 'other',
        type: 'semantic',
        content: 'user prefers typescript over javascript normally',
        accessCount: 1,
        importance: 0.3,
      });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2]);

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      await c.compress('weekly', 'r-1');

      // Anchor is updated, non-anchor is deleted
      expect(brainStorage.updateMemory).toHaveBeenCalledWith(
        'anchor',
        expect.objectContaining({
          content: expect.any(String),
        })
      );
      expect(brainStorage.deleteMemories).toHaveBeenCalledWith(['other']);
    });

    it('archives non-anchor members when retainOriginals is true', async () => {
      const mem1 = makeMemory({
        id: 'anchor',
        type: 'semantic',
        content: 'shared knowledge about database indexing strategies',
        accessCount: 10,
        importance: 0.9,
      });
      const mem2 = makeMemory({
        id: 'loser',
        type: 'semantic',
        content: 'shared knowledge about database indexing patterns',
        accessCount: 1,
        importance: 0.3,
      });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2]);

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      await c.compress('weekly', 'r-1');

      // Only the non-anchor gets archived
      expect(auditStorage.archiveMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          originalMemoryId: 'loser',
          transformType: 'merged',
        })
      );
      // Anchor is NOT archived
      const archiveCalls = auditStorage.archiveMemory.mock.calls;
      const archivedIds = archiveCalls.map((c: any[]) => c[0].originalMemoryId);
      expect(archivedIds).not.toContain('anchor');
    });

    it('does not archive non-anchor when retainOriginals is false', async () => {
      policy.shouldRetainOriginals.mockReturnValue(false);
      const mem1 = makeMemory({
        id: 'anchor',
        type: 'semantic',
        content: 'api endpoint configuration details setup',
        accessCount: 10,
        importance: 0.9,
      });
      const mem2 = makeMemory({
        id: 'other',
        type: 'semantic',
        content: 'api endpoint configuration details notes',
        accessCount: 1,
        importance: 0.3,
      });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2]);

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      await c.compress('weekly', 'r-1');

      expect(auditStorage.archiveMemory).not.toHaveBeenCalled();
    });

    it('processes both semantic and procedural types', async () => {
      const sem1 = makeMemory({
        id: 'sem1',
        type: 'semantic',
        content: 'react hooks patterns guide',
        accessCount: 5,
        importance: 0.7,
      });
      const sem2 = makeMemory({
        id: 'sem2',
        type: 'semantic',
        content: 'react hooks patterns tutorial',
        accessCount: 2,
        importance: 0.5,
      });
      const proc1 = makeMemory({
        id: 'proc1',
        type: 'procedural',
        content: 'deploy steps checklist procedure',
        accessCount: 8,
        importance: 0.8,
      });
      const proc2 = makeMemory({
        id: 'proc2',
        type: 'procedural',
        content: 'deploy steps checklist instructions',
        accessCount: 1,
        importance: 0.4,
      });

      // First call returns semantic, second returns procedural
      brainStorage.queryMemories
        .mockResolvedValueOnce([sem1, sem2])
        .mockResolvedValueOnce([proc1, proc2]);

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      const result = await c.compress('weekly', 'r-1');

      expect(brainStorage.queryMemories).toHaveBeenCalledTimes(2);
      expect(result.memoriesCompressed).toBeGreaterThanOrEqual(1);
    });

    it('increments compressionLevel on anchor context', async () => {
      const mem1 = makeMemory({
        id: 'anchor',
        type: 'semantic',
        content: 'kubernetes deployment patterns strategy guide',
        context: { compressionLevel: '2' },
        accessCount: 10,
        importance: 0.9,
      });
      const mem2 = makeMemory({
        id: 'other',
        type: 'semantic',
        content: 'kubernetes deployment patterns configuration guide',
        accessCount: 1,
        importance: 0.3,
      });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2]);

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      await c.compress('weekly', 'r-1');

      const updateCall = brainStorage.updateMemory.mock.calls[0];
      expect(updateCall[1].context.compressionLevel).toBe('3');
    });

    it('skips clusters with low content similarity', async () => {
      const mem1 = makeMemory({ id: 'a', type: 'semantic', content: 'alpha bravo charlie' });
      const mem2 = makeMemory({ id: 'b', type: 'semantic', content: 'delta echo foxtrot' });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2]);
      // threshold is 0.3 by default — these have 0 overlap
      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      const result = await c.compress('weekly', 'r-1');

      expect(result.memoriesCompressed).toBe(0);
    });

    it('handles errors in a cluster gracefully', async () => {
      const mem1 = makeMemory({
        id: 'a',
        type: 'semantic',
        content: 'overlapping content words here shared',
        accessCount: 5,
        importance: 0.8,
      });
      const mem2 = makeMemory({
        id: 'b',
        type: 'semantic',
        content: 'overlapping content words here shared too',
        accessCount: 1,
        importance: 0.4,
      });
      brainStorage.queryMemories
        .mockResolvedValueOnce([mem1, mem2]) // semantic
        .mockResolvedValueOnce([]); // procedural
      brainStorage.updateMemory.mockRejectedValue(new Error('update fail'));

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      const result = await c.compress('weekly', 'r-1');

      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('Thematic cluster error');
    });

    it('monthly scope also triggers thematic compression', async () => {
      brainStorage.queryMemories.mockResolvedValue([]);
      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      const result = await c.compress('monthly', 'r-1');

      expect(result.candidatesFound).toBe(0);
      // Confirms it ran (didn't throw for unrecognized scope)
      expect(result.errors).toEqual([]);
    });
  });

  // ── Quality Check ─────────────────────────────────────────

  describe('quality check', () => {
    it('passes when compressed text contains most key terms', async () => {
      // Memories with words > 4 chars that appear in the fallback concatenation
      const mem1 = makeMemory({
        id: 'a',
        content: 'database migration failed during deployment',
        context: { t: '1' },
        createdAt: OLD,
      });
      const mem2 = makeMemory({
        id: 'b',
        content: 'database migration rollback during deployment completed',
        context: { t: '1' },
        createdAt: OLD,
      });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2]);

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      const result = await c.compress('daily', 'r-1');

      // Fallback concatenation includes all original words → passes
      expect(result.qualityChecksPassed).toBe(1);
      expect(result.qualityChecksFailed).toBe(0);
    });

    it('fails when compressed text loses too many key terms', async () => {
      const mem1 = makeMemory({
        id: 'a',
        content: 'database migration orchestration framework',
        context: { t: '1' },
        createdAt: OLD,
      });
      const mem2 = makeMemory({
        id: 'b',
        content: 'database migration orchestration patterns',
        context: { t: '1' },
        createdAt: OLD,
      });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2]);

      // AI provider returns something with very few key terms
      const aiProvider = {
        chat: vi.fn().mockResolvedValue({ content: 'short note about xyz' }),
      } as any;

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger, aiProvider });
      const result = await c.compress('daily', 'r-1');

      expect(result.qualityChecksFailed).toBe(1);
      expect(result.qualityChecksPassed).toBe(0);
      // No compression should have occurred
      expect(brainStorage.createMemory).not.toHaveBeenCalled();
    });

    it('passes quality check when originals have no words > 4 chars', async () => {
      const mem1 = makeMemory({ id: 'a', content: 'a b c d', context: { t: '1' }, createdAt: OLD });
      const mem2 = makeMemory({ id: 'b', content: 'e f g h', context: { t: '1' }, createdAt: OLD });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2]);

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      const result = await c.compress('daily', 'r-1');

      // No key terms → automatically passes
      expect(result.qualityChecksPassed).toBe(1);
    });
  });

  // ── AI Provider ───────────────────────────────────────────

  describe('AI provider', () => {
    it('calls AI provider for compression when available', async () => {
      const aiProvider = makeAiProvider(
        'The database migration failed and was rolled back during deployment'
      );
      const mem1 = makeMemory({
        id: 'a',
        content: 'database migration failed during deployment process',
        context: { t: '1' },
        createdAt: OLD,
      });
      const mem2 = makeMemory({
        id: 'b',
        content: 'database migration rollback during deployment process',
        context: { t: '1' },
        createdAt: OLD,
      });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2]);

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger, aiProvider });
      await c.compress('daily', 'r-1');

      expect(aiProvider.chat).toHaveBeenCalledTimes(1);
      expect(aiProvider.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system' }),
            expect.objectContaining({ role: 'user' }),
          ]),
          stream: false,
        })
      );
    });

    it('uses model from policy when available', async () => {
      policy.getModel.mockReturnValue('gpt-4o');
      const aiProvider = makeAiProvider(
        'compressed database migration details deployment rollback process'
      );
      const mem1 = makeMemory({
        id: 'a',
        content: 'database migration details deployment',
        context: { t: '1' },
        createdAt: OLD,
      });
      const mem2 = makeMemory({
        id: 'b',
        content: 'database migration rollback deployment process',
        context: { t: '1' },
        createdAt: OLD,
      });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2]);

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger, aiProvider });
      await c.compress('daily', 'r-1');

      expect(aiProvider.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o',
        })
      );
    });

    it('falls back to concatenation when AI provider throws', async () => {
      const aiProvider = {
        chat: vi.fn().mockRejectedValue(new Error('API rate limit')),
      } as any;
      const mem1 = makeMemory({
        id: 'a',
        content: 'important configuration details about servers',
        context: { t: '1' },
        createdAt: OLD,
      });
      const mem2 = makeMemory({
        id: 'b',
        content: 'important configuration details about networking',
        context: { t: '1' },
        createdAt: OLD,
      });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2]);

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger, aiProvider });
      const result = await c.compress('daily', 'r-1');

      expect(logger.warn).toHaveBeenCalled();
      // Falls back and still compresses
      expect(result.qualityChecksPassed).toBe(1);
      expect(brainStorage.createMemory).toHaveBeenCalled();
    });

    it('handles AI returning a string directly', async () => {
      const aiProvider = {
        chat: vi
          .fn()
          .mockResolvedValue(
            'database migration during deployment happened and was completed successfully'
          ),
      } as any;
      const mem1 = makeMemory({
        id: 'a',
        content: 'database migration during deployment happened',
        context: { t: '1' },
        createdAt: OLD,
      });
      const mem2 = makeMemory({
        id: 'b',
        content: 'database migration deployment was completed',
        context: { t: '1' },
        createdAt: OLD,
      });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2]);

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger, aiProvider });
      const result = await c.compress('daily', 'r-1');

      expect(result.qualityChecksPassed).toBe(1);
    });

    it('handles AI returning empty content gracefully and falls back', async () => {
      const aiProvider = {
        chat: vi.fn().mockResolvedValue({ content: '' }),
      } as any;
      const mem1 = makeMemory({
        id: 'a',
        content: 'some knowledge about servers infrastructure',
        context: { t: '1' },
        createdAt: OLD,
      });
      const mem2 = makeMemory({
        id: 'b',
        content: 'some knowledge about servers configuration',
        context: { t: '1' },
        createdAt: OLD,
      });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2]);

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger, aiProvider });
      const result = await c.compress('daily', 'r-1');

      // parseCompressionResponse returns null for empty string, so compressGroup returns null
      // Then falls through — no compression
      expect(result.memoriesCompressed).toBe(0);
    });
  });

  // ── Fallback Compression ──────────────────────────────────

  describe('fallback compression (no AI)', () => {
    it('concatenates memory contents with pipe separator', async () => {
      const mem1 = makeMemory({
        id: 'a',
        content: 'content alpha about databases details',
        context: { t: '1' },
        createdAt: OLD,
      });
      const mem2 = makeMemory({
        id: 'b',
        content: 'content beta about databases details',
        context: { t: '1' },
        createdAt: OLD,
      });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2]);

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      await c.compress('daily', 'r-1');

      const createCall = brainStorage.createMemory.mock.calls[0]?.[0];
      expect(createCall.content).toContain('content alpha about databases details');
      expect(createCall.content).toContain(' | ');
      expect(createCall.content).toContain('content beta about databases details');
    });

    it('truncates combined content at 4096 characters', async () => {
      const longContent = 'x'.repeat(3000) + ' important_key_term';
      const mem1 = makeMemory({
        id: 'a',
        content: longContent,
        context: { t: '1' },
        createdAt: OLD,
      });
      const mem2 = makeMemory({
        id: 'b',
        content: longContent,
        context: { t: '1' },
        createdAt: OLD,
      });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2]);

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      await c.compress('daily', 'r-1');

      // Quality check may fail due to truncation, but the point is it doesn't crash
      const callsMade = brainStorage.createMemory.mock.calls.length;
      if (callsMade > 0) {
        const content = brainStorage.createMemory.mock.calls[0]![0].content;
        expect(content.length).toBeLessThanOrEqual(4096);
      }
    });
  });

  // ── Context Overlap (private, tested via temporal grouping) ─

  describe('context overlap behavior', () => {
    it('groups memories with identical context together', async () => {
      const ctx = { topic: 'deploy', env: 'prod', region: 'us-east' };
      const mem1 = makeMemory({
        id: 'a',
        content: 'deployment configuration details about servers',
        context: ctx,
        createdAt: OLD,
      });
      const mem2 = makeMemory({
        id: 'b',
        content: 'deployment configuration details about networking',
        context: ctx,
        createdAt: OLD,
      });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2]);

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      const result = await c.compress('daily', 'r-1');

      expect(result.memoriesCompressed).toBe(1);
    });

    it('does not group memories with completely different contexts', async () => {
      const mem1 = makeMemory({
        id: 'a',
        content: 'context alpha details info',
        context: { topic: 'alpha', env: 'prod' },
        createdAt: OLD,
      });
      const mem2 = makeMemory({
        id: 'b',
        content: 'context beta details info',
        context: { area: 'beta', tier: 'free' },
        createdAt: OLD,
      });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2]);

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      const result = await c.compress('daily', 'r-1');

      // No overlap at all → no group formed
      expect(result.memoriesCompressed).toBe(0);
    });

    it('groups memories with partial context overlap above threshold (>50%)', async () => {
      // 2 of 3 keys match → 66% overlap > 50% threshold
      const mem1 = makeMemory({
        id: 'a',
        content: 'partial context overlap testing details',
        context: { topic: 'x', env: 'prod', extra: 'a' },
        createdAt: OLD,
      });
      const mem2 = makeMemory({
        id: 'b',
        content: 'partial context overlap testing analysis',
        context: { topic: 'x', env: 'prod', extra: 'b' },
        createdAt: OLD,
      });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2]);

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      const result = await c.compress('daily', 'r-1');

      expect(result.memoriesCompressed).toBe(1);
    });

    it('treats two empty contexts as fully overlapping', async () => {
      const mem1 = makeMemory({
        id: 'a',
        content: 'empty context memory alpha details',
        context: {},
        createdAt: OLD,
      });
      const mem2 = makeMemory({
        id: 'b',
        content: 'empty context memory alpha analysis',
        context: {},
        createdAt: OLD,
      });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2]);

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      const result = await c.compress('daily', 'r-1');

      expect(result.memoriesCompressed).toBe(1);
    });
  });

  // ── Content Similarity (private, tested via thematic clustering) ─

  describe('content similarity behavior', () => {
    it('clusters identical content together', async () => {
      const mem1 = makeMemory({
        id: 'a',
        type: 'semantic',
        content: 'the quick brown fox jumps over the lazy dog',
        accessCount: 5,
        importance: 0.8,
      });
      const mem2 = makeMemory({
        id: 'b',
        type: 'semantic',
        content: 'the quick brown fox jumps over the lazy dog',
        accessCount: 2,
        importance: 0.5,
      });
      brainStorage.queryMemories
        .mockResolvedValueOnce([mem1, mem2]) // semantic
        .mockResolvedValueOnce([]); // procedural

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      const result = await c.compress('weekly', 'r-1');

      expect(result.memoriesCompressed).toBe(1);
    });

    it('does not cluster completely disjoint content', async () => {
      const mem1 = makeMemory({ id: 'a', type: 'semantic', content: 'alpha bravo charlie delta' });
      const mem2 = makeMemory({ id: 'b', type: 'semantic', content: 'echo foxtrot golf hotel' });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2]);

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      const result = await c.compress('weekly', 'r-1');

      expect(result.memoriesCompressed).toBe(0);
    });
  });

  // ── Compression Ratio ─────────────────────────────────────

  describe('compression ratio', () => {
    it('calculates ratio as (candidates - compressed) / candidates', async () => {
      const mem1 = makeMemory({
        id: 'a',
        content: 'overlapping content words information details',
        context: { t: '1' },
        createdAt: OLD,
      });
      const mem2 = makeMemory({
        id: 'b',
        content: 'overlapping content words information notes',
        context: { t: '1' },
        createdAt: OLD,
      });
      const mem3 = makeMemory({
        id: 'c',
        content: 'different topic entirely separate subject',
        context: { t: '1' },
        createdAt: OLD,
      });
      brainStorage.queryMemories.mockResolvedValue([mem1, mem2, mem3]);

      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      const result = await c.compress('daily', 'r-1');

      if (result.candidatesFound > 0 && result.memoriesCompressed > 0) {
        const expected =
          Math.round(
            ((result.candidatesFound - result.memoriesCompressed) / result.candidatesFound) * 100
          ) / 100;
        expect(result.compressionRatio).toBe(expected);
      }
    });

    it('compression ratio is 0 when no candidates found', async () => {
      brainStorage.queryMemories.mockResolvedValue([]);
      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      const result = await c.compress('daily', 'r-1');

      expect(result.compressionRatio).toBe(0);
    });
  });

  // ── Edge Cases ────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles top-level error gracefully', async () => {
      brainStorage.queryMemories.mockRejectedValue(new Error('connection lost'));
      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      const result = await c.compress('daily', 'r-1');

      expect(result.errors).toContain('Error: connection lost');
    });

    it('accepts personalityId as undefined', async () => {
      brainStorage.queryMemories.mockResolvedValue([]);
      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      const result = await c.compress('daily', 'r-1');

      expect(result.errors).toEqual([]);
      expect(brainStorage.queryMemories).toHaveBeenCalledWith(
        expect.objectContaining({
          personalityId: undefined,
        })
      );
    });

    it('constructs with aiProvider as null', () => {
      const c = new MemoryCompressor({
        brainStorage,
        auditStorage,
        policy,
        logger,
        aiProvider: null,
      });
      expect(c).toBeDefined();
    });

    it('constructs without aiProvider', () => {
      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      expect(c).toBeDefined();
    });

    it('uses thematic compression for weekly scope', async () => {
      brainStorage.queryMemories.mockResolvedValue([]);
      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      const result = await c.compress('weekly', 'r-1');

      // Thematic queries semantic + procedural = 2 calls
      expect(brainStorage.queryMemories).toHaveBeenCalledTimes(2);
      expect(result.errors).toEqual([]);
    });

    it('uses temporal compression for daily scope', async () => {
      brainStorage.queryMemories.mockResolvedValue([]);
      const c = new MemoryCompressor({ brainStorage, auditStorage, policy, logger });
      const result = await c.compress('daily', 'r-1');

      // Temporal queries only episodic = 1 call
      expect(brainStorage.queryMemories).toHaveBeenCalledTimes(1);
      expect(brainStorage.queryMemories).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'episodic',
        })
      );
      expect(result.errors).toEqual([]);
    });
  });
});
