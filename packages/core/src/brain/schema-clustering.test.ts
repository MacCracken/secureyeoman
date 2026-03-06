import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SchemaClusteringManager, kMeans } from './schema-clustering.js';
import type { SchemaClusteringDeps } from './schema-clustering.js';

function createMockDeps(overrides: Partial<SchemaClusteringDeps> = {}): SchemaClusteringDeps {
  return {
    embeddingProvider: {
      embed: vi.fn().mockImplementation((texts: string[]) => {
        return Promise.resolve(
          texts.map((t) => {
            const hash = [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
            return [Math.sin(hash), Math.cos(hash), Math.sin(hash * 2)];
          })
        );
      }),
    } as any,
    aiProvider: {
      name: 'test' as any,
      chat: vi.fn().mockResolvedValue({
        content: JSON.stringify({ label: 'Test Cluster', summary: 'A cluster of test items' }),
      }),
      chatStream: vi.fn(),
    } as any,
    storage: {
      queryKnowledge: vi.fn().mockResolvedValue([]),
      createKnowledge: vi.fn().mockResolvedValue(undefined),
    } as any,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as SchemaClusteringDeps['logger'],
    ...overrides,
  };
}

describe('kMeans', () => {
  it('returns empty for empty input', () => {
    const result = kMeans([], 3, 50);
    expect(result.assignments).toHaveLength(0);
    expect(result.centroids).toHaveLength(0);
  });

  it('returns empty for k=0', () => {
    const result = kMeans([[1, 2]], 0, 50);
    expect(result.assignments).toHaveLength(0);
  });

  it('assigns all points to one cluster when k=1', () => {
    const points = [
      [1, 0],
      [0, 1],
      [1, 1],
    ];
    const result = kMeans(points, 1, 50);
    expect(result.assignments).toHaveLength(3);
    expect(new Set(result.assignments).size).toBe(1);
  });

  it('separates clearly distinct clusters', () => {
    const points = [
      [0, 0],
      [0.1, 0.1],
      [0.05, 0.05],
      [10, 10],
      [10.1, 10.1],
      [9.9, 9.9],
    ];
    const result = kMeans(points, 2, 50);

    const cluster0 = result.assignments[0];
    const cluster3 = result.assignments[3];
    expect(cluster0).not.toBe(cluster3);
    expect(result.assignments[1]).toBe(cluster0);
    expect(result.assignments[2]).toBe(cluster0);
    expect(result.assignments[4]).toBe(cluster3);
    expect(result.assignments[5]).toBe(cluster3);
  });

  it('handles k > n by capping', () => {
    const points = [
      [1, 0],
      [0, 1],
    ];
    const result = kMeans(points, 5, 50);
    expect(result.assignments).toHaveLength(2);
    expect(result.centroids.length).toBeLessThanOrEqual(2);
  });
});

describe('SchemaClusteringManager', () => {
  let deps: SchemaClusteringDeps;
  let manager: SchemaClusteringManager;

  beforeEach(() => {
    deps = createMockDeps();
    manager = new SchemaClusteringManager({ enabled: true, k: 2, minClusterSize: 2 }, deps);
  });

  it('returns empty when disabled', async () => {
    manager = new SchemaClusteringManager({ enabled: false }, deps);
    const result = await manager.runClustering();
    expect(result).toHaveLength(0);
  });

  it('returns empty when not enough entries', async () => {
    (deps.storage.queryKnowledge as any).mockResolvedValue([
      { id: '1', topic: 'test', content: 'hello' },
    ]);
    const result = await manager.runClustering();
    expect(result).toHaveLength(0);
  });

  it('clusters entries and labels via LLM', async () => {
    const entries = Array.from({ length: 6 }, (_, i) => ({
      id: `e${i}`,
      topic: `topic${i}`,
      content: `Content about topic ${i % 2 === 0 ? 'alpha' : 'beta'}`,
      source: 'test',
    }));
    (deps.storage.queryKnowledge as any).mockResolvedValue(entries);

    const result = await manager.runClustering();
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.label).toBeTruthy();
    expect(result[0]!.summary).toBeTruthy();
    expect(result[0]!.memberIds.length).toBeGreaterThanOrEqual(2);
    expect(result[0]!.coherence).toBeGreaterThan(0);
  });

  it('upserts schemas as knowledge entries', async () => {
    const entries = Array.from({ length: 6 }, (_, i) => ({
      id: `e${i}`,
      topic: `topic${i}`,
      content: `Content item ${i}`,
      source: 'test',
    }));
    (deps.storage.queryKnowledge as any).mockResolvedValue(entries);

    await manager.runClustering();
    expect(deps.storage.createKnowledge).toHaveBeenCalled();
  });

  it('falls back to keyword extraction when LLM fails', async () => {
    (deps.aiProvider!.chat as any).mockRejectedValue(new Error('LLM error'));

    const entries = Array.from({ length: 6 }, (_, i) => ({
      id: `e${i}`,
      topic: `topic${i}`,
      content: `Content about testing and development ${i}`,
      source: 'test',
    }));
    (deps.storage.queryKnowledge as any).mockResolvedValue(entries);

    const result = await manager.runClustering();
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.label).toBeTruthy();
  });

  it('getSchemas returns current schemas', async () => {
    expect(manager.getSchemas()).toHaveLength(0);

    const entries = Array.from({ length: 6 }, (_, i) => ({
      id: `e${i}`,
      topic: `topic${i}`,
      content: `Content ${i}`,
      source: 'test',
    }));
    (deps.storage.queryKnowledge as any).mockResolvedValue(entries);

    await manager.runClustering();
    expect(manager.getSchemas().length).toBeGreaterThan(0);
  });
});
