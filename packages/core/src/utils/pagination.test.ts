import { describe, it, expect } from 'vitest';
import { paginate, parsePagination } from './pagination.js';

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

describe('parsePagination', () => {
  it('returns defaults when no params provided', () => {
    expect(parsePagination({})).toEqual({ limit: 20, offset: 0 });
  });

  it('parses valid string limit and offset', () => {
    expect(parsePagination({ limit: '50', offset: '10' })).toEqual({ limit: 50, offset: 10 });
  });

  it('clamps limit to maxLimit', () => {
    expect(parsePagination({ limit: '500' })).toEqual({ limit: 100, offset: 0 });
  });

  it('clamps limit to custom maxLimit', () => {
    expect(parsePagination({ limit: '25' }, { maxLimit: 20 })).toEqual({ limit: 20, offset: 0 });
  });

  it('uses custom defaultLimit', () => {
    expect(parsePagination({}, { defaultLimit: 10 })).toEqual({ limit: 10, offset: 0 });
  });

  it('handles negative limit', () => {
    expect(parsePagination({ limit: '-5' })).toEqual({ limit: 20, offset: 0 });
  });

  it('handles zero limit', () => {
    expect(parsePagination({ limit: '0' })).toEqual({ limit: 20, offset: 0 });
  });

  it('handles negative offset', () => {
    expect(parsePagination({ offset: '-10' })).toEqual({ limit: 20, offset: 0 });
  });

  it('handles NaN limit', () => {
    expect(parsePagination({ limit: 'abc' })).toEqual({ limit: 20, offset: 0 });
  });

  it('handles NaN offset', () => {
    expect(parsePagination({ offset: 'xyz' })).toEqual({ limit: 20, offset: 0 });
  });

  it('handles numeric inputs (not just strings)', () => {
    expect(parsePagination({ limit: 30, offset: 5 })).toEqual({ limit: 30, offset: 5 });
  });

  it('caps at exactly maxLimit', () => {
    expect(parsePagination({ limit: '100' })).toEqual({ limit: 100, offset: 0 });
    expect(parsePagination({ limit: '101' })).toEqual({ limit: 100, offset: 0 });
  });
});
