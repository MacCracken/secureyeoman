/**
 * Rate Limiter Middleware — token bucket per-tool rate limiting.
 */

export interface RateLimiterMiddleware {
  check(toolName: string): { allowed: boolean; retryAfterMs?: number };
  reset(toolName: string): void;
  wrap<T>(toolName: string, fn: () => Promise<T>): Promise<T>;
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

export function createRateLimiter(maxPerSecond: number): RateLimiterMiddleware {
  const buckets = new Map<string, TokenBucket>();

  function getBucket(toolName: string): TokenBucket {
    let bucket = buckets.get(toolName);
    if (!bucket) {
      bucket = { tokens: maxPerSecond, lastRefill: Date.now() };
      buckets.set(toolName, bucket);
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
    check(toolName: string): { allowed: boolean; retryAfterMs?: number } {
      const bucket = getBucket(toolName);
      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        return { allowed: true };
      }
      const retryAfterMs = Math.ceil((1 - bucket.tokens) / maxPerSecond * 1000);
      return { allowed: false, retryAfterMs };
    },

    reset(toolName: string): void {
      buckets.delete(toolName);
    },

    async wrap<T>(toolName: string, fn: () => Promise<T>): Promise<T> {
      const result = this.check(toolName);
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
    public readonly retryAfterMs: number,
  ) {
    super(`Rate limit exceeded for tool "${toolName}". Retry after ${retryAfterMs}ms.`);
    this.name = 'RateLimitError';
  }
}
