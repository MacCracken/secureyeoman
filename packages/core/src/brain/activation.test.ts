import { describe, it, expect } from 'vitest';
import { actrActivation, ageDays, softplus, compositeScore } from './activation.js';

describe('ageDays', () => {
  it('returns 0.1 for null lastAccessed', () => {
    expect(ageDays(null, Date.now())).toBe(0.1);
  });

  it('returns 0.1 for very recent access (clamp)', () => {
    const now = Date.now();
    expect(ageDays(now, now)).toBe(0.1);
  });

  it('returns 1.0 for exactly one day ago', () => {
    const now = Date.now();
    const oneDayAgo = now - 86_400_000;
    expect(ageDays(oneDayAgo, now)).toBeCloseTo(1.0, 5);
  });

  it('returns correct fractional days', () => {
    const now = Date.now();
    const halfDayAgo = now - 43_200_000;
    expect(ageDays(halfDayAgo, now)).toBeCloseTo(0.5, 5);
  });

  it('clamps negative age to 0.1', () => {
    const now = Date.now();
    // Future timestamp
    expect(ageDays(now + 100000, now)).toBe(0.1);
  });
});

describe('actrActivation', () => {
  it('returns 0 for accessCount=0, ageDays=0.1 (freshly created)', () => {
    // ln(1) - 0.5 * ln(0.1 / 1) = 0 - 0.5 * ln(0.1) ≈ 1.15
    const result = actrActivation(0, 0.1);
    expect(result).toBeCloseTo(0 - 0.5 * Math.log(0.1), 5);
  });

  it('increases with more accesses', () => {
    const low = actrActivation(1, 1.0);
    const high = actrActivation(10, 1.0);
    expect(high).toBeGreaterThan(low);
  });

  it('decreases with greater age', () => {
    const recent = actrActivation(5, 1.0);
    const old = actrActivation(5, 30.0);
    expect(recent).toBeGreaterThan(old);
  });

  it('negative accessCount treated as 0', () => {
    expect(actrActivation(-5, 1.0)).toBe(actrActivation(0, 1.0));
  });

  it('very small age clamped to 0.1', () => {
    expect(actrActivation(5, 0.001)).toBe(actrActivation(5, 0.1));
  });

  it('matches expected formula for known values', () => {
    // n=5, age=10: ln(6) - 0.5 * ln(10/6)
    const expected = Math.log(6) - 0.5 * Math.log(10 / 6);
    expect(actrActivation(5, 10)).toBeCloseTo(expected, 10);
  });
});

describe('softplus', () => {
  it('returns approximately x for large x', () => {
    expect(softplus(10)).toBeCloseTo(10, 0);
  });

  it('returns ln(2) for x=0', () => {
    expect(softplus(0)).toBeCloseTo(Math.LN2, 10);
  });

  it('returns approximately 0 for large negative x', () => {
    expect(softplus(-20)).toBeCloseTo(0, 5);
  });

  it('does not overflow for very large x', () => {
    const result = softplus(1000);
    expect(Number.isFinite(result)).toBe(true);
    // Should be capped via Math.min(x, 20) → log(1 + exp(20))
    expect(result).toBeCloseTo(20, 0);
  });
});

describe('compositeScore', () => {
  it('returns contentMatch when activation is neutral and no Hebbian', () => {
    // activation=0 → sigmoid(0)=0.5, so with α=0.3:
    // (0.7 * 0.8) + (0.3 * 0.5) + 0 = 0.56 + 0.15 = 0.71
    const result = compositeScore(0.8, 0, 0);
    expect(result).toBeCloseTo(0.71, 2);
  });

  it('includes Hebbian boost', () => {
    const withBoost = compositeScore(0.5, 0, 0.3);
    const withoutBoost = compositeScore(0.5, 0, 0);
    expect(withBoost).toBeGreaterThan(withoutBoost);
  });

  it('caps Hebbian boost at boostCap', () => {
    const atCap = compositeScore(0.5, 0, 0.5, 1.0, 1.0, 0.3, 0.5);
    const overCap = compositeScore(0.5, 0, 10.0, 1.0, 1.0, 0.3, 0.5);
    expect(atCap).toBeCloseTo(overCap, 10);
  });

  it('scales by confidence', () => {
    const full = compositeScore(0.8, 0, 0, 1.0, 1.0);
    const half = compositeScore(0.8, 0, 0, 1.0, 0.5);
    expect(half).toBeCloseTo(full * 0.5, 10);
  });

  it('higher activation gives higher score', () => {
    const low = compositeScore(0.5, -5, 0);
    const high = compositeScore(0.5, 5, 0);
    expect(high).toBeGreaterThan(low);
  });

  it('respects custom alpha', () => {
    // α=0 → pure content match
    const pureContent = compositeScore(0.9, 100, 0, 1.0, 1.0, 0);
    expect(pureContent).toBeCloseTo(0.9, 2);
  });

  it('respects hebbianScale', () => {
    const scale1 = compositeScore(0.5, 0, 0.2, 1.0);
    const scale2 = compositeScore(0.5, 0, 0.2, 2.0);
    expect(scale2).toBeGreaterThan(scale1);
  });
});
