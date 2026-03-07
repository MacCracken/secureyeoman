/**
 * Test Setup — PostgreSQL pool initialization for test suites.
 *
 * Connects to a test database (defaults to localhost:5432/secureyeoman_test).
 * Call `setupTestDb()` in `beforeAll()` and `teardownTestDb()` in `afterAll()`.
 * Call `truncateAllTables()` in `beforeEach()` for clean test state.
 */

import { initPool, closePool, resetPool, getPool } from './storage/pg-pool.js';
import { runMigrations } from './storage/migrations/runner.js';

/** Validate a PostgreSQL identifier to prevent SQL injection in DDL statements */
function assertSafeIdentifier(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(name)) {
    throw new Error(`Unsafe SQL identifier rejected: ${name}`);
  }
  return name;
}

let initialized = false;

/**
 * Initialize pool + run migrations for tests.
 * Safe to call multiple times — only runs once.
 */
export async function setupTestDb(): Promise<void> {
  if (initialized) return;

  const host = process.env.TEST_DB_HOST ?? process.env.DATABASE_HOST ?? 'localhost';
  const port = Number(process.env.TEST_DB_PORT ?? '5432');
  const database = process.env.TEST_DB_NAME ?? 'secureyeoman_test';
  const user = process.env.TEST_DB_USER ?? 'secureyeoman';
  const password =
    process.env.TEST_DB_PASSWORD ?? process.env.POSTGRES_PASSWORD ?? 'secureyeoman_dev';

  initPool({
    host,
    port,
    database,
    user,
    password,
    ssl: false,
    poolSize: 5,
  });

  await runMigrations();
  initialized = true;
}

/**
 * Truncate all application tables for clean test state.
 * Preserves schema_migrations so migrations don't re-run.
 */
export async function truncateAllTables(): Promise<void> {
  const pool = getPool();

  // Build a single TRUNCATE statement for all application tables.
  // This is atomic, faster, and avoids mid-iteration schema-drop issues
  // that occurred with per-table TRUNCATE CASCADE calls.
  const res = await pool.query<{ full_name: string }>(
    `SELECT schemaname || '.' || '"' || tablename || '"' AS full_name
     FROM pg_tables
     WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'public')
       AND schemaname NOT LIKE 'pg_%'
     ORDER BY schemaname, tablename`
  );

  if (res.rows.length > 0) {
    const tableList = res.rows.map((r) => {
      // full_name is "schema"."table" — validate both parts
      const [schema, table] = r.full_name.replace(/"/g, '').split('.');
      assertSafeIdentifier(schema);
      assertSafeIdentifier(table);
      return r.full_name;
    }).join(', ');
    await pool.query(`TRUNCATE ${tableList} CASCADE`);
  }

  // Also truncate public-schema user tables (e.g. oauth_tokens, usage_records, outbound_webhooks)
  // Excludes schema_migrations so migration state is preserved across test runs.
  const publicRes = await pool.query<{ full_name: string }>(
    `SELECT 'public."' || tablename || '"' AS full_name
     FROM pg_tables
     WHERE schemaname = 'public' AND tablename != 'schema_migrations'`
  );
  if (publicRes.rows.length > 0) {
    const pubList = publicRes.rows.map((r) => {
      const tableName = r.full_name.replace(/^public\."(.+)"$/, '$1');
      assertSafeIdentifier(tableName);
      return r.full_name;
    }).join(', ');
    await pool.query(`TRUNCATE ${pubList} CASCADE`);
  }

  // Re-seed the default tenant so FK constraints (tenant_id → auth.tenants) resolve.
  // Migration 058 adds tenant_id FK columns to user-data tables with DEFAULT 'default'.
  // After truncating auth.tenants, inserting any row with DEFAULT 'default' would fail.
  await pool.query(`
    INSERT INTO auth.tenants (id, name, slug, plan, metadata, created_at, updated_at)
    VALUES ('default', 'Default', 'default', 'enterprise', '{}', 0, 0)
    ON CONFLICT DO NOTHING
  `);
}

/**
 * Truncate only workflow schema tables (definitions, runs, step_runs).
 * Lighter alternative to truncateAllTables for workflow-specific test suites.
 */
export async function truncateWorkflowTables(): Promise<void> {
  const pool = getPool();
  const res = await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'workflow'`);
  for (const row of res.rows) {
    const table = assertSafeIdentifier(row.tablename);
    await pool.query(`TRUNCATE workflow."${table}" CASCADE`);
  }
}

/**
 * Close the pool and reset state.
 *
 * NOTE: With vitest.db.config.ts (isolate: false), all DB test files share a
 * single worker process. This function is intentionally a no-op in that mode
 * to prevent closing the pool between files — subsequent files would fail
 * because runMigrations() re-executes non-idempotent SQL (CREATE SCHEMA
 * without IF NOT EXISTS). The pool is cleaned up on process exit instead.
 *
 * Each test file still calls this in afterAll for correctness when run in
 * isolation (e.g., `vitest run src/foo.test.ts`), but the shared-process
 * fast path keeps the pool alive.
 */
export async function teardownTestDb(): Promise<void> {
  if (!initialized) return;
  // Skip teardown when pool is shared across files (isolate: false).
  // The initialized guard in setupTestDb() prevents double-init anyway.
}
