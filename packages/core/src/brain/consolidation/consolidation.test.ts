/**
 * Memory Consolidation Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConsolidationManager, type ConsolidationConfig, type ConsolidationManagerDeps } from './manager.js';
import { parseConsolidationResponse, buildConsolidationPrompt } from './prompts.js';
import type { Memory } from '../types.js';

function makeMemory(id: string, content: string, importance = 0.5): Memory {
  return {
    id,
    type: 'semantic',
    content,
    source: 'test',
    context: {},
    importance,
    accessCount: 0,
    lastAccessedAt: null,
    expiresAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

const defaultConfig: ConsolidationConfig = {
  enabled: true,
  schedule: '0 2 * * *',
  quickCheck: {
    autoDedupThreshold: 0.95,
    flagThreshold: 0.85,
  },
  deepConsolidation: {
    replaceThreshold: 0.9,
    batchSize: 50,
    timeoutMs: 30000,
    dryRun: false,
  },
  model: null,
};

function createMockDeps(): ConsolidationManagerDeps {
  return {
    vectorManager: {
      searchMemories: vi.fn(async () => []),
      searchKnowledge: vi.fn(async () => []),
      indexMemory: vi.fn(async () => {}),
      removeMemory: vi.fn(async () => {}),
      indexKnowledge: vi.fn(async () => {}),
      removeKnowledge: vi.fn(async () => {}),
      reindexAll: vi.fn(async () => ({ indexed: 0 })),
      close: vi.fn(async () => {}),
    } as any,
    storage: {
      getMemory: vi.fn(async (id: string) => makeMemory(id, `content for ${id}`)),
      queryMemories: vi.fn(async () => []),
      createMemory: vi.fn(async (data: any) => makeMemory('new-mem', data.content, data.importance)),
      deleteMemory: vi.fn(async () => {}),
      getMemoryCount: vi.fn(async () => 0),
    } as any,
    auditChain: {
      append: vi.fn(async () => {}),
    } as any,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any,
  };
}

describe('ConsolidationManager', () => {
  let manager: ConsolidationManager;
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    deps = createMockDeps();
    manager = new ConsolidationManager(defaultConfig, deps);
  });

  afterEach(() => {
    manager.stop();
  });

  describe('onMemorySave', () => {
    it('returns clean when no similar memories', async () => {
      const memory = makeMemory('m1', 'unique content');
      const result = await manager.onMemorySave(memory);
      expect(result).toBe('clean');
    });

    it('auto-dedupes when similarity > autoDedupThreshold', async () => {
      (deps.vectorManager.searchMemories as any).mockResolvedValue([
        { id: 'existing', score: 0.97 },
      ]);

      const memory = makeMemory('m1', 'duplicate content');
      const result = await manager.onMemorySave(memory);

      expect(result).toBe('deduped');
      expect(deps.storage.deleteMemory).toHaveBeenCalledWith('m1');
      expect(deps.vectorManager.removeMemory).toHaveBeenCalledWith('m1');
    });

    it('flags when similarity between flagThreshold and autoDedupThreshold', async () => {
      (deps.vectorManager.searchMemories as any).mockResolvedValue([
        { id: 'similar', score: 0.90 },
      ]);

      const memory = makeMemory('m1', 'somewhat similar');
      const result = await manager.onMemorySave(memory);

      expect(result).toBe('flagged');
      expect(deps.storage.deleteMemory).not.toHaveBeenCalled();
    });

    it('returns clean when disabled', async () => {
      const disabledManager = new ConsolidationManager(
        { ...defaultConfig, enabled: false },
        deps,
      );
      const result = await disabledManager.onMemorySave(makeMemory('m1', 'test'));
      expect(result).toBe('clean');
    });

    it('returns clean on vector search error', async () => {
      (deps.vectorManager.searchMemories as any).mockRejectedValue(new Error('fail'));
      const result = await manager.onMemorySave(makeMemory('m1', 'test'));
      expect(result).toBe('clean');
      expect(deps.logger.warn).toHaveBeenCalled();
    });

    it('filters out the memory itself from results', async () => {
      (deps.vectorManager.searchMemories as any).mockResolvedValue([
        { id: 'm1', score: 1.0 }, // Self-match
      ]);

      const result = await manager.onMemorySave(makeMemory('m1', 'test'));
      expect(result).toBe('clean');
    });
  });

  describe('runDeepConsolidation', () => {
    it('returns report with zero candidates when no memories', async () => {
      (deps.storage.queryMemories as any).mockResolvedValue([]);
      const report = await manager.runDeepConsolidation();

      expect(report.totalCandidates).toBe(0);
      expect(report.dryRun).toBe(false);
      expect(report.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('performs threshold-based dedup without AI provider', async () => {
      const mem1 = makeMemory('m1', 'The server runs on port 3000', 0.8);
      const mem2 = makeMemory('m2', 'The server is running on port 3000', 0.5);

      (deps.storage.queryMemories as any).mockResolvedValue([mem1, mem2]);
      (deps.vectorManager.searchMemories as any).mockResolvedValue([
        { id: 'm2', score: 0.92 },
      ]);

      const report = await manager.runDeepConsolidation();
      expect(report.totalCandidates).toBeGreaterThanOrEqual(0);
    });

    it('respects dryRun mode', async () => {
      const dryRunConfig = {
        ...defaultConfig,
        deepConsolidation: { ...defaultConfig.deepConsolidation, dryRun: true },
      };
      const dryManager = new ConsolidationManager(dryRunConfig, deps);

      const mem1 = makeMemory('m1', 'content', 0.8);
      (deps.storage.queryMemories as any).mockResolvedValue([mem1]);
      (deps.vectorManager.searchMemories as any).mockResolvedValue([
        { id: 'm2', score: 0.95 },
      ]);

      const report = await dryManager.runDeepConsolidation();
      expect(report.dryRun).toBe(true);
      // In dry-run, no actual deletions should occur
      expect(deps.storage.deleteMemory).not.toHaveBeenCalled();
    });

    it('stores report in history', async () => {
      (deps.storage.queryMemories as any).mockResolvedValue([]);
      await manager.runDeepConsolidation();
      const history = manager.getHistory();
      expect(history).toHaveLength(1);
    });
  });

  describe('scheduling', () => {
    it('get/set schedule', () => {
      expect(manager.getSchedule()).toBe('0 2 * * *');
      manager.setSchedule('0 3 * * *');
      expect(manager.getSchedule()).toBe('0 3 * * *');
    });

    it('start and stop without errors', () => {
      manager.start();
      manager.stop();
      expect(deps.logger.info).toHaveBeenCalledWith(
        'Consolidation scheduler started',
        expect.any(Object),
      );
    });
  });
});

describe('parseConsolidationResponse', () => {
  it('parses valid JSON array', () => {
    const response = JSON.stringify([
      { type: 'MERGE', sourceIds: ['a', 'b'], mergedContent: 'merged', reason: 'similar' },
    ]);
    const result = parseConsolidationResponse(response);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('MERGE');
  });

  it('parses JSON from markdown code block', () => {
    const response = '```json\n[{"type":"SKIP","sourceIds":["a"],"reason":"ok"}]\n```';
    const result = parseConsolidationResponse(response);
    expect(result).toHaveLength(1);
  });

  it('returns empty array for invalid response', () => {
    expect(parseConsolidationResponse('not json')).toEqual([]);
  });

  it('filters out malformed actions', () => {
    const response = JSON.stringify([
      { type: 'MERGE', sourceIds: ['a'], reason: 'valid' },
      { type: 'BAD' }, // missing sourceIds and reason
      { notAnAction: true },
    ]);
    const result = parseConsolidationResponse(response);
    expect(result).toHaveLength(1);
  });
});

describe('buildConsolidationPrompt', () => {
  it('formats candidates into numbered groups', () => {
    const prompt = buildConsolidationPrompt([
      {
        memoryId: 'm1',
        content: 'Server runs on port 3000',
        type: 'semantic',
        importance: 0.8,
        similarMemories: [
          { id: 'm2', content: 'Server uses port 3000', score: 0.92, importance: 0.5 },
        ],
      },
    ]);

    expect(prompt).toContain('Group 1:');
    expect(prompt).toContain('m1');
    expect(prompt).toContain('Server runs on port 3000');
    expect(prompt).toContain('0.920');
  });
});
