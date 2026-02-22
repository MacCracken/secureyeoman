/**
 * LLM Response Cache (ADR 101)
 *
 * In-memory TTL cache for non-streaming AI completions.
 * Keyed by SHA-256(provider + model + messages + temperature + maxTokens + tool names).
 *
 * Primary use-case: heartbeat probes and repeated identical system-state queries that
 * run on aggressive schedules, paying for identical API calls every cycle.
 *
 * Eviction: FIFO (Map insertion-order) when maxEntries is reached; TTL checked on get().
 * Streaming responses are never cached — only `chat()` hits the cache.
 */

import type { AIRequest, AIResponse, ResponseCacheConfig } from '@secureyeoman/shared';
import { sha256 } from '../utils/crypto.js';

interface CacheEntry {
  response: AIResponse;
  cachedAt: number;
  expiresAt: number;
  hitCount: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  entries: number;
  /** Fraction of lookups that returned a cached result (0–1). */
  hitRate: number;
}

export class ResponseCache {
  private readonly store = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;
  private readonly config: ResponseCacheConfig;

  constructor(config: ResponseCacheConfig) {
    this.config = config;
  }

  /**
   * Build a deterministic SHA-256 cache key from the provider, resolved model,
   * and the request parameters that determine the LLM output.
   */
  buildKey(provider: string, model: string, request: AIRequest): string {
    const keyData = {
      provider,
      model,
      messages: request.messages,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      // Include sorted tool names so different tool sets produce different keys,
      // but tool schema changes don't pollute the key with verbose JSON.
      toolNames: request.tools ? request.tools.map((t) => t.name).sort() : undefined,
    };
    return sha256(JSON.stringify(keyData));
  }

  /**
   * Retrieve a cached response.
   * Returns `null` when the cache is disabled, the key is missing, or the entry has expired.
   */
  get(key: string): AIResponse | null {
    if (!this.config.enabled) return null;

    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return null;
    }

    entry.hitCount++;
    this.hits++;
    return entry.response;
  }

  /**
   * Store a response in the cache.
   * When the store is at capacity the oldest entry (by insertion order) is evicted first.
   * No-op when the cache is disabled.
   */
  set(key: string, response: AIResponse): void {
    if (!this.config.enabled) return;

    if (this.store.size >= this.config.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }

    const now = Date.now();
    this.store.set(key, {
      response,
      cachedAt: now,
      expiresAt: now + this.config.ttlMs,
      hitCount: 0,
    });
  }

  /** Remove all entries whose TTL has elapsed. Returns the number of entries evicted. */
  evictExpired(): number {
    const now = Date.now();
    let count = 0;
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  /** Return hit/miss counters and current store size. */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      entries: this.store.size,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /** Clear all cached entries and reset counters. */
  clear(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }
}
