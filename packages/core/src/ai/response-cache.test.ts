import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResponseCache } from './response-cache.js';
import type { AIRequest, AIResponse } from '@secureyeoman/shared';

const enabledConfig = { enabled: true, ttlMs: 5_000, maxEntries: 3 };
const disabledConfig = { enabled: false, ttlMs: 5_000, maxEntries: 100 };

const baseRequest: AIRequest = {
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is 2 + 2?' },
  ],
  stream: false,
};

const baseResponse: AIResponse = {
  id: 'resp-1',
  content: '4',
  usage: { inputTokens: 20, outputTokens: 5, cachedTokens: 0, totalTokens: 25 },
  stopReason: 'end_turn',
  model: 'claude-sonnet-4-20250514',
  provider: 'anthropic',
};

describe('ResponseCache', () => {
  describe('buildKey', () => {
    it('returns the same key for identical inputs', () => {
      const cache = new ResponseCache(enabledConfig);
      const k1 = cache.buildKey('anthropic', 'claude-sonnet-4-20250514', baseRequest);
      const k2 = cache.buildKey('anthropic', 'claude-sonnet-4-20250514', baseRequest);
      expect(k1).toBe(k2);
    });

    it('returns different keys for different providers', () => {
      const cache = new ResponseCache(enabledConfig);
      const k1 = cache.buildKey('anthropic', 'claude-sonnet-4-20250514', baseRequest);
      const k2 = cache.buildKey('openai', 'claude-sonnet-4-20250514', baseRequest);
      expect(k1).not.toBe(k2);
    });

    it('returns different keys for different models', () => {
      const cache = new ResponseCache(enabledConfig);
      const k1 = cache.buildKey('anthropic', 'claude-sonnet-4-20250514', baseRequest);
      const k2 = cache.buildKey('anthropic', 'claude-opus-4-20250514', baseRequest);
      expect(k1).not.toBe(k2);
    });

    it('returns different keys for different messages', () => {
      const cache = new ResponseCache(enabledConfig);
      const req2: AIRequest = {
        ...baseRequest,
        messages: [{ role: 'user', content: 'What is 3 + 3?' }],
      };
      const k1 = cache.buildKey('anthropic', 'model', baseRequest);
      const k2 = cache.buildKey('anthropic', 'model', req2);
      expect(k1).not.toBe(k2);
    });

    it('returns different keys for different temperatures', () => {
      const cache = new ResponseCache(enabledConfig);
      const req1: AIRequest = { ...baseRequest, temperature: 0.5 };
      const req2: AIRequest = { ...baseRequest, temperature: 0.9 };
      const k1 = cache.buildKey('anthropic', 'model', req1);
      const k2 = cache.buildKey('anthropic', 'model', req2);
      expect(k1).not.toBe(k2);
    });

    it('returns different keys for different tool sets', () => {
      const cache = new ResponseCache(enabledConfig);
      const reqWithTools: AIRequest = {
        ...baseRequest,
        tools: [
          {
            name: 'search',
            description: 'Search the web',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
      };
      const k1 = cache.buildKey('anthropic', 'model', baseRequest);
      const k2 = cache.buildKey('anthropic', 'model', reqWithTools);
      expect(k1).not.toBe(k2);
    });

    it('produces a 64-character hex string (SHA-256)', () => {
      const cache = new ResponseCache(enabledConfig);
      const key = cache.buildKey('anthropic', 'model', baseRequest);
      expect(key).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('get / set', () => {
    it('returns null when the cache is disabled', () => {
      const cache = new ResponseCache(disabledConfig);
      const key = cache.buildKey('anthropic', 'model', baseRequest);
      cache.set(key, baseResponse);
      expect(cache.get(key)).toBeNull();
    });

    it('returns null for a missing key', () => {
      const cache = new ResponseCache(enabledConfig);
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('returns the stored response for a valid entry', () => {
      const cache = new ResponseCache(enabledConfig);
      const key = cache.buildKey('anthropic', 'model', baseRequest);
      cache.set(key, baseResponse);
      expect(cache.get(key)).toEqual(baseResponse);
    });

    it('returns null for an expired entry', () => {
      vi.useFakeTimers();
      const cache = new ResponseCache({ enabled: true, ttlMs: 1_000, maxEntries: 100 });
      const key = cache.buildKey('anthropic', 'model', baseRequest);
      cache.set(key, baseResponse);

      vi.advanceTimersByTime(1_001);
      expect(cache.get(key)).toBeNull();
      vi.useRealTimers();
    });

    it('does not store when cache is disabled', () => {
      const cache = new ResponseCache(disabledConfig);
      const key = 'some-key';
      cache.set(key, baseResponse);
      expect(cache.getStats().entries).toBe(0);
    });
  });

  describe('eviction', () => {
    it('evicts the oldest entry when maxEntries is exceeded', () => {
      const cache = new ResponseCache({ enabled: true, ttlMs: 60_000, maxEntries: 2 });
      const k1 = 'key-a';
      const k2 = 'key-b';
      const k3 = 'key-c';
      cache.set(k1, baseResponse);
      cache.set(k2, baseResponse);
      cache.set(k3, baseResponse); // should evict k1

      expect(cache.get(k1)).toBeNull(); // evicted
      expect(cache.get(k2)).not.toBeNull();
      expect(cache.get(k3)).not.toBeNull();
    });
  });

  describe('evictExpired', () => {
    it('removes expired entries and returns the count', () => {
      vi.useFakeTimers();
      const cache = new ResponseCache({ enabled: true, ttlMs: 500, maxEntries: 100 });
      cache.set('a', baseResponse);
      cache.set('b', baseResponse);
      vi.advanceTimersByTime(600);
      cache.set('c', baseResponse); // fresh entry

      const evicted = cache.evictExpired();
      expect(evicted).toBe(2);
      expect(cache.getStats().entries).toBe(1);
      vi.useRealTimers();
    });

    it('returns 0 when no entries have expired', () => {
      const cache = new ResponseCache(enabledConfig);
      cache.set('a', baseResponse);
      expect(cache.evictExpired()).toBe(0);
    });
  });

  describe('getStats', () => {
    it('starts with zero hits/misses and zero entries', () => {
      const cache = new ResponseCache(enabledConfig);
      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.entries).toBe(0);
      expect(stats.hitRate).toBe(0);
    });

    it('tracks hits and misses correctly', () => {
      const cache = new ResponseCache(enabledConfig);
      const key = cache.buildKey('anthropic', 'model', baseRequest);

      cache.get(key); // miss
      cache.set(key, baseResponse);
      cache.get(key); // hit

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.5);
    });

    it('counts expired entries as misses', () => {
      vi.useFakeTimers();
      const cache = new ResponseCache({ enabled: true, ttlMs: 100, maxEntries: 100 });
      const key = 'k';
      cache.set(key, baseResponse);
      vi.advanceTimersByTime(200);
      cache.get(key); // expired → miss

      const stats = cache.getStats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(0);
      vi.useRealTimers();
    });
  });

  describe('clear', () => {
    it('removes all entries and resets counters', () => {
      const cache = new ResponseCache(enabledConfig);
      cache.set('a', baseResponse);
      cache.get('a'); // hit
      cache.get('b'); // miss

      cache.clear();

      const stats = cache.getStats();
      expect(stats.entries).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('disabled cache stats', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('shows zero misses when disabled (get is a no-op)', () => {
      const cache = new ResponseCache(disabledConfig);
      cache.get('any');
      // Disabled cache should not increment misses
      expect(cache.getStats().misses).toBe(0);
    });
  });
});
