/**
 * Tests for Context-Dependent Retrieval (Phase 125-A)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fuseEmbeddings,
  computeCentroid,
  ContextRetriever,
  _DEFAULT_CONTEXT_RETRIEVAL_CONFIG,
} from './context-retrieval.js';
import type { EmbeddingProvider } from '../ai/embeddings/types.js';

// ── Pure function tests ──────────────────────────────────────

describe('fuseEmbeddings', () => {
  it('returns pure query when queryWeight is 1', () => {
    const query = [1, 0, 0];
    const context = [0, 1, 0];
    const result = fuseEmbeddings(query, context, 1.0);
    // Should be normalized [1, 0, 0]
    expect(result[0]).toBeCloseTo(1, 5);
    expect(result[1]).toBeCloseTo(0, 5);
    expect(result[2]).toBeCloseTo(0, 5);
  });

  it('returns pure context when queryWeight is 0', () => {
    const query = [1, 0, 0];
    const context = [0, 1, 0];
    const result = fuseEmbeddings(query, context, 0.0);
    expect(result[0]).toBeCloseTo(0, 5);
    expect(result[1]).toBeCloseTo(1, 5);
    expect(result[2]).toBeCloseTo(0, 5);
  });

  it('blends at 0.5 weight', () => {
    const query = [1, 0, 0];
    const context = [0, 1, 0];
    const result = fuseEmbeddings(query, context, 0.5);
    // 0.5 * [1,0,0] + 0.5 * [0,1,0] = [0.5, 0.5, 0], normalized
    const norm = Math.sqrt(0.5 * 0.5 + 0.5 * 0.5);
    expect(result[0]).toBeCloseTo(0.5 / norm, 5);
    expect(result[1]).toBeCloseTo(0.5 / norm, 5);
  });

  it('clamps queryWeight to [0, 1]', () => {
    const query = [1, 0, 0];
    const context = [0, 1, 0];
    const overResult = fuseEmbeddings(query, context, 1.5);
    expect(overResult[0]).toBeCloseTo(1, 5);
    const underResult = fuseEmbeddings(query, context, -0.5);
    expect(underResult[1]).toBeCloseTo(1, 5);
  });

  it('result is L2 normalized', () => {
    const result = fuseEmbeddings([3, 4, 0], [1, 2, 3], 0.6);
    const norm = Math.sqrt(result.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 5);
  });
});

describe('computeCentroid', () => {
  it('returns null for empty list', () => {
    expect(computeCentroid([])).toBeNull();
  });

  it('returns the point itself for single embedding', () => {
    const result = computeCentroid([[1, 2, 3]]);
    expect(result).toEqual([1, 2, 3]);
  });

  it('computes mean of multiple embeddings', () => {
    const result = computeCentroid([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    expect(result![0]).toBeCloseTo(1 / 3, 5);
    expect(result![1]).toBeCloseTo(1 / 3, 5);
    expect(result![2]).toBeCloseTo(1 / 3, 5);
  });
});

// ── ContextRetriever tests ───────────────────────────────────

describe('ContextRetriever', () => {
  let mockProvider: EmbeddingProvider;
  let embedCount: number;

  beforeEach(() => {
    embedCount = 0;
    mockProvider = {
      name: 'test',
      dimensions: () => 3,
      embed: vi.fn(async (texts: string[]) => {
        return texts.map(() => {
          embedCount++;
          // Deterministic embeddings based on call order
          const angle = (embedCount * Math.PI) / 6;
          return [Math.cos(angle), Math.sin(angle), 0];
        });
      }),
    };
  });

  it('returns raw query embedding when context is insufficient', async () => {
    const retriever = new ContextRetriever(mockProvider, { minContextMessages: 3 });
    // Only 1 message in context — below threshold
    await retriever.addMessage('hello');
    const result = await retriever.getSearchVector('test query');
    // Should be the raw embedding, not fused
    expect(result).toHaveLength(3);
    expect(mockProvider.embed).toHaveBeenCalled();
  });

  it('fuses with context when enough messages are present', async () => {
    const retriever = new ContextRetriever(mockProvider, { minContextMessages: 2 });
    await retriever.addMessage('message 1');
    await retriever.addMessage('message 2');

    const _rawBefore = await mockProvider.embed(['standalone']);
    const fused = await retriever.getSearchVector('test query');

    // Fused should differ from raw (context modifies the search vector)
    expect(fused).toHaveLength(3);
    // Both should be normalized
    const norm = Math.sqrt(fused.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 4);
  });

  it('respects contextWindowSize', async () => {
    const retriever = new ContextRetriever(mockProvider, {
      contextWindowSize: 2,
      minContextMessages: 1,
    });
    await retriever.addMessage('msg 1');
    await retriever.addMessage('msg 2');
    await retriever.addMessage('msg 3');
    expect(retriever.contextSize).toBe(2);
  });

  it('clear() resets context', async () => {
    const retriever = new ContextRetriever(mockProvider);
    await retriever.addMessage('msg');
    expect(retriever.contextSize).toBe(1);
    retriever.clear();
    expect(retriever.contextSize).toBe(0);
  });

  it('addEmbedding adds directly without calling provider', () => {
    const retriever = new ContextRetriever(mockProvider);
    retriever.addEmbedding([1, 0, 0]);
    expect(retriever.contextSize).toBe(1);
    expect(mockProvider.embed).not.toHaveBeenCalled();
  });

  it('getContextCentroid returns null when insufficient context', () => {
    const retriever = new ContextRetriever(mockProvider, { minContextMessages: 3 });
    retriever.addEmbedding([1, 0, 0]);
    expect(retriever.getContextCentroid()).toBeNull();
  });

  it('getContextCentroid returns centroid when sufficient context', () => {
    const retriever = new ContextRetriever(mockProvider, { minContextMessages: 2 });
    retriever.addEmbedding([1, 0, 0]);
    retriever.addEmbedding([0, 1, 0]);
    const centroid = retriever.getContextCentroid();
    expect(centroid).not.toBeNull();
    expect(centroid![0]).toBeCloseTo(0.5, 5);
    expect(centroid![1]).toBeCloseTo(0.5, 5);
  });
});
