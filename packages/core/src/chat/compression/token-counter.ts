/**
 * Token Counter
 *
 * Approximate token counting for compression budget management.
 * Uses ~4 chars per token heuristic with optional tiktoken integration.
 */

// Bounded LRU-style cache: evict oldest entry (Map insertion order) when full.
const TOKEN_CACHE_MAX = 2000;
const tokenCache = new Map<string, number>();

function cachedCount(key: string, compute: () => number): number {
  const hit = tokenCache.get(key);
  if (hit !== undefined) return hit;
  const value = compute();
  if (tokenCache.size >= TOKEN_CACHE_MAX) {
    // Evict oldest entry (first in insertion order)
    const oldest = tokenCache.keys().next().value;
    if (oldest !== undefined) tokenCache.delete(oldest);
  }
  tokenCache.set(key, value);
  return value;
}

/**
 * Approximate token count for a text string.
 * Uses the ~4 characters per token heuristic (accurate within ~10% for English).
 */
export function countTokens(text: string): number {
  if (!text) return 0;
  // Skip caching for large strings to avoid storing huge keys
  if (text.length >= 10000) return Math.ceil(text.length / 4);
  return cachedCount(text, () => Math.ceil(text.length / 4));
}

/**
 * Count tokens for a message, keyed by ID for caching.
 */
export function countMessageTokens(id: string, content: string): number {
  return cachedCount(`msg:${id}`, () => Math.ceil(content.length / 4));
}

/**
 * Clear the token cache.
 */
export function clearTokenCache(): void {
  tokenCache.clear();
}
