import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerSoaRoutes } from './soa-routes.js';

vi.mock('../licensing/license-guard.js', () => ({
  licenseGuard: () => ({}), // No-op guard for tests
}));

describe('soa-routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    const mockSY = {
      getLicenseTier: () => 'enterprise',
      isFeatureEnabled: () => true,
    } as any;
    registerSoaRoutes(app, { secureYeoman: mockSY });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── GET /api/v1/compliance/soa ──────────────────────────────────────────

  it('GET /api/v1/compliance/soa returns 200 with SoADocument shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/compliance/soa' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('generatedAt');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('controls');
    expect(body).toHaveProperty('summary');
    expect(Array.isArray(body.controls)).toBe(true);
    expect(body.controls.length).toBeGreaterThan(0);
  });

  // ── GET /api/v1/compliance/soa/markdown ─────────────────────────────────

  it('GET /api/v1/compliance/soa/markdown returns 200 with text/markdown content-type', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/compliance/soa/markdown' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');
    expect(res.payload).toContain('# Statement of Applicability');
  });

  // ── GET /api/v1/compliance/soa/summary ──────────────────────────────────

  it('GET /api/v1/compliance/soa/summary returns 200 with summaries array', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/compliance/soa/summary' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('summaries');
    expect(Array.isArray(body.summaries)).toBe(true);
    expect(body.summaries.length).toBeGreaterThan(0);

    for (const s of body.summaries) {
      expect(s).toHaveProperty('framework');
      expect(s).toHaveProperty('total');
      expect(s).toHaveProperty('implemented');
      expect(s).toHaveProperty('coveragePercent');
    }
  });

  // ── GET /api/v1/compliance/soa/:framework (NIST) ───────────────────────

  it('GET /api/v1/compliance/soa/nist-800-53 returns 200 with NIST-scoped document', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/compliance/soa/nist-800-53',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.framework).toBe('nist-800-53');
    expect(body.controls.length).toBeGreaterThan(0);
    for (const c of body.controls) {
      expect(c.framework).toBe('nist-800-53');
    }
  });

  // ── GET /api/v1/compliance/soa/:framework/markdown ──────────────────────

  it('GET /api/v1/compliance/soa/nist-800-53/markdown returns 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/compliance/soa/nist-800-53/markdown',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');
    expect(res.payload).toContain('NIST SP 800-53');
  });

  // ── GET /api/v1/compliance/soa/:framework/summary ───────────────────────

  it('GET /api/v1/compliance/soa/nist-800-53/summary returns 200 with single summary', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/compliance/soa/nist-800-53/summary',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('summary');
    expect(body.summary.framework).toBe('nist-800-53');
    expect(body.summary.total).toBeGreaterThan(0);
  });

  // ── GET /api/v1/compliance/soa/invalid-framework ────────────────────────

  it('GET /api/v1/compliance/soa/invalid-framework returns 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/compliance/soa/invalid-framework',
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.message).toContain('Unknown framework');
  });
});
