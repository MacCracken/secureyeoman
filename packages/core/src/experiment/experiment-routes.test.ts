import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerExperimentRoutes } from './experiment-routes.js';
import type { ExperimentManager } from './manager.js';

const EXPERIMENT = {
  id: 'exp-1',
  name: 'Button Color Test',
  description: 'Test button color',
  status: 'pending',
  variants: [
    { id: 'v1', name: 'control' },
    { id: 'v2', name: 'variant' },
  ],
};

function makeMockManager(overrides?: Partial<ExperimentManager>): ExperimentManager {
  return {
    list: vi.fn().mockResolvedValue({ experiments: [EXPERIMENT], total: 1 }),
    create: vi.fn().mockResolvedValue(EXPERIMENT),
    get: vi.fn().mockResolvedValue(EXPERIMENT),
    start: vi.fn().mockResolvedValue({ ...EXPERIMENT, status: 'running' }),
    stop: vi.fn().mockResolvedValue({ ...EXPERIMENT, status: 'stopped' }),
    delete: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as ExperimentManager;
}

function buildApp(overrides?: Partial<ExperimentManager>) {
  const app = Fastify();
  registerExperimentRoutes(app, { experimentManager: makeMockManager(overrides) });
  return app;
}

describe('GET /api/v1/experiments', () => {
  it('returns experiments list', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/experiments' });
    expect(res.statusCode).toBe(200);
    expect(res.json().experiments).toHaveLength(1);
  });

  it('passes pagination params', async () => {
    const listMock = vi.fn().mockResolvedValue({ experiments: [], total: 0 });
    const app = buildApp({ list: listMock });
    await app.inject({ method: 'GET', url: '/api/v1/experiments?limit=10&offset=20' });
    expect(listMock).toHaveBeenCalledWith({ limit: 10, offset: 20 });
  });
});

describe('POST /api/v1/experiments', () => {
  it('creates experiment and returns 201', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/experiments',
      payload: { name: 'Test', variants: [{ name: 'A' }, { name: 'B' }] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().experiment.id).toBe('exp-1');
  });

  it('returns 400 on error', async () => {
    const app = buildApp({ create: vi.fn().mockRejectedValue(new Error('invalid')) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/experiments',
      payload: { name: 'Bad' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/v1/experiments/:id', () => {
  it('returns experiment', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/experiments/exp-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().experiment.id).toBe('exp-1');
  });

  it('returns 404 when not found', async () => {
    const app = buildApp({ get: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/experiments/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/v1/experiments/:id/start', () => {
  it('starts experiment', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/experiments/exp-1/start' });
    expect(res.statusCode).toBe(200);
    expect(res.json().experiment.status).toBe('running');
  });

  it('returns 404 when not found', async () => {
    const app = buildApp({ start: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({ method: 'POST', url: '/api/v1/experiments/missing/start' });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/v1/experiments/:id/stop', () => {
  it('stops experiment', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/experiments/exp-1/stop' });
    expect(res.statusCode).toBe(200);
    expect(res.json().experiment.status).toBe('stopped');
  });

  it('returns 404 when not found', async () => {
    const app = buildApp({ stop: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({ method: 'POST', url: '/api/v1/experiments/missing/stop' });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/v1/experiments/:id', () => {
  it('deletes experiment and returns 204', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/experiments/exp-1' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when not found', async () => {
    const app = buildApp({ delete: vi.fn().mockResolvedValue(false) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/experiments/missing' });
    expect(res.statusCode).toBe(404);
  });
});
