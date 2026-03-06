import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrivacyEngine } from './privacy-engine.js';
import type { DifferentialPrivacyConfig } from '@secureyeoman/shared';

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;
}

function makeConfig(overrides: Partial<DifferentialPrivacyConfig> = {}): DifferentialPrivacyConfig {
  return {
    enabled: true,
    mechanism: 'gaussian',
    epsilon: 1.0,
    delta: 1e-5,
    maxGradientNorm: 1.0,
    noiseSigma: 0,
    privacyBudgetTotal: 10.0,
    privacyBudgetUsed: 0,
    ...overrides,
  };
}

describe('PrivacyEngine', () => {
  let engine: PrivacyEngine;

  beforeEach(() => {
    engine = new PrivacyEngine({ log: makeLogger() });
  });

  // ── Gradient Clipping ────────────────────────────────────────────

  it('returns gradients unchanged when norm is within limit', () => {
    const grads = [0.3, 0.4]; // norm = 0.5
    const result = engine.clipGradients(grads, 1.0);
    expect(result).toEqual(grads);
  });

  it('clips gradients when norm exceeds max', () => {
    const grads = [3, 4]; // norm = 5
    const result = engine.clipGradients(grads, 1.0);
    const norm = Math.sqrt(result.reduce((s, g) => s + g * g, 0));
    expect(norm).toBeCloseTo(1.0, 5);
  });

  it('preserves gradient direction after clipping', () => {
    const grads = [6, 8]; // norm = 10
    const result = engine.clipGradients(grads, 2.0);
    expect(result[0]! / result[1]!).toBeCloseTo(6 / 8, 5);
  });

  // ── Noise Injection ──────────────────────────────────────────────

  it('returns unchanged gradients when privacy is disabled', () => {
    const grads = [1, 2, 3];
    const config = makeConfig({ enabled: false });
    expect(engine.addNoise(grads, config)).toEqual(grads);
  });

  it('adds Gaussian noise that changes values', () => {
    const grads = Array.from({ length: 100 }, () => 1.0);
    const config = makeConfig({ mechanism: 'gaussian', noiseSigma: 1.0 });
    const noisy = engine.addNoise(grads, config);
    const diffs = noisy.filter((v, i) => Math.abs(v - grads[i]!) > 0.001);
    expect(diffs.length).toBeGreaterThan(50);
  });

  it('adds Laplacian noise', () => {
    const grads = [1, 2, 3, 4, 5];
    const config = makeConfig({ mechanism: 'laplacian' });
    const noisy = engine.addNoise(grads, config);
    const same = noisy.every((v, i) => v === grads[i]);
    expect(same).toBe(false);
  });

  it('adds local DP noise (randomised response)', () => {
    const grads = Array.from({ length: 200 }, () => 5.0);
    const config = makeConfig({ mechanism: 'local_dp', epsilon: 0.1 });
    const noisy = engine.addNoise(grads, config);
    const flipped = noisy.filter((v) => v < 0).length;
    expect(flipped).toBeGreaterThan(10); // with low epsilon, many should flip
  });

  // ── Sigma Computation ────────────────────────────────────────────

  it('computes sigma correctly', () => {
    const sigma = engine.computeSigma(1.0, 1e-5, 1.0);
    // sigma = 1.0 * sqrt(2 * ln(1.25/1e-5)) / 1.0
    const expected = Math.sqrt(2 * Math.log(1.25 / 1e-5));
    expect(sigma).toBeCloseTo(expected, 5);
  });

  it('increases sigma with lower epsilon', () => {
    const s1 = engine.computeSigma(1.0, 1e-5, 1.0);
    const s2 = engine.computeSigma(0.1, 1e-5, 1.0);
    expect(s2).toBeGreaterThan(s1);
  });

  // ── Budget Tracking ──────────────────────────────────────────────

  it('reports budget not exhausted when unused', () => {
    expect(engine.isBudgetExhausted(makeConfig())).toBe(false);
  });

  it('reports budget exhausted when fully used', () => {
    expect(engine.isBudgetExhausted(makeConfig({ privacyBudgetUsed: 10 }))).toBe(true);
  });

  it('reports not exhausted when disabled', () => {
    expect(engine.isBudgetExhausted(makeConfig({ enabled: false, privacyBudgetUsed: 999 }))).toBe(false);
  });

  it('consumes budget correctly', () => {
    const config = makeConfig({ privacyBudgetUsed: 3 });
    const updated = engine.consumeBudget(config, 2);
    expect(updated.privacyBudgetUsed).toBe(5);
    expect(config.privacyBudgetUsed).toBe(3); // original unchanged
  });

  it('returns remaining budget', () => {
    expect(engine.remainingBudget(makeConfig({ privacyBudgetUsed: 7 }))).toBe(3);
  });

  it('returns zero remaining when over-used', () => {
    expect(engine.remainingBudget(makeConfig({ privacyBudgetUsed: 15 }))).toBe(0);
  });
});
