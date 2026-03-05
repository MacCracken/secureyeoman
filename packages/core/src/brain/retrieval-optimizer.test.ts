/**
 * Tests for Retrieval Optimizer (Phase 125 — Future scaffold)
 */

import { describe, it, expect } from 'vitest';
import {
  RetrievalOptimizer,
  sampleBeta,
  DEFAULT_RETRIEVAL_WEIGHTS,
} from './retrieval-optimizer.js';

describe('sampleBeta', () => {
  it('returns a value in [0, 1]', () => {
    for (let i = 0; i < 100; i++) {
      const sample = sampleBeta(2, 2);
      expect(sample).toBeGreaterThanOrEqual(0);
      expect(sample).toBeLessThanOrEqual(1);
    }
  });

  it('high alpha biases toward 1', () => {
    const samples = Array.from({ length: 100 }, () => sampleBeta(100, 1));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(0.8);
  });

  it('high beta biases toward 0', () => {
    const samples = Array.from({ length: 100 }, () => sampleBeta(1, 100));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeLessThan(0.2);
  });
});

describe('RetrievalOptimizer', () => {
  it('returns default weights when disabled', () => {
    const optimizer = new RetrievalOptimizer({ enabled: false });
    const weights = optimizer.selectWeights();
    expect(weights).toEqual(DEFAULT_RETRIEVAL_WEIGHTS);
  });

  it('selects weights when enabled', () => {
    const optimizer = new RetrievalOptimizer({ enabled: true, armCount: 3 });
    const weights = optimizer.selectWeights();
    expect(weights).toHaveProperty('alpha');
    expect(weights).toHaveProperty('hebbianScale');
    expect(weights).toHaveProperty('boostCap');
    expect(weights).toHaveProperty('salienceWeight');
  });

  it('records feedback and updates arm posteriors', () => {
    const optimizer = new RetrievalOptimizer({ enabled: true, armCount: 3, priorStrength: 1 });
    optimizer.selectWeights();
    optimizer.recordFeedback(true);
    optimizer.selectWeights();
    optimizer.recordFeedback(true);
    optimizer.selectWeights();
    optimizer.recordFeedback(false);

    const stats = optimizer.getStats();
    const totalPulls = stats.reduce((s, a) => s + a.pulls, 0);
    expect(totalPulls).toBe(3);
  });

  it('getBestWeights returns arm with highest mean', () => {
    const optimizer = new RetrievalOptimizer({ enabled: true, armCount: 2, priorStrength: 1 });

    // Pull arm 0 several times with positive feedback
    for (let i = 0; i < 10; i++) {
      optimizer.selectWeights();
      optimizer.recordFeedback(true);
    }

    const best = optimizer.getBestWeights();
    expect(best).toHaveProperty('alpha');
  });

  it('getStats returns correct arm count', () => {
    const optimizer = new RetrievalOptimizer({ enabled: true, armCount: 5 });
    expect(optimizer.getStats()).toHaveLength(5);
  });

  it('does not record feedback when disabled', () => {
    const optimizer = new RetrievalOptimizer({ enabled: false });
    optimizer.selectWeights();
    optimizer.recordFeedback(true);
    const stats = optimizer.getStats();
    // All pulls should be 0 when disabled
    const totalPulls = stats.reduce((s, a) => s + a.pulls, 0);
    expect(totalPulls).toBe(0);
  });
});
