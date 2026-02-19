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

  // Ensure the migrations tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at BIGINT NOT NULL
    )
  `);

  const migrations = MIGRATION_MANIFEST;
  if (migrations.length === 0) return;

  // Fast-path: if the highest-numbered entry is already the latest recorded
  // migration, all migrations have been applied — skip the per-item loop.
  const latestId = migrations[migrations.length - 1]!.id;
  const latest = await pool.query<{ id: string }>(
    'SELECT id FROM schema_migrations ORDER BY id DESC LIMIT 1'
  );
  if (latest.rows[0]?.id === latestId) {
    return;
  }

  for (const { id, sql } of migrations) {
    // Check if already applied
    const existing = await pool.query('SELECT id FROM schema_migrations WHERE id = $1', [id]);
    if (existing.rows.length > 0) {
      continue;
    }

    // Execute migration SQL
    await pool.query(sql);

    // Record as applied
    await pool.query('INSERT INTO schema_migrations (id, applied_at) VALUES ($1, $2)', [
      id,
      Date.now(),
    ]);
  }
}
