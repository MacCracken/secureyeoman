/**
 * Migration Runner — Applies numbered SQL migrations in order.
 *
 * Tracks applied migrations in a `schema_migrations` table.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool } from '../pg-pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runMigrations(): Promise<void> {
  const pool = getPool();

  // Ensure the migrations tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at BIGINT NOT NULL
    )
  `);

  // Find all .sql files in this directory
  const files = readdirSync(__dirname)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const id = file.replace('.sql', '');

    // Check if already applied
    const existing = await pool.query('SELECT id FROM schema_migrations WHERE id = $1', [id]);
    if (existing.rows.length > 0) {
      continue;
    }

    // Read and execute
    const sql = readFileSync(join(__dirname, file), 'utf-8');
    await pool.query(sql);

    // Record as applied
    await pool.query('INSERT INTO schema_migrations (id, applied_at) VALUES ($1, $2)', [
      id,
      Date.now(),
    ]);
  }
}
