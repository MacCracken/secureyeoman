/**
 * Startup Time Integration Test
 *
 * Verifies that `secureyeoman start` reaches /health:ok in < 10 s when the
 * database is already fully migrated (migration fast-path active).
 *
 * What this exercises:
 *  - Full process cold-start overhead (Node.js + tsx transpilation)
 *  - config → logger → keyring → DB pool → migration fast-path → RBAC →
 *    audit chain → all managers → Fastify gateway listen
 *  - /health endpoint round-trip
 *
 * Requires: a running PostgreSQL instance reachable via the same env vars as
 * runner.test.ts (TEST_DB_* or DATABASE_* / POSTGRES_PASSWORD).
 *
 * The parent process applies all migrations in beforeAll so the child process
 * always hits the fast-path (single query instead of advisory-lock + loop).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initPool, closePool, resetPool, getPool } from './storage/pg-pool.js';
import { runMigrations } from './storage/migrations/runner.js';
import { MIGRATION_MANIFEST } from './storage/migrations/manifest.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve binaries and entry points from this file's directory
const TSX_BIN = resolve(__dirname, '../../../node_modules/.bin/tsx');
const CLI_ENTRY = resolve(__dirname, 'cli.ts');

// ─── Constants ────────────────────────────────────────────────────────────────

/** Wall-clock budget from spawn → /health:ok */
const STARTUP_BUDGET_MS = 10_000;

/** How often to poke the health endpoint */
const POLL_INTERVAL_MS = 100;

/**
 * Port the child process listens on.
 * Chosen to avoid collisions with the production default (18789) and
 * any other test services that may be running concurrently.
 */
const TEST_PORT = 19_191;

// ─── Database config (mirrors runner.test.ts) ────────────────────────────────

const dbConfig = {
  host: process.env['TEST_DB_HOST'] ?? process.env['DATABASE_HOST'] ?? 'localhost',
  port: Number(process.env['TEST_DB_PORT'] ?? '5432'),
  database: process.env['TEST_DB_NAME'] ?? 'secureyeoman_test',
  user: process.env['TEST_DB_USER'] ?? 'secureyeoman',
  password:
    process.env['TEST_DB_PASSWORD'] ??
    process.env['POSTGRES_PASSWORD'] ??
    'secureyeoman_dev',
  ssl: false,
  poolSize: 3,
};

// ─── Child process environment ───────────────────────────────────────────────
// The child connects to the same test database so it sees all migrations
// already applied and takes the fast-path (no advisory lock needed).

const childEnv: NodeJS.ProcessEnv = {
  ...process.env,
  // Required secrets — values are synthetic but long enough to pass validation
  SECUREYEOMAN_SIGNING_KEY:
    process.env['SECUREYEOMAN_SIGNING_KEY'] ??
    'test-signing-key-at-least-32-characters-xxxx',
  SECUREYEOMAN_TOKEN_SECRET:
    process.env['SECUREYEOMAN_TOKEN_SECRET'] ??
    'test-token-secret-at-least-32-chars-xxx',
  SECUREYEOMAN_ENCRYPTION_KEY:
    process.env['SECUREYEOMAN_ENCRYPTION_KEY'] ??
    'test-encryption-key-32-chars-xxxxxxxx',
  SECUREYEOMAN_ADMIN_PASSWORD:
    process.env['SECUREYEOMAN_ADMIN_PASSWORD'] ?? 'test-admin-password',
  // Forward test-DB settings — the pool reads POSTGRES_PASSWORD via passwordEnv
  DATABASE_HOST: dbConfig.host,
  DATABASE_NAME: dbConfig.database,
  DATABASE_USER: dbConfig.user,
  POSTGRES_PASSWORD: dbConfig.password,
  // Override gateway port via SECUREYEOMAN_PORT (read by loadEnvConfig)
  SECUREYEOMAN_PORT: String(TEST_PORT),
  // validateSecrets() requires an API key whenever provider != 'ollama'.
  // A placeholder satisfies the presence check; no AI call is made during startup.
  ANTHROPIC_API_KEY: process.env['ANTHROPIC_API_KEY'] ?? 'test-anthropic-api-key-placeholder',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Polls GET http://127.0.0.1:<port>/health every POLL_INTERVAL_MS until the
 * response body contains `{ status: 'ok' }` or the deadline is exceeded.
 *
 * Returns the elapsed time in ms from call to first healthy response.
 */
async function pollUntilHealthy(port: number, timeoutMs: number): Promise<number> {
  const start = Date.now();
  const deadline = start + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) {
        const body = (await res.json()) as { status: string };
        if (body.status === 'ok') {
          return Date.now() - start;
        }
      }
    } catch {
      // ECONNREFUSED — gateway not yet listening; keep polling
    }
    await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(`/health did not return status:ok within ${timeoutMs} ms`);
}

/**
 * Sends SIGTERM to the child and waits for it to exit.
 * Falls back to SIGKILL after 2 s to handle stuck processes.
 */
function killChild(child: ChildProcess): Promise<void> {
  return new Promise<void>((resolve) => {
    if (child.killed || child.exitCode !== null) {
      resolve();
      return;
    }
    child.once('exit', () => resolve());
    child.kill('SIGTERM');
    setTimeout(() => {
      if (!child.killed) child.kill('SIGKILL');
    }, 2_000);
  });
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('Startup time — process-level (migration fast-path)', () => {
  beforeAll(async () => {
    // Apply all migrations in the parent process first so the child sees a
    // fully migrated schema and unconditionally takes the fast-path.
    initPool(dbConfig);
    await runMigrations();

    // Sanity-check: confirm the fast-path precondition is met.
    const res = await getPool().query<{ id: string }>(
      'SELECT id FROM schema_migrations ORDER BY id DESC LIMIT 1'
    );
    const latestApplied = res.rows[0]?.id;
    const latestManifest = MIGRATION_MANIFEST[MIGRATION_MANIFEST.length - 1]!.id;

    if (latestApplied !== latestManifest) {
      throw new Error(
        `Startup-time precondition failed: DB is not fully migrated. ` +
          `latest applied=${latestApplied ?? 'none'}, latest manifest=${latestManifest}`
      );
    }
  });

  afterAll(async () => {
    await closePool();
    resetPool();
  });

  it(
    'reaches /health:ok in < 10 s with migration fast-path on an up-to-date database',
    async () => {
      let child: ChildProcess | null = null;
      const wallStart = Date.now();

      try {
        child = spawn(TSX_BIN, [CLI_ENTRY, 'start', '--log-level', 'error'], {
          env: childEnv,
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: false,
        });

        // Forward child stderr so diagnostics appear in the test output if the
        // test fails (e.g. missing env var, DB connection error).
        child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk));

        const pollElapsedMs = await pollUntilHealthy(TEST_PORT, STARTUP_BUDGET_MS);
        const wallMs = Date.now() - wallStart;

        console.info(
          `[startup-time] poll-elapsed=${pollElapsedMs} ms  ` +
            `wall-clock=${wallMs} ms  budget=${STARTUP_BUDGET_MS} ms`
        );

        expect(
          wallMs,
          `Expected startup < ${STARTUP_BUDGET_MS} ms, got ${wallMs} ms`
        ).toBeLessThan(STARTUP_BUDGET_MS);
      } finally {
        if (child) await killChild(child);
      }
    },
    // Vitest timeout: startup budget + 5 s breathing room for spawn/teardown overhead
    STARTUP_BUDGET_MS + 5_000
  );
});
