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
import { initPool, getPool } from '../pg-pool.js';
import { runMigrations } from './runner.js';
import { MIGRATION_MANIFEST } from './manifest.js';

function assertSafeIdentifier(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(name)) {
    throw new Error(`Unsafe SQL identifier rejected: ${name}`);
  }
  return name;
}

const dbConfig = {
  host: process.env['TEST_DB_HOST'] ?? process.env['DATABASE_HOST'] ?? 'localhost',
  port: Number(process.env['TEST_DB_PORT'] ?? '5432'),
  database: process.env['TEST_DB_NAME'] ?? 'secureyeoman_test',
  user: process.env['TEST_DB_USER'] ?? 'secureyeoman',
  password:
    process.env['TEST_DB_PASSWORD'] ?? process.env['POSTGRES_PASSWORD'] ?? 'secureyeoman_dev',
  ssl: false,
  poolSize: 3,
};

async function appliedIds(): Promise<string[]> {
  const res = await getPool().query<{ id: string }>('SELECT id FROM schema_migrations ORDER BY id');
  return res.rows.map((r) => r.id);
}

async function wipeAllSchemas(): Promise<void> {
  const pool = getPool();
  // Drop every application schema + the tracking table so runMigrations()
  // starts from a truly blank database (only public + pg_* remain).
  const schemas = [
    'a2a',
    'admin',
    'agents',
    'ai',
    'analytics',
    'audit',
    'auth',
    'brain',
    'browser',
    'capture',
    'chat',
    'comms',
    'dashboard',
    'execution',
    'experiment',
    'extensions',
    'federation',
    'integration',
    'marketplace',
    'mcp',
    'multimodal',
    'proactive',
    'rbac',
    'risk',
    'rotation',
    'sandbox',
    'security',
    'soul',
    'spirit',
    'task',
    'telemetry',
    'training',
    'workflow',
    'workspace',
  ];
  for (const s of schemas) {
    assertSafeIdentifier(s);
    await pool.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`);
  }
  await pool.query('DROP TABLE IF EXISTS schema_migrations');
  // Drop all public-schema application tables/sequences created by migrations
  const pubTables = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('pg_stat_statements')`
  );
  for (const row of pubTables.rows) {
    const table = assertSafeIdentifier(row.tablename);
    await pool.query(`DROP TABLE IF EXISTS public."${table}" CASCADE`);
  }
  const pubSeqs = await pool.query<{ sequencename: string }>(
    `SELECT sequencename FROM pg_sequences WHERE schemaname = 'public'`
  );
  for (const row of pubSeqs.rows) {
    const seq = assertSafeIdentifier(row.sequencename);
    await pool.query(`DROP SEQUENCE IF EXISTS public."${seq}" CASCADE`);
  }
}

describe('runMigrations()', () => {
  beforeAll(async () => {
    initPool(dbConfig);
    // Ensure schema objects exist before any test calls wipeMigrationsTable().
    // On a fresh DB this is the first migration run.
    await runMigrations();
  });

  afterAll(async () => {
    // Leave DB fully migrated for any subsequent suites that share the test DB.
    await runMigrations();
    // Do NOT closePool/resetPool — with isolate: false the pool is shared
    // across all DB test files and must stay alive.
  });

  it('applies all manifest entries on a fresh schema_migrations table', async () => {
    await wipeAllSchemas();
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
