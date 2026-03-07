import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MemoryAuditScheduler } from './scheduler.js';
import type { MemoryAuditReport } from '@secureyeoman/shared';

// ── Helpers ──────────────────────────────────────────────────

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  child: vi.fn(() => mockLogger),
  level: 'info',
};

function makeReport(overrides: Partial<MemoryAuditReport> = {}): MemoryAuditReport {
  return {
    id: `report-${Math.random().toString(36).slice(2, 8)}`,
    tenantId: 'default',
    personalityId: null,
    scope: 'daily',
    startedAt: Date.now(),
    completedAt: Date.now(),
    preSnapshot: null,
    postSnapshot: null,
    compressionSummary: null,
    reorganizationSummary: null,
    maintenanceSummary: null,
    status: 'completed',
    approvedBy: null,
    approvedAt: null,
    error: null,
    ...overrides,
  };
}

function makeMocks() {
  const brainStorage = {
    getMeta: vi.fn().mockResolvedValue(null),
    setMeta: vi.fn().mockResolvedValue(undefined),
  };

  const engine = {
    runAudit: vi.fn().mockResolvedValue(makeReport()),
  };

  const policy = {
    isEnabled: vi.fn().mockReturnValue(true),
    getSchedule: vi.fn().mockImplementation((scope: string) => {
      switch (scope) {
        case 'daily':
          return '30 3 * * *';
        case 'weekly':
          return '0 4 * * 0';
        case 'monthly':
          return '0 5 1 * *';
        default:
          return '* * * * *';
      }
    }),
    isCompressionEnabled: vi.fn().mockReturnValue(true),
    isReorganizationEnabled: vi.fn().mockReturnValue(true),
    requiresApproval: vi.fn().mockReturnValue(false),
  };

  return { brainStorage, engine, policy };
}

function makeScheduler(mocks: ReturnType<typeof makeMocks>) {
  return new MemoryAuditScheduler({
    brainStorage: mocks.brainStorage as never,
    engine: mocks.engine as never,
    policy: mocks.policy as never,
    logger: mockLogger as never,
  });
}

// ── Tests ────────────────────────────────────────────────────

