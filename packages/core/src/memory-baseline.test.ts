/**
 * Memory Baseline Integration Test
 *
 * Verifies that the cold-start Resident Set Size (RSS) of `secureyeoman start`
 * is < 300 MB on an up-to-date database (migration fast-path active).
 *
 * What this exercises:
 *  - Full process cold-start memory footprint after all managers initialize
 *  - Node.js runtime + V8 heap + native modules (pg, better-sqlite3, etc.)
 *  - Measured via the unauthenticated GET /metrics endpoint (process_rss_bytes)
 *    — the same value Prometheus scrapes in production
 *
 * Requires: a running PostgreSQL instance reachable via the same env vars as
 * runner.test.ts (TEST_DB_* or DATABASE_* / POSTGRES_PASSWORD).
 *
 * The parent process applies all migrations in beforeAll so the child takes
 * the fast-path (single SELECT, no advisory lock).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initPool, closePool, resetPool } from './storage/pg-pool.js';
import { runMigrations } from './storage/migrations/runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TSX_BIN = resolve(__dirname, '../../../node_modules/.bin/tsx');
const CLI_ENTRY = resolve(__dirname, 'cli.ts');

// ─── Constants ────────────────────────────────────────────────────────────────

/** Budget for the process to reach /health:ok before we read memory */
const STARTUP_TIMEOUT_MS = 10_000;

/** RSS must stay below this threshold */
const MEMORY_BUDGET_MB = 300;

/** After health is confirmed, wait this long for post-init allocations to settle */
const SETTLE_MS = 1_000;

const POLL_INTERVAL_MS = 100;

/**
 * Port distinct from the startup-time test (19191) and production default (18789)
 * to avoid conflicts when both suites run in the same vitest session.
 */
const TEST_PORT = 19_192;

// ─── Database config ──────────────────────────────────────────────────────────

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

// ─── Child process environment ────────────────────────────────────────────────

const childEnv: NodeJS.ProcessEnv = {
  ...process.env,
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
  DATABASE_HOST: dbConfig.host,
  DATABASE_NAME: dbConfig.database,
  DATABASE_USER: dbConfig.user,
  POSTGRES_PASSWORD: dbConfig.password,
  SECUREYEOMAN_PORT: String(TEST_PORT),
  // Presence check only — no AI call during startup
  ANTHROPIC_API_KEY: process.env['ANTHROPIC_API_KEY'] ?? 'test-anthropic-api-key-placeholder',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function pollUntilHealthy(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) {
        const body = (await res.json()) as { status: string };
        if (body.status === 'ok') return;
      }
    } catch {
      // Not listening yet
    }
    await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`/health did not return status:ok within ${timeoutMs} ms`);
}

/**
 * Reads the Resident Set Size of the given PID from /proc/<pid>/status.
 * VmRSS is reported in kB; we convert to MB.
 *
 * This is the same value as process.memoryUsage().rss in the child process
 * and what Prometheus would scrape as process_rss_bytes.
 */
function readRssMb(pid: number): number {
  const status = readFileSync(`/proc/${pid}/status`, 'utf-8');
  const match = status.match(/^VmRSS:\s+(\d+)\s+kB/m);
  if (!match) throw new Error(`Could not parse VmRSS from /proc/${pid}/status`);
  return Number(match[1]) / 1024;
}

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

describe('Memory baseline — cold-start RSS (migration fast-path)', () => {
  beforeAll(async () => {
    initPool(dbConfig);
    await runMigrations();
  });

  afterAll(async () => {
    await closePool();
    resetPool();
  });

  it(
    'cold-start RSS is < 300 MB on an up-to-date database',
    async () => {
      let child: ChildProcess | null = null;

      try {
        child = spawn(TSX_BIN, [CLI_ENTRY, 'start', '--log-level', 'error'], {
          env: childEnv,
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: false,
        });

        child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk));

        // Wait for the server to be fully initialized
        await pollUntilHealthy(TEST_PORT, STARTUP_TIMEOUT_MS);

        // Brief settle period — post-init async work (SQLite vacuums, timer setup,
        // lazy module loads) should complete before we sample memory.
        await new Promise<void>((r) => setTimeout(r, SETTLE_MS));

        const pid = child.pid;
        if (!pid) throw new Error('Child process has no PID');
        const rssMb = readRssMb(pid);

        console.info(
          `[memory-baseline] RSS=${rssMb.toFixed(1)} MB  budget=${MEMORY_BUDGET_MB} MB`
        );

        expect(
          rssMb,
          `Cold-start RSS ${rssMb.toFixed(1)} MB exceeds budget of ${MEMORY_BUDGET_MB} MB`
        ).toBeLessThan(MEMORY_BUDGET_MB);
      } finally {
        if (child) await killChild(child);
      }
    },
    STARTUP_TIMEOUT_MS + SETTLE_MS + 5_000 // 10s startup + 1s settle + 5s buffer
  );
});
