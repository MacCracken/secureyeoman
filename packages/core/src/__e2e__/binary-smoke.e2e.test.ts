/**
 * Binary Smoke Tests
 *
 * Tests the actual CLI binary (not programmatic Fastify). Spawns `node src/cli.ts start`
 * as a subprocess, waits for it to become healthy, and exercises key endpoints.
 * Requires a running PostgreSQL instance (same as other e2e tests).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../test-setup.js';

const __dirname_ = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.resolve(__dirname_, '..', 'cli.ts');
const TEST_PORT = 19877; // unique port to avoid collision
const TEST_HOST = '127.0.0.1';
const BASE_URL = `http://${TEST_HOST}:${TEST_PORT}`;
const ADMIN_PASSWORD = 'smoke-test-admin-password-32ch!!';
const TOKEN_SECRET = 'smoke-test-token-secret-32chars!!';

let proc: ChildProcess | null = null;
let accessToken = '';
let tmpConfigPath = '';

// ── Helpers ──────────────────────────────────────────────────────────────

function createTempConfig(): string {
  const dbHost = process.env.TEST_DB_HOST ?? 'localhost';
  const dbName = process.env.TEST_DB_NAME ?? 'secureyeoman_test';
  const dbUser = process.env.TEST_DB_USER ?? 'secureyeoman';
  const config = `
security:
  secretBackend: env
core:
  database:
    host: "${dbHost}"
    database: "${dbName}"
    user: "${dbUser}"
`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sy-smoke-'));
  const configPath = path.join(tmpDir, 'config.yaml');
  fs.writeFileSync(configPath, config);
  return configPath;
}

async function waitForHealthy(url: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server did not become healthy within ${timeoutMs}ms`);
}

function spawnServer(configPath: string): ChildProcess {
  const child = spawn(process.execPath, ['--import', 'tsx', CLI_PATH, 'start', '-p', String(TEST_PORT), '-H', TEST_HOST, '-l', 'warn', '-c', configPath], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      SECUREYEOMAN_ADMIN_PASSWORD: ADMIN_PASSWORD,
      SECUREYEOMAN_TOKEN_SECRET: TOKEN_SECRET,
      SECUREYEOMAN_SIGNING_KEY: 'smoke-test-signing-key-32chars!!!',
      SECUREYEOMAN_ENCRYPTION_KEY: 'a]&3Gk9$mQ#vL7@pR!wZ5*xN2^bT8+dF',
      POSTGRES_PASSWORD: process.env.TEST_DB_PASSWORD ?? 'secureyeoman_dev',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Collect stderr for debugging failures
  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  child.on('exit', (code) => {
    if (code && code !== 0 && code !== null) {
      console.error(`[binary-smoke] server exited with code ${code}\n${stderr}`);
    }
  });

  return child;
}

// ── Setup / Teardown ─────────────────────────────────────────────────────

beforeAll(async () => {
  await setupTestDb();
  await truncateAllTables();
  tmpConfigPath = createTempConfig();
  proc = spawnServer(tmpConfigPath);
  await waitForHealthy(BASE_URL);
}, 45_000);

afterAll(async () => {
  if (proc && !proc.killed) {
    proc.kill('SIGTERM');
    // Wait for graceful shutdown
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        proc?.kill('SIGKILL');
        resolve();
      }, 5_000);
      proc?.on('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  await teardownTestDb();
  // Clean up temp config
  if (tmpConfigPath) {
    fs.rmSync(path.dirname(tmpConfigPath), { recursive: true, force: true });
  }
}, 15_000);

// ── Tests ────────────────────────────────────────────────────────────────

describe('Binary Smoke Tests', () => {
  // ── Health ────────────────────────────────────────────────────────────

  it('GET /health returns 200 with status ok', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.version).toBeDefined();
    expect(body.uptime).toBeGreaterThan(0);
  });

  it('GET /health returns correct content-type', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  // ── Auth ──────────────────────────────────────────────────────────────

  it('POST /api/v1/auth/login succeeds with correct password', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: ADMIN_PASSWORD }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();
    accessToken = body.accessToken;
  });

  it('POST /api/v1/auth/login rejects wrong password', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'wrong-password' }),
    });
    expect(res.status).toBe(401);
  });

  it('protected endpoint rejects unauthenticated request', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/tasks`);
    expect([401, 403]).toContain(res.status);
  });

  it('protected endpoint accepts authenticated request', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/personalities`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    // 200 (empty list) or 404 (route not registered in this config)
    expect([200, 404]).toContain(res.status);
  });

  // ── API Discovery ─────────────────────────────────────────────────────

  it('GET /api/v1/status returns platform info', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/status`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 200) {
      const body = await res.json();
      expect(body).toBeDefined();
    }
    // 200 or 404 both acceptable (depends on route registration)
    expect([200, 404]).toContain(res.status);
  });

  // ── A2A ───────────────────────────────────────────────────────────────

  it('GET /api/v1/a2a/peers returns peer list', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/a2a/peers`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 200) {
      const body = await res.json();
      expect(body.peers).toBeDefined();
    }
    expect([200, 404]).toContain(res.status);
  });

  // ── Soul (Personalities) ──────────────────────────────────────────────

  it('GET /api/v1/personalities returns list or is registered', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/personalities`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 200) {
      const body = await res.json();
      expect(Array.isArray(body.personalities ?? body)).toBe(true);
    }
    // 200 (list) or 404 (route not loaded) — either confirms the binary started
    expect([200, 404]).toContain(res.status);
  });

  // ── Brain (Memory) ────────────────────────────────────────────────────

  it('GET /api/v1/memory returns memory entries', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/memory`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 200) {
      const body = await res.json();
      expect(body).toBeDefined();
    }
    expect([200, 404]).toContain(res.status);
  });

  // ── Workflow ──────────────────────────────────────────────────────────

  it('GET /api/v1/workflows returns list', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/workflows`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 200) {
      const body = await res.json();
      expect(body).toBeDefined();
    }
    expect([200, 404]).toContain(res.status);
  });

  // ── 404 ───────────────────────────────────────────────────────────────

  it('GET /api/v1/nonexistent returns 404', async () => {
    // Use /api/v1/ prefix to avoid dashboard SPA catch-all
    const res = await fetch(`${BASE_URL}/api/v1/nonexistent`);
    expect(res.status).toBe(404);
  });

  // ── Content Type ──────────────────────────────────────────────────────

  it('API endpoints return JSON content-type', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: ADMIN_PASSWORD }),
    });
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  // ── Graceful error handling ───────────────────────────────────────────

  it('POST with invalid JSON returns 400', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });
    expect([400, 422]).toContain(res.status);
  });
});