describe('MemoryAuditScheduler', () => {
  let mocks: ReturnType<typeof makeMocks>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks = makeMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Constructor ────────────────────────────────────────────

  it('initializes schedules from policy defaults', () => {
    const scheduler = makeScheduler(mocks);
    const schedules = scheduler.getSchedules();
    expect(schedules.daily).toBe('30 3 * * *');
    expect(schedules.weekly).toBe('0 4 * * 0');
    expect(schedules.monthly).toBe('0 5 1 * *');
  });

  it('calls policy.getSchedule for each scope during construction', () => {
    makeScheduler(mocks);
    expect(mocks.policy.getSchedule).toHaveBeenCalledWith('daily');
    expect(mocks.policy.getSchedule).toHaveBeenCalledWith('weekly');
    expect(mocks.policy.getSchedule).toHaveBeenCalledWith('monthly');
  });

  // ── start / stop ───────────────────────────────────────────

  it('start() begins interval and logs', () => {
    const scheduler = makeScheduler(mocks);
    scheduler.start();

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ schedules: expect.any(String) }),
      'Memory audit scheduler started'
    );

    scheduler.stop();
  });

  it('stop() clears the interval and logs', () => {
    const scheduler = makeScheduler(mocks);
    scheduler.start();
    scheduler.stop();

    expect(mockLogger.info).toHaveBeenCalledWith('Memory audit scheduler stopped');
  });

  it('start() is idempotent — calling twice does not create duplicate intervals', () => {
    const scheduler = makeScheduler(mocks);
    scheduler.start();
    scheduler.start(); // second call should be no-op

    // Only one 'started' log
    const startedCalls = mockLogger.info.mock.calls.filter(
      (c: unknown[]) => c[1] === 'Memory audit scheduler started'
    );
    expect(startedCalls).toHaveLength(1);

    scheduler.stop();
  });

  it('stop() is safe to call when not started', () => {
    const scheduler = makeScheduler(mocks);
    // Should not throw
    scheduler.stop();
  });

  // ── Policy disabled ────────────────────────────────────────

  it('does not start if policy is disabled', () => {
    mocks.policy.isEnabled.mockReturnValue(false);
    const scheduler = makeScheduler(mocks);
    scheduler.start();

    expect(mockLogger.info).toHaveBeenCalledWith('Memory audit scheduler disabled by policy');

    // Advance time — should not trigger any audits
    vi.advanceTimersByTime(120_000);
    expect(mocks.engine.runAudit).not.toHaveBeenCalled();
  });

  // ── getSchedules ───────────────────────────────────────────

  it('getSchedules() returns a copy of current schedules', () => {
    const scheduler = makeScheduler(mocks);
    const s1 = scheduler.getSchedules();
    const s2 = scheduler.getSchedules();
    expect(s1).toEqual(s2);
    // Should be separate objects (not the same reference)
    expect(s1).not.toBe(s2);
  });

  // ── setSchedule ────────────────────────────────────────────

  it('setSchedule() updates the schedule for a scope', async () => {
    const scheduler = makeScheduler(mocks);
    await scheduler.setSchedule('daily', '0 2 * * *');
    expect(scheduler.getSchedules().daily).toBe('0 2 * * *');
  });

  it('setSchedule() persists to brainStorage', async () => {
    const scheduler = makeScheduler(mocks);
    await scheduler.setSchedule('weekly', '0 6 * * 1');
    expect(mocks.brainStorage.setMeta).toHaveBeenCalledWith('audit:schedule:weekly', '0 6 * * 1');
  });

  it('setSchedule() logs the update', async () => {
    const scheduler = makeScheduler(mocks);
    await scheduler.setSchedule('monthly', '0 1 15 * *');
    expect(mockLogger.info).toHaveBeenCalledWith(
{
      scope: 'monthly',
      cron: '0 1 15 * *',
    },
'Audit schedule updated'
);
  });

  // ── runManualAudit ─────────────────────────────────────────

  it('runManualAudit() delegates to engine.runAudit', async () => {
    const scheduler = makeScheduler(mocks);
    await scheduler.runManualAudit('daily', 'soul-1');
    expect(mocks.engine.runAudit).toHaveBeenCalledWith('daily', 'soul-1');
  });

  it('runManualAudit() stores result in history', async () => {
    const report = makeReport({ id: 'manual-1' });
    mocks.engine.runAudit.mockResolvedValue(report);

    const scheduler = makeScheduler(mocks);
    await scheduler.runManualAudit('daily');
    const history = scheduler.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0]!.id).toBe('manual-1');
  });

  it('runManualAudit() logs the trigger', async () => {
    const scheduler = makeScheduler(mocks);
    await scheduler.runManualAudit('weekly', 'soul-7');
    expect(mockLogger.info).toHaveBeenCalledWith(
{
      scope: 'weekly',
      personalityId: 'soul-7',
    },
'Manual audit triggered'
);
  });

  // ── History ────────────────────────────────────────────────

  it('getHistory() returns empty array initially', () => {
    const scheduler = makeScheduler(mocks);
    expect(scheduler.getHistory()).toEqual([]);
  });

  it('getHistory() returns a copy (not the internal array)', async () => {
    const scheduler = makeScheduler(mocks);
    await scheduler.runManualAudit('daily');
    const h1 = scheduler.getHistory();
    const h2 = scheduler.getHistory();
    expect(h1).not.toBe(h2);
  });

  it('history is limited to 50 entries', async () => {
    const scheduler = makeScheduler(mocks);
    for (let i = 0; i < 55; i++) {
      mocks.engine.runAudit.mockResolvedValue(makeReport({ id: `r-${i}` }));
      await scheduler.runManualAudit('daily');
    }
    const history = scheduler.getHistory();
    expect(history).toHaveLength(50);
    // Most recent should be first
    expect(history[0]!.id).toBe('r-54');
  });

  // ── Cron matching (via scheduled audits) ───────────────────

  it('cron exact match fires a scheduled audit', async () => {
    // Set schedule to match: minute=0, hour=3, any day/month/dow
    mocks.policy.getSchedule.mockImplementation((scope: string) => {
      if (scope === 'daily') return '0 3 * * *';
      return '0 0 31 12 6'; // won't match
    });
    // Lock acquisition returns true (no lock held)
    mocks.brainStorage.getMeta.mockResolvedValue(null);

    // Set time to 02:59:00 so that after 60s advance, it's 03:00:00
    vi.setSystemTime(new Date(2026, 2, 3, 2, 59, 0));

    const scheduler = makeScheduler(mocks);
    scheduler.start();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(mocks.engine.runAudit).toHaveBeenCalledWith('daily');
    scheduler.stop();
  });

  it('cron wildcard match fires correctly', async () => {
    // Match every minute at any time
    mocks.policy.getSchedule.mockImplementation((scope: string) => {
      if (scope === 'daily') return '* * * * *';
      return '0 0 31 12 6';
    });
    mocks.brainStorage.getMeta.mockResolvedValue(null);

    const scheduler = makeScheduler(mocks);
    scheduler.start();

    vi.setSystemTime(new Date(2026, 2, 3, 10, 15, 0));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mocks.engine.runAudit).toHaveBeenCalled();
    scheduler.stop();
  });

  it('cron no match does not fire', async () => {
    // Set all schedules to something that won't match
    mocks.policy.getSchedule.mockReturnValue('0 0 31 12 6');

    const scheduler = makeScheduler(mocks);
    scheduler.start();

    vi.setSystemTime(new Date(2026, 2, 3, 10, 15, 0)); // March 3 is not Dec 31
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mocks.engine.runAudit).not.toHaveBeenCalled();
    scheduler.stop();
  });

  // ── Lock management ────────────────────────────────────────

  it('acquires lock before running scheduled audit', async () => {
    mocks.policy.getSchedule.mockImplementation((scope: string) => {
      if (scope === 'daily') return '* * * * *';
      return '0 0 31 12 6';
    });
    mocks.brainStorage.getMeta.mockResolvedValue(null);

    const scheduler = makeScheduler(mocks);
    scheduler.start();

    vi.setSystemTime(new Date(2026, 2, 3, 10, 15, 0));
    await vi.advanceTimersByTimeAsync(60_000);

    // Should have tried to read lock
    expect(mocks.brainStorage.getMeta).toHaveBeenCalledWith('audit:lock');
    // Should have set the lock
    expect(mocks.brainStorage.setMeta).toHaveBeenCalledWith('audit:lock', expect.any(String));
    scheduler.stop();
  });

  it('releases lock after scheduled audit completes', async () => {
    mocks.policy.getSchedule.mockImplementation((scope: string) => {
      if (scope === 'daily') return '* * * * *';
      return '0 0 31 12 6';
    });
    mocks.brainStorage.getMeta.mockResolvedValue(null);

    const scheduler = makeScheduler(mocks);
    scheduler.start();

    vi.setSystemTime(new Date(2026, 2, 3, 10, 15, 0));
    await vi.advanceTimersByTimeAsync(60_000);

    // Lock release sets to '0'
    expect(mocks.brainStorage.setMeta).toHaveBeenCalledWith('audit:lock', '0');
    scheduler.stop();
  });

  it('skips audit if lock is held by another process', async () => {
    mocks.policy.getSchedule.mockImplementation((scope: string) => {
      if (scope === 'daily') return '* * * * *';
      return '0 0 31 12 6';
    });

    // Set fake time first, then create a lock timestamp within TTL
    vi.setSystemTime(new Date(2026, 2, 3, 10, 15, 0));
    const recentLockTime = String(Date.now());
    // Return lock value only for the lock key, null for schedule keys
    mocks.brainStorage.getMeta.mockImplementation(async (key: string) => {
      if (key === 'audit:lock') return recentLockTime;
      return null;
    });

    const scheduler = makeScheduler(mocks);
    scheduler.start();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(mocks.engine.runAudit).not.toHaveBeenCalled();
    expect(mockLogger.debug).toHaveBeenCalledWith('Audit lock held by another process, skipping');
    scheduler.stop();
  });

  it('acquires lock when existing lock is expired (past TTL)', async () => {
    mocks.policy.getSchedule.mockImplementation((scope: string) => {
      if (scope === 'daily') return '* * * * *';
      return '0 0 31 12 6';
    });

    // Set fake time first, then create an expired lock (15 min ago, TTL is 10 min)
    vi.setSystemTime(new Date(2026, 2, 3, 10, 15, 0));
    const expiredLock = String(Date.now() - 15 * 60 * 1000);
    // Return expired lock only for the lock key, null for schedule keys
    mocks.brainStorage.getMeta.mockImplementation(async (key: string) => {
      if (key === 'audit:lock') return expiredLock;
      return null;
    });

    const scheduler = makeScheduler(mocks);
    scheduler.start();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(mocks.engine.runAudit).toHaveBeenCalled();
    scheduler.stop();
  });

  // ── Load persisted schedules ───────────────────────────────

  it('loads persisted schedules on start', async () => {
    mocks.brainStorage.getMeta.mockImplementation(async (key: string) => {
      if (key === 'audit:schedule:daily') return '15 2 * * *';
      if (key === 'audit:schedule:weekly') return '0 3 * * 1';
      if (key === 'audit:schedule:monthly') return '30 4 15 * *';
      return null;
    });

    const scheduler = makeScheduler(mocks);
    scheduler.start();

    // Wait for loadSchedules to complete (async)
    await vi.advanceTimersByTimeAsync(0);

    const schedules = scheduler.getSchedules();
    expect(schedules.daily).toBe('15 2 * * *');
    expect(schedules.weekly).toBe('0 3 * * 1');
    expect(schedules.monthly).toBe('30 4 15 * *');

    scheduler.stop();
  });

  it('keeps policy defaults when persisted schedule load fails', async () => {
    mocks.brainStorage.getMeta.mockRejectedValue(new Error('db error'));

    const scheduler = makeScheduler(mocks);
    scheduler.start();

    await vi.advanceTimersByTimeAsync(0);

    // Should fall back to policy defaults
    const schedules = scheduler.getSchedules();
    expect(schedules.daily).toBe('30 3 * * *');

    scheduler.stop();
  });
});
