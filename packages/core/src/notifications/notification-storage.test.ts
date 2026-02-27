/**
 * NotificationStorage Tests — Phase 51
 *
 * Unit tests using mocked PgBaseStorage methods.
 * No database required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationStorage, type Notification } from './notification-storage.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000;

function makeRow(overrides: Partial<{
  id: string;
  type: string;
  title: string;
  body: string;
  level: string;
  source: string | null;
  metadata: Record<string, unknown> | null;
  read_at: number | null;
  created_at: number;
}> = {}) {
  return {
    id: 'notif-1',
    type: 'heartbeat_alert',
    title: 'System Warning',
    body: 'High memory usage detected',
    level: 'warn',
    source: 'heartbeat',
    metadata: null,
    read_at: null,
    created_at: NOW,
    ...overrides,
  };
}

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'notif-1',
    type: 'heartbeat_alert',
    title: 'System Warning',
    body: 'High memory usage detected',
    level: 'warn',
    source: 'heartbeat',
    readAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NotificationStorage.create()', () => {
  it('inserts a row and returns a Notification', async () => {
    const storage = new NotificationStorage();
    const row = makeRow();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(row);

    const result = await storage.create({
      type: 'heartbeat_alert',
      title: 'System Warning',
      body: 'High memory usage detected',
      level: 'warn',
      source: 'heartbeat',
    });

    expect(result.id).toBe('notif-1');
    expect(result.type).toBe('heartbeat_alert');
    expect(result.level).toBe('warn');
    expect(result.readAt).toBeNull();
    expect(result.createdAt).toBe(NOW);
  });

  it('defaults level to info when not provided', async () => {
    const storage = new NotificationStorage();
    const row = makeRow({ level: 'info' });
    const spy = vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(row);

    await storage.create({ type: 'test', title: 'T', body: 'B' });

    const callArgs = spy.mock.calls[0]![1] as unknown[];
    expect(callArgs[4]).toBe('info'); // level is 5th param (index 4)
  });

  it('serializes metadata as JSON', async () => {
    const storage = new NotificationStorage();
    const row = makeRow({ metadata: { key: 'val' } });
    const spy = vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(row);

    await storage.create({
      type: 'test',
      title: 'T',
      body: 'B',
      metadata: { key: 'val' },
    });

    const callArgs = spy.mock.calls[0]![1] as unknown[];
    expect(callArgs[6]).toBe('{"key":"val"}');
  });
});

describe('NotificationStorage.list()', () => {
  it('returns notifications and total count', async () => {
    const storage = new NotificationStorage();
    vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([makeRow()]);
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce({ count: '1' });

    const result = await storage.list();

    expect(result.notifications).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.notifications[0]!.id).toBe('notif-1');
  });

  it('applies unreadOnly filter in SQL when requested', async () => {
    const storage = new NotificationStorage();
    const spy = vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([]);
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce({ count: '0' });

    await storage.list({ unreadOnly: true });

    expect(spy.mock.calls[0]![0]).toContain('WHERE read_at IS NULL');
  });

  it('uses default limit=50 and offset=0', async () => {
    const storage = new NotificationStorage();
    const spy = vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([]);
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce({ count: '0' });

    await storage.list();

    const params = spy.mock.calls[0]![1] as number[];
    expect(params[0]).toBe(50);
    expect(params[1]).toBe(0);
  });

  it('passes custom limit and offset', async () => {
    const storage = new NotificationStorage();
    const spy = vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([]);
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce({ count: '0' });

    await storage.list({ limit: 10, offset: 20 });

    const params = spy.mock.calls[0]![1] as number[];
    expect(params[0]).toBe(10);
    expect(params[1]).toBe(20);
  });
});

describe('NotificationStorage.markRead()', () => {
  it('returns true when a row was updated', async () => {
    const storage = new NotificationStorage();
    vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(1);

    const result = await storage.markRead('notif-1');

    expect(result).toBe(true);
  });

  it('returns false when no row matched (already read or not found)', async () => {
    const storage = new NotificationStorage();
    vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(0);

    const result = await storage.markRead('nonexistent');

    expect(result).toBe(false);
  });
});

describe('NotificationStorage.markAllRead()', () => {
  it('returns the number of updated rows', async () => {
    const storage = new NotificationStorage();
    vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(5);

    const count = await storage.markAllRead();

    expect(count).toBe(5);
  });
});

describe('NotificationStorage.delete()', () => {
  it('returns true when a row was deleted', async () => {
    const storage = new NotificationStorage();
    vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(1);

    const result = await storage.delete('notif-1');

    expect(result).toBe(true);
  });

  it('returns false when no row was deleted', async () => {
    const storage = new NotificationStorage();
    vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(0);

    const result = await storage.delete('nonexistent');

    expect(result).toBe(false);
  });
});

describe('NotificationStorage.unreadCount()', () => {
  it('returns the unread count', async () => {
    const storage = new NotificationStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce({ count: '3' });

    const count = await storage.unreadCount();

    expect(count).toBe(3);
  });

  it('returns 0 when queryOne returns null', async () => {
    const storage = new NotificationStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(null);

    const count = await storage.unreadCount();

    expect(count).toBe(0);
  });
});

describe('row mapping', () => {
  it('converts string timestamps to numbers', async () => {
    const storage = new NotificationStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(
      makeRow({ created_at: 1700000000000 as any, read_at: 1700000001000 as any })
    );

    const result = await storage.create({ type: 't', title: 'T', body: 'B' });

    expect(typeof result.createdAt).toBe('number');
    expect(typeof result.readAt).toBe('number');
  });

  it('converts string timestamps to numbers (string read_at and created_at)', async () => {
    const storage = new NotificationStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(
      makeRow({ created_at: '1700000000000' as any, read_at: '1700000001000' as any })
    );

    const result = await storage.create({ type: 't', title: 'T', body: 'B' });

    expect(result.createdAt).toBe(1700000000000);
    expect(result.readAt).toBe(1700000001000);
  });

  it('maps source null to undefined', async () => {
    const storage = new NotificationStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(
      makeRow({ source: null })
    );

    const result = await storage.create({ type: 't', title: 'T', body: 'B' });

    expect(result.source).toBeUndefined();
  });

  it('maps metadata non-null to object', async () => {
    const storage = new NotificationStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(
      makeRow({ metadata: { key: 'val' } })
    );

    const result = await storage.create({ type: 't', title: 'T', body: 'B' });

    expect(result.metadata).toEqual({ key: 'val' });
  });

  it('list() handles null countResult', async () => {
    const storage = new NotificationStorage();
    vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([]);
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(null);

    const result = await storage.list();

    expect(result.total).toBe(0);
  });
});

describe('NotificationStorage.deleteOlderThan()', () => {
  it('deletes rows older than maxAgeMs and returns count', async () => {
    const storage = new NotificationStorage();
    const spy = vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(3);

    const count = await storage.deleteOlderThan(30 * 24 * 60 * 60 * 1000);

    expect(count).toBe(3);
    expect(spy.mock.calls[0]![0]).toContain('DELETE FROM notifications WHERE created_at < $1');
  });

  it('passes correct cutoff timestamp', async () => {
    const storage = new NotificationStorage();
    const spy = vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(0);
    const before = Date.now();
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000;

    await storage.deleteOlderThan(maxAgeMs);

    const after = Date.now();
    const cutoff = spy.mock.calls[0]![1] as number[];
    expect(cutoff[0]).toBeGreaterThanOrEqual(before - maxAgeMs);
    expect(cutoff[0]).toBeLessThanOrEqual(after - maxAgeMs + 100);
  });

  it('returns 0 when no rows matched', async () => {
    const storage = new NotificationStorage();
    vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(0);

    const count = await storage.deleteOlderThan(86_400_000);

    expect(count).toBe(0);
  });
});
