/**
 * Ifran Integration Tests — runs against a live Ifran container.
 *
 * Prerequisites:
 *   docker run -d --name ifran-test -p 8420:8420 -p 8421:8421 \
 *     ghcr.io/maccracken/ifran:latest
 *
 * Run with:
 *   IFRAN_API_URL=http://localhost:8420 npx vitest run --project core:unit -- ifran-integration
 *
 * These tests are skipped when IFRAN_API_URL is not set.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const IFRAN_URL = process.env.IFRAN_API_URL;
const skip = !IFRAN_URL;

const noopLogger = {
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {},
  child: () => noopLogger,
} as any;

// Helper to call Ifran REST API directly (bypasses IfranClient transforms for raw verification)
async function ifranGet(path: string): Promise<{ status: number; body: unknown }> {
  const resp = await fetch(`${IFRAN_URL}${path}`, {
    signal: AbortSignal.timeout(10_000),
  });
  const contentType = resp.headers.get('content-type') ?? '';
  let body: unknown;
  if (contentType.includes('json')) {
    body = await resp.json();
  } else {
    body = await resp.text();
  }
  return { status: resp.status, body };
}

async function _ifranPost(path: string, data: unknown): Promise<{ status: number; body: unknown }> {
  const resp = await fetch(`${IFRAN_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(10_000),
  });
  const contentType = resp.headers.get('content-type') ?? '';
  let body: unknown;
  if (contentType.includes('json')) {
    body = await resp.json();
  } else {
    body = await resp.text();
  }
  return { status: resp.status, body };
}

describe.skipIf(skip)('Ifran Integration', () => {
  // ── Health ────────────────────────────────────────────────────────────────

  describe('health', () => {
    it('returns ok', async () => {
      const { status, body } = await ifranGet('/health');
      expect(status).toBe(200);
      expect(body).toBe('ok');
    });
  });

  // ── Status (wire format verification) ─────────────────────────────────────

  describe('system/status', () => {
    it('returns snake_case hardware capabilities', async () => {
      const { status, body } = await ifranGet('/system/status');
      expect(status).toBe(200);

      const data = body as Record<string, unknown>;
      expect(data.version).toBeDefined();

      // Hardware block uses snake_case
      const hw = data.hardware as Record<string, unknown>;
      expect(hw).toBeDefined();
      expect(hw.cpu).toBeDefined();
      expect(hw.gpus).toBeDefined();

      const cpu = hw.cpu as Record<string, unknown>;
      expect(cpu.cores).toBeGreaterThan(0);
      expect(cpu.memory_total_mb).toBeGreaterThan(0);
      expect(cpu.memory_available_mb).toBeGreaterThan(0);

      // GPUs is an array
      const gpus = hw.gpus as Record<string, unknown>[];
      expect(Array.isArray(gpus)).toBe(true);
      if (gpus.length > 0) {
        expect(gpus[0].name).toBeDefined();
        expect(gpus[0].memory_total_mb).toBeGreaterThan(0);
        expect(gpus[0].memory_free_mb).toBeDefined();
      }
    });

    it('includes registered_backends array', async () => {
      const { body } = await ifranGet('/system/status');
      const data = body as Record<string, unknown>;
      expect(Array.isArray(data.registered_backends)).toBe(true);
    });

    it('reports loaded_models count', async () => {
      const { body } = await ifranGet('/system/status');
      const data = body as Record<string, unknown>;
      expect(typeof data.loaded_models).toBe('number');
    });
  });

  // ── IfranClient transform verification ──────────────────────────────────

  describe('IfranClient transform', () => {
    let IfranClient: typeof import('./ifran-client.js').IfranClient;

    beforeAll(async () => {
      const mod = await import('./ifran-client.js');
      IfranClient = mod.IfranClient;
    });

    it('getStatus transforms snake_case → camelCase', async () => {
      const client = new IfranClient(
        { apiUrl: IFRAN_URL!, enabled: true, connectionTimeoutMs: 10_000 },
        noopLogger
      );

      const instance = await client.getStatus();
      expect(instance.endpoint).toBe(IFRAN_URL);
      expect(instance.version).toBeDefined();
      expect(instance.capabilities.gpuCount).toBeGreaterThanOrEqual(0);
      expect(typeof instance.capabilities.totalGpuMemoryMb).toBe('number');
      expect(instance.status).toBe('connected');
    });

    it('listModels returns array', async () => {
      const client = new IfranClient(
        { apiUrl: IFRAN_URL!, enabled: true, connectionTimeoutMs: 10_000 },
        noopLogger
      );

      const models = await client.listModels();
      expect(Array.isArray(models)).toBe(true);
    });

    it('listJobs returns array', async () => {
      const client = new IfranClient(
        { apiUrl: IFRAN_URL!, enabled: true, connectionTimeoutMs: 10_000 },
        noopLogger
      );

      const jobs = await client.listJobs();
      expect(Array.isArray(jobs)).toBe(true);
    });
  });

  // ── Models ────────────────────────────────────────────────────────────────

  describe('models', () => {
    it('GET /models returns data array', async () => {
      const { status, body } = await ifranGet('/models');
      expect(status).toBe(200);
      const data = body as Record<string, unknown>;
      expect(Array.isArray(data.data)).toBe(true);
    });
  });

  // ── Training Jobs ─────────────────────────────────────────────────────────

  describe('training/jobs', () => {
    it('GET /training/jobs returns array', async () => {
      const { status, body } = await ifranGet('/training/jobs');
      expect(status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
    });
  });

  // ── SY Proxy Route Verification ───────────────────────────────────────────
  // These would need the full SY stack running. Documented as pending.

  // ── Heartbeat / Reconnection ──────────────────────────────────────────────

  describe('heartbeat', () => {
    it('repeated status calls succeed (simulates heartbeat polling)', async () => {
      for (let i = 0; i < 3; i++) {
        const { status } = await ifranGet('/health');
        expect(status).toBe(200);
      }
    });
  });
});
