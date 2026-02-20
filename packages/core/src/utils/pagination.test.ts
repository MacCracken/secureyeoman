import { describe, it, expect } from 'vitest';
import { paginate } from './pagination.js';

describe('paginate', () => {
  const arr = [1, 2, 3, 4, 5];

  it('returns the full array when no limit or offset', () => {
    expect(paginate(arr)).toEqual([1, 2, 3, 4, 5]);
  });

  it('applies limit', () => {
    expect(paginate(arr, 3)).toEqual([1, 2, 3]);
  });

  it('applies offset', () => {
    expect(paginate(arr, undefined, 2)).toEqual([3, 4, 5]);
  });

  it('applies limit and offset together', () => {
    expect(paginate(arr, 2, 1)).toEqual([2, 3]);
  });

  it('returns empty array when offset exceeds length', () => {
    expect(paginate(arr, 5, 10)).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(paginate([], 5, 0)).toEqual([]);
  });

  it('handles limit of 0', () => {
    expect(paginate(arr, 0)).toEqual([]);
  });

  it('handles offset of 0 with limit', () => {
    expect(paginate(arr, 2, 0)).toEqual([1, 2]);
  });

  it('clamps result to end of array when limit overshoots', () => {
    expect(paginate(arr, 100, 3)).toEqual([4, 5]);
  });
});
