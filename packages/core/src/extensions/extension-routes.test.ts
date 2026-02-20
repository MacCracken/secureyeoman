import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerExtensionRoutes } from './extension-routes.js';
import type { ExtensionManager } from './manager.js';

const EXTENSION = { id: 'ext-1', name: 'Test Extension', version: '1.0.0', hooks: [] };
const HOOK = { id: 'hook-1', hookPoint: 'pre-chat', extensionId: 'ext-1', priority: 10, semantics: 'filter' };
const WEBHOOK = { id: 'wh-1', url: 'https://example.com/hook', hookPoints: ['pre-chat'], enabled: true };

function makeMockManager(overrides?: Partial<ExtensionManager>): ExtensionManager {
  return {
    getExtensions: vi.fn().mockResolvedValue([EXTENSION]),
    registerExtension: vi.fn().mockResolvedValue(EXTENSION),
    removeExtension: vi.fn().mockResolvedValue(true),
    getRegisteredHooks: vi.fn().mockReturnValue([HOOK]),
    registerHook: vi.fn().mockReturnValue('hook-1'),
    unregisterHook: vi.fn(),
    getWebhooks: vi.fn().mockResolvedValue([WEBHOOK]),
    registerWebhook: vi.fn().mockResolvedValue(WEBHOOK),
    removeWebhook: vi.fn().mockResolvedValue(true),
    getExecutionLog: vi.fn().mockReturnValue([]),
    testEmit: vi.fn().mockResolvedValue({ vetoed: false, errors: [] }),
    discoverExtensions: vi.fn().mockResolvedValue([EXTENSION]),
    getConfig: vi.fn().mockReturnValue({ enabled: true }),
    storage: {
      updateWebhook: vi.fn().mockResolvedValue(WEBHOOK),
    },
    ...overrides,
  } as unknown as ExtensionManager;
}

function buildApp(overrides?: Partial<ExtensionManager>) {
  const app = Fastify();
  registerExtensionRoutes(app, { extensionManager: makeMockManager(overrides) });
  return app;
}

describe('GET /api/v1/extensions', () => {
  it('returns extensions list', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/extensions' });
    expect(res.statusCode).toBe(200);
    expect(res.json().extensions).toHaveLength(1);
  });
});

describe('POST /api/v1/extensions', () => {
  it('registers extension and returns 201', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/extensions',
      payload: { name: 'Test', version: '1.0.0', hooks: [] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().extension.id).toBe('ext-1');
  });

  it('returns 400 on error', async () => {
    const app = buildApp({ registerExtension: vi.fn().mockRejectedValue(new Error('conflict')) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/extensions',
      payload: { name: 'Bad', version: '1.0.0', hooks: [] },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /api/v1/extensions/:id', () => {
  it('removes extension and returns 204', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/extensions/ext-1' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when not found', async () => {
    const app = buildApp({ removeExtension: vi.fn().mockResolvedValue(false) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/extensions/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/v1/extensions/hooks', () => {
  it('returns hooks list', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/extensions/hooks' });
    expect(res.statusCode).toBe(200);
    expect(res.json().hooks).toHaveLength(1);
  });

  it('filters by extensionId', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/extensions/hooks?extensionId=other-ext',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().hooks).toHaveLength(0);
  });

  it('filters by hookPoint', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/extensions/hooks?hookPoint=post-chat',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().hooks).toHaveLength(0); // our hook is pre-chat
  });
});

describe('POST /api/v1/extensions/hooks', () => {
  it('registers hook and returns 201 with hookId', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/extensions/hooks',
      payload: { hookPoint: 'pre-chat', extensionId: 'ext-1', priority: 10 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().hookId).toBe('hook-1');
  });

  it('returns 400 on error', async () => {
    const app = buildApp({ registerHook: vi.fn().mockImplementation(() => { throw new Error('invalid'); }) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/extensions/hooks',
      payload: { hookPoint: 'bad-point' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /api/v1/extensions/hooks/:id', () => {
  it('unregisters hook and returns 204', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/extensions/hooks/hook-1' });
    expect(res.statusCode).toBe(204);
  });
});

describe('GET /api/v1/extensions/webhooks', () => {
  it('returns webhooks list', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/extensions/webhooks' });
    expect(res.statusCode).toBe(200);
    expect(res.json().webhooks).toHaveLength(1);
  });
});

describe('POST /api/v1/extensions/webhooks', () => {
  it('registers webhook and returns 201', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/extensions/webhooks',
      payload: { url: 'https://example.com', hookPoints: ['pre-chat'] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().webhook.id).toBe('wh-1');
  });

  it('returns 400 on error', async () => {
    const app = buildApp({ registerWebhook: vi.fn().mockRejectedValue(new Error('invalid url')) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/extensions/webhooks',
      payload: { url: 'bad', hookPoints: [] },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('PUT /api/v1/extensions/webhooks/:id', () => {
  it('updates webhook', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/extensions/webhooks/wh-1',
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().webhook.id).toBe('wh-1');
  });

  it('returns 404 when not found', async () => {
    const mgr = makeMockManager();
    (mgr.storage as any).updateWebhook = vi.fn().mockResolvedValue(null);
    const app = Fastify();
    registerExtensionRoutes(app, { extensionManager: mgr });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/extensions/webhooks/missing',
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/v1/extensions/webhooks/:id', () => {
  it('removes webhook and returns 204', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/extensions/webhooks/wh-1' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when not found', async () => {
    const app = buildApp({ removeWebhook: vi.fn().mockResolvedValue(false) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/extensions/webhooks/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/v1/extensions/hooks/log', () => {
  it('returns execution log', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/extensions/hooks/log' });
    expect(res.statusCode).toBe(200);
    expect(res.json().entries).toBeDefined();
  });
});

describe('POST /api/v1/extensions/hooks/test', () => {
  it('tests a hook emit', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/extensions/hooks/test',
      payload: { hookPoint: 'pre-chat', data: { msg: 'hello' } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().result.vetoed).toBe(false);
  });

  it('returns 400 on error', async () => {
    const app = buildApp({ testEmit: vi.fn().mockRejectedValue(new Error('fail')) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/extensions/hooks/test',
      payload: { hookPoint: 'bad-point' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/v1/extensions/discover', () => {
  it('discovers extensions', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/extensions/discover',
      payload: { directory: '/ext' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().count).toBe(1);
  });
});

describe('GET /api/v1/extensions/config', () => {
  it('returns extension config', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/extensions/config' });
    expect(res.statusCode).toBe(200);
    expect(res.json().config.enabled).toBe(true);
  });
});
