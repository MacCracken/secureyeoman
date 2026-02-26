import { describe, it, expect, vi } from 'vitest';
import { NotificationManager } from './notification-manager.js';
import type { NotificationStorage, Notification } from './notification-storage.js';

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'n-1',
    type: 'system',
    title: 'Test',
    body: 'Test body',
    level: 'info',
    source: undefined,
    metadata: undefined,
    readAt: undefined,
    createdAt: 1000,
    ...overrides,
  };
}

function makeStorage(overrides: Partial<NotificationStorage> = {}): NotificationStorage {
  return {
    create: vi.fn().mockResolvedValue(makeNotification()),
    list: vi.fn().mockResolvedValue({ notifications: [], total: 0, unreadCount: 0 }),
    markRead: vi.fn().mockResolvedValue(true),
    markAllRead: vi.fn().mockResolvedValue(3),
    delete: vi.fn().mockResolvedValue(true),
    unreadCount: vi.fn().mockResolvedValue(0),
    ...overrides,
  } as unknown as NotificationStorage;
}

describe('NotificationManager', () => {
  describe('notify()', () => {
    it('persists notification via storage.create', async () => {
      const storage = makeStorage();
      const manager = new NotificationManager(storage);
      const result = await manager.notify({ type: 'alert', title: 'Hi', body: 'Message' });
      expect(storage.create).toHaveBeenCalledWith({
        type: 'alert',
        title: 'Hi',
        body: 'Message',
        level: 'info',
        source: undefined,
        metadata: undefined,
      });
      expect(result.id).toBe('n-1');
    });

    it('uses provided level instead of default info', async () => {
      const storage = makeStorage();
      const manager = new NotificationManager(storage);
      await manager.notify({ type: 'alert', title: 'Hi', body: 'Msg', level: 'error' });
      expect(storage.create).toHaveBeenCalledWith(expect.objectContaining({ level: 'error' }));
    });

    it('calls broadcast after persisting', async () => {
      const storage = makeStorage();
      const broadcast = vi.fn();
      const manager = new NotificationManager(storage, broadcast);
      const notification = makeNotification({ id: 'n-42' });
      (storage.create as ReturnType<typeof vi.fn>).mockResolvedValue(notification);
      await manager.notify({ type: 'system', title: 'T', body: 'B' });
      expect(broadcast).toHaveBeenCalledWith({ notification });
    });

    it('does not throw when no broadcast set', async () => {
      const storage = makeStorage();
      const manager = new NotificationManager(storage);
      await expect(manager.notify({ type: 'x', title: 'T', body: 'B' })).resolves.toBeDefined();
    });
  });

  describe('setBroadcast()', () => {
    it('wires broadcast callback after construction', async () => {
      const storage = makeStorage();
      const manager = new NotificationManager(storage);
      const broadcast = vi.fn();
      manager.setBroadcast(broadcast);
      await manager.notify({ type: 'x', title: 'T', body: 'B' });
      expect(broadcast).toHaveBeenCalled();
    });
  });

  describe('getStorage()', () => {
    it('returns the storage instance', () => {
      const storage = makeStorage();
      const manager = new NotificationManager(storage);
      expect(manager.getStorage()).toBe(storage);
    });
  });

  describe('delegation methods', () => {
    it('list() delegates to storage', async () => {
      const storage = makeStorage();
      const manager = new NotificationManager(storage);
      await manager.list({ unreadOnly: true });
      expect(storage.list).toHaveBeenCalledWith({ unreadOnly: true });
    });

    it('markRead() delegates to storage', async () => {
      const storage = makeStorage();
      const manager = new NotificationManager(storage);
      const result = await manager.markRead('n-1');
      expect(storage.markRead).toHaveBeenCalledWith('n-1');
      expect(result).toBe(true);
    });

    it('markAllRead() delegates to storage', async () => {
      const storage = makeStorage();
      const manager = new NotificationManager(storage);
      const count = await manager.markAllRead();
      expect(storage.markAllRead).toHaveBeenCalled();
      expect(count).toBe(3);
    });

    it('delete() delegates to storage', async () => {
      const storage = makeStorage();
      const manager = new NotificationManager(storage);
      const result = await manager.delete('n-1');
      expect(storage.delete).toHaveBeenCalledWith('n-1');
      expect(result).toBe(true);
    });

    it('unreadCount() delegates to storage', async () => {
      const storage = makeStorage({ unreadCount: vi.fn().mockResolvedValue(7) });
      const manager = new NotificationManager(storage);
      expect(await manager.unreadCount()).toBe(7);
    });
  });
});
