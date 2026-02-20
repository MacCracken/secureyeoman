import { describe, it, expect, beforeEach } from 'vitest';
import { countTokens, countMessageTokens, clearTokenCache } from './token-counter.js';

describe('countTokens', () => {
  beforeEach(() => {
    clearTokenCache();
  });

  it('returns 0 for empty string', () => {
    expect(countTokens('')).toBe(0);
  });

  it('returns 0 for null/undefined-like falsy', () => {
    // @ts-expect-error testing runtime falsy behavior
    expect(countTokens(null)).toBe(0);
    // @ts-expect-error
    expect(countTokens(undefined)).toBe(0);
  });

  it('approximates token count as ceil(length / 4)', () => {
    expect(countTokens('abcd')).toBe(1);       // 4 chars → 1 token
    expect(countTokens('abcde')).toBe(2);      // 5 chars → ceil(5/4) = 2
    expect(countTokens('hello world')).toBe(3); // 11 chars → ceil(11/4) = 3
  });

  it('caches results for repeated calls', () => {
    const text = 'hello world';
    const first = countTokens(text);
    const second = countTokens(text);
    expect(first).toBe(second);
  });

  it('does not cache very large texts (>= 10000 chars)', () => {
    const bigText = 'x'.repeat(10001);
    const count = countTokens(bigText);
    expect(count).toBe(Math.ceil(10001 / 4));
    // Calling again should still work (recomputed)
    expect(countTokens(bigText)).toBe(count);
  });

  it('single character returns 1', () => {
    expect(countTokens('a')).toBe(1);
  });
});

describe('countMessageTokens', () => {
  beforeEach(() => {
    clearTokenCache();
  });

  it('counts tokens for message by ID', () => {
    const count = countMessageTokens('msg-1', 'hello world');
    expect(count).toBe(3); // ceil(11/4) = 3
  });

  it('caches by ID', () => {
    const first = countMessageTokens('msg-2', 'some content');
    const second = countMessageTokens('msg-2', 'different content'); // same ID, different content
    // Second call should return cached value from first call
    expect(second).toBe(first);
  });

  it('treats different IDs independently', () => {
    countMessageTokens('id-a', 'short');
    countMessageTokens('id-b', 'a longer piece of text here');
    expect(countMessageTokens('id-a', 'short')).toBe(2);
    expect(countMessageTokens('id-b', 'a longer piece of text here')).toBe(7);
  });
});

describe('clearTokenCache', () => {
  it('clears cached values', () => {
    const text = 'clear me';
    countTokens(text);    // populate cache
    clearTokenCache();
    // After clearing, the same text should recompute (no observable side effect, just should not throw)
    expect(() => countTokens(text)).not.toThrow();
  });
});
