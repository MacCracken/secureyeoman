/**
 * Tests for Salience Classification (Phase 125-C)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SalienceClassifier, DEFAULT_SALIENCE_WEIGHTS } from './salience.js';
import type { EmbeddingProvider } from '../ai/embeddings/types.js';

function createMockEmbedding(): EmbeddingProvider {
  // Returns embeddings that vary based on text content for testability
  return {
    name: 'test-salience',
    dimensions: () => 4,
    embed: vi.fn(async (texts: string[]) => {
      return texts.map((text) => {
        const lower = text.toLowerCase();
        // Generate deterministic embeddings based on keyword presence
        const urgency = lower.includes('urgent') || lower.includes('critical') ? 0.9 : 0.1;
        const error =
          lower.includes('error') || lower.includes('bug') || lower.includes('broke') ? 0.9 : 0.1;
        const frustration = lower.includes('frustrat') || lower.includes('stuck') ? 0.9 : 0.1;
        const success =
          lower.includes('success') || lower.includes('perfect') || lower.includes('solved')
            ? 0.9
            : 0.1;
        // Normalize
        const norm = Math.sqrt(urgency ** 2 + error ** 2 + frustration ** 2 + success ** 2);
        return [urgency / norm, error / norm, frustration / norm, success / norm];
      });
    }),
  };
}

describe('SalienceClassifier', () => {
  let classifier: SalienceClassifier;
  let mockEmbed: EmbeddingProvider;

  beforeEach(() => {
    mockEmbed = createMockEmbedding();
    classifier = new SalienceClassifier(mockEmbed);
  });

  it('initializes lazily on first classify', async () => {
    expect(classifier.isInitialized).toBe(false);
    await classifier.classify('test text');
    expect(classifier.isInitialized).toBe(true);
  });

  it('initializes only once', async () => {
    await classifier.classify('a');
    await classifier.classify('b');
    // 20 anchor texts + 2 classify texts = 22 embed calls total
    // But the anchor texts are embedded in one batch per dimension (5 batches)
    // plus 2 classify calls = 7 total calls
    const calls = (mockEmbed.embed as ReturnType<typeof vi.fn>).mock.calls.length;
    // Anchors: 5 dimensions × 1 call each = 5, plus 2 classify = 7
    expect(calls).toBe(7);
  });

  it('returns zero scores when embedding fails', async () => {
    const failEmbed: EmbeddingProvider = {
      name: 'fail',
      dimensions: () => 4,
      embed: vi.fn(async () => []),
    };
    const failClassifier = new SalienceClassifier(failEmbed);
    // Initialize will succeed (empty arrays), then classify returns zeros
    const result = await failClassifier.classify('test');
    expect(result.composite).toBe(0);
  });

  it('classifies text and returns all dimensions', async () => {
    const result = await classifier.classify('the server is broken');
    expect(result).toHaveProperty('urgency');
    expect(result).toHaveProperty('error');
    expect(result).toHaveProperty('frustration');
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('curiosity');
    expect(result).toHaveProperty('composite');

    // All scores should be in [0, 1]
    for (const val of Object.values(result)) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    }
  });

  it('composite is a weighted average of dimensions', async () => {
    const result = await classifier.classify('some generic text');
    const weights = DEFAULT_SALIENCE_WEIGHTS;
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    const expectedComposite =
      (result.urgency * weights.urgency +
        result.error * weights.error +
        result.frustration * weights.frustration +
        result.success * weights.success +
        result.curiosity * weights.curiosity) /
      totalWeight;
    expect(result.composite).toBeCloseTo(expectedComposite, 5);
  });

  it('accepts custom weights', async () => {
    const customClassifier = new SalienceClassifier(mockEmbed, {
      urgency: 1.0,
      error: 0.0,
      frustration: 0.0,
      success: 0.0,
      curiosity: 0.0,
    });
    const result = await customClassifier.classify('urgent task');
    // Composite should be heavily weighted toward urgency
    expect(result.composite).toBeCloseTo(result.urgency, 5);
  });

  it('classifyFromEmbedding works without async', async () => {
    await classifier.initialize();
    const embedding = [0.9, 0.1, 0.1, 0.1];
    const result = classifier.classifyFromEmbedding(embedding);
    expect(result).toHaveProperty('composite');
    expect(result.composite).toBeGreaterThan(0);
  });

  it('classifyFromEmbedding returns zeros when not initialized', () => {
    const result = classifier.classifyFromEmbedding([1, 0, 0, 0]);
    expect(result.composite).toBe(0);
  });
});
