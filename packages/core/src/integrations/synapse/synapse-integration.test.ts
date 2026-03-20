/**
 * Synapse Integration Tests — runs against a live Synapse container.
 *
 * Prerequisites:
 *   docker run -d --name synapse-test -p 8420:8420 -p 8421:8421 \
 *     ghcr.io/maccracken/synapse:latest
 *
 * Run with:
 *   SYNAPSE_API_URL=http://localhost:8420 npx vitest run --project core:unit -- synapse-integration
 *
 * These tests are skipped when SYNAPSE_API_URL is not set.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const SYNAPSE_URL = process.env.SYNAPSE_API_URL;
const skip = !SYNAPSE_URL;

const noopLogger = {
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {},
  child: () => noopLogger,
} as any;

// Helper to call Synapse REST API directly (bypasses SynapseClient transforms for raw verification)
async function synapseGet(path: string): Promise<{ status: number; body: unknown }> {
  const resp = await fetch(`${SYNAPSE_URL}${path}`, {
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

async function _synapsePost(
  path: string,
  data: unknown
): Promise<{ status: number; body: unknown }> {
  const resp = await fetch(`${SYNAPSE_URL}${path}`, {
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

describe.skipIf(skip)('Synapse Integration', () => {
  // ── Health ────────────────────────────────────────────────────────────────

  describe('health', () => {
    it('returns ok', async () => {
      const { status, body } = await synapseGet('/health');
      expect(status).toBe(200);
      expect(body).toBe('ok');
    });
  });

  // ── Status (wire format verification) ─────────────────────────────────────

  describe('system/status', () => {
    it('returns snake_case hardware capabilities', async () => {
      const { status, body } = await synapseGet('/system/status');
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
      const { body } = await synapseGet('/system/status');
      const data = body as Record<string, unknown>;
      expect(Array.isArray(data.registered_backends)).toBe(true);
    });

    it('reports loaded_models count', async () => {
      const { body } = await synapseGet('/system/status');
      const data = body as Record<string, unknown>;
      expect(typeof data.loaded_models).toBe('number');
    });
  });

  // ── SynapseClient transform verification ──────────────────────────────────

  describe('SynapseClient transform', () => {
    let SynapseClient: typeof import('./synapse-client.js').SynapseClient;

    beforeAll(async () => {
      const mod = await import('./synapse-client.js');
      SynapseClient = mod.SynapseClient;
    });

    it('getStatus transforms snake_case → camelCase', async () => {
      const client = new SynapseClient(
        { apiUrl: SYNAPSE_URL!, enabled: true, connectionTimeoutMs: 10_000 },
        noopLogger
      );

      const instance = await client.getStatus();
      expect(instance.endpoint).toBe(SYNAPSE_URL);
      expect(instance.version).toBeDefined();
      expect(instance.capabilities.gpuCount).toBeGreaterThanOrEqual(0);
      expect(typeof instance.capabilities.totalGpuMemoryMb).toBe('number');
      expect(instance.status).toBe('connected');
    });

    it('listModels returns array', async () => {
      const client = new SynapseClient(
        { apiUrl: SYNAPSE_URL!, enabled: true, connectionTimeoutMs: 10_000 },
        noopLogger
      );

      const models = await client.listModels();
      expect(Array.isArray(models)).toBe(true);
    });

    it('listJobs returns array', async () => {
      const client = new SynapseClient(
        { apiUrl: SYNAPSE_URL!, enabled: true, connectionTimeoutMs: 10_000 },
        noopLogger
      );

      const jobs = await client.listJobs();
      expect(Array.isArray(jobs)).toBe(true);
    });
  });

  // ── Models ────────────────────────────────────────────────────────────────

  describe('models', () => {
    it('GET /models returns data array', async () => {
      const { status, body } = await synapseGet('/models');
      expect(status).toBe(200);
      const data = body as Record<string, unknown>;
      expect(Array.isArray(data.data)).toBe(true);
    });
  });

  // ── Training Jobs ─────────────────────────────────────────────────────────

  describe('training/jobs', () => {
    it('GET /training/jobs returns array', async () => {
      const { status, body } = await synapseGet('/training/jobs');
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
        const { status } = await synapseGet('/health');
        expect(status).toBe(200);
      }
    });
  });
});
