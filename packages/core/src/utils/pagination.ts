export function paginate<T>(arr: T[], limit?: number, offset = 0): T[] {
  return limit !== undefined ? arr.slice(offset, offset + limit) : arr.slice(offset);
}

/**
 * Parse and clamp user-provided limit/offset query parameters.
 * Prevents unbounded queries by enforcing a configurable max limit.
 */

const DEFAULT_LIMIT = 20;
const DEFAULT_MAX_LIMIT = 100;

export interface PaginationOptions {
  maxLimit?: number;
  defaultLimit?: number;
}

export interface PaginationResult {
  limit: number;
  offset: number;
}

export function parsePagination(
  query: { limit?: string | number; offset?: string | number },
  options?: PaginationOptions
): PaginationResult {
  const maxLimit = options?.maxLimit ?? DEFAULT_MAX_LIMIT;
  const defaultLimit = options?.defaultLimit ?? DEFAULT_LIMIT;

  let limit = typeof query.limit === 'number' ? query.limit : parseInt(query.limit ?? '', 10);
  if (isNaN(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;

  let offset = typeof query.offset === 'number' ? query.offset : parseInt(query.offset ?? '', 10);
  if (isNaN(offset) || offset < 0) offset = 0;

  return { limit, offset };
}
