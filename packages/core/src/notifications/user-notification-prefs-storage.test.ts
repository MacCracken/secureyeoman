/**
 * UserNotificationPrefsStorage Tests — Phase 55
 *
 * Unit tests using mocked PgBaseStorage methods.
 * No database required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserNotificationPrefsStorage, type UserNotificationPref } from './user-notification-prefs-storage.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000;

function makeRow(
  overrides: Partial<{
    id: string;
    user_id: string;
    channel: string;
    integration_id: string | null;
    chat_id: string;
    enabled: boolean;
    quiet_hours_start: number | null;
    quiet_hours_end: number | null;
    min_level: string;
    created_at: number;
    updated_at: number;
  }> = {}
) {
  return {
    id: 'pref-1',
    user_id: 'user-1',
    channel: 'telegram',
    integration_id: null,
    chat_id: '-100123456789',
    enabled: true,
    quiet_hours_start: null,
    quiet_hours_end: null,
    min_level: 'info',
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('UserNotificationPrefsStorage.list()', () => {
  it('returns prefs for the given userId', async () => {
    const storage = new UserNotificationPrefsStorage();
    vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([makeRow()]);

    const result = await storage.list('user-1');

    expect(result).toHaveLength(1);
    expect(result[0]!.userId).toBe('user-1');
    expect(result[0]!.channel).toBe('telegram');
  });

  it('returns empty array when no prefs exist', async () => {
    const storage = new UserNotificationPrefsStorage();
    vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([]);

    const result = await storage.list('user-1');

    expect(result).toEqual([]);
  });
});

describe('UserNotificationPrefsStorage.listAll()', () => {
  it('returns all enabled prefs', async () => {
    const storage = new UserNotificationPrefsStorage();
    const spy = vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([makeRow()]);

    const result = await storage.listAll();

    expect(result).toHaveLength(1);
    expect(spy.mock.calls[0]![0]).toContain('enabled = true');
  });
});

describe('UserNotificationPrefsStorage.get()', () => {
  it('returns the pref when found', async () => {
    const storage = new UserNotificationPrefsStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(makeRow());

    const result = await storage.get('user-1', 'pref-1');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('pref-1');
  });

  it('returns null when not found', async () => {
    const storage = new UserNotificationPrefsStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(null);

    const result = await storage.get('user-1', 'nonexistent');

    expect(result).toBeNull();
  });
});

describe('UserNotificationPrefsStorage.upsert()', () => {
  it('inserts/upserts a pref and returns mapped result', async () => {
    const storage = new UserNotificationPrefsStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(makeRow());

    const result = await storage.upsert('user-1', {
      channel: 'telegram',
      chatId: '-100123456789',
      integrationId: null,
      enabled: true,
      quietHoursStart: null,
      quietHoursEnd: null,
      minLevel: 'info',
    });

    expect(result.id).toBe('pref-1');
    expect(result.channel).toBe('telegram');
    expect(result.enabled).toBe(true);
  });

  it('passes all fields to the INSERT query', async () => {
    const storage = new UserNotificationPrefsStorage();
    const spy = vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(
      makeRow({ channel: 'slack', chat_id: '#alerts', quiet_hours_start: 22, quiet_hours_end: 8 })
    );

    await storage.upsert('user-1', {
      channel: 'slack',
      chatId: '#alerts',
      integrationId: 'integ-123',
      enabled: true,
      quietHoursStart: 22,
      quietHoursEnd: 8,
      minLevel: 'warn',
    });

    const params = spy.mock.calls[0]![1] as unknown[];
    expect(params[2]).toBe('slack');
    expect(params[3]).toBe('integ-123');
    expect(params[4]).toBe('#alerts');
    expect(params[6]).toBe(22);
    expect(params[7]).toBe(8);
    expect(params[8]).toBe('warn');
  });
});

describe('UserNotificationPrefsStorage.update()', () => {
  it('merges patch into current and returns updated pref', async () => {
    const storage = new UserNotificationPrefsStorage();
    // First queryOne returns current row (for get()), second returns updated row
    vi.spyOn(storage as any, 'queryOne')
      .mockResolvedValueOnce(makeRow())
      .mockResolvedValueOnce(makeRow({ enabled: false }));

    const result = await storage.update('user-1', 'pref-1', { enabled: false });

    expect(result).not.toBeNull();
    expect(result!.enabled).toBe(false);
  });

  it('returns null when pref does not belong to user', async () => {
    const storage = new UserNotificationPrefsStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(null);

    const result = await storage.update('user-1', 'nonexistent', { enabled: false });

    expect(result).toBeNull();
  });
});

describe('UserNotificationPrefsStorage.delete()', () => {
  it('returns true when deleted', async () => {
    const storage = new UserNotificationPrefsStorage();
    vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(1);

    const result = await storage.delete('user-1', 'pref-1');

    expect(result).toBe(true);
  });

  it('returns false when not found', async () => {
    const storage = new UserNotificationPrefsStorage();
    vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(0);

    const result = await storage.delete('user-1', 'nonexistent');

    expect(result).toBe(false);
  });
});

describe('row mapping', () => {
  it('maps camelCase fields from snake_case row', async () => {
    const storage = new UserNotificationPrefsStorage();
    vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([
      makeRow({ integration_id: 'integ-abc', quiet_hours_start: 22, quiet_hours_end: 8, min_level: 'error' }),
    ]);

    const [pref] = await storage.list('user-1');

    expect(pref!.integrationId).toBe('integ-abc');
    expect(pref!.quietHoursStart).toBe(22);
    expect(pref!.quietHoursEnd).toBe(8);
    expect(pref!.minLevel).toBe('error');
  });

  it('converts string timestamps to numbers', async () => {
    const storage = new UserNotificationPrefsStorage();
    vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([
      makeRow({ created_at: '1700000000000' as any, updated_at: '1700000001000' as any }),
    ]);

    const [pref] = await storage.list('user-1');

    expect(typeof pref!.createdAt).toBe('number');
    expect(typeof pref!.updatedAt).toBe('number');
  });
});
