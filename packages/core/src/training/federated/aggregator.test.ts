import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Aggregator } from './aggregator.js';
import type { ModelUpdate, AggregationStrategy } from '@secureyeoman/shared';

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;
}

function makeUpdate(overrides: Partial<ModelUpdate> = {}): ModelUpdate {
  return {
    participantId: 'fp-1',
    roundId: 'fr-1',
    gradientChecksum: 'abc',
    datasetSizeSeen: 100,
    trainingLoss: 0.5,
    metricsJson: { accuracy: 0.9 },
    submittedAt: Date.now(),
    privacyNoiseApplied: false,
    ...overrides,
  };
}

describe('Aggregator', () => {
  let agg: Aggregator;

  beforeEach(() => {
    agg = new Aggregator({ log: makeLogger() });
  });

  it('throws when no updates provided', () => {
    expect(() => agg.aggregate([], 'fedavg')).toThrow('No model updates');
  });

  // ── FedAvg ───────────────────────────────────────────────────────

  it('computes fedavg weighted by dataset size', () => {
    const updates = [
      makeUpdate({ datasetSizeSeen: 300, trainingLoss: 0.3, metricsJson: { acc: 0.9 } }),
      makeUpdate({ datasetSizeSeen: 100, trainingLoss: 0.7, metricsJson: { acc: 0.7 } }),
    ];
    const result = agg.aggregate(updates, 'fedavg');
    // weighted: (0.3*300 + 0.7*100) / 400 = 160/400 = 0.4 → but it's sum of loss*weight
    // weights: 0.75, 0.25 → loss = 0.3*0.75 + 0.7*0.25 = 0.225 + 0.175 = 0.4
    expect(result.globalLoss).toBeCloseTo(0.4, 5);
    expect(result.strategy).toBe('fedavg');
    expect(result.participantCount).toBe(2);
    expect(result.totalDatasetSize).toBe(400);
  });

  it('handles equal weights when total dataset size is zero', () => {
    const updates = [
      makeUpdate({ datasetSizeSeen: 0, trainingLoss: 0.4 }),
      makeUpdate({ datasetSizeSeen: 0, trainingLoss: 0.6 }),
    ];
    const result = agg.aggregate(updates, 'fedavg');
    expect(result.globalLoss).toBeCloseTo(0.5, 5);
  });

  // ── FedSGD ───────────────────────────────────────────────────────

  it('computes fedsgd with equal weights', () => {
    const updates = [
      makeUpdate({ datasetSizeSeen: 1000, trainingLoss: 0.2 }),
      makeUpdate({ datasetSizeSeen: 10, trainingLoss: 0.8 }),
    ];
    const result = agg.aggregate(updates, 'fedsgd');
    expect(result.globalLoss).toBeCloseTo(0.5, 5);
    expect(result.strategy).toBe('fedsgd');
  });

  // ── Median ───────────────────────────────────────────────────────

  it('computes median aggregation', () => {
    const updates = [
      makeUpdate({ trainingLoss: 0.1 }),
      makeUpdate({ trainingLoss: 0.5 }),
      makeUpdate({ trainingLoss: 0.9 }),
    ];
    const result = agg.aggregate(updates, 'median');
    expect(result.globalLoss).toBe(0.5);
    expect(result.strategy).toBe('median');
  });

  it('handles median with even number of updates', () => {
    const updates = [
      makeUpdate({ trainingLoss: 0.2 }),
      makeUpdate({ trainingLoss: 0.4 }),
      makeUpdate({ trainingLoss: 0.6 }),
      makeUpdate({ trainingLoss: 0.8 }),
    ];
    const result = agg.aggregate(updates, 'median');
    // floor(4/2) = index 2 → 0.6
    expect(result.globalLoss).toBe(0.6);
  });

  // ── Trimmed Mean ─────────────────────────────────────────────────

  it('computes trimmed mean discarding outliers', () => {
    const updates = [
      makeUpdate({ trainingLoss: 100 }),  // outlier high
      makeUpdate({ trainingLoss: 0.3 }),
      makeUpdate({ trainingLoss: 0.4 }),
      makeUpdate({ trainingLoss: 0.5 }),
      makeUpdate({ trainingLoss: 0.6 }),
      makeUpdate({ trainingLoss: 0.7 }),
      makeUpdate({ trainingLoss: 0.8 }),
      makeUpdate({ trainingLoss: 0.9 }),
      makeUpdate({ trainingLoss: 1.0 }),
      makeUpdate({ trainingLoss: -50 }),  // outlier low
    ];
    const result = agg.aggregate(updates, 'trimmed_mean');
    expect(result.strategy).toBe('trimmed_mean');
    // Should exclude the -50 and 100 outliers
    expect(result.globalLoss).toBeGreaterThan(0);
    expect(result.globalLoss).toBeLessThan(5);
  });

  it('falls back to fedavg when trimming removes all', () => {
    const updates = [
      makeUpdate({ trainingLoss: 0.5 }),
      makeUpdate({ trainingLoss: 0.6 }),
    ];
    // 10% trim of 2 = 1 each side → empty trimmed, falls back
    const result = agg.aggregate(updates, 'trimmed_mean');
    expect(result.participantCount).toBe(2);
  });

  // ── Weighted Average ─────────────────────────────────────────────

  it('computes weighted_avg with equal weights', () => {
    const updates = [
      makeUpdate({ trainingLoss: 0.3 }),
      makeUpdate({ trainingLoss: 0.9 }),
    ];
    const result = agg.aggregate(updates, 'weighted_avg');
    expect(result.globalLoss).toBeCloseTo(0.6, 5);
    expect(result.strategy).toBe('weighted_avg');
  });

  // ── Metrics Merging ──────────────────────────────────────────────

  it('merges metrics from all participants', () => {
    const updates = [
      makeUpdate({ metricsJson: { acc: 0.8, f1: 0.7 } }),
      makeUpdate({ metricsJson: { acc: 0.9, precision: 0.85 } }),
    ];
    const result = agg.aggregate(updates, 'fedsgd');
    expect(result.globalMetrics).toHaveProperty('acc');
    expect(result.globalMetrics).toHaveProperty('f1');
    expect(result.globalMetrics).toHaveProperty('precision');
    expect(result.globalMetrics.acc).toBeCloseTo(0.85, 5);
  });

  // ── Default / Unknown Strategy ───────────────────────────────────

  it('falls back to fedavg for unknown strategy', () => {
    const updates = [makeUpdate({ trainingLoss: 0.5 })];
    const result = agg.aggregate(updates, 'unknown_strategy' as AggregationStrategy);
    expect(result.strategy).toBe('fedavg');
  });

  // ── FedProx ──────────────────────────────────────────────────────

  it('computes fedprox (same as fedavg at aggregation time)', () => {
    const updates = [
      makeUpdate({ datasetSizeSeen: 200, trainingLoss: 0.4 }),
      makeUpdate({ datasetSizeSeen: 200, trainingLoss: 0.6 }),
    ];
    const result = agg.aggregate(updates, 'fedprox');
    expect(result.globalLoss).toBeCloseTo(0.5, 5);
  });
});
