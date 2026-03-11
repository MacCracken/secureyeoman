import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerArtifactRoutes } from './artifact-routes.js';

const mockRegistryAdapter = {
  provider: 'github',
  listImages: vi.fn().mockResolvedValue([
    {
      name: 'my-app',
      fullName: 'ghcr.io/user/my-app',
      tags: [],
      registry: 'ghcr',
      visibility: 'public',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ]),
  getImageTags: vi.fn().mockResolvedValue([
    {
      name: 'v1.0.0',
      digest: 'sha256:abc',
      size: 5000,
      pushedAt: '2026-01-01T00:00:00Z',
    },
  ]),
  listBuildArtifacts: vi.fn().mockResolvedValue([
    {
      id: 'a1',
      name: 'build.zip',
      size: 1024,
      downloadUrl: 'https://example.com/download',
      pipelineId: 'pl1',
      createdAt: '2026-01-01T00:00:00Z',
    },
  ]),
};

vi.mock('./registries/registry-factory.js', () => ({
  createRegistryAdapter: vi.fn(() => mockRegistryAdapter),
}));

describe('Artifact Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    registerArtifactRoutes(app, {
      initialForges: [{ provider: 'github', baseUrl: 'https://github.com', token: 'tok' }],
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it('GET /artifacts/images returns container images', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/forge/github:github.com/artifacts/images?owner=user',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.images).toHaveLength(1);
    expect(body.images[0].name).toBe('my-app');
    expect(mockRegistryAdapter.listImages).toHaveBeenCalledWith('user');
  });

  it('GET /artifacts/images requires owner query param', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/forge/github:github.com/artifacts/images',
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.message).toContain('owner');
  });

  it('GET /artifacts/images/:owner/:name/tags returns tags', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/forge/github:github.com/artifacts/images/user/my-app/tags',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.tags).toHaveLength(1);
    expect(body.tags[0].name).toBe('v1.0.0');
    expect(mockRegistryAdapter.getImageTags).toHaveBeenCalledWith('user', 'my-app');
  });

  it('GET /pipelines/:pipelineId/artifacts returns build artifacts', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/forge/github:github.com/repos/user/repo/pipelines/pl1/artifacts',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.artifacts).toHaveLength(1);
    expect(body.artifacts[0].name).toBe('build.zip');
    expect(mockRegistryAdapter.listBuildArtifacts).toHaveBeenCalledWith('user', 'repo', 'pl1');
  });

  it('returns 404 for unknown forge key on images', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/forge/unknown:host/artifacts/images?owner=user',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for unknown forge key on tags', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/forge/unknown:host/artifacts/images/user/app/tags',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for unknown forge key on build artifacts', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/forge/unknown:host/repos/user/repo/pipelines/pl1/artifacts',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 502 when adapter throws', async () => {
    mockRegistryAdapter.listImages.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/forge/github:github.com/artifacts/images?owner=user',
    });
    expect(res.statusCode).toBe(502);
    const body = JSON.parse(res.payload);
    expect(body.message).toContain('ECONNREFUSED');
  });
});
