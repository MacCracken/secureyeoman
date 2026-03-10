/**
 * Rate Limiter Middleware — token bucket rate limiting keyed by session + tool.
 *
 * Bucket keys combine a session/connection identifier with the tool name so that
 * one session's burst does not exhaust the budget for other sessions.  When no
 * session context is available, the tool name alone is used (backwards-compatible).
 */

export interface RateLimiterMiddleware {
  check(toolName: string, sessionId?: string): { allowed: boolean; retryAfterMs?: number };
  reset(toolName: string, sessionId?: string): void;
  prune(): void;
  wrap<T>(toolName: string, fn: () => Promise<T>, sessionId?: string): Promise<T>;
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

export function createRateLimiter(maxPerSecond: number): RateLimiterMiddleware {
  const buckets = new Map<string, TokenBucket>();
  const BUCKET_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

  function bucketKey(toolName: string, sessionId?: string): string {
    return sessionId ? `${sessionId}:${toolName}` : toolName;
  }

  function getBucket(toolName: string, sessionId?: string): TokenBucket {
    const key = bucketKey(toolName, sessionId);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { tokens: maxPerSecond, lastRefill: Date.now() };
      buckets.set(key, bucket);
    }

    // Refill tokens based on time elapsed
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const refill = (elapsed / 1000) * maxPerSecond;
    bucket.tokens = Math.min(maxPerSecond, bucket.tokens + refill);
    bucket.lastRefill = now;

    return bucket;
  }

  return {
    check(toolName: string, sessionId?: string): { allowed: boolean; retryAfterMs?: number } {
      const bucket = getBucket(toolName, sessionId);
      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        return { allowed: true };
      }
      const retryAfterMs = Math.ceil(((1 - bucket.tokens) / maxPerSecond) * 1000);
      return { allowed: false, retryAfterMs };
    },

    reset(toolName: string, sessionId?: string): void {
      buckets.delete(bucketKey(toolName, sessionId));
    },

    /** Remove stale buckets that haven't been refilled in over an hour. */
    prune(): void {
      const cutoff = Date.now() - BUCKET_MAX_AGE_MS;
      for (const [key, bucket] of buckets) {
        if (bucket.lastRefill < cutoff) buckets.delete(key);
      }
    },

    async wrap<T>(toolName: string, fn: () => Promise<T>, sessionId?: string): Promise<T> {
      const result = this.check(toolName, sessionId);
      if (!result.allowed) {
        throw new RateLimitError(toolName, result.retryAfterMs ?? 1000);
      }
      return fn();
    },
  };
}

export class RateLimitError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly retryAfterMs: number
  ) {
    super(`Rate limit exceeded for tool "${toolName}". Retry after ${retryAfterMs}ms.`);
    this.name = 'RateLimitError';
  }
}
