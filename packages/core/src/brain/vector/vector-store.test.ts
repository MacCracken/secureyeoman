/**
 * Vector Store Adapter Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VectorStore, VectorResult } from './types.js';

// In-memory vector store for testing (avoids faiss-node/qdrant dependency)
class InMemoryVectorStore implements VectorStore {
  private vectors: Map<string, { vector: number[]; metadata?: Record<string, unknown> }> = new Map();

  async insert(id: string, vector: number[], metadata?: Record<string, unknown>) {
    this.vectors.set(id, { vector, metadata });
  }

  async insertBatch(items: Array<{ id: string; vector: number[]; metadata?: Record<string, unknown> }>) {
    for (const item of items) {
      this.vectors.set(item.id, { vector: item.vector, metadata: item.metadata });
    }
  }

  async search(vector: number[], limit: number, threshold?: number): Promise<VectorResult[]> {
    const results: VectorResult[] = [];

    for (const [id, entry] of this.vectors) {
      const score = cosineSimilarity(vector, entry.vector);
      if (threshold !== undefined && score < threshold) continue;
      results.push({ id, score, metadata: entry.metadata });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async delete(id: string): Promise<boolean> {
    return this.vectors.delete(id);
  }

  async count(): Promise<number> {
    return this.vectors.size;
  }

  async close() {
    this.vectors.clear();
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const mag = Math.sqrt(magA) * Math.sqrt(magB);
  return mag === 0 ? 0 : dot / mag;
}

describe('VectorStore interface', () => {
  let store: VectorStore;

  beforeEach(() => {
    store = new InMemoryVectorStore();
  });

  it('inserts and counts vectors', async () => {
    await store.insert('a', [1, 0, 0]);
    await store.insert('b', [0, 1, 0]);
    expect(await store.count()).toBe(2);
  });

  it('inserts batch of vectors', async () => {
    await store.insertBatch([
      { id: 'a', vector: [1, 0, 0] },
      { id: 'b', vector: [0, 1, 0] },
      { id: 'c', vector: [0, 0, 1] },
    ]);
    expect(await store.count()).toBe(3);
  });

  it('searches for nearest neighbors', async () => {
    await store.insert('a', [1, 0, 0], { type: 'memory' });
    await store.insert('b', [0.9, 0.1, 0], { type: 'memory' });
    await store.insert('c', [0, 1, 0], { type: 'knowledge' });

    const results = await store.search([1, 0, 0], 2);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('a');
    expect(results[0].score).toBeCloseTo(1.0, 2);
    expect(results[1].id).toBe('b');
  });

  it('respects similarity threshold', async () => {
    await store.insert('a', [1, 0, 0]);
    await store.insert('b', [0, 1, 0]); // orthogonal = 0 similarity

    const results = await store.search([1, 0, 0], 10, 0.5);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('a');
  });

  it('deletes vectors', async () => {
    await store.insert('a', [1, 0, 0]);
    await store.insert('b', [0, 1, 0]);

    const deleted = await store.delete('a');
    expect(deleted).toBe(true);
    expect(await store.count()).toBe(1);

    const notDeleted = await store.delete('nonexistent');
    expect(notDeleted).toBe(false);
  });

  it('returns metadata with search results', async () => {
    await store.insert('a', [1, 0, 0], { type: 'memory', source: 'test' });

    const results = await store.search([1, 0, 0], 1);
    expect(results[0].metadata).toEqual({ type: 'memory', source: 'test' });
  });

  it('closes gracefully', async () => {
    await store.insert('a', [1, 0, 0]);
    await store.close();
    expect(await store.count()).toBe(0);
  });
});
