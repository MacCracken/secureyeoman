import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerForgeRoutes } from './forge-routes.js';

const mockAdapter = {
  provider: 'delta' as const,
  baseUrl: 'http://localhost:8070',
  listRepos: vi.fn().mockResolvedValue([{ id: 'r1', fullName: 'user/repo' }]),
  getRepo: vi.fn().mockResolvedValue({ id: 'r1', fullName: 'user/repo' }),
  listPulls: vi.fn().mockResolvedValue([{ id: 'p1', number: 1, title: 'Fix' }]),
  getPull: vi.fn().mockResolvedValue({ id: 'p1', number: 1, title: 'Fix' }),
  listPipelines: vi.fn().mockResolvedValue([{ id: 'pl1', status: 'running' }]),
  triggerPipeline: vi.fn().mockResolvedValue({ id: 'pl2', status: 'queued' }),
  cancelPipeline: vi.fn().mockResolvedValue(undefined),
  listBranches: vi.fn().mockResolvedValue([{ name: 'main', sha: 'abc', protected: true }]),
  listReleases: vi.fn().mockResolvedValue([]),
  health: vi.fn().mockResolvedValue(true),
};

vi.mock('./forge-factory.js', () => ({
  createForgeAdapter: vi.fn(() => mockAdapter),
}));

describe('Forge Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    registerForgeRoutes(app, {
      initialForges: [{ provider: 'delta', baseUrl: 'http://localhost:8070', token: 'tok' }],
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe('Connection management', () => {
    it('GET /connections lists configured forges', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/forge/connections' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.connections).toHaveLength(1);
      expect(body.connections[0].provider).toBe('delta');
    });

    it('POST /connections adds a new forge', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/forge/connections',
        payload: { provider: 'github', baseUrl: 'https://github.com', token: 'ghp_test' },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.provider).toBe('github');
    });

    it('POST /connections rejects duplicate', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/forge/connections',
        payload: { provider: 'delta', baseUrl: 'http://localhost:8070' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('POST /connections rejects invalid provider', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/forge/connections',
        payload: { provider: 'svn', baseUrl: 'http://localhost' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('DELETE /connections removes a forge', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/forge/connections/delta:localhost:8070',
      });
      expect(res.statusCode).toBe(204);

      // Verify it's gone
      const list = await app.inject({ method: 'GET', url: '/api/v1/forge/connections' });
      expect(JSON.parse(list.payload).connections).toHaveLength(0);
    });

    it('DELETE /connections returns 404 for unknown', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/forge/connections/unknown:host',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Repo endpoints', () => {
    it('GET /forge/:key/repos returns repos', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/forge/delta:localhost:8070/repos',
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).repos).toHaveLength(1);
    });

    it('GET /forge/:key/repos/:owner/:name returns single repo', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/forge/delta:localhost:8070/repos/user/repo',
      });
      expect(res.statusCode).toBe(200);
      expect(mockAdapter.getRepo).toHaveBeenCalledWith('user', 'repo');
    });

    it('returns 404 for unknown forge key', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/forge/unknown:host/repos' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PR endpoints', () => {
    it('GET /pulls returns pull requests', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/forge/delta:localhost:8070/repos/user/repo/pulls',
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).pulls).toHaveLength(1);
    });

    it('GET /pulls/:number returns single PR', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/forge/delta:localhost:8070/repos/user/repo/pulls/1',
      });
      expect(res.statusCode).toBe(200);
      expect(mockAdapter.getPull).toHaveBeenCalledWith('user', 'repo', 1);
    });
  });

  describe('Pipeline endpoints', () => {
    it('GET /pipelines returns pipelines', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/forge/delta:localhost:8070/repos/user/repo/pipelines',
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).pipelines).toHaveLength(1);
    });

    it('POST /pipelines/trigger triggers a pipeline', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/forge/delta:localhost:8070/repos/user/repo/pipelines/trigger',
        payload: { ref: 'main' },
      });
      expect(res.statusCode).toBe(200);
      expect(mockAdapter.triggerPipeline).toHaveBeenCalledWith('user', 'repo', 'main');
    });

    it('POST /pipelines/trigger requires ref', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/forge/delta:localhost:8070/repos/user/repo/pipelines/trigger',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('POST /pipelines/:id/cancel cancels a pipeline', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/forge/delta:localhost:8070/repos/user/repo/pipelines/pl1/cancel',
      });
      expect(res.statusCode).toBe(204);
      expect(mockAdapter.cancelPipeline).toHaveBeenCalledWith('user', 'repo', 'pl1');
    });
  });

  describe('Branch & Release endpoints', () => {
    it('GET /branches returns branches', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/forge/delta:localhost:8070/repos/user/repo/branches',
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).branches).toHaveLength(1);
    });

    it('GET /releases returns releases', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/forge/delta:localhost:8070/repos/user/repo/releases',
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).releases).toEqual([]);
    });
  });

  describe('Health endpoint', () => {
    it('GET /health returns forge health', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/forge/delta:localhost:8070/health',
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).healthy).toBe(true);
    });
  });
});
