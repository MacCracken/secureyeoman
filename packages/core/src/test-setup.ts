/**
 * Test Setup — PostgreSQL pool initialization for test suites.
 *
 * Connects to a test database (defaults to localhost:5432/secureyeoman_test).
 * Call `setupTestDb()` in `beforeAll()` and `teardownTestDb()` in `afterAll()`.
 * Call `truncateAllTables()` in `beforeEach()` for clean test state.
 */

import { initPool, closePool, resetPool, getPool } from './storage/pg-pool.js';
import { runMigrations } from './storage/migrations/runner.js';

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
  const password = process.env.TEST_DB_PASSWORD ?? process.env.POSTGRES_PASSWORD ?? 'secureyeoman_dev';

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
  const schemas = [
    'brain',
    'soul',
    'spirit',
    'auth',
    'audit',
    'chat',
    'task',
    'integration',
    'mcp',
    'marketplace',
    'dashboard',
    'workspace',
    'experiment',
    'comms',
    'rotation',
    'rbac',
  ];

  for (const schema of schemas) {
    // Get all tables in the schema
    const res = await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname = $1`, [schema]);
    for (const row of res.rows) {
      await pool.query(`TRUNCATE ${schema}."${row.tablename}" CASCADE`);
    }
  }

  // Also truncate public-schema user tables (e.g. oauth_tokens, usage_records, outbound_webhooks)
  // Excludes schema_migrations so migration state is preserved across test runs.
  const publicRes = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != 'schema_migrations'`
  );
  for (const row of publicRes.rows) {
    await pool.query(`TRUNCATE public."${row.tablename}" CASCADE`);
  }
}

/**
 * Close the pool and reset state.
 */
export async function teardownTestDb(): Promise<void> {
  await closePool();
  resetPool();
  initialized = false;
}
