import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerArtifactoryRoutes } from './artifactory-routes.js';

// Mock the ArtifactoryClient
const mockClient = {
  baseUrl: 'https://mycompany.jfrog.io/artifactory',
  listRepos: vi
    .fn()
    .mockResolvedValue([{ key: 'npm-local', type: 'local', packageType: 'npm', url: '' }]),
  getRepo: vi
    .fn()
    .mockResolvedValue({ key: 'npm-local', type: 'local', packageType: 'npm', url: '' }),
  listFolder: vi
    .fn()
    .mockResolvedValue([{ path: '', name: 'lib-1.0.jar', size: 1024, created: '', modified: '' }]),
  getItemInfo: vi.fn().mockResolvedValue({
    path: 'org/lib-1.0.jar',
    name: 'lib-1.0.jar',
    size: 1024,
    created: '',
    modified: '',
  }),
  searchAql: vi
    .fn()
    .mockResolvedValue([{ path: '', name: 'result.jar', size: 512, created: '', modified: '' }]),
  searchByName: vi
    .fn()
    .mockResolvedValue([{ path: '', name: 'found.jar', size: 256, created: '', modified: '' }]),
  listDockerImages: vi.fn().mockResolvedValue([{ name: 'my-app', tags: ['latest', 'v1.0'] }]),
  getDockerTags: vi.fn().mockResolvedValue(['latest', 'v1.0', 'v2.0']),
  listBuilds: vi
    .fn()
    .mockResolvedValue([{ name: 'my-build', lastStarted: '2026-01-01T00:00:00Z' }]),
  getBuild: vi.fn().mockResolvedValue({
    name: 'my-build',
    number: '1',
    started: '2026-01-01T00:00:00Z',
    status: 'released',
  }),
  promoteBuild: vi.fn().mockResolvedValue(undefined),
  health: vi.fn().mockResolvedValue(true),
};

vi.mock('./artifactory-client.js', () => ({
  ArtifactoryClient: function (cfg: any) {
    mockClient.baseUrl = cfg.baseUrl.replace(/\/+$/, '');
    return mockClient;
  },
}));

const CONN_KEY = 'mycompany.jfrog.io/artifactory';

describe('Artifactory Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    registerArtifactoryRoutes(app, {
      initialConnections: [{ baseUrl: 'https://mycompany.jfrog.io/artifactory', token: 'tok' }],
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  // ── Connection CRUD ─────────────────────────────────────

  it('GET /connections lists configured connections', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/artifactory/connections' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.connections).toHaveLength(1);
    expect(body.connections[0].key).toBe(CONN_KEY);
  });

  it('POST /connections adds a new connection', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/artifactory/connections',
      payload: { baseUrl: 'https://other.jfrog.io/artifactory', token: 'tok2' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.key).toBe('other.jfrog.io/artifactory');
  });

  it('DELETE /connections removes a connection', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/artifactory/connections/${encodeURIComponent(CONN_KEY)}`,
    });
    expect(res.statusCode).toBe(204);

    const list = await app.inject({ method: 'GET', url: '/api/v1/artifactory/connections' });
    expect(JSON.parse(list.payload).connections).toHaveLength(0);
  });

  // ── Repos ─────────────────────────────────────────────────

  it('GET /:key/repos returns repos', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/artifactory/${encodeURIComponent(CONN_KEY)}/repos`,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).repos).toHaveLength(1);
  });

  // ── Browse ────────────────────────────────────────────────

  it('GET /:key/repos/:repoKey/browse returns folder items', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/artifactory/${encodeURIComponent(CONN_KEY)}/repos/npm-local/browse?path=org`,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).items).toHaveLength(1);
    expect(mockClient.listFolder).toHaveBeenCalledWith('npm-local', 'org');
  });

  // ── Search ────────────────────────────────────────────────

  it('GET /:key/search returns name search results', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/artifactory/${encodeURIComponent(CONN_KEY)}/search?name=found`,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).items).toHaveLength(1);
    expect(mockClient.searchByName).toHaveBeenCalledWith('found', undefined);
  });

  // ── Docker ────────────────────────────────────────────────

  it('GET /docker/:repoKey/images returns Docker images', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/artifactory/${encodeURIComponent(CONN_KEY)}/docker/docker-local/images`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.images).toHaveLength(1);
    expect(body.images[0].name).toBe('my-app');
  });

  it('GET /docker/:repoKey/images/:image/tags returns tags', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/artifactory/${encodeURIComponent(CONN_KEY)}/docker/docker-local/images/my-app/tags`,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).tags).toEqual(['latest', 'v1.0', 'v2.0']);
  });

  // ── Builds ────────────────────────────────────────────────

  it('GET /:key/builds returns builds', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/artifactory/${encodeURIComponent(CONN_KEY)}/builds`,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).builds).toHaveLength(1);
  });

  it('POST /:key/builds/:name/:number/promote promotes build', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/artifactory/${encodeURIComponent(CONN_KEY)}/builds/my-build/1/promote`,
      payload: { targetRepo: 'libs-release', status: 'released' },
    });
    expect(res.statusCode).toBe(204);
    expect(mockClient.promoteBuild).toHaveBeenCalledWith(
      'my-build',
      '1',
      'libs-release',
      'released'
    );
  });

  // ── Health ────────────────────────────────────────────────

  it('GET /:key/health returns health status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/artifactory/${encodeURIComponent(CONN_KEY)}/health`,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).healthy).toBe(true);
  });
});
