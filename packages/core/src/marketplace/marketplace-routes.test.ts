import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerMarketplaceRoutes } from './marketplace-routes.js';
import type { MarketplaceManager } from './manager.js';
import type { Config } from '@secureyeoman/shared';

const SKILL = { id: 'skill-1', name: 'Test Skill', version: '1.0.0', category: 'utility' };

function makeMockManager(overrides?: Partial<MarketplaceManager>): MarketplaceManager {
  return {
    search: vi.fn().mockResolvedValue({ skills: [SKILL], total: 1 }),
    getSkill: vi.fn().mockResolvedValue(SKILL),
    install: vi.fn().mockResolvedValue(true),
    uninstall: vi.fn().mockResolvedValue(true),
    publish: vi.fn().mockResolvedValue(SKILL),
    delete: vi.fn().mockResolvedValue(true),
    syncFromCommunity: vi.fn().mockResolvedValue({ synced: 3, added: 2, updated: 1 }),
    getCommunityStatus: vi.fn().mockResolvedValue({ lastSync: null, available: 10 }),
    ...overrides,
  } as unknown as MarketplaceManager;
}

function buildApp(overrides?: Partial<MarketplaceManager>, getConfig?: () => Config) {
  const app = Fastify();
  registerMarketplaceRoutes(app, {
    marketplaceManager: makeMockManager(overrides),
    getConfig,
  });
  return app;
}

describe('GET /api/v1/marketplace', () => {
  it('returns skills list', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/marketplace' });
    expect(res.statusCode).toBe(200);
    expect(res.json().skills).toHaveLength(1);
  });

  it('passes search params to manager.search', async () => {
    const searchMock = vi.fn().mockResolvedValue({ skills: [], total: 0 });
    const app = buildApp({ search: searchMock });
    await app.inject({
      method: 'GET',
      url: '/api/v1/marketplace?query=hello&category=utility&limit=5&offset=10&source=community',
    });
    expect(searchMock).toHaveBeenCalledWith('hello', 'utility', 5, 10, 'community');
  });
});

describe('GET /api/v1/marketplace/:id', () => {
  it('returns a skill', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/marketplace/skill-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().skill.id).toBe('skill-1');
  });

  it('returns 404 when skill not found', async () => {
    const app = buildApp({ getSkill: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/marketplace/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/v1/marketplace/:id/install', () => {
  it('installs a skill and returns message', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/skill-1/install',
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe('Skill installed');
  });

  it('installs with personalityId', async () => {
    const installMock = vi.fn().mockResolvedValue(true);
    const app = buildApp({ install: installMock });
    await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/skill-1/install',
      payload: { personalityId: 'pers-1' },
    });
    expect(installMock).toHaveBeenCalledWith('skill-1', 'pers-1');
  });

  it('returns 404 when skill not found', async () => {
    const app = buildApp({ install: vi.fn().mockResolvedValue(false) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/missing/install',
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/v1/marketplace/:id/uninstall', () => {
  it('uninstalls a skill', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/skill-1/uninstall',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe('Skill uninstalled');
  });

  it('returns 404 when skill not found', async () => {
    const app = buildApp({ uninstall: vi.fn().mockResolvedValue(false) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/missing/uninstall',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/v1/marketplace/publish', () => {
  it('publishes a skill and returns 201', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/publish',
      payload: { name: 'My Skill', version: '1.0.0' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().skill.id).toBe('skill-1');
  });

  it('returns 400 on publish error', async () => {
    const app = buildApp({ publish: vi.fn().mockRejectedValue(new Error('conflict')) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/publish',
      payload: { name: 'Dup' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /api/v1/marketplace/:id', () => {
  it('deletes a skill and returns 204', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/marketplace/skill-1' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when skill not found', async () => {
    const app = buildApp({ delete: vi.fn().mockResolvedValue(false) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/marketplace/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/v1/marketplace/community/sync', () => {
  it('syncs from community', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/community/sync',
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().synced).toBe(3);
  });

  it('returns 403 when repoUrl provided but community fetch disabled', async () => {
    const getConfig = vi.fn().mockReturnValue({
      security: { allowCommunityGitFetch: false },
    }) as unknown as () => Config;
    const app = buildApp(undefined, getConfig);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/community/sync',
      payload: { repoUrl: 'https://github.com/example/skills' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('allows repoUrl when community fetch enabled', async () => {
    const getConfig = vi.fn().mockReturnValue({
      security: { allowCommunityGitFetch: true },
    }) as unknown as () => Config;
    const app = buildApp(undefined, getConfig);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/community/sync',
      payload: { repoUrl: 'https://github.com/example/skills' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 500 on sync error', async () => {
    const app = buildApp({ syncFromCommunity: vi.fn().mockRejectedValue(new Error('network')) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/community/sync',
      payload: {},
    });
    expect(res.statusCode).toBe(500);
  });
});

describe('GET /api/v1/marketplace/community/status', () => {
  it('returns community sync status', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/marketplace/community/status',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().available).toBe(10);
  });

  it('returns 500 on error', async () => {
    const app = buildApp({ getCommunityStatus: vi.fn().mockRejectedValue(new Error('fail')) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/marketplace/community/status',
    });
    expect(res.statusCode).toBe(500);
  });
});
