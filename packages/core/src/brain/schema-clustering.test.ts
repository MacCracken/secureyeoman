/**
 * Tests for Schema Clustering (Phase 125 — Future scaffold)
 */

import { describe, it, expect } from 'vitest';
import { kMeans } from './schema-clustering.js';

describe('kMeans', () => {
  it('returns empty for empty input', () => {
    const result = kMeans([], 3, 10);
    expect(result.assignments).toEqual([]);
    expect(result.centroids).toEqual([]);
  });

  it('returns empty for k=0', () => {
    const result = kMeans([[1, 2]], 0, 10);
    expect(result.assignments).toEqual([]);
  });

  it('assigns single point to single cluster', () => {
    const result = kMeans([[1, 2, 3]], 1, 10);
    expect(result.assignments).toEqual([0]);
    expect(result.centroids).toHaveLength(1);
  });

  it('clusters two well-separated groups', () => {
    const points = [
      [0, 0],
      [0.1, 0.1],
      [0.2, 0],
      [10, 10],
      [10.1, 10.1],
      [10.2, 10],
    ];
    const result = kMeans(points, 2, 50);

    // Points in same group should have same cluster
    expect(result.assignments[0]).toBe(result.assignments[1]);
    expect(result.assignments[1]).toBe(result.assignments[2]);
    expect(result.assignments[3]).toBe(result.assignments[4]);
    expect(result.assignments[4]).toBe(result.assignments[5]);

    // The two groups should be in different clusters
    expect(result.assignments[0]).not.toBe(result.assignments[3]);
  });

  it('handles k > n gracefully', () => {
    const result = kMeans(
      [
        [1, 2],
        [3, 4],
      ],
      5,
      10
    );
    // Should create at most n centroids
    expect(result.centroids.length).toBeLessThanOrEqual(2);
    expect(result.assignments).toHaveLength(2);
  });

  it('converges for identical points', () => {
    const points = [
      [1, 1],
      [1, 1],
      [1, 1],
    ];
    const result = kMeans(points, 2, 50);
    expect(result.assignments).toHaveLength(3);
  });
});
