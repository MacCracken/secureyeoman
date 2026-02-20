/**
 * Migration Runner Integration Tests
 *
 * Verifies:
 *   1. All manifest entries apply cleanly on a fresh schema_migrations table.
 *   2. A second call is idempotent (fast-path short-circuit).
 *   3. Partial state recovery — missing entries are applied without re-running others.
 *   4. Every applied row carries a valid numeric applied_at timestamp.
 *
 * Requires a running PostgreSQL instance (TEST_DB_* or DATABASE_HOST env vars).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initPool, closePool, resetPool, getPool } from '../pg-pool.js';
import { runMigrations } from './runner.js';
import { MIGRATION_MANIFEST } from './manifest.js';

const dbConfig = {
  host: process.env['TEST_DB_HOST'] ?? process.env['DATABASE_HOST'] ?? 'localhost',
  port: Number(process.env['TEST_DB_PORT'] ?? '5432'),
  database: process.env['TEST_DB_NAME'] ?? 'secureyeoman_test',
  user: process.env['TEST_DB_USER'] ?? 'secureyeoman',
  password: process.env['TEST_DB_PASSWORD'] ?? process.env['POSTGRES_PASSWORD'] ?? 'secureyeoman_dev',
  ssl: false,
  poolSize: 3,
};

async function appliedIds(): Promise<string[]> {
  const res = await getPool().query<{ id: string }>(
    'SELECT id FROM schema_migrations ORDER BY id'
  );
  return res.rows.map((r) => r.id);
}

async function wipeMigrationsTable(): Promise<void> {
  // Truncate tracking table only — leaves all schema objects intact so SQL
  // with IF NOT EXISTS doesn't fail on re-apply.
  await getPool().query('TRUNCATE schema_migrations');
}

describe('runMigrations()', () => {
  beforeAll(() => {
    initPool(dbConfig);
  });

  afterAll(async () => {
    // Leave DB fully migrated for any subsequent suites that share the test DB.
    await runMigrations();
    await closePool();
    resetPool();
  });

  it('applies all manifest entries on a fresh schema_migrations table', async () => {
    await wipeMigrationsTable();
    await runMigrations();

    const ids = await appliedIds();
    const expectedIds = MIGRATION_MANIFEST.map((m) => m.id);

    expect(ids).toEqual(expectedIds);
    expect(ids).toHaveLength(MIGRATION_MANIFEST.length);
  });

  it('is idempotent — second call applies nothing new (fast-path)', async () => {
    const before = await appliedIds();
    await runMigrations();
    const after = await appliedIds();

    expect(after).toEqual(before);
    expect(after).toHaveLength(MIGRATION_MANIFEST.length);
  });

  it('recovers from partial state — applies only the missing entry', async () => {
    const lastId = MIGRATION_MANIFEST[MIGRATION_MANIFEST.length - 1]!.id;
    await getPool().query('DELETE FROM schema_migrations WHERE id = $1', [lastId]);

    const before = await appliedIds();
    expect(before).not.toContain(lastId);

    await runMigrations();

    const after = await appliedIds();
    expect(after).toContain(lastId);
    expect(after).toHaveLength(MIGRATION_MANIFEST.length);
  });

  it('records every migration with a positive numeric applied_at timestamp', async () => {
    const res = await getPool().query<{ id: string; applied_at: string }>(
      'SELECT id, applied_at FROM schema_migrations ORDER BY id'
    );
    for (const row of res.rows) {
      const ts = Number(row.applied_at);
      expect(ts, `applied_at for ${row.id} should be a positive integer`).toBeGreaterThan(0);
    }
  });
});
