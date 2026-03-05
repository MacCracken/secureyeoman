/**
 * Safe JSON parsing utility.
 *
 * Wraps JSON.parse in a try-catch to prevent crashes from corrupted
 * or malformed data in storage layers.
 */

/**
 * Parse JSON safely, returning fallback on failure.
 * Use in storage row mappers where DB values may be corrupted.
 */
export function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw !== 'string') return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
