/**
 * ResponseCache Performance Benchmarks
 *
 * Hit/miss rates, set under capacity vs at-capacity eviction, evictExpired.
 *
 * Run:  cd packages/core && npx vitest bench
 */

import { bench, describe } from 'vitest';
import { ResponseCache } from './response-cache.js';
import type { AIResponse } from '@secureyeoman/shared';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCache(maxEntries = 500, ttlMs = 60_000): ResponseCache {
  return new ResponseCache({ enabled: true, maxEntries, ttlMs });
}

const RESPONSE: AIResponse = {
  id: 'bench-resp-1',
  content: 'The weather in San Francisco is foggy with a high of 62°F.',
  model: 'test',
  provider: 'bench',
  stopReason: 'end_turn',
  usage: { inputTokens: 10, outputTokens: 20, cachedTokens: 0, totalTokens: 30 },
};

// ── Benchmarks ────────────────────────────────────────────────────────────────

describe('ResponseCache — hit/miss', () => {
  const cache = makeCache();
  cache.set('existing-key', RESPONSE);

  bench('cache hit', () => {
    cache.get('existing-key');
  });

  bench('cache miss', () => {
    cache.get('nonexistent-key-that-will-not-match');
  });
});

describe('ResponseCache — set operations', () => {
  bench('set under capacity (100 entries)', () => {
    const cache = makeCache(10_000);
    for (let i = 0; i < 100; i++) {
      cache.set(`prompt-${i}`, { ...RESPONSE, content: `resp-${i}` });
    }
  });

  bench('set at capacity (100 evictions)', () => {
    const cache = makeCache(100);
    for (let i = 0; i < 100; i++) {
      cache.set(`prompt-${i}`, { ...RESPONSE, content: `resp-${i}` });
    }
    for (let i = 100; i < 200; i++) {
      cache.set(`prompt-${i}`, { ...RESPONSE, content: `resp-${i}` });
    }
  });
});

describe('ResponseCache — evictExpired', () => {
  bench('evict all expired (200 entries, 1ms TTL)', () => {
    const cache = makeCache(200, 1);
    for (let i = 0; i < 200; i++) {
      cache.set(`prompt-${i}`, { ...RESPONSE, content: `resp-${i}` });
    }
    cache.evictExpired();
  });
});
