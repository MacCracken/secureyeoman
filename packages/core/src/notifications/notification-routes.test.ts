/**
 * Notification Routes Tests — Phase 51
 *
 * Fastify inject tests with mocked NotificationManager.
 * No database required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerNotificationRoutes } from './notification-routes.js';
import type { Notification } from './notification-storage.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000;
const NOTIF_ID = 'notif-abc-123';

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: NOTIF_ID,
    type: 'heartbeat_alert',
    title: 'High Memory',
    body: 'RSS 600MB exceeds threshold',
    level: 'warn',
    source: 'heartbeat',
    readAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

function makeManager(overrides: Record<string, unknown> = {}) {
  return {
    list: vi.fn().mockResolvedValue({
      notifications: [makeNotification()],
      total: 1,
    }),
    unreadCount: vi.fn().mockResolvedValue(1),
    markRead: vi.fn().mockResolvedValue(true),
    markAllRead: vi.fn().mockResolvedValue(3),
    delete: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function buildApp(managerOverrides: Record<string, unknown> = {}) {
  const app = Fastify({ logger: false });
  const mgr = makeManager(managerOverrides);
  registerNotificationRoutes(app, { notificationManager: mgr as any });
  return { app, mgr };
}

// ─── GET /api/v1/notifications ────────────────────────────────────────────────

describe('GET /api/v1/notifications', () => {
  it('returns notifications, total, and unreadCount', async () => {
    const { app } = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/notifications' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.notifications).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.unreadCount).toBe(1);
  });

  it('passes unreadOnly=true to manager when queried', async () => {
    const { app, mgr } = buildApp();
    await app.inject({ method: 'GET', url: '/api/v1/notifications?unreadOnly=true' });
    expect(mgr.list).toHaveBeenCalledWith(expect.objectContaining({ unreadOnly: true }));
  });

  it('caps limit at 100', async () => {
    const { app, mgr } = buildApp();
    await app.inject({ method: 'GET', url: '/api/v1/notifications?limit=999' });
    expect(mgr.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
  });

  it('uses default limit=50 when not provided', async () => {
    const { app, mgr } = buildApp();
    await app.inject({ method: 'GET', url: '/api/v1/notifications' });
    expect(mgr.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 50, offset: 0 }));
  });

  it('accepts unreadOnly=1 as truthy', async () => {
    const { app, mgr } = buildApp();
    await app.inject({ method: 'GET', url: '/api/v1/notifications?unreadOnly=1' });
    expect(mgr.list).toHaveBeenCalledWith(expect.objectContaining({ unreadOnly: true }));
  });

  it('uses default limit=50 when limit is non-numeric', async () => {
    const { app, mgr } = buildApp();
    await app.inject({ method: 'GET', url: '/api/v1/notifications?limit=abc' });
    expect(mgr.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));
  });

  it('passes offset query param to manager', async () => {
    const { app, mgr } = buildApp();
    await app.inject({ method: 'GET', url: '/api/v1/notifications?offset=20' });
    expect(mgr.list).toHaveBeenCalledWith(expect.objectContaining({ offset: 20 }));
  });

  it('uses default offset=0 when offset is non-numeric', async () => {
    const { app, mgr } = buildApp();
    await app.inject({ method: 'GET', url: '/api/v1/notifications?offset=abc' });
    expect(mgr.list).toHaveBeenCalledWith(expect.objectContaining({ offset: 0 }));
  });

  it('returns 500 on storage error', async () => {
    const { app } = buildApp({ list: vi.fn().mockRejectedValue(new Error('DB error')) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/notifications' });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /api/v1/notifications/count ─────────────────────────────────────────

describe('GET /api/v1/notifications/count', () => {
  it('returns unreadCount', async () => {
    const { app } = buildApp({ unreadCount: vi.fn().mockResolvedValue(7) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/notifications/count' });
    expect(res.statusCode).toBe(200);
    expect(res.json().unreadCount).toBe(7);
  });

  it('returns 0 when no unread notifications', async () => {
    const { app } = buildApp({ unreadCount: vi.fn().mockResolvedValue(0) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/notifications/count' });
    expect(res.json().unreadCount).toBe(0);
  });

  it('returns 500 on error', async () => {
    const { app } = buildApp({
      unreadCount: vi.fn().mockRejectedValue(new Error('fail')),
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/notifications/count' });
    expect(res.statusCode).toBe(500);
  });
});

// ─── POST /api/v1/notifications/:id/read ─────────────────────────────────────

describe('POST /api/v1/notifications/:id/read', () => {
  it('marks a notification as read', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/notifications/${NOTIF_ID}/read`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('returns 404 when not found or already read', async () => {
    const { app } = buildApp({ markRead: vi.fn().mockResolvedValue(false) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/nonexistent/read',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on storage error', async () => {
    const { app } = buildApp({
      markRead: vi.fn().mockRejectedValue(new Error('DB error')),
    });
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/notifications/${NOTIF_ID}/read`,
    });
    expect(res.statusCode).toBe(500);
  });
});

// ─── POST /api/v1/notifications/read-all ─────────────────────────────────────

describe('POST /api/v1/notifications/read-all', () => {
  it('marks all notifications read and returns count', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/read-all',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().updated).toBe(3);
  });

  it('returns 0 when nothing to mark', async () => {
    const { app } = buildApp({ markAllRead: vi.fn().mockResolvedValue(0) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/read-all',
    });
    expect(res.json().updated).toBe(0);
  });

  it('returns 500 on error', async () => {
    const { app } = buildApp({
      markAllRead: vi.fn().mockRejectedValue(new Error('fail')),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/read-all',
    });
    expect(res.statusCode).toBe(500);
  });
});

// ─── DELETE /api/v1/notifications/:id ────────────────────────────────────────

describe('DELETE /api/v1/notifications/:id', () => {
  it('deletes a notification', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/notifications/${NOTIF_ID}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('returns 404 when not found', async () => {
    const { app } = buildApp({ delete: vi.fn().mockResolvedValue(false) });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/notifications/nonexistent',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on storage error', async () => {
    const { app } = buildApp({
      delete: vi.fn().mockRejectedValue(new Error('DB error')),
    });
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/notifications/${NOTIF_ID}`,
    });
    expect(res.statusCode).toBe(500);
  });
});
