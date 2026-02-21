/**
 * Migration Runner — Applies numbered SQL migrations in order.
 *
 * In normal Node.js / tsx dev mode: uses the static MIGRATION_MANIFEST
 * (imported from manifest.ts) to avoid readdirSync issues in bundled
 * environments such as Bun compiled single binaries.
 *
 * Tracks applied migrations in a `schema_migrations` table.
 */

import { getPool } from '../pg-pool.js';
import { MIGRATION_MANIFEST } from './manifest.js';

export async function runMigrations(): Promise<void> {
  const pool = getPool();

  // Ensure the migrations tracking table exists. CREATE TABLE IF NOT EXISTS is
  // safe under concurrent execution — PostgreSQL serialises it internally.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at BIGINT NOT NULL
    )
  `);

  const migrations = MIGRATION_MANIFEST;
  if (migrations.length === 0) return;

  // Fast-path (no lock needed): if the latest manifest entry is already the
  // latest recorded migration, all migrations have been applied.
  const latestId = migrations[migrations.length - 1]!.id;
  const latest = await pool.query<{ id: string }>(
    'SELECT id FROM schema_migrations ORDER BY id DESC LIMIT 1'
  );
  if (latest.rows[0]?.id === latestId) {
    return;
  }

  // Acquire a session-level Postgres advisory lock so that only one process
  // runs the per-entry migration loop at a time. This prevents the unique-
  // constraint race condition when multiple pods (e.g. replicaCount: 3) start
  // simultaneously and all pass the fast-path check above before any INSERT
  // has been committed. pg_advisory_lock blocks until the lock is available;
  // it is released automatically when the client is returned to the pool.
  const client = await pool.connect();
  try {
    await client.query(`SELECT pg_advisory_lock(hashtext('secureyeoman_migrations'))`);
    try {
      // Re-check fast-path after acquiring the lock — another pod may have
      // completed migrations while we were waiting.
      const recheck = await client.query<{ id: string }>(
        'SELECT id FROM schema_migrations ORDER BY id DESC LIMIT 1'
      );
      if (recheck.rows[0]?.id === latestId) {
        return;
      }

      for (const { id, sql } of migrations) {
        const existing = await client.query('SELECT id FROM schema_migrations WHERE id = $1', [id]);
        if (existing.rows.length > 0) {
          continue;
        }

        await client.query(sql);

        await client.query('INSERT INTO schema_migrations (id, applied_at) VALUES ($1, $2)', [
          id,
          Date.now(),
        ]);
      }
    } finally {
      await client.query(`SELECT pg_advisory_unlock(hashtext('secureyeoman_migrations'))`);
    }
  } finally {
    client.release();
  }
}
