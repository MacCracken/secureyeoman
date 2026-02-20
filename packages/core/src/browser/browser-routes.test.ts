import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerBrowserRoutes } from './browser-routes.js';
import type { BrowserSessionStorage } from './storage.js';

const SESSION = { id: 'sess-1', status: 'active', toolName: 'playwright', url: 'https://example.com' };
const STATS = { total: 5, active: 2, closed: 3 };
const BROWSER_CONFIG = { headless: true, timeout: 30000, maxSessions: 10 };

function makeMockStorage(overrides?: Partial<BrowserSessionStorage>): BrowserSessionStorage {
  return {
    listSessions: vi.fn().mockResolvedValue([SESSION]),
    getSession: vi.fn().mockResolvedValue(SESSION),
    closeSession: vi.fn().mockResolvedValue(SESSION),
    getSessionStats: vi.fn().mockResolvedValue(STATS),
    ...overrides,
  } as unknown as BrowserSessionStorage;
}

function buildApp(overrides?: Partial<BrowserSessionStorage>, config = BROWSER_CONFIG) {
  const app = Fastify();
  registerBrowserRoutes(app, {
    browserSessionStorage: makeMockStorage(overrides),
    browserConfig: config,
  });
  return app;
}

describe('GET /api/v1/browser/sessions', () => {
  it('returns session list', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/browser/sessions' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });

  it('passes query filters to listSessions', async () => {
    const listMock = vi.fn().mockResolvedValue([]);
    const app = buildApp({ listSessions: listMock });
    await app.inject({
      method: 'GET',
      url: '/api/v1/browser/sessions?status=active&toolName=playwright&limit=5&offset=10',
    });
    expect(listMock).toHaveBeenCalledWith({
      status: 'active',
      toolName: 'playwright',
      limit: 5,
      offset: 10,
    });
  });
});

describe('GET /api/v1/browser/sessions/:id', () => {
  it('returns a session', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/browser/sessions/sess-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe('sess-1');
  });

  it('returns 404 when not found', async () => {
    const app = buildApp({ getSession: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/browser/sessions/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/v1/browser/sessions/:id/close', () => {
  it('closes session and returns it', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/browser/sessions/sess-1/close' });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe('sess-1');
  });

  it('returns 404 when session not found', async () => {
    const app = buildApp({ closeSession: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({ method: 'POST', url: '/api/v1/browser/sessions/missing/close' });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/v1/browser/config', () => {
  it('returns browser config', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/browser/config' });
    expect(res.statusCode).toBe(200);
    expect(res.json().headless).toBe(true);
    expect(res.json().maxSessions).toBe(10);
  });
});

describe('GET /api/v1/browser/sessions/stats', () => {
  it('returns session stats', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/browser/sessions/stats' });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(5);
    expect(res.json().active).toBe(2);
  });
});
