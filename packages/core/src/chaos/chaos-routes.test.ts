/**
 * Chaos Routes Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerChaosRoutes } from './chaos-routes.js';

function makeMockManager() {
  return {
    listExperiments: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    getExperiment: vi.fn().mockResolvedValue(null),
    createExperiment: vi.fn().mockResolvedValue({ id: 'exp-1', name: 'Test', status: 'draft' }),
    runExperiment: vi.fn().mockResolvedValue({ experimentId: 'exp-1', status: 'passed' }),
    scheduleExperiment: vi.fn().mockResolvedValue({ id: 'exp-1', status: 'scheduled' }),
    abortExperiment: vi.fn().mockResolvedValue(false),
    deleteExperiment: vi.fn().mockResolvedValue(true),
    getResults: vi.fn().mockResolvedValue([]),
    runningCount: 0,
  };
}

describe('Chaos Routes', () => {
  let app: ReturnType<typeof Fastify>;
  let mockManager: ReturnType<typeof makeMockManager>;

  beforeEach(async () => {
    app = Fastify();
    mockManager = makeMockManager();
    registerChaosRoutes(app, { chaosManager: mockManager as any });
    await app.ready();
  });

  it('GET /api/v1/chaos/experiments returns list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/chaos/experiments' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ items: [], total: 0 });
  });

  it('GET /api/v1/chaos/experiments/:id returns 404 when not found', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/chaos/experiments/nope' });
    expect(res.statusCode).toBe(404);
  });

  it('GET /api/v1/chaos/experiments/:id returns experiment', async () => {
    mockManager.getExperiment.mockResolvedValue({ id: 'exp-1', name: 'Found' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/chaos/experiments/exp-1' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).name).toBe('Found');
  });

  it('POST /api/v1/chaos/experiments creates experiment', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chaos/experiments',
      payload: { name: 'New', rules: [{ id: 'r1' }], durationMs: 5000 },
    });
    expect(res.statusCode).toBe(201);
    expect(mockManager.createExperiment).toHaveBeenCalledOnce();
  });

  it('POST /api/v1/chaos/experiments returns 400 on validation error', async () => {
    mockManager.createExperiment.mockRejectedValue(new Error('bad input'));
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chaos/experiments',
      payload: { name: 'Bad' },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).message).toBe('bad input');
  });

  it('POST /api/v1/chaos/experiments/:id/run runs experiment', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/chaos/experiments/exp-1/run' });
    expect(res.statusCode).toBe(200);
    expect(mockManager.runExperiment).toHaveBeenCalledWith('exp-1');
  });

  it('POST /api/v1/chaos/experiments/:id/schedule schedules experiment', async () => {
    const future = Date.now() + 60000;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chaos/experiments/exp-1/schedule',
      payload: { scheduledAt: future },
    });
    expect(res.statusCode).toBe(200);
  });

  it('POST /api/v1/chaos/experiments/:id/schedule rejects past time', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chaos/experiments/exp-1/schedule',
      payload: { scheduledAt: 1000 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/v1/chaos/experiments/:id/abort returns 404 when not running', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/chaos/experiments/exp-1/abort' });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /api/v1/chaos/experiments/:id deletes experiment', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/chaos/experiments/exp-1' });
    expect(res.statusCode).toBe(200);
    expect(mockManager.deleteExperiment).toHaveBeenCalledWith('exp-1');
  });

  it('DELETE /api/v1/chaos/experiments/:id returns 404 when not found', async () => {
    mockManager.deleteExperiment.mockResolvedValue(false);
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/chaos/experiments/nope' });
    expect(res.statusCode).toBe(404);
  });

  it('GET /api/v1/chaos/experiments/:id/results returns results', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/chaos/experiments/exp-1/results' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ items: [], total: 0 });
  });

  it('GET /api/v1/chaos/status returns status', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/chaos/status' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.enabled).toBe(true);
    expect(body.runningExperiments).toBe(0);
  });
});
