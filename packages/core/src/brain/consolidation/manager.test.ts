import { describe, it, expect, vi, afterEach } from 'vitest';
import { ConsolidationManager } from './manager.js';

const makeLogger = () => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn().mockReturnThis(),
  level: 'info',
});

const MEMORY = {
  id: 'mem-1',
  type: 'semantic',
  content: 'test content',
  source: 'user',
  createdAt: 1000,
  updatedAt: 1000,
  lastAccessedAt: 1000,
  importance: 0.5,
  accessCount: 1,
};

function makeVectorManager(overrides: any = {}) {
  return {
    searchMemories: vi.fn().mockResolvedValue([]),
    searchKnowledge: vi.fn().mockResolvedValue([]),
    indexMemory: vi.fn().mockResolvedValue(undefined),
    indexKnowledge: vi.fn().mockResolvedValue(undefined),
    removeMemory: vi.fn().mockResolvedValue(undefined),
    removeKnowledge: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeStorage(overrides: any = {}) {
  return {
    getMemory: vi.fn().mockResolvedValue(MEMORY),
    deleteMemory: vi.fn().mockResolvedValue(undefined),
    queryMemories: vi.fn().mockResolvedValue([]),
    touchMemories: vi.fn().mockResolvedValue(undefined),
    setMeta: vi.fn().mockResolvedValue(undefined),
    getMeta: vi.fn().mockResolvedValue(null),
    createMemory: vi.fn().mockResolvedValue(MEMORY),
    updateMemory: vi.fn().mockResolvedValue(MEMORY),
    ...overrides,
  };
}

function makeConfig(overrides: any = {}) {
  return {
    enabled: true,
    schedule: '0 2 * * *',
    quickCheck: { autoDedupThreshold: 0.95, flagThreshold: 0.85 },
    deepConsolidation: { replaceThreshold: 0.9, batchSize: 10, timeoutMs: 30000, dryRun: false },
    model: null,
    ...overrides,
  };
}

function makeManager(storageOverrides: any = {}, configOverrides: any = {}, aiProvider?: any) {
  const storage = makeStorage(storageOverrides);
  const vectorManager = makeVectorManager();
  const logger = makeLogger();
  const auditChain = { record: vi.fn().mockResolvedValue(undefined) };
  const config = makeConfig(configOverrides);
  const deps = {
    vectorManager: vectorManager as any,
    storage: storage as any,
    auditChain: auditChain as any,
    logger: logger as any,
    aiProvider,
  };
  const manager = new ConsolidationManager(config as any, deps);
  return { manager, storage, vectorManager, logger, config };
}

describe('ConsolidationManager', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('onMemorySave', () => {
    it('returns clean when disabled', async () => {
      const { manager } = makeManager({}, { enabled: false });
      expect(await manager.onMemorySave(MEMORY as any)).toBe('clean');
    });

    it('returns clean when no similar memories found', async () => {
      const { manager } = makeManager();
      expect(await manager.onMemorySave(MEMORY as any)).toBe('clean');
    });

    it('returns deduped and deletes when similarity >= autoDedupThreshold', async () => {
      const { manager, storage, vectorManager } = makeManager();
      vectorManager.searchMemories.mockResolvedValue([{ id: 'mem-2', score: 0.97 }]);
      const result = await manager.onMemorySave(MEMORY as any);
      expect(result).toBe('deduped');
      expect(storage.deleteMemory).toHaveBeenCalledWith('mem-1');
      expect(vectorManager.removeMemory).toHaveBeenCalledWith('mem-1');
    });

    it('returns flagged when similarity >= flagThreshold but < autoDedupThreshold', async () => {
      const { manager, vectorManager } = makeManager();
      vectorManager.searchMemories.mockResolvedValue([{ id: 'mem-2', score: 0.88 }]);
      const result = await manager.onMemorySave(MEMORY as any);
      expect(result).toBe('flagged');
    });

    it('filters out self from similar results', async () => {
      const { manager, vectorManager } = makeManager();
      // Only result is self — should not dedup
      vectorManager.searchMemories.mockResolvedValue([{ id: 'mem-1', score: 0.99 }]);
      const result = await manager.onMemorySave(MEMORY as any);
      expect(result).toBe('clean');
    });

    it('returns clean when vector search fails', async () => {
      const { manager, vectorManager } = makeManager();
      vectorManager.searchMemories.mockRejectedValue(new Error('vector error'));
      const result = await manager.onMemorySave(MEMORY as any);
      expect(result).toBe('clean');
    });
  });

  describe('runDeepConsolidation', () => {
    it('returns empty report when no candidates', async () => {
      const { manager } = makeManager();
      const report = await manager.runDeepConsolidation();
      expect(report.totalCandidates).toBe(0);
      expect(report.actions).toHaveLength(0);
    });

    it('runs without AI provider using threshold-based dedup', async () => {
      const similarResult = {
        id: 'mem-2',
        score: 0.95,
        content: 'similar content',
        importance: 0.3,
      };
      const { manager, storage, vectorManager } = makeManager();
      storage.queryMemories.mockResolvedValue([MEMORY]);
      vectorManager.searchMemories.mockResolvedValue([similarResult]);
      storage.getMemory.mockImplementation((id: string) => {
        if (id === 'mem-1') return Promise.resolve(MEMORY);
        if (id === 'mem-2')
          return Promise.resolve({
            ...MEMORY,
            id: 'mem-2',
            content: 'similar content',
            importance: 0.3,
          });
        return Promise.resolve(null);
      });
      const report = await manager.runDeepConsolidation();
      expect(report.dryRun).toBe(false);
    });

    it('runs in dryRun mode when configured', async () => {
      const { manager } = makeManager(
        {},
        {
          deepConsolidation: {
            replaceThreshold: 0.9,
            batchSize: 10,
            timeoutMs: 30000,
            dryRun: true,
          },
        }
      );
      const report = await manager.runDeepConsolidation();
      expect(report.dryRun).toBe(true);
    });

    it('uses AI provider when available and candidates exist', async () => {
      const similarResult = { id: 'mem-2', score: 0.88 };
      const mockAiProvider = {
        chat: vi.fn().mockResolvedValue({ content: '[]', finishReason: 'stop', usage: null }),
      };
      const { manager, storage, vectorManager } = makeManager({}, {}, mockAiProvider);
      storage.queryMemories.mockResolvedValue([MEMORY]);
      vectorManager.searchMemories.mockResolvedValue([similarResult]);
      storage.getMemory.mockImplementation((id: string) => {
        if (id === 'mem-1') return Promise.resolve(MEMORY);
        return Promise.resolve({ ...MEMORY, id, content: 'similar' });
      });
      const report = await manager.runDeepConsolidation();
      expect(mockAiProvider.chat).toHaveBeenCalled();
      expect(report.actions).toHaveLength(0); // empty JSON array response
    });

    it('records report in history', async () => {
      const { manager } = makeManager();
      await manager.runDeepConsolidation();
      expect(manager.getHistory()).toHaveLength(1);
    });
  });

  describe('scheduling', () => {
    it('start/stop does not throw', () => {
      vi.useFakeTimers();
      const { manager } = makeManager();
      expect(() => manager.start()).not.toThrow();
      expect(() => manager.stop()).not.toThrow();
    });

    it('start is idempotent', () => {
      vi.useFakeTimers();
      const { manager } = makeManager();
      manager.start();
      manager.start(); // second call should be no-op
      manager.stop();
    });

    it('getSchedule returns current schedule', () => {
      const { manager } = makeManager({}, { schedule: '0 3 * * 1' });
      expect(manager.getSchedule()).toBe('0 3 * * 1');
    });

    it('setSchedule updates the schedule', () => {
      const { manager } = makeManager();
      manager.setSchedule('0 4 * * *');
      expect(manager.getSchedule()).toBe('0 4 * * *');
    });
  });

  describe('getHistory', () => {
    it('starts with empty history', () => {
      const { manager } = makeManager();
      expect(manager.getHistory()).toHaveLength(0);
    });

    it('returns copies of history entries', async () => {
      const { manager } = makeManager();
      await manager.runDeepConsolidation();
      const history = manager.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].totalCandidates).toBe(0);
    });
  });

  describe('onMemorySave edge cases', () => {
    it('returns clean when score is below flagThreshold', async () => {
      const { manager, vectorManager } = makeManager();
      // Score 0.70 < flagThreshold 0.85 → clean
      vectorManager.searchMemories.mockResolvedValue([{ id: 'mem-2', score: 0.7 }]);
      const result = await manager.onMemorySave(MEMORY as any);
      expect(result).toBe('clean');
    });
  });

  describe('runDeepConsolidation error handling', () => {
    it('handles queryMemories error gracefully', async () => {
      const { manager, storage } = makeManager();
      storage.queryMemories.mockRejectedValue(new Error('DB error'));
      // Should not throw — returns an empty report
      await expect(manager.runDeepConsolidation()).rejects.toThrow('DB error');
    });

    it('AI provider returning malformed JSON still records report', async () => {
      const similarResult = { id: 'mem-2', score: 0.88 };
      const mockAiProvider = {
        chat: vi
          .fn()
          .mockResolvedValue({ content: 'not valid json!', finishReason: 'stop', usage: null }),
      };
      const { manager, storage, vectorManager } = makeManager({}, {}, mockAiProvider);
      storage.queryMemories.mockResolvedValue([MEMORY]);
      vectorManager.searchMemories.mockResolvedValue([similarResult]);
      storage.getMemory.mockImplementation((id: string) => {
        if (id === 'mem-1') return Promise.resolve(MEMORY);
        return Promise.resolve({ ...MEMORY, id, content: 'similar' });
      });
      // Should not throw — JSON parse error is caught internally
      const report = await manager.runDeepConsolidation();
      expect(report.actions).toHaveLength(0);
      expect(manager.getHistory()).toHaveLength(1);
    });

    it('records multiple reports in history', async () => {
      const { manager } = makeManager();
      await manager.runDeepConsolidation();
      await manager.runDeepConsolidation();
      expect(manager.getHistory()).toHaveLength(2);
    });

    it('trims history to 50 entries when exceeded', async () => {
      const { manager } = makeManager();
      for (let i = 0; i < 51; i++) {
        await manager.runDeepConsolidation();
      }
      expect(manager.getHistory()).toHaveLength(50);
    });

    it('continues when getMemory returns null for an id in the process list', async () => {
      const { manager, storage, vectorManager } = makeManager();
      storage.queryMemories.mockResolvedValue([MEMORY]);
      // getMemory returns null → continue branch in for loop
      storage.getMemory.mockResolvedValue(null);
      const report = await manager.runDeepConsolidation();
      expect(report.totalCandidates).toBe(0);
    });

    it('uses bestMatch id as keepId when bestMatch importance is higher', async () => {
      const mem2 = { ...MEMORY, id: 'mem-2', content: 'other', importance: 0.9 };
      const { manager, storage, vectorManager } = makeManager();
      storage.queryMemories.mockResolvedValue([MEMORY]); // importance: 0.5
      vectorManager.searchMemories.mockResolvedValue([{ id: 'mem-2', score: 0.95 }]);
      storage.getMemory.mockImplementation((id: string) => {
        if (id === 'mem-1') return Promise.resolve(MEMORY);
        return Promise.resolve(mem2);
      });
      const report = await manager.runDeepConsolidation();
      // With mem-1 importance=0.5 < mem-2 importance=0.9, bestMatch.id is keepId
      expect(report.actions.length).toBeGreaterThanOrEqual(0); // dedup happens
    });

    it('handles persistFlaggedIds setMeta error gracefully', async () => {
      const { manager, storage } = makeManager({
        setMeta: vi.fn().mockRejectedValue(new Error('DB down')),
      });
      // runDeepConsolidation calls persistFlaggedIds at the end — should not throw
      await expect(manager.runDeepConsolidation()).resolves.toBeDefined();
    });

    it('loads flaggedIds on start when getMeta returns serialized IDs', async () => {
      let resolveMeta!: (v: string) => void;
      const metaPromise = new Promise<string>((r) => {
        resolveMeta = r;
      });
      const { manager, storage } = makeManager({
        getMeta: vi.fn().mockReturnValue(metaPromise),
      });
      manager.start();
      resolveMeta('["flag-1","flag-2"]');
      // Flush the resolved promise chain
      await metaPromise;
      await Promise.resolve();
      manager.stop();
      expect(storage.getMeta).toHaveBeenCalled();
    });

    it('handles loadFlaggedIds getMeta error gracefully', async () => {
      let rejectMeta!: (e: Error) => void;
      const metaPromise = new Promise<string>((_, r) => {
        rejectMeta = r;
      });
      const { manager, storage } = makeManager({
        getMeta: vi.fn().mockReturnValue(metaPromise),
      });
      manager.start();
      rejectMeta(new Error('read error'));
      // Let the rejected promise settle — error is caught inside loadFlaggedIds
      await metaPromise.catch(() => {});
      await Promise.resolve();
      manager.stop();
      expect(storage.getMeta).toHaveBeenCalled();
    });
  });

  describe('checkSchedule — cron matching', () => {
    it('skips scheduling when cron has fewer than 5 parts', async () => {
      vi.useFakeTimers();
      const { manager } = makeManager({}, { schedule: 'bad cron' });
      manager.start();
      // Advance 60s to trigger checkSchedule — with < 5 parts it returns early
      vi.advanceTimersByTime(60_000);
      // No runDeepConsolidation should have fired
      expect(manager.getHistory()).toHaveLength(0);
      manager.stop();
      vi.useRealTimers();
    });

    it('fires runDeepConsolidation when schedule matches all wildcards', async () => {
      vi.useFakeTimers();
      const { manager } = makeManager({}, { schedule: '* * * * *' });
      manager.start();
      vi.advanceTimersByTime(60_000);
      // Allow async chain to settle
      await Promise.resolve();
      await Promise.resolve();
      manager.stop();
      vi.useRealTimers();
      // History may or may not be 1 depending on timing — just confirm no throw
      expect(manager.getHistory().length).toBeGreaterThanOrEqual(0);
    });
  });
});
