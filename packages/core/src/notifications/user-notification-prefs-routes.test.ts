/**
 * UserNotificationPrefsRoutes Tests — Phase 55
 *
 * Tests all 4 REST endpoints using a Fastify test instance with a mocked storage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { UserNotificationPref } from './user-notification-prefs-storage.js';
import { registerUserNotificationPrefsRoutes } from './user-notification-prefs-routes.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000;

function makePref(overrides: Partial<UserNotificationPref> = {}): UserNotificationPref {
  return {
    id: 'pref-1',
    userId: 'user-1',
    channel: 'telegram',
    integrationId: null,
    chatId: '-100123456789',
    enabled: true,
    quietHoursStart: null,
    quietHoursEnd: null,
    minLevel: 'info',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ─── Mock storage ─────────────────────────────────────────────────────────────

function makeStorage() {
  return {
    list: vi.fn().mockResolvedValue([makePref()]),
    listAll: vi.fn().mockResolvedValue([makePref()]),
    get: vi.fn().mockResolvedValue(makePref()),
    upsert: vi.fn().mockResolvedValue(makePref()),
    update: vi.fn().mockResolvedValue(makePref()),
    delete: vi.fn().mockResolvedValue(true),
  };
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

async function buildApp(storage: ReturnType<typeof makeStorage>, withAuth = true) {
  const app = Fastify({ logger: false });

  // Simulate auth middleware — set authUser on all requests
  if (withAuth) {
    app.addHook('preHandler', async (request) => {
      (request as any).authUser = { userId: 'user-1', role: 'admin' };
    });
  }

  registerUserNotificationPrefsRoutes(app, { userNotificationPrefsStorage: storage as any });
  await app.ready();
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/v1/users/me/notification-prefs', () => {
  it('returns prefs for the auth user', async () => {
    const storage = makeStorage();
    const app = await buildApp(storage);

    const res = await app.inject({ method: 'GET', url: '/api/v1/users/me/notification-prefs' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.prefs).toHaveLength(1);
    expect(body.prefs[0].channel).toBe('telegram');
    expect(storage.list).toHaveBeenCalledWith('user-1');
  });

  it('returns 401 when not authenticated', async () => {
    const storage = makeStorage();
    const app = await buildApp(storage, false);

    const res = await app.inject({ method: 'GET', url: '/api/v1/users/me/notification-prefs' });

    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/v1/users/me/notification-prefs', () => {
  it('creates a pref and returns 201', async () => {
    const storage = makeStorage();
    const app = await buildApp(storage);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users/me/notification-prefs',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'telegram', chatId: '-100123456789', minLevel: 'info' }),
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.pref.channel).toBe('telegram');
    expect(storage.upsert).toHaveBeenCalledWith('user-1', expect.objectContaining({ channel: 'telegram' }));
  });

  it('returns 400 for invalid channel', async () => {
    const storage = makeStorage();
    const app = await buildApp(storage);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users/me/notification-prefs',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'whatsapp', chatId: '123' }),
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when chatId is missing', async () => {
    const storage = makeStorage();
    const app = await buildApp(storage);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users/me/notification-prefs',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'telegram' }),
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid minLevel', async () => {
    const storage = makeStorage();
    const app = await buildApp(storage);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users/me/notification-prefs',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'telegram', chatId: '123', minLevel: 'debug' }),
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 401 when not authenticated', async () => {
    const storage = makeStorage();
    const app = await buildApp(storage, false);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users/me/notification-prefs',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'telegram', chatId: '123' }),
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('PUT /api/v1/users/me/notification-prefs/:id', () => {
  it('updates a pref and returns updated data', async () => {
    const storage = makeStorage();
    storage.update.mockResolvedValueOnce(makePref({ enabled: false }));
    const app = await buildApp(storage);

    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/users/me/notification-prefs/pref-1',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pref.enabled).toBe(false);
    expect(storage.update).toHaveBeenCalledWith('user-1', 'pref-1', expect.objectContaining({ enabled: false }));
  });

  it('returns 404 when pref not found', async () => {
    const storage = makeStorage();
    storage.update.mockResolvedValueOnce(null);
    const app = await buildApp(storage);

    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/users/me/notification-prefs/nonexistent',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for invalid channel in update', async () => {
    const storage = makeStorage();
    const app = await buildApp(storage);

    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/users/me/notification-prefs/pref-1',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'invalid' }),
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 401 when not authenticated', async () => {
    const storage = makeStorage();
    const app = await buildApp(storage, false);

    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/users/me/notification-prefs/pref-1',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /api/v1/users/me/notification-prefs/:id', () => {
  it('deletes a pref and returns ok', async () => {
    const storage = makeStorage();
    const app = await buildApp(storage);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/users/me/notification-prefs/pref-1',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(storage.delete).toHaveBeenCalledWith('user-1', 'pref-1');
  });

  it('returns 404 when pref not found', async () => {
    const storage = makeStorage();
    storage.delete.mockResolvedValueOnce(false);
    const app = await buildApp(storage);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/users/me/notification-prefs/nonexistent',
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 401 when not authenticated', async () => {
    const storage = makeStorage();
    const app = await buildApp(storage, false);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/users/me/notification-prefs/pref-1',
    });

    expect(res.statusCode).toBe(401);
  });
});
