/**
 * AlertManager Tests (Phase 83)
 *
 * Unit tests — no DB required (storage is mocked).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlertManager, resolvePath, compareOperator } from './alert-manager.js';
import type { AlertRule, AlertChannel } from './alert-storage.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000;

function makeRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 'rule-1',
    name: 'Test Rule',
    metricPath: 'security.rateLimitHitsTotal',
    operator: 'gt',
    threshold: 10,
    channels: [],
    enabled: true,
    cooldownSeconds: 300,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeStorage(rules: AlertRule[] = []) {
  return {
    createRule: vi
      .fn()
      .mockImplementation(async (d) => ({ id: 'new-id', ...d, createdAt: NOW, updatedAt: NOW })),
    getRule: vi.fn().mockImplementation(async (id) => rules.find((r) => r.id === id) ?? null),
    updateRule: vi.fn().mockImplementation(async (id, patch) => {
      const r = rules.find((x) => x.id === id);
      return r ? { ...r, ...patch } : null;
    }),
    deleteRule: vi.fn().mockResolvedValue(true),
    listRules: vi
      .fn()
      .mockImplementation(async (onlyEnabled?: boolean) =>
        onlyEnabled ? rules.filter((r) => r.enabled) : rules
      ),
    markFired: vi.fn().mockResolvedValue(undefined),
  };
}

function makeNotificationManager() {
  return {
    notify: vi.fn().mockResolvedValue({ id: 'notif-1' }),
  };
}

function makeLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
}

// ── resolvePath ──────────────────────────────────────────────────────────────

describe('resolvePath', () => {
  const obj = { security: { rateLimitHitsTotal: 42, nested: { deep: 7 } }, timestamp: 100 };

  it('resolves top-level keys', () => {
    expect(resolvePath(obj, 'timestamp')).toBe(100);
  });

  it('resolves nested dot-notation', () => {
    expect(resolvePath(obj, 'security.rateLimitHitsTotal')).toBe(42);
    expect(resolvePath(obj, 'security.nested.deep')).toBe(7);
  });

  it('returns undefined for missing keys', () => {
    expect(resolvePath(obj, 'security.unknown')).toBeUndefined();
    expect(resolvePath(obj, 'missing')).toBeUndefined();
  });
});

// ── compareOperator ──────────────────────────────────────────────────────────

describe('compareOperator', () => {
  it('gt', () => {
    expect(compareOperator(11, 'gt', 10)).toBe(true);
    expect(compareOperator(10, 'gt', 10)).toBe(false);
  });
  it('lt', () => {
    expect(compareOperator(9, 'lt', 10)).toBe(true);
    expect(compareOperator(10, 'lt', 10)).toBe(false);
  });
  it('gte', () => {
    expect(compareOperator(10, 'gte', 10)).toBe(true);
    expect(compareOperator(9, 'gte', 10)).toBe(false);
  });
  it('lte', () => {
    expect(compareOperator(10, 'lte', 10)).toBe(true);
    expect(compareOperator(11, 'lte', 10)).toBe(false);
  });
  it('eq', () => {
    expect(compareOperator(10, 'eq', 10)).toBe(true);
    expect(compareOperator(11, 'eq', 10)).toBe(false);
  });
});

// ── AlertManager.evaluate ────────────────────────────────────────────────────

describe('AlertManager.evaluate', () => {
  let storage: ReturnType<typeof makeStorage>;
  let notif: ReturnType<typeof makeNotificationManager>;
  let logger: ReturnType<typeof makeLogger>;
  let manager: AlertManager;

  beforeEach(() => {
    storage = makeStorage([makeRule()]);
    notif = makeNotificationManager();
    logger = makeLogger();
    manager = new AlertManager(storage as any, notif as any, logger as any);
  });

  it('does nothing when no enabled rules', async () => {
    storage.listRules.mockResolvedValue([]);
    await manager.evaluate({ security: { rateLimitHitsTotal: 100 } });
    expect(notif.notify).not.toHaveBeenCalled();
  });

  it('fires when threshold crossed', async () => {
    storage.listRules.mockResolvedValue([makeRule({ threshold: 10 })]);
    await manager.evaluate({ security: { rateLimitHitsTotal: 11 } });
    expect(notif.notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'alert', level: 'error' })
    );
    expect(storage.markFired).toHaveBeenCalled();
  });

  it('does not fire when threshold not crossed', async () => {
    storage.listRules.mockResolvedValue([makeRule({ threshold: 10, operator: 'gt' })]);
    await manager.evaluate({ security: { rateLimitHitsTotal: 5 } });
    expect(notif.notify).not.toHaveBeenCalled();
  });

  it('does not fire when disabled', async () => {
    storage.listRules.mockResolvedValue([makeRule({ enabled: false })]);
    await manager.evaluate({ security: { rateLimitHitsTotal: 100 } });
    expect(notif.notify).not.toHaveBeenCalled();
  });

  it('respects cooldown window', async () => {
    const recentFire = Date.now() - 60_000; // 60s ago, cooldown=300s
    storage.listRules.mockResolvedValue([
      makeRule({ lastFiredAt: recentFire, cooldownSeconds: 300 }),
    ]);
    await manager.evaluate({ security: { rateLimitHitsTotal: 100 } });
    expect(notif.notify).not.toHaveBeenCalled();
  });

  it('fires after cooldown has elapsed', async () => {
    const oldFire = Date.now() - 400_000; // 400s ago > 300s cooldown
    storage.listRules.mockResolvedValue([makeRule({ lastFiredAt: oldFire, cooldownSeconds: 300 })]);
    await manager.evaluate({ security: { rateLimitHitsTotal: 100 } });
    expect(notif.notify).toHaveBeenCalled();
  });

  it('skips rule when metric path not found in snapshot', async () => {
    storage.listRules.mockResolvedValue([makeRule({ metricPath: 'nonexistent.path' })]);
    await manager.evaluate({ security: { rateLimitHitsTotal: 100 } });
    expect(notif.notify).not.toHaveBeenCalled();
  });
});

// ── AlertManager.testRule ────────────────────────────────────────────────────

describe('AlertManager.testRule', () => {
  it('returns fired=true when threshold crossed (ignores cooldown)', async () => {
    const recentFire = Date.now() - 60_000; // would block normal evaluate
    const storage = makeStorage([makeRule({ lastFiredAt: recentFire, threshold: 5 })]);
    const notif = makeNotificationManager();
    const manager = new AlertManager(storage as any, notif as any, makeLogger() as any);

    const result = await manager.testRule('rule-1', { security: { rateLimitHitsTotal: 10 } });
    expect(result.fired).toBe(true);
    expect(result.value).toBe(10);
  });

  it('returns fired=false when threshold not crossed', async () => {
    const storage = makeStorage([makeRule({ threshold: 100 })]);
    const notif = makeNotificationManager();
    const manager = new AlertManager(storage as any, notif as any, makeLogger() as any);

    const result = await manager.testRule('rule-1', { security: { rateLimitHitsTotal: 5 } });
    expect(result.fired).toBe(false);
    expect(result.value).toBe(5);
  });

  it('returns fired=false with value=null when path missing', async () => {
    const storage = makeStorage([makeRule({ metricPath: 'missing.path' })]);
    const notif = makeNotificationManager();
    const manager = new AlertManager(storage as any, notif as any, makeLogger() as any);

    const result = await manager.testRule('rule-1', { security: {} });
    expect(result.fired).toBe(false);
    expect(result.value).toBeNull();
  });

  it('throws when rule not found', async () => {
    const storage = makeStorage([]);
    const notif = makeNotificationManager();
    const manager = new AlertManager(storage as any, notif as any, makeLogger() as any);

    await expect(manager.testRule('nonexistent', {})).rejects.toThrow('Alert rule not found');
  });
});

// ── AlertManager._dispatchChannel ────────────────────────────────────────────

describe('AlertManager channel dispatch', () => {
  it('calls slack webhook with correct text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const rule = makeRule({ channels: [{ type: 'slack', url: 'https://hooks.slack.com/x' }] });
    const storage = makeStorage([rule]);
    const notif = makeNotificationManager();
    const manager = new AlertManager(storage as any, notif as any, makeLogger() as any);

    await manager.evaluate({ security: { rateLimitHitsTotal: 100 } });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://hooks.slack.com/x',
      expect.objectContaining({ method: 'POST' })
    );
    vi.unstubAllGlobals();
  });

  it('does not throw when fetch fails (fire-and-forget)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const rule = makeRule({ channels: [{ type: 'webhook', url: 'https://example.com/hook' }] });
    const storage = makeStorage([rule]);
    const notif = makeNotificationManager();
    const manager = new AlertManager(storage as any, notif as any, makeLogger() as any);

    await expect(
      manager.evaluate({ security: { rateLimitHitsTotal: 100 } })
    ).resolves.not.toThrow();
    vi.unstubAllGlobals();
  });
});
