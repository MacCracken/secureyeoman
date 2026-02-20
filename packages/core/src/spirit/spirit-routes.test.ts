import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerSpiritRoutes } from './spirit-routes.js';
import type { SpiritManager } from './manager.js';
import type { Passion, Inspiration, Pain } from './types.js';

// ── Mock SpiritManager ────────────────────────────────────────────

const PASSION: Passion = {
  id: 'p1', name: 'Open Source', description: 'desc', intensity: 0.9, isActive: true,
  createdAt: 1000, updatedAt: 1000,
};
const INSPIRATION: Inspiration = {
  id: 'i1', source: 'Alan Turing', description: 'pioneer', impact: 0.95, isActive: true,
  createdAt: 1000, updatedAt: 1000,
};
const PAIN: Pain = {
  id: 'pa1', trigger: 'Data Loss', description: 'ouch', severity: 0.8, isActive: true,
  createdAt: 1000, updatedAt: 1000,
};

function makeMockManager(overrides?: Partial<SpiritManager>): SpiritManager {
  return {
    listPassions: vi.fn().mockResolvedValue({ passions: [PASSION], total: 1 }),
    createPassion: vi.fn().mockResolvedValue(PASSION),
    getPassion: vi.fn().mockResolvedValue(PASSION),
    updatePassion: vi.fn().mockResolvedValue(PASSION),
    deletePassion: vi.fn().mockResolvedValue(true),

    listInspirations: vi.fn().mockResolvedValue({ inspirations: [INSPIRATION], total: 1 }),
    createInspiration: vi.fn().mockResolvedValue(INSPIRATION),
    getInspiration: vi.fn().mockResolvedValue(INSPIRATION),
    updateInspiration: vi.fn().mockResolvedValue(INSPIRATION),
    deleteInspiration: vi.fn().mockResolvedValue(true),

    listPains: vi.fn().mockResolvedValue({ pains: [PAIN], total: 1 }),
    createPain: vi.fn().mockResolvedValue(PAIN),
    getPain: vi.fn().mockResolvedValue(PAIN),
    updatePain: vi.fn().mockResolvedValue(PAIN),
    deletePain: vi.fn().mockResolvedValue(true),

    getConfig: vi.fn().mockReturnValue({ enabled: true, maxPassions: 20, maxInspirations: 20, maxPains: 20 }),
    getStats: vi.fn().mockResolvedValue({ passions: { total: 1, active: 1 }, inspirations: { total: 1, active: 1 }, pains: { total: 1, active: 1 } }),
    composeSpiritPrompt: vi.fn().mockResolvedValue('## Spirit\nContent here'),
    ...overrides,
  } as unknown as SpiritManager;
}

