/**
 * Key Rotation Routes Tests
 *
 * Route tests for the key rotation admin REST API.
 * No DB required — SecretRotationManager is fully mocked.
 */

import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerRotationRoutes } from './rotation-routes.js';
import type { RotationStatus } from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SAMPLE_STATUS: RotationStatus = {
  name: 'JWT_SECRET',
  category: 'jwt',
  source: 'internal',
  status: 'ok',
  daysUntilExpiry: 25,
  lastRotatedAt: Date.now() - 86_400_000,
  autoRotate: true,
  rotationIntervalDays: 30,
  expiresAt: Date.now() + 25 * 86_400_000,
  createdAt: Date.now() - 5 * 86_400_000,
};

function makeManager(overrides: Record<string, unknown> = {}) {
  return {
    getStatus: vi.fn().mockResolvedValue([SAMPLE_STATUS]),
    rotateSecret: vi.fn().mockResolvedValue('new-secret-value'),
    ...overrides,
  };
}

function buildApp(manager: ReturnType<typeof makeManager> | null = makeManager()) {
  const app = Fastify({ logger: false });
  const secureYeoman = manager ? ({ getRotationManager: () => manager } as any) : null;
  registerRotationRoutes(app, secureYeoman);
  return { app, manager };
}

// ─── GET /api/v1/admin/key-rotation ──────────────────────────────────────────

describe('GET /api/v1/admin/key-rotation', () => {
  it('returns statuses on success', async () => {
    const { app } = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/key-rotation' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.statuses).toHaveLength(1);
    expect(body.statuses[0].name).toBe('JWT_SECRET');
  });

  it('returns 503 when rotation manager is not available', async () => {
    const { app } = buildApp(null);
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/key-rotation' });
    expect(res.statusCode).toBe(503);
    expect(res.json().message).toMatch(/not available/i);
  });

  it('returns 500 on manager error', async () => {
    const mgr = makeManager({ getStatus: vi.fn().mockRejectedValue(new Error('DB down')) });
    const { app } = buildApp(mgr);
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/key-rotation' });
    expect(res.statusCode).toBe(500);
  });
});

// ─── POST /api/v1/admin/key-rotation/:name/rotate ───────────────────────────

describe('POST /api/v1/admin/key-rotation/:name/rotate', () => {
  it('rotates and returns updated status', async () => {
    const mgr = makeManager();
    const { app } = buildApp(mgr);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/key-rotation/JWT_SECRET/rotate',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rotated).toBe(true);
    expect(body.status.name).toBe('JWT_SECRET');
    expect(mgr!.rotateSecret).toHaveBeenCalledWith('JWT_SECRET');
  });

  it('returns 503 when rotation manager is not available', async () => {
    const { app } = buildApp(null);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/key-rotation/JWT_SECRET/rotate',
    });
    expect(res.statusCode).toBe(503);
  });

  it('returns 400 when secret is not tracked', async () => {
    const mgr = makeManager({
      rotateSecret: vi.fn().mockRejectedValue(new Error('Secret not tracked: UNKNOWN')),
    });
    const { app } = buildApp(mgr);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/key-rotation/UNKNOWN/rotate',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/not tracked/i);
  });

  it('returns null status when rotated secret not found in status list', async () => {
    const mgr = makeManager({
      getStatus: vi.fn().mockResolvedValue([]),
    });
    const { app } = buildApp(mgr);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/key-rotation/JWT_SECRET/rotate',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBeNull();
  });
});
