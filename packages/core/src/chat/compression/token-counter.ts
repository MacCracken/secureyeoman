/**
 * Token Counter
 *
 * Approximate token counting for compression budget management.
 * Uses ~4 chars per token heuristic with optional tiktoken integration.
 */

const tokenCache = new Map<string, number>();

/**
 * Approximate token count for a text string.
 * Uses the ~4 characters per token heuristic (accurate within ~10% for English).
 */
export function countTokens(text: string): number {
  if (!text) return 0;

  const cached = tokenCache.get(text);
  if (cached !== undefined) return cached;

  const count = Math.ceil(text.length / 4);

  // Cache if the text isn't too large (avoid memory bloat)
  if (text.length < 10000) {
    tokenCache.set(text, count);
  }

  return count;
}

/**
 * Count tokens for a message, keyed by ID for caching.
 */
export function countMessageTokens(id: string, content: string): number {
  const cacheKey = `msg:${id}`;
  const cached = tokenCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const count = countTokens(content);
  tokenCache.set(cacheKey, count);
  return count;
}

/**
 * Clear the token cache.
 */
export function clearTokenCache(): void {
  tokenCache.clear();
}