function buildApp(manager?: SpiritManager) {
  const app = Fastify();
  registerSpiritRoutes(app, { spiritManager: manager ?? makeMockManager() });
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────

describe('Spirit Routes — passions', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(() => { app = buildApp(); });

  it('GET /api/v1/spirit/passions returns list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/spirit/passions' });
    expect(res.statusCode).toBe(200);
    expect(res.json().passions).toHaveLength(1);
  });

  it('POST /api/v1/spirit/passions creates passion', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/spirit/passions', payload: { name: 'Open Source', intensity: 0.9 } });
    expect(res.statusCode).toBe(201);
    expect(res.json().passion.id).toBe('p1');
  });

  it('POST /api/v1/spirit/passions returns 400 on manager error', async () => {
    const mgr = makeMockManager({ createPassion: vi.fn().mockRejectedValue(new Error('limit exceeded')) });
    const a = buildApp(mgr);
    const res = await a.inject({ method: 'POST', url: '/api/v1/spirit/passions', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/v1/spirit/passions/:id returns passion', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/spirit/passions/p1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().passion.id).toBe('p1');
  });

  it('GET /api/v1/spirit/passions/:id returns 404 when not found', async () => {
    const mgr = makeMockManager({ getPassion: vi.fn().mockResolvedValue(null) });
    const a = buildApp(mgr);
    const res = await a.inject({ method: 'GET', url: '/api/v1/spirit/passions/missing' });
    expect(res.statusCode).toBe(404);
  });

  it('PUT /api/v1/spirit/passions/:id updates passion', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/v1/spirit/passions/p1', payload: { name: 'Updated' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().passion.id).toBe('p1');
  });

  it('PUT /api/v1/spirit/passions/:id returns 404 on manager error', async () => {
    const mgr = makeMockManager({ updatePassion: vi.fn().mockRejectedValue(new Error('Passion not found')) });
    const a = buildApp(mgr);
    const res = await a.inject({ method: 'PUT', url: '/api/v1/spirit/passions/missing', payload: {} });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /api/v1/spirit/passions/:id returns 204', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/spirit/passions/p1' });
    expect(res.statusCode).toBe(204);
  });

  it('DELETE /api/v1/spirit/passions/:id returns 404 when not found', async () => {
    const mgr = makeMockManager({ deletePassion: vi.fn().mockResolvedValue(false) });
    const a = buildApp(mgr);
    const res = await a.inject({ method: 'DELETE', url: '/api/v1/spirit/passions/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('Spirit Routes — inspirations', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(() => { app = buildApp(); });

  it('GET /api/v1/spirit/inspirations returns list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/spirit/inspirations' });
    expect(res.statusCode).toBe(200);
    expect(res.json().inspirations).toHaveLength(1);
  });

  it('POST /api/v1/spirit/inspirations creates inspiration', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/spirit/inspirations', payload: { source: 'Turing', impact: 0.95 } });
    expect(res.statusCode).toBe(201);
    expect(res.json().inspiration.id).toBe('i1');
  });

  it('POST /api/v1/spirit/inspirations returns 400 on error', async () => {
    const mgr = makeMockManager({ createInspiration: vi.fn().mockRejectedValue(new Error('limit')) });
    const a = buildApp(mgr);
    const res = await a.inject({ method: 'POST', url: '/api/v1/spirit/inspirations', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/v1/spirit/inspirations/:id returns 404 when not found', async () => {
    const mgr = makeMockManager({ getInspiration: vi.fn().mockResolvedValue(null) });
    const a = buildApp(mgr);
    const res = await a.inject({ method: 'GET', url: '/api/v1/spirit/inspirations/missing' });
    expect(res.statusCode).toBe(404);
  });

  it('PUT /api/v1/spirit/inspirations/:id returns 404 on error', async () => {
    const mgr = makeMockManager({ updateInspiration: vi.fn().mockRejectedValue(new Error('Inspiration not found')) });
    const a = buildApp(mgr);
    const res = await a.inject({ method: 'PUT', url: '/api/v1/spirit/inspirations/missing', payload: {} });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /api/v1/spirit/inspirations/:id returns 204', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/spirit/inspirations/i1' });
    expect(res.statusCode).toBe(204);
  });

  it('DELETE /api/v1/spirit/inspirations/:id returns 404 when not found', async () => {
    const mgr = makeMockManager({ deleteInspiration: vi.fn().mockResolvedValue(false) });
    const a = buildApp(mgr);
    const res = await a.inject({ method: 'DELETE', url: '/api/v1/spirit/inspirations/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('Spirit Routes — pains', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(() => { app = buildApp(); });

  it('GET /api/v1/spirit/pains returns list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/spirit/pains' });
    expect(res.statusCode).toBe(200);
    expect(res.json().pains).toHaveLength(1);
  });

  it('POST /api/v1/spirit/pains creates pain', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/spirit/pains', payload: { trigger: 'Data Loss', severity: 0.8 } });
    expect(res.statusCode).toBe(201);
    expect(res.json().pain.id).toBe('pa1');
  });

  it('POST /api/v1/spirit/pains returns 400 on error', async () => {
    const mgr = makeMockManager({ createPain: vi.fn().mockRejectedValue(new Error('limit')) });
    const a = buildApp(mgr);
    const res = await a.inject({ method: 'POST', url: '/api/v1/spirit/pains', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/v1/spirit/pains/:id returns 404 when not found', async () => {
    const mgr = makeMockManager({ getPain: vi.fn().mockResolvedValue(null) });
    const a = buildApp(mgr);
    const res = await a.inject({ method: 'GET', url: '/api/v1/spirit/pains/missing' });
    expect(res.statusCode).toBe(404);
  });

  it('PUT /api/v1/spirit/pains/:id returns 404 on error', async () => {
    const mgr = makeMockManager({ updatePain: vi.fn().mockRejectedValue(new Error('Pain not found')) });
    const a = buildApp(mgr);
    const res = await a.inject({ method: 'PUT', url: '/api/v1/spirit/pains/missing', payload: {} });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /api/v1/spirit/pains/:id returns 204', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/spirit/pains/pa1' });
    expect(res.statusCode).toBe(204);
  });

  it('DELETE /api/v1/spirit/pains/:id returns 404 when not found', async () => {
    const mgr = makeMockManager({ deletePain: vi.fn().mockResolvedValue(false) });
    const a = buildApp(mgr);
    const res = await a.inject({ method: 'DELETE', url: '/api/v1/spirit/pains/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('Spirit Routes — config, stats, prompt', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(() => { app = buildApp(); });

  it('GET /api/v1/spirit/config returns config', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/spirit/config' });
    expect(res.statusCode).toBe(200);
    expect(res.json().config.enabled).toBe(true);
  });

  it('GET /api/v1/spirit/stats returns stats', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/spirit/stats' });
    expect(res.statusCode).toBe(200);
    expect(res.json().stats.passions.total).toBe(1);
  });

  it('GET /api/v1/spirit/prompt/preview returns prompt with metadata', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/spirit/prompt/preview' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.prompt).toContain('## Spirit');
    expect(typeof body.charCount).toBe('number');
    expect(typeof body.estimatedTokens).toBe('number');
  });
});
