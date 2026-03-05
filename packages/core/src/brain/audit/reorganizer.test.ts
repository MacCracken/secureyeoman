import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryReorganizer } from './reorganizer.js';
import type { Memory, KnowledgeEntry } from '../types.js';

// ── Helpers ──────────────────────────────────────────────────

const now = Date.now();
const FORTY_DAYS_AGO = now - 40 * 24 * 60 * 60 * 1000;
const TEN_DAYS_AGO = now - 10 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: 'mem-1',
    personalityId: 'p-1',
    type: 'episodic',
    content: 'The user discussed deployment strategies yesterday',
    source: 'conversation',
    context: { topic: 'deploy' },
    importance: 0.5,
    accessCount: 2,
    lastAccessedAt: now,
    expiresAt: null,
    createdAt: now - 5 * 24 * 60 * 60 * 1000,
    updatedAt: now,
    ...overrides,
  };
}

function makeKnowledge(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: 'k-1',
    personalityId: 'p-1',
    topic: 'TypeScript',
    content: 'TypeScript is a superset of JavaScript with static types.',
    source: 'documentation',
    confidence: 0.9,
    supersedes: null,
    createdAt: now,
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

function makeBrainStorage(overrides: Record<string, unknown> = {}) {
  return {
    queryMemories: vi.fn().mockResolvedValue([]),
    updateMemory: vi.fn().mockResolvedValue(makeMemory()),
    deleteMemory: vi.fn().mockResolvedValue(true),
    queryKnowledge: vi.fn().mockResolvedValue([]),
    updateKnowledge: vi.fn().mockResolvedValue(makeKnowledge()),
    createKnowledge: vi.fn().mockResolvedValue(makeKnowledge()),
    ...overrides,
  } as any;
}

function makeAuditStorage(overrides: Record<string, unknown> = {}) {
  return {
    archiveMemory: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as any;
}

// ── Tests ────────────────────────────────────────────────────

describe('MemoryReorganizer', () => {
  let brainStorage: ReturnType<typeof makeBrainStorage>;
  let auditStorage: ReturnType<typeof makeAuditStorage>;
  let logger: ReturnType<typeof makeLogger>;

  beforeEach(() => {
    brainStorage = makeBrainStorage();
    auditStorage = makeAuditStorage();
    logger = makeLogger();
  });

  // ── Promote: Episodic → Semantic ──────────────────────────

  describe('promote', () => {
    it('promotes episodic memory with accessCount > 5', async () => {
      const mem = makeMemory({ id: 'ep-1', accessCount: 8, content: 'user prefers dark mode' });
      brainStorage.queryMemories
        .mockResolvedValueOnce([mem]) // episodic query
        .mockResolvedValueOnce([]); // semantic query

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('daily', 'r-1', 'p-1');

      expect(result.promoted).toBe(1);
      expect(brainStorage.updateMemory).toHaveBeenCalledWith(
        'ep-1',
        expect.objectContaining({
          type: 'semantic',
          expiresAt: null,
        })
      );
    });

    it('skips episodic memory with accessCount <= 5', async () => {
      const mem = makeMemory({ id: 'ep-1', accessCount: 3 });
      brainStorage.queryMemories.mockResolvedValueOnce([mem]).mockResolvedValueOnce([]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('daily', 'r-1');

      expect(result.promoted).toBe(0);
      expect(brainStorage.updateMemory).not.toHaveBeenCalled();
    });

    it('skips episodic with exactly accessCount = 5', async () => {
      const mem = makeMemory({ id: 'ep-1', accessCount: 5 });
      brainStorage.queryMemories.mockResolvedValueOnce([mem]).mockResolvedValueOnce([]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('daily', 'r-1');

      expect(result.promoted).toBe(0);
    });

    it('strips temporal references from content when promoting', async () => {
      const mem = makeMemory({
        id: 'ep-1',
        accessCount: 10,
        content:
          'Yesterday the user configured the server. Today they deployed it. Just now it started.',
      });
      brainStorage.queryMemories.mockResolvedValueOnce([mem]).mockResolvedValueOnce([]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      await r.reorganize('daily', 'r-1');

      const updateCall = brainStorage.updateMemory.mock.calls[0];
      const newContent = updateCall[1].content;
      expect(newContent).not.toContain('Yesterday');
      expect(newContent).not.toContain('Today');
      expect(newContent).not.toContain('Just now');
      expect(newContent).toContain('user configured the server');
      expect(newContent).toContain('deployed it');
    });

    it('strips "this morning", "last night", "earlier", "recently"', async () => {
      const mem = makeMemory({
        id: 'ep-1',
        accessCount: 7,
        content:
          'This morning the build failed. Earlier it worked. Last night it was fine. Recently changes landed.',
      });
      brainStorage.queryMemories.mockResolvedValueOnce([mem]).mockResolvedValueOnce([]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      await r.reorganize('daily', 'r-1');

      const newContent = brainStorage.updateMemory.mock.calls[0]![1].content;
      expect(newContent).not.toMatch(/this morning/i);
      expect(newContent).not.toMatch(/last night/i);
      expect(newContent).not.toMatch(/\bearlier\b/i);
      expect(newContent).not.toMatch(/\brecently\b/i);
    });

    it('archives original before promoting', async () => {
      const mem = makeMemory({ id: 'ep-1', accessCount: 10 });
      brainStorage.queryMemories.mockResolvedValueOnce([mem]).mockResolvedValueOnce([]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      await r.reorganize('daily', 'r-1');

      expect(auditStorage.archiveMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          originalMemoryId: 'ep-1',
          transformType: 'promoted',
          auditReportId: 'r-1',
        })
      );
      // Archive happens before update
      const archiveOrder = auditStorage.archiveMemory.mock.invocationCallOrder[0];
      const updateOrder = brainStorage.updateMemory.mock.invocationCallOrder[0];
      expect(archiveOrder).toBeLessThan(updateOrder!);
    });

    it('promotes multiple eligible memories', async () => {
      const mems = [
        makeMemory({ id: 'ep-1', accessCount: 8 }),
        makeMemory({ id: 'ep-2', accessCount: 12 }),
        makeMemory({ id: 'ep-3', accessCount: 2 }), // not eligible
      ];
      brainStorage.queryMemories.mockResolvedValueOnce(mems).mockResolvedValueOnce([]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('daily', 'r-1');

      expect(result.promoted).toBe(2);
    });

    it('captures promote error in summary.errors', async () => {
      const mem = makeMemory({ id: 'ep-1', accessCount: 10 });
      brainStorage.queryMemories.mockResolvedValueOnce([mem]).mockResolvedValueOnce([]);
      brainStorage.updateMemory.mockRejectedValue(new Error('update failed'));

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('daily', 'r-1');

      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('Promote ep-1');
    });
  });

  // ── Demote: Semantic → Episodic ───────────────────────────

  describe('demote', () => {
    it('demotes semantic not accessed in 30+ days with importance < 0.2', async () => {
      const mem = makeMemory({
        id: 'sem-1',
        type: 'semantic',
        importance: 0.1,
        lastAccessedAt: FORTY_DAYS_AGO,
      });
      brainStorage.queryMemories
        .mockResolvedValueOnce([]) // episodic query
        .mockResolvedValueOnce([mem]); // semantic query

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('daily', 'r-1');

      expect(result.demoted).toBe(1);
      expect(brainStorage.updateMemory).toHaveBeenCalledWith(
        'sem-1',
        expect.objectContaining({
          type: 'episodic',
        })
      );
    });

    it('skips semantic accessed recently (within 30 days)', async () => {
      const mem = makeMemory({
        id: 'sem-1',
        type: 'semantic',
        importance: 0.1,
        lastAccessedAt: TEN_DAYS_AGO,
      });
      brainStorage.queryMemories.mockResolvedValueOnce([]).mockResolvedValueOnce([mem]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('daily', 'r-1');

      expect(result.demoted).toBe(0);
    });

    it('skips semantic with importance >= 0.2 even if old', async () => {
      const mem = makeMemory({
        id: 'sem-1',
        type: 'semantic',
        importance: 0.5,
        lastAccessedAt: FORTY_DAYS_AGO,
      });
      brainStorage.queryMemories.mockResolvedValueOnce([]).mockResolvedValueOnce([mem]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('daily', 'r-1');

      expect(result.demoted).toBe(0);
    });

    it('sets 7-day expiry on demoted memory', async () => {
      const mem = makeMemory({
        id: 'sem-1',
        type: 'semantic',
        importance: 0.05,
        lastAccessedAt: FORTY_DAYS_AGO,
      });
      brainStorage.queryMemories.mockResolvedValueOnce([]).mockResolvedValueOnce([mem]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      await r.reorganize('daily', 'r-1');

      const updateCall = brainStorage.updateMemory.mock.calls[0];
      const expiresAt = updateCall[1].expiresAt;
      // Should be approximately 7 days from now
      expect(expiresAt).toBeGreaterThan(now + SEVEN_DAYS_MS - 5000);
      expect(expiresAt).toBeLessThan(now + SEVEN_DAYS_MS + 5000);
    });

    it('uses createdAt when lastAccessedAt is null', async () => {
      const mem = makeMemory({
        id: 'sem-1',
        type: 'semantic',
        importance: 0.1,
        lastAccessedAt: null,
        createdAt: FORTY_DAYS_AGO,
      });
      brainStorage.queryMemories.mockResolvedValueOnce([]).mockResolvedValueOnce([mem]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('daily', 'r-1');

      expect(result.demoted).toBe(1);
    });

    it('archives before demoting', async () => {
      const mem = makeMemory({
        id: 'sem-1',
        type: 'semantic',
        importance: 0.05,
        lastAccessedAt: FORTY_DAYS_AGO,
      });
      brainStorage.queryMemories.mockResolvedValueOnce([]).mockResolvedValueOnce([mem]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      await r.reorganize('daily', 'r-1');

      expect(auditStorage.archiveMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          originalMemoryId: 'sem-1',
          transformType: 'demoted',
        })
      );
    });

    it('captures demote error in summary.errors', async () => {
      const mem = makeMemory({
        id: 'sem-1',
        type: 'semantic',
        importance: 0.05,
        lastAccessedAt: FORTY_DAYS_AGO,
      });
      brainStorage.queryMemories.mockResolvedValueOnce([]).mockResolvedValueOnce([mem]);
      auditStorage.archiveMemory.mockRejectedValue(new Error('archive failure'));

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('daily', 'r-1');

      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('Demote sem-1');
    });
  });

  // ── Topic Merge ───────────────────────────────────────────

  describe('topic merge', () => {
    it('merges knowledge with edit distance < 3', async () => {
      const k1 = makeKnowledge({
        id: 'k-1',
        topic: 'TypeScript',
        confidence: 0.9,
        content: 'TS is typed',
      });
      const k2 = makeKnowledge({
        id: 'k-2',
        topic: 'Typescript',
        confidence: 0.7,
        content: 'TS is great',
      });
      brainStorage.queryMemories.mockResolvedValue([]);
      brainStorage.queryKnowledge.mockResolvedValue([k1, k2]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('weekly', 'r-1');

      expect(result.topicsMerged).toBe(1);
    });

    it('higher confidence absorbs lower', async () => {
      const k1 = makeKnowledge({
        id: 'winner',
        topic: 'React',
        confidence: 0.95,
        content: 'React is a UI library',
      });
      const k2 = makeKnowledge({
        id: 'loser',
        topic: 'Reacr',
        confidence: 0.3,
        content: 'React uses JSX',
      });
      brainStorage.queryMemories.mockResolvedValue([]);
      brainStorage.queryKnowledge.mockResolvedValue([k1, k2]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      await r.reorganize('weekly', 'r-1');

      // Winner gets merged content
      expect(brainStorage.updateKnowledge).toHaveBeenCalledWith('winner', {
        content: 'React is a UI library\n\nReact uses JSX',
      });
      // Loser gets superseded marker
      expect(brainStorage.updateKnowledge).toHaveBeenCalledWith('loser', {
        content: expect.stringContaining('[Superseded by winner]'),
      });
    });

    it('lower confidence entry absorbs when it has higher confidence', async () => {
      const k1 = makeKnowledge({
        id: 'k-1',
        topic: 'Docker',
        confidence: 0.4,
        content: 'Docker containers',
      });
      const k2 = makeKnowledge({
        id: 'k-2',
        topic: 'Dockre',
        confidence: 0.8,
        content: 'Docker images',
      });
      brainStorage.queryMemories.mockResolvedValue([]);
      brainStorage.queryKnowledge.mockResolvedValue([k1, k2]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      await r.reorganize('weekly', 'r-1');

      // k2 has higher confidence, so k2 is the winner
      expect(brainStorage.updateKnowledge).toHaveBeenCalledWith('k-2', {
        content: 'Docker images\n\nDocker containers',
      });
    });

    it('skips already assigned (loser) entries', async () => {
      // k1 and k2 match (distance=0), k2 and k3 also match
      // But once k2 is assigned as loser, k3 should not try to merge with k2
      const k1 = makeKnowledge({
        id: 'k-1',
        topic: 'Node',
        confidence: 0.9,
        content: 'Node.js runtime',
      });
      const k2 = makeKnowledge({
        id: 'k-2',
        topic: 'Node',
        confidence: 0.5,
        content: 'Node event loop',
      });
      const k3 = makeKnowledge({
        id: 'k-3',
        topic: 'Node',
        confidence: 0.3,
        content: 'Node modules',
      });
      brainStorage.queryMemories.mockResolvedValue([]);
      brainStorage.queryKnowledge.mockResolvedValue([k1, k2, k3]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('weekly', 'r-1');

      // k1 absorbs k2 (first match), then k1 absorbs k3 (second match, k2 assigned)
      expect(result.topicsMerged).toBe(2);
    });

    it('does not merge topics with edit distance >= 3', async () => {
      const k1 = makeKnowledge({ id: 'k-1', topic: 'TypeScript', content: 'TS types' });
      const k2 = makeKnowledge({ id: 'k-2', topic: 'JavaScript', content: 'JS types' });
      brainStorage.queryMemories.mockResolvedValue([]);
      brainStorage.queryKnowledge.mockResolvedValue([k1, k2]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('weekly', 'r-1');

      expect(result.topicsMerged).toBe(0);
    });

    it('captures merge error in summary.errors', async () => {
      const k1 = makeKnowledge({ id: 'k-1', topic: 'Python', confidence: 0.9 });
      const k2 = makeKnowledge({ id: 'k-2', topic: 'Pythob', confidence: 0.3 });
      brainStorage.queryMemories.mockResolvedValue([]);
      brainStorage.queryKnowledge.mockResolvedValue([k1, k2]);
      brainStorage.updateKnowledge.mockRejectedValue(new Error('merge fail'));

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('weekly', 'r-1');

      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('Merge topics');
    });
  });

  // ── Topic Split ───────────────────────────────────────────

  describe('topic split', () => {
    it('splits knowledge > 2000 chars at paragraphs', async () => {
      const longContent =
        'First paragraph content here.\n\nSecond paragraph content here.\n\nThird paragraph content here.';
      // Pad to exceed 2000 chars
      const padded = longContent + '\n\n' + 'a'.repeat(2000);
      const entry = makeKnowledge({
        id: 'k-big',
        content: padded,
        topic: 'BigTopic',
        confidence: 0.85,
      });
      brainStorage.queryMemories.mockResolvedValue([]);
      brainStorage.queryKnowledge.mockResolvedValue([entry]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('weekly', 'r-1');

      expect(result.topicsSplit).toBe(1);
      // Original updated with first part
      expect(brainStorage.updateKnowledge).toHaveBeenCalledWith(
        'k-big',
        expect.objectContaining({
          content: expect.any(String),
        })
      );
      // New entries created for remaining parts
      expect(brainStorage.createKnowledge).toHaveBeenCalled();
    });

    it('preserves confidence on new child entries', async () => {
      const longContent = 'Paragraph one.\n\n' + 'b'.repeat(2000);
      const entry = makeKnowledge({
        id: 'k-big',
        content: longContent,
        topic: 'Topic',
        confidence: 0.75,
      });
      brainStorage.queryMemories.mockResolvedValue([]);
      brainStorage.queryKnowledge.mockResolvedValue([entry]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      await r.reorganize('weekly', 'r-1');

      const createCall = brainStorage.createKnowledge.mock.calls[0]![0];
      expect(createCall.confidence).toBe(0.75);
    });

    it('creates numbered topic names for split parts', async () => {
      const longContent = 'Part A.\n\nPart B.\n\n' + 'c'.repeat(2000);
      const entry = makeKnowledge({
        id: 'k-big',
        content: longContent,
        topic: 'SplitMe',
        confidence: 0.8,
      });
      brainStorage.queryMemories.mockResolvedValue([]);
      brainStorage.queryKnowledge.mockResolvedValue([entry]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      await r.reorganize('weekly', 'r-1');

      const createCalls = brainStorage.createKnowledge.mock.calls;
      expect(createCalls.length).toBeGreaterThanOrEqual(1);
      // Check that the topic includes a part number
      expect(createCalls[0]![0].topic).toMatch(/SplitMe \(\d+\/\d+\)/);
    });

    it('skips knowledge <= 2000 chars', async () => {
      const entry = makeKnowledge({ id: 'k-small', content: 'Short content.' });
      brainStorage.queryMemories.mockResolvedValue([]);
      brainStorage.queryKnowledge.mockResolvedValue([entry]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('weekly', 'r-1');

      expect(result.topicsSplit).toBe(0);
    });

    it('skips knowledge exactly 2000 chars', async () => {
      const entry = makeKnowledge({ id: 'k-exact', content: 'x'.repeat(2000) });
      brainStorage.queryMemories.mockResolvedValue([]);
      brainStorage.queryKnowledge.mockResolvedValue([entry]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('weekly', 'r-1');

      expect(result.topicsSplit).toBe(0);
    });

    it('uses sentence boundary fallback when no paragraphs', async () => {
      // Content > 2000 chars with sentences but no paragraph breaks
      const sentences = [];
      for (let i = 0; i < 35; i++) {
        sentences.push(`Sentence number ${i} with some additional padding text for extra length.`);
      }
      const longContent = sentences.join(' ');
      expect(longContent.length).toBeGreaterThan(2000);

      const entry = makeKnowledge({ id: 'k-nopara', content: longContent });
      brainStorage.queryMemories.mockResolvedValue([]);
      brainStorage.queryKnowledge.mockResolvedValue([entry]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('weekly', 'r-1');

      expect(result.topicsSplit).toBe(1);
      expect(brainStorage.createKnowledge).toHaveBeenCalled();
    });

    it('skips split if content cannot be split into 2+ parts', async () => {
      // Single very long word with no paragraph or sentence breaks
      const entry = makeKnowledge({ id: 'k-nosplit', content: 'a'.repeat(2001) });
      brainStorage.queryMemories.mockResolvedValue([]);
      brainStorage.queryKnowledge.mockResolvedValue([entry]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('weekly', 'r-1');

      // Cannot split into 2+ parts → skipped
      expect(result.topicsSplit).toBe(0);
    });

    it('captures split error in summary.errors', async () => {
      const longContent = 'Part A.\n\nPart B.\n\n' + 'd'.repeat(2000);
      const entry = makeKnowledge({ id: 'k-err', content: longContent });
      brainStorage.queryMemories.mockResolvedValue([]);
      brainStorage.queryKnowledge.mockResolvedValue([entry]);
      brainStorage.updateKnowledge.mockRejectedValue(new Error('split fail'));

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('weekly', 'r-1');

      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('Split topic k-err');
    });

    it('passes personalityId when creating new knowledge entries', async () => {
      const longContent = 'Part A.\n\n' + 'e'.repeat(2000);
      const entry = makeKnowledge({ id: 'k-pid', content: longContent });
      brainStorage.queryMemories.mockResolvedValue([]);
      brainStorage.queryKnowledge.mockResolvedValue([entry]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      await r.reorganize('weekly', 'r-1', 'personality-42');

      expect(brainStorage.createKnowledge).toHaveBeenCalledWith(
        expect.any(Object),
        'personality-42'
      );
    });
  });

  // ── Importance Recalibration ──────────────────────────────

  describe('importance recalibration', () => {
    it('adjusts importance toward target distribution', async () => {
      // Create 10 memories all with importance 0.5
      const mems = Array.from({ length: 10 }, (_, i) =>
        makeMemory({ id: `m-${i}`, importance: 0.5 })
      );
      brainStorage.queryMemories
        .mockResolvedValueOnce([]) // episodic
        .mockResolvedValueOnce([]) // semantic
        .mockResolvedValueOnce(mems); // recalibration

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('weekly', 'r-1');

      expect(result.importanceRecalibrated).toBeGreaterThan(0);
    });

    it('applies gentle nudge (50% of diff)', async () => {
      // One memory with importance 0.5. With 1 item: highCutoff=0, midCutoff=0,
      // so it falls into the "low" band. Target = 0.3, diff = 0.2 > 0.1.
      // Nudge = 0.5 + (0.3 - 0.5) * 0.5 = 0.4
      const mems = [makeMemory({ id: 'm-0', importance: 0.5 })];
      brainStorage.queryMemories
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(mems);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      await r.reorganize('weekly', 'r-1');

      expect(brainStorage.updateMemory).toHaveBeenCalled();
      const call = brainStorage.updateMemory.mock.calls[0];
      const newImportance = call[1].importance;
      // Nudge should move toward 0.3 (target), result is 0.4
      expect(newImportance).toBe(0.4);
    });

    it('skips recalibration when diff < 0.1', async () => {
      // One memory at importance 0.3. With 1 item the target is exactly 0.3
      // (low band, pos=0 → target = 0.3 - 0*0.25 = 0.3). diff ≈ 0 → should skip.
      const mems = [makeMemory({ id: 'm-0', importance: 0.3 })];
      brainStorage.queryMemories
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(mems);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('weekly', 'r-1');

      expect(result.importanceRecalibrated).toBe(0);
    });

    it('clamps recalibrated importance to [0.01, 1]', async () => {
      // Very low importance → target might push close to 0
      const mems = [
        makeMemory({ id: 'm-0', importance: 0.9 }),
        makeMemory({ id: 'm-1', importance: 0.001 }),
      ];
      brainStorage.queryMemories
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(mems);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      await r.reorganize('weekly', 'r-1');

      for (const call of brainStorage.updateMemory.mock.calls) {
        const imp = call[1].importance;
        if (imp !== undefined) {
          expect(imp).toBeGreaterThanOrEqual(0.01);
          expect(imp).toBeLessThanOrEqual(1);
        }
      }
    });

    it('skips when no memories exist', async () => {
      brainStorage.queryMemories.mockResolvedValue([]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('weekly', 'r-1');

      expect(result.importanceRecalibrated).toBe(0);
    });

    it('captures recalibration error in summary.errors', async () => {
      const mems = Array.from({ length: 5 }, (_, i) =>
        makeMemory({ id: `m-${i}`, importance: 0.5 })
      );
      brainStorage.queryMemories
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(mems);
      brainStorage.updateMemory.mockRejectedValue(new Error('recalibrate fail'));

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('weekly', 'r-1');

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Recalibrate');
    });
  });

  // ── Scope Behavior ────────────────────────────────────────

  describe('scope behavior', () => {
    it('daily scope only runs promote and demote', async () => {
      brainStorage.queryMemories.mockResolvedValue([]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('daily', 'r-1');

      // promote queries episodic, demote queries semantic = 2 calls
      expect(brainStorage.queryMemories).toHaveBeenCalledTimes(2);
      // No knowledge queries (merge/split) or recalibration query
      expect(brainStorage.queryKnowledge).not.toHaveBeenCalled();
      expect(result.topicsMerged).toBe(0);
      expect(result.topicsSplit).toBe(0);
      expect(result.importanceRecalibrated).toBe(0);
    });

    it('weekly scope runs all operations', async () => {
      brainStorage.queryMemories.mockResolvedValue([]);
      brainStorage.queryKnowledge.mockResolvedValue([]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      await r.reorganize('weekly', 'r-1');

      // promote(episodic) + demote(semantic) + recalibrate(all) = 3 queryMemories calls
      expect(brainStorage.queryMemories).toHaveBeenCalledTimes(3);
      // merge + split = 2 queryKnowledge calls
      expect(brainStorage.queryKnowledge).toHaveBeenCalledTimes(2);
    });

    it('monthly scope runs all operations', async () => {
      brainStorage.queryMemories.mockResolvedValue([]);
      brainStorage.queryKnowledge.mockResolvedValue([]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      await r.reorganize('monthly', 'r-1');

      expect(brainStorage.queryMemories).toHaveBeenCalledTimes(3);
      expect(brainStorage.queryKnowledge).toHaveBeenCalledTimes(2);
    });
  });

  // ── Edit Distance (via topic merge behavior) ──────────────

  describe('edit distance behavior', () => {
    it('identical topics have distance 0 and merge', async () => {
      const k1 = makeKnowledge({ id: 'k-1', topic: 'React', confidence: 0.9 });
      const k2 = makeKnowledge({ id: 'k-2', topic: 'React', confidence: 0.5 });
      brainStorage.queryMemories.mockResolvedValue([]);
      brainStorage.queryKnowledge.mockResolvedValue([k1, k2]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('weekly', 'r-1');

      expect(result.topicsMerged).toBe(1);
    });

    it('case-insensitive comparison (distance between "React" and "react" = 0)', async () => {
      const k1 = makeKnowledge({ id: 'k-1', topic: 'React', confidence: 0.9 });
      const k2 = makeKnowledge({ id: 'k-2', topic: 'react', confidence: 0.5 });
      brainStorage.queryMemories.mockResolvedValue([]);
      brainStorage.queryKnowledge.mockResolvedValue([k1, k2]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('weekly', 'r-1');

      expect(result.topicsMerged).toBe(1);
    });

    it('completely different strings have distance >= 3 and do not merge', async () => {
      const k1 = makeKnowledge({ id: 'k-1', topic: 'Python' });
      const k2 = makeKnowledge({ id: 'k-2', topic: 'Kubernetes' });
      brainStorage.queryMemories.mockResolvedValue([]);
      brainStorage.queryKnowledge.mockResolvedValue([k1, k2]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('weekly', 'r-1');

      expect(result.topicsMerged).toBe(0);
    });

    it('topics with distance exactly 2 still merge', async () => {
      // "abc" → "axc" = 1 substitution; "abc" → "abcde" = 2 insertions
      const k1 = makeKnowledge({ id: 'k-1', topic: 'abc', confidence: 0.9 });
      const k2 = makeKnowledge({ id: 'k-2', topic: 'abcde', confidence: 0.5 });
      brainStorage.queryMemories.mockResolvedValue([]);
      brainStorage.queryKnowledge.mockResolvedValue([k1, k2]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('weekly', 'r-1');

      expect(result.topicsMerged).toBe(1);
    });
  });

  // ── Empty / Edge Cases ────────────────────────────────────

  describe('edge cases', () => {
    it('returns empty summary when no memories or knowledge exist', async () => {
      brainStorage.queryMemories.mockResolvedValue([]);
      brainStorage.queryKnowledge.mockResolvedValue([]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('weekly', 'r-1');

      expect(result.promoted).toBe(0);
      expect(result.demoted).toBe(0);
      expect(result.topicsMerged).toBe(0);
      expect(result.topicsSplit).toBe(0);
      expect(result.importanceRecalibrated).toBe(0);
      expect(result.coherenceIssuesFound).toBe(0);
      expect(result.coherenceIssuesFixed).toBe(0);
      expect(result.errors).toEqual([]);
    });

    it('captures top-level error in summary.errors', async () => {
      brainStorage.queryMemories.mockRejectedValue(new Error('connection lost'));

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('daily', 'r-1');

      expect(result.errors).toContain('Error: connection lost');
    });

    it('accepts personalityId as undefined', async () => {
      brainStorage.queryMemories.mockResolvedValue([]);

      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      const result = await r.reorganize('daily', 'r-1');

      expect(result.errors).toEqual([]);
      expect(brainStorage.queryMemories).toHaveBeenCalledWith(
        expect.objectContaining({
          personalityId: undefined,
        })
      );
    });

    it('constructs without error', () => {
      const r = new MemoryReorganizer({ brainStorage, auditStorage, logger });
      expect(r).toBeDefined();
    });
  });
});
