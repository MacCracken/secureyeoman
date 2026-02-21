/**
 * Storage Backend Resolution (Phase 22 — Single Binary)
 *
 * Determines whether to use PostgreSQL or SQLite based on configuration
 * and environment. The 'auto' mode selects PG when DATABASE_URL is set,
 * otherwise falls back to SQLite (Tier 2 embedded/edge deployments).
 */

export type StorageBackend = 'pg' | 'sqlite';

export interface BackendResolutionResult {
  backend: StorageBackend;
  reason: string;
}

/**
 * Resolve the storage backend from config + environment.
 *
 * @param configBackend - Value from config.storage.backend ('pg', 'sqlite', or 'auto')
 */
export function resolveBackend(configBackend = 'auto'): BackendResolutionResult {
  if (configBackend === 'pg') {
    return { backend: 'pg', reason: 'explicitly configured' };
  }

  if (configBackend === 'sqlite') {
    return { backend: 'sqlite', reason: 'explicitly configured' };
  }

  // auto: pick PG if DATABASE_URL is available
  if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
    return { backend: 'pg', reason: 'DATABASE_URL detected' };
  }

  return { backend: 'sqlite', reason: 'no DATABASE_URL found, using SQLite (Tier 2)' };
}
