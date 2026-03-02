import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NotificationManager } from './notification-manager.js';
import type { NotificationStorage, Notification } from './notification-storage.js';
import type { UserNotificationPref } from './user-notification-prefs-storage.js';

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
    deleteOlderThan: vi.fn().mockResolvedValue(0),
    ...overrides,
  } as unknown as NotificationStorage;
}

function makePref(overrides: Partial<UserNotificationPref> = {}): UserNotificationPref {
  return {
    id: 'pref-1',
    userId: 'user-1',
    channel: 'telegram',
    integrationId: null,
    chatId: '-100123',
    enabled: true,
    quietHoursStart: null,
    quietHoursEnd: null,
    minLevel: 'info',
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function makePrefsStorage(prefs: UserNotificationPref[]) {
  return { listAll: vi.fn().mockResolvedValue(prefs) };
}

function makeIntegrationManager() {
  const sendMessage = vi.fn().mockResolvedValue('msg-id');
  return {
    getAdapter: vi.fn().mockReturnValue({ sendMessage }),
    getAdaptersByPlatform: vi.fn().mockReturnValue([{ sendMessage }]),
    _sendMessage: sendMessage,
  };
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

// ─── Phase 55: Fan-out tests ──────────────────────────────────────────────────

describe('NotificationManager fan-out (Phase 55)', () => {
  it('calls adapter.sendMessage for matching pref', async () => {
    const storage = makeStorage();
    const prefs = [makePref()];
    const prefsStorage = makePrefsStorage(prefs);
    const im = makeIntegrationManager();

    const manager = new NotificationManager(storage);
    manager.setUserPrefsStorage(prefsStorage as any);
    manager.setIntegrationManager(im as any);

    await manager.notify({ type: 'test', title: 'T', body: 'B', level: 'warn' });
    await new Promise((r) => setTimeout(r, 10));

    // sendMessage is called with the notification returned by storage.create (mock returns 'Test body'/'Test')
    expect(im._sendMessage).toHaveBeenCalledWith('-100123', 'Test body', { subject: 'Test' });
  });

  it('skips prefs where notification level is below minLevel', async () => {
    const storage = makeStorage();
    const prefs = [makePref({ minLevel: 'critical' })];
    const prefsStorage = makePrefsStorage(prefs);
    const im = makeIntegrationManager();

    const manager = new NotificationManager(storage);
    manager.setUserPrefsStorage(prefsStorage as any);
    manager.setIntegrationManager(im as any);

    await manager.notify({ type: 'test', title: 'T', body: 'B', level: 'info' });
    await new Promise((r) => setTimeout(r, 10));

    expect(im._sendMessage).not.toHaveBeenCalled();
  });

  it('skips disabled prefs', async () => {
    const storage = makeStorage();
    const prefs = [makePref({ enabled: false })];
    const prefsStorage = makePrefsStorage(prefs);
    const im = makeIntegrationManager();

    const manager = new NotificationManager(storage);
    manager.setUserPrefsStorage(prefsStorage as any);
    manager.setIntegrationManager(im as any);

    await manager.notify({ type: 'test', title: 'T', body: 'B', level: 'error' });
    await new Promise((r) => setTimeout(r, 10));

    expect(im._sendMessage).not.toHaveBeenCalled();
  });

  it('uses getAdapter(integrationId) when integrationId is set in pref', async () => {
    const storage = makeStorage();
    const prefs = [makePref({ integrationId: 'integ-abc' })];
    const prefsStorage = makePrefsStorage(prefs);
    const sendMessage = vi.fn().mockResolvedValue('id');
    const im = {
      getAdapter: vi.fn().mockReturnValue({ sendMessage }),
      getAdaptersByPlatform: vi.fn().mockReturnValue([]),
    };

    const manager = new NotificationManager(storage);
    manager.setUserPrefsStorage(prefsStorage as any);
    manager.setIntegrationManager(im as any);

    await manager.notify({ type: 'test', title: 'T', body: 'B', level: 'warn' });
    await new Promise((r) => setTimeout(r, 10));

    expect(im.getAdapter).toHaveBeenCalledWith('integ-abc');
    expect(sendMessage).toHaveBeenCalled();
  });

  it('does not throw when integration manager is not set', async () => {
    const storage = makeStorage();
    const prefs = [makePref()];
    const prefsStorage = makePrefsStorage(prefs);

    const manager = new NotificationManager(storage);
    manager.setUserPrefsStorage(prefsStorage as any);
    // No setIntegrationManager call

    await expect(
      manager.notify({ type: 'test', title: 'T', body: 'B', level: 'error' })
    ).resolves.toBeDefined();
  });
});

// ─── Phase 105: Quiet hours + edge case branch coverage ──────────────────────

describe('NotificationManager fan-out quiet hours (Phase 105)', () => {
  let dateSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    dateSpy?.mockRestore();
  });

  function mockUTCHour(hour: number) {
    dateSpy = vi.spyOn(Date.prototype, 'getUTCHours').mockReturnValue(hour);
  }

  async function flushFanout() {
    // _fanout is fire-and-forget; give microtasks time to settle
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
  }

  it('skips notification during daytime quiet hours (e > s, hour in range)', async () => {
    mockUTCHour(12); // Quiet hours 9–17 → should skip
    const storage = makeStorage();
    const prefs = [makePref({ quietHoursStart: 9, quietHoursEnd: 17 })];
    const prefsStorage = makePrefsStorage(prefs);
    const im = makeIntegrationManager();

    const manager = new NotificationManager(storage);
    manager.setUserPrefsStorage(prefsStorage as any);
    manager.setIntegrationManager(im as any);

    await manager.notify({ type: 'test', title: 'T', body: 'B', level: 'error' });
    await flushFanout();

    expect(im._sendMessage).not.toHaveBeenCalled();
  });

  it('sends notification outside daytime quiet hours (hour below start)', async () => {
    mockUTCHour(7); // Quiet hours 9–17 → should send
    const storage = makeStorage();
    const prefs = [makePref({ quietHoursStart: 9, quietHoursEnd: 17 })];
    const prefsStorage = makePrefsStorage(prefs);
    const im = makeIntegrationManager();

    const manager = new NotificationManager(storage);
    manager.setUserPrefsStorage(prefsStorage as any);
    manager.setIntegrationManager(im as any);

    await manager.notify({ type: 'test', title: 'T', body: 'B', level: 'error' });
    await flushFanout();

    expect(im._sendMessage).toHaveBeenCalled();
  });

  it('skips notification during overnight quiet hours (s=22, e=8, hour=23)', async () => {
    mockUTCHour(23); // Quiet hours 22–08 overnight → should skip
    const storage = makeStorage();
    const prefs = [makePref({ quietHoursStart: 22, quietHoursEnd: 8 })];
    const prefsStorage = makePrefsStorage(prefs);
    const im = makeIntegrationManager();

    const manager = new NotificationManager(storage);
    manager.setUserPrefsStorage(prefsStorage as any);
    manager.setIntegrationManager(im as any);

    await manager.notify({ type: 'test', title: 'T', body: 'B', level: 'error' });
    await flushFanout();

    expect(im._sendMessage).not.toHaveBeenCalled();
  });

  it('sends notification outside overnight quiet hours (s=22, e=8, hour=12)', async () => {
    mockUTCHour(12); // Quiet hours 22–08 overnight → should send
    const storage = makeStorage();
    const prefs = [makePref({ quietHoursStart: 22, quietHoursEnd: 8 })];
    const prefsStorage = makePrefsStorage(prefs);
    const im = makeIntegrationManager();

    const manager = new NotificationManager(storage);
    manager.setUserPrefsStorage(prefsStorage as any);
    manager.setIntegrationManager(im as any);

    await manager.notify({ type: 'test', title: 'T', body: 'B', level: 'error' });
    await flushFanout();

    expect(im._sendMessage).toHaveBeenCalled();
  });

  it('skips quiet hours check when only start is set (end is null)', async () => {
    mockUTCHour(23); // Only start set → quiet hours block skipped, should send
    const storage = makeStorage();
    const prefs = [makePref({ quietHoursStart: 22, quietHoursEnd: null })];
    const prefsStorage = makePrefsStorage(prefs);
    const im = makeIntegrationManager();

    const manager = new NotificationManager(storage);
    manager.setUserPrefsStorage(prefsStorage as any);
    manager.setIntegrationManager(im as any);

    await manager.notify({ type: 'test', title: 'T', body: 'B', level: 'error' });
    await flushFanout();

    expect(im._sendMessage).toHaveBeenCalled();
  });

  it('skips quiet hours check when only end is set (start is null)', async () => {
    mockUTCHour(12); // Only end set → quiet hours block skipped, should send
    const storage = makeStorage();
    const prefs = [makePref({ quietHoursStart: null, quietHoursEnd: 17 })];
    const prefsStorage = makePrefsStorage(prefs);
    const im = makeIntegrationManager();

    const manager = new NotificationManager(storage);
    manager.setUserPrefsStorage(prefsStorage as any);
    manager.setIntegrationManager(im as any);

    await manager.notify({ type: 'test', title: 'T', body: 'B', level: 'error' });
    await flushFanout();

    expect(im._sendMessage).toHaveBeenCalled();
  });
});

describe('NotificationManager fan-out adapter edge cases (Phase 105)', () => {
  it('returns early when getAdaptersByPlatform() returns empty array', async () => {
    const storage = makeStorage();
    const prefs = [makePref({ integrationId: null })]; // no integrationId → uses getAdaptersByPlatform
    const prefsStorage = makePrefsStorage(prefs);
    const im = {
      getAdapter: vi.fn(),
      getAdaptersByPlatform: vi.fn().mockReturnValue([]), // empty → no adapter
    };

    const manager = new NotificationManager(storage);
    manager.setUserPrefsStorage(prefsStorage as any);
    manager.setIntegrationManager(im as any);

    await manager.notify({ type: 'test', title: 'T', body: 'B', level: 'error' });
    await new Promise((r) => setTimeout(r, 10));

    expect(im.getAdaptersByPlatform).toHaveBeenCalledWith('telegram');
    expect(im.getAdapter).not.toHaveBeenCalled();
  });

  it('continues to next pref when adapter.sendMessage() throws', async () => {
    const storage = makeStorage();
    const sendMessage1 = vi.fn().mockRejectedValue(new Error('network error'));
    const sendMessage2 = vi.fn().mockResolvedValue('msg-id');
    const prefs = [
      makePref({ id: 'pref-1', chatId: '-100' }),
      makePref({ id: 'pref-2', chatId: '-200' }),
    ];
    const prefsStorage = makePrefsStorage(prefs);

    let callCount = 0;
    const im = {
      getAdapter: vi.fn(),
      getAdaptersByPlatform: vi.fn().mockImplementation(() => {
        callCount++;
        return [{ sendMessage: callCount === 1 ? sendMessage1 : sendMessage2 }];
      }),
    };

    const manager = new NotificationManager(storage);
    manager.setUserPrefsStorage(prefsStorage as any);
    manager.setIntegrationManager(im as any);

    await manager.notify({ type: 'test', title: 'T', body: 'B', level: 'error' });
    await new Promise((r) => setTimeout(r, 50));

    // First pref threw, second pref should still be called
    expect(sendMessage1).toHaveBeenCalled();
    expect(sendMessage2).toHaveBeenCalled();
  });
});

describe('NotificationManager fan-out storage error (Phase 105)', () => {
  it('returns silently when userPrefsStorage.listAll throws', async () => {
    const storage = makeStorage();
    const prefsStorage = { listAll: vi.fn().mockRejectedValue(new Error('db down')) };
    const im = makeIntegrationManager();

    const manager = new NotificationManager(storage);
    manager.setUserPrefsStorage(prefsStorage as any);
    manager.setIntegrationManager(im as any);

    await manager.notify({ type: 'test', title: 'T', body: 'B', level: 'error' });
    await new Promise((r) => setTimeout(r, 10));

    expect(im._sendMessage).not.toHaveBeenCalled();
  });

  it('returns silently when userPrefsStorage is not set', async () => {
    const storage = makeStorage();
    const im = makeIntegrationManager();

    const manager = new NotificationManager(storage);
    // Only set integrationManager, not userPrefsStorage
    manager.setIntegrationManager(im as any);

    await expect(
      manager.notify({ type: 'test', title: 'T', body: 'B', level: 'error' })
    ).resolves.toBeDefined();
    await new Promise((r) => setTimeout(r, 10));

    expect(im._sendMessage).not.toHaveBeenCalled();
  });

  it('skips pref when getAdapter returns null (integrationId set but adapter missing)', async () => {
    const storage = makeStorage();
    const prefs = [makePref({ integrationId: 'missing-integ' })];
    const prefsStorage = makePrefsStorage(prefs);
    const im = {
      getAdapter: vi.fn().mockReturnValue(null),
      getAdaptersByPlatform: vi.fn().mockReturnValue([]),
    };

    const manager = new NotificationManager(storage);
    manager.setUserPrefsStorage(prefsStorage as any);
    manager.setIntegrationManager(im as any);

    await manager.notify({ type: 'test', title: 'T', body: 'B', level: 'error' });
    await new Promise((r) => setTimeout(r, 10));

    expect(im.getAdapter).toHaveBeenCalledWith('missing-integ');
  });
});

// ─── Phase 55: Cleanup job tests ─────────────────────────────────────────────

describe('NotificationManager cleanup job (Phase 55)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls deleteOlderThan immediately when started', async () => {
    const storage = makeStorage();
    const manager = new NotificationManager(storage);

    manager.startCleanupJob(30);
    await Promise.resolve();

    expect(storage.deleteOlderThan).toHaveBeenCalledOnce();
    const [maxAgeMs] = (storage.deleteOlderThan as any).mock.calls[0] as number[];
    expect(maxAgeMs).toBe(30 * 24 * 60 * 60 * 1000);

    manager.stopCleanupJob();
  });

  it('calls deleteOlderThan again after 24 hours', async () => {
    const storage = makeStorage();
    const manager = new NotificationManager(storage);

    manager.startCleanupJob(7);
    await Promise.resolve();

    vi.advanceTimersByTime(86_400_000);
    await Promise.resolve();

    expect(storage.deleteOlderThan).toHaveBeenCalledTimes(2);

    manager.stopCleanupJob();
  });

  it('stopCleanupJob prevents further calls', async () => {
    const storage = makeStorage();
    const manager = new NotificationManager(storage);

    manager.startCleanupJob(30);
    await Promise.resolve();

    manager.stopCleanupJob();
    vi.advanceTimersByTime(86_400_000 * 5);
    await Promise.resolve();

    expect(storage.deleteOlderThan).toHaveBeenCalledTimes(1);
  });
});
