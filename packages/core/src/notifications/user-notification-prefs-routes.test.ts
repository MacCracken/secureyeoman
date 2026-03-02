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
    expect(storage.upsert).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ channel: 'telegram' })
    );
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
    expect(storage.update).toHaveBeenCalledWith(
      'user-1',
      'pref-1',
      expect.objectContaining({ enabled: false })
    );
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

// ── Phase 105: Branch coverage for body parsing + error paths ─────────────────

describe('POST body parsing branches (Phase 105)', () => {
  it('handles non-string integrationId (sets null)', async () => {
    const storage = makeStorage();
    const app = await buildApp(storage);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users/me/notification-prefs',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'slack', chatId: 'C123', integrationId: 42 }),
    });
    expect(res.statusCode).toBe(201);
    expect(storage.upsert).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ integrationId: null })
    );
  });

  it('handles string integrationId (passes through)', async () => {
    const storage = makeStorage();
    const app = await buildApp(storage);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users/me/notification-prefs',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'slack', chatId: 'C123', integrationId: 'int-1' }),
    });
    expect(res.statusCode).toBe(201);
    expect(storage.upsert).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ integrationId: 'int-1' })
    );
  });

  it('defaults enabled to true when not provided', async () => {
    const storage = makeStorage();
    const app = await buildApp(storage);
    await app.inject({
      method: 'POST',
      url: '/api/v1/users/me/notification-prefs',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'telegram', chatId: '123' }),
    });
    expect(storage.upsert).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ enabled: true })
    );
  });

  it('converts enabled to boolean when provided', async () => {
    const storage = makeStorage();
    const app = await buildApp(storage);
    await app.inject({
      method: 'POST',
      url: '/api/v1/users/me/notification-prefs',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'telegram', chatId: '123', enabled: false }),
    });
    expect(storage.upsert).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ enabled: false })
    );
  });

  it('parses numeric quietHoursStart and quietHoursEnd', async () => {
    const storage = makeStorage();
    const app = await buildApp(storage);
    await app.inject({
      method: 'POST',
      url: '/api/v1/users/me/notification-prefs',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'slack', chatId: 'C1', quietHoursStart: 22, quietHoursEnd: 8 }),
    });
    expect(storage.upsert).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ quietHoursStart: 22, quietHoursEnd: 8 })
    );
  });

  it('sets null for NaN quietHoursStart/End', async () => {
    const storage = makeStorage();
    const app = await buildApp(storage);
    await app.inject({
      method: 'POST',
      url: '/api/v1/users/me/notification-prefs',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'slack', chatId: 'C1', quietHoursStart: 'abc', quietHoursEnd: 'xyz' }),
    });
    expect(storage.upsert).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ quietHoursStart: null, quietHoursEnd: null })
    );
  });

  it('returns 400 when chatId is empty string', async () => {
    const storage = makeStorage();
    const app = await buildApp(storage);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users/me/notification-prefs',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'slack', chatId: '   ' }),
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('PUT body parsing branches (Phase 105)', () => {
  it('returns 400 for invalid minLevel in update', async () => {
    const storage = makeStorage();
    const app = await buildApp(storage);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/users/me/notification-prefs/pref-1',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ minLevel: 'debug' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('passes through patch fields: channel, chatId, integrationId, enabled, quietHours, minLevel', async () => {
    const storage = makeStorage();
    const app = await buildApp(storage);
    await app.inject({
      method: 'PUT',
      url: '/api/v1/users/me/notification-prefs/pref-1',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channel: 'discord',
        chatId: ' trimmed ',
        integrationId: 'int-2',
        enabled: true,
        quietHoursStart: 23,
        quietHoursEnd: 7,
        minLevel: 'warn',
      }),
    });
    expect(storage.update).toHaveBeenCalledWith(
      'user-1',
      'pref-1',
      expect.objectContaining({
        channel: 'discord',
        chatId: 'trimmed',
        integrationId: 'int-2',
        enabled: true,
        quietHoursStart: 23,
        quietHoursEnd: 7,
        minLevel: 'warn',
      })
    );
  });

  it('sets integrationId to null when non-string', async () => {
    const storage = makeStorage();
    const app = await buildApp(storage);
    await app.inject({
      method: 'PUT',
      url: '/api/v1/users/me/notification-prefs/pref-1',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ integrationId: 99 }),
    });
    expect(storage.update).toHaveBeenCalledWith(
      'user-1',
      'pref-1',
      expect.objectContaining({ integrationId: null })
    );
  });

  it('sets quietHoursStart/End to null for NaN values', async () => {
    const storage = makeStorage();
    const app = await buildApp(storage);
    await app.inject({
      method: 'PUT',
      url: '/api/v1/users/me/notification-prefs/pref-1',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quietHoursStart: 'bad', quietHoursEnd: 'bad' }),
    });
    expect(storage.update).toHaveBeenCalledWith(
      'user-1',
      'pref-1',
      expect.objectContaining({ quietHoursStart: null, quietHoursEnd: null })
    );
  });
});

describe('Error catch blocks (Phase 105)', () => {
  it('GET returns 500 when storage.list throws', async () => {
    const storage = makeStorage();
    storage.list.mockRejectedValueOnce(new Error('db error'));
    const app = await buildApp(storage);
    const res = await app.inject({ method: 'GET', url: '/api/v1/users/me/notification-prefs' });
    expect(res.statusCode).toBe(500);
  });

  it('POST returns 500 when storage.upsert throws', async () => {
    const storage = makeStorage();
    storage.upsert.mockRejectedValueOnce(new Error('db error'));
    const app = await buildApp(storage);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users/me/notification-prefs',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'slack', chatId: 'C1' }),
    });
    expect(res.statusCode).toBe(500);
  });

  it('PUT returns 500 when storage.update throws', async () => {
    const storage = makeStorage();
    storage.update.mockRejectedValueOnce(new Error('db error'));
    const app = await buildApp(storage);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/users/me/notification-prefs/pref-1',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.statusCode).toBe(500);
  });

  it('DELETE returns 500 when storage.delete throws', async () => {
    const storage = makeStorage();
    storage.delete.mockRejectedValueOnce(new Error('db error'));
    const app = await buildApp(storage);
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/users/me/notification-prefs/pref-1',
    });
    expect(res.statusCode).toBe(500);
  });
});
