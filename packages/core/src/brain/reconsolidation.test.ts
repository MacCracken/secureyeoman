import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReconsolidationManager } from './reconsolidation.js';
import type { ReconsolidationManagerDeps } from './reconsolidation.js';
import type { Memory } from './types.js';

function createMockDeps(
  overrides: Partial<ReconsolidationManagerDeps> = {}
): ReconsolidationManagerDeps {
  return {
    aiProvider: {
      name: 'test' as any,
      chat: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          action: 'keep',
          reasoning: 'Memory is fine as-is',
        }),
      }),
      chatStream: vi.fn(),
    } as any,
    storage: {
      updateMemory: vi.fn().mockResolvedValue(undefined),
      getMemory: vi.fn().mockResolvedValue({
        id: 'm1',
        type: 'observation',
        content: 'old content',
        source: 'test',
        context: {},
        importance: 0.5,
        personalityId: null,
      }),
      createMemory: vi.fn().mockResolvedValue(undefined),
      deleteMemory: vi.fn().mockResolvedValue(true),
    } as any,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as ReconsolidationManagerDeps['logger'],
    ...overrides,
  };
}

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: 'm1',
    type: 'observation',
    content: 'The deployment process uses Docker containers.',
    source: 'test',
    context: {},
    importance: 0.5,
    personalityId: null,
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
    lastAccessedAt: Date.now() - 3600000,
    accessCount: 5,
    ...overrides,
  } as Memory;
}

describe('ReconsolidationManager', () => {
  let deps: ReconsolidationManagerDeps;
  let manager: ReconsolidationManager;

  beforeEach(() => {
    deps = createMockDeps();
    manager = new ReconsolidationManager({ enabled: true }, deps);
  });

  it('returns null when disabled', async () => {
    manager = new ReconsolidationManager({ enabled: false }, deps);
    const result = await manager.evaluate(makeMemory(), 'context', 0.8);
    expect(result).toBeNull();
  });

  it('returns null when overlap below threshold', async () => {
    const result = await manager.evaluate(makeMemory(), 'context', 0.5);
    expect(result).toBeNull();
  });

  it('returns null when overlap above dedup threshold', async () => {
    const result = await manager.evaluate(makeMemory(), 'context', 0.96);
    expect(result).toBeNull();
  });

  it('calls LLM and returns keep decision', async () => {
    const result = await manager.evaluate(makeMemory(), 'new context about Docker', 0.8);
    expect(result).not.toBeNull();
    expect(result!.action).toBe('keep');
    expect(deps.aiProvider.chat).toHaveBeenCalled();
  });

  it('returns update decision from LLM', async () => {
    (deps.aiProvider.chat as any).mockResolvedValue({
      content: JSON.stringify({
        action: 'update',
        updatedContent: 'Updated deployment info with Kubernetes.',
        reasoning: 'New context adds K8s info',
      }),
    });

    const result = await manager.evaluate(makeMemory(), 'new K8s context', 0.8);
    expect(result!.action).toBe('update');
    expect(result!.updatedContent).toContain('Kubernetes');
  });

  it('returns split decision from LLM', async () => {
    (deps.aiProvider.chat as any).mockResolvedValue({
      content: JSON.stringify({
        action: 'split',
        splitContents: ['Docker deployment', 'Kubernetes orchestration'],
        reasoning: 'Memory conflates two topics',
      }),
    });

    const result = await manager.evaluate(makeMemory(), 'context', 0.8);
    expect(result!.action).toBe('split');
    expect(result!.splitContents).toHaveLength(2);
  });

  it('enforces cooldown between evaluations', async () => {
    await manager.evaluate(makeMemory(), 'context', 0.8);
    const result2 = await manager.evaluate(makeMemory(), 'context again', 0.8);
    expect(result2).toBeNull(); // cooldown active
  });

  it('handles LLM errors gracefully', async () => {
    (deps.aiProvider.chat as any).mockRejectedValue(new Error('LLM down'));

    const result = await manager.evaluate(makeMemory(), 'context', 0.8);
    expect(result).toBeNull();
    expect(deps.logger.warn).toHaveBeenCalledWith(
      'Reconsolidation evaluation failed',
      expect.objectContaining({ error: 'Error: LLM down' })
    );
  });

  describe('apply', () => {
    it('does nothing for keep decisions', async () => {
      await manager.apply('m1', { action: 'keep', reasoning: 'fine', overlapScore: 0.8 });
      expect(deps.storage.updateMemory).not.toHaveBeenCalled();
    });

    it('updates memory for update decisions', async () => {
      await manager.apply('m1', {
        action: 'update',
        updatedContent: 'new content',
        reasoning: 'merged info',
        overlapScore: 0.8,
      });
      expect(deps.storage.updateMemory).toHaveBeenCalledWith('m1', { content: 'new content' });
    });

    it('splits memory into new entries and deletes original', async () => {
      await manager.apply('m1', {
        action: 'split',
        splitContents: ['part A', 'part B'],
        reasoning: 'distinct topics',
        overlapScore: 0.8,
      });
      expect(deps.storage.createMemory).toHaveBeenCalledTimes(2);
      expect(deps.storage.deleteMemory).toHaveBeenCalledWith('m1');
    });
  });

  it('tracks stats correctly', async () => {
    // Evaluate one keep
    await manager.evaluate(makeMemory({ id: 'a' }), 'ctx', 0.8);

    // Evaluate one update
    (deps.aiProvider.chat as any).mockResolvedValue({
      content: JSON.stringify({ action: 'update', updatedContent: 'x', reasoning: 'y' }),
    });
    await manager.evaluate(makeMemory({ id: 'b' }), 'ctx', 0.8);

    const stats = manager.getStats();
    expect(stats.evaluated).toBe(2);
    expect(stats.kept).toBe(1);
    expect(stats.updated).toBe(1);
  });
});
