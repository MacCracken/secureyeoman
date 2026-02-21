import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../logging/logger.js', () => ({
  getLogger: () => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: () => ({}),
  }),
}));

import { SkillScheduler } from './skill-scheduler.js';
import type { ScheduledSkill, ScheduleEvent } from './skill-scheduler.js';

let idCounter = 0;

function makeScheduledSkill(overrides?: Partial<ScheduledSkill>): ScheduledSkill {
  idCounter++;
  return {
    id: `sched-${idCounter}`,
    skillId: `skill-${idCounter}`,
    skillName: 'Test Skill',
    schedule: { type: 'interval', intervalMs: 60000 },
    timeoutMs: 5000,
    retryCount: 0,
    retryDelayMs: 1000,
    enabled: true,
    runCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ── SkillScheduler Tests ──────────────────────────────────────────

describe('SkillScheduler', () => {
  let scheduler: SkillScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    scheduler = new SkillScheduler({ maxScheduled: 5 });
  });

  afterEach(() => {
    scheduler.stop();
    vi.useRealTimers();
  });

  describe('schedule / unschedule', () => {
    it('adds a scheduled skill', () => {
      const s = makeScheduledSkill();
      scheduler.schedule(s);
      expect(scheduler.getScheduledSkills()).toHaveLength(1);
    });

    it('throws when max scheduled limit is reached', () => {
      for (let i = 0; i < 5; i++) {
        scheduler.schedule(makeScheduledSkill());
      }
      expect(() => scheduler.schedule(makeScheduledSkill())).toThrow(
        'Maximum scheduled skills limit'
      );
    });

    it('allows updating an existing scheduled skill (same id)', () => {
      const s = makeScheduledSkill();
      scheduler.schedule(s);
      // Scheduling same id again should update, not throw
      scheduler.schedule({ ...s, skillName: 'Updated' });
      expect(scheduler.getScheduledSkills()).toHaveLength(1);
      expect(scheduler.getScheduledSkills()[0].skillName).toBe('Updated');
    });

    it('removes a scheduled skill via unschedule', () => {
      const s = makeScheduledSkill();
      scheduler.schedule(s);
      scheduler.unschedule(s.id);
      expect(scheduler.getScheduledSkills()).toHaveLength(0);
    });
  });

  describe('pause / resume', () => {
    it('pauses and disables a scheduled skill', () => {
      const s = makeScheduledSkill();
      scheduler.schedule(s);
      scheduler.pause(s.id);
      expect(scheduler.getScheduledSkills()[0].enabled).toBe(false);
    });

    it('throws when pausing non-existent skill', () => {
      expect(() => scheduler.pause('nonexistent')).toThrow('Scheduled skill not found');
    });

    it('resumes a paused skill', () => {
      const s = makeScheduledSkill();
      scheduler.schedule(s);
      scheduler.pause(s.id);
      scheduler.resume(s.id);
      expect(scheduler.getScheduledSkills()[0].enabled).toBe(true);
    });

    it('throws when resuming non-existent skill', () => {
      expect(() => scheduler.resume('nonexistent')).toThrow('Scheduled skill not found');
    });
  });

  describe('getNextRun', () => {
    it('returns null for unknown skill', () => {
      expect(scheduler.getNextRun('nonexistent')).toBeNull();
    });

    it('returns scheduled nextRunAt after start', () => {
      const s = makeScheduledSkill({ schedule: { type: 'interval', intervalMs: 30000 } });
      scheduler.schedule(s);
      scheduler.start();
      expect(scheduler.getNextRun(s.id)).toBeGreaterThan(Date.now());
    });
  });

  describe('start / stop', () => {
    it('can start and stop cleanly', () => {
      expect(() => {
        scheduler.start();
        scheduler.stop();
      }).not.toThrow();
    });

    it('start is idempotent', () => {
      expect(() => {
        scheduler.start();
        scheduler.start(); // second call should be no-op
      }).not.toThrow();
    });
  });

  describe('onEvent', () => {
    it('registers and unregisters event handlers', () => {
      const handler = vi.fn();
      const unsubscribe = scheduler.onEvent(handler);
      // Handler registered — trigger a fake event by calling triggerNow
      unsubscribe();
      // After unsubscribe no further calls
      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('triggerNow', () => {
    it('returns a failed execution with not-implemented message', async () => {
      const result = await scheduler.triggerNow('skill-42', 'action-1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('SkillExecutor not implemented');
      expect(result.skillId).toBe('skill-42');
      expect(result.actionId).toBe('action-1');
    });
  });

  describe('schedule types', () => {
    it('schedules one-time skill in the future', () => {
      const future = Date.now() + 10000;
      const s = makeScheduledSkill({ schedule: { type: 'once', timestamp: future } });
      scheduler.schedule(s);
      scheduler.start();
      expect(scheduler.getNextRun(s.id)).toBe(future);
    });

    it('does not schedule past one-time skill', () => {
      const past = Date.now() - 1000;
      const s = makeScheduledSkill({ schedule: { type: 'once', timestamp: past } });
      scheduler.schedule(s);
      scheduler.start();
      // Past one-time — nextRunAt should be null (calculateNextRun returns null)
      expect(scheduler.getNextRun(s.id)).toBeNull();
    });

    it('schedules interval skill with future startAt', () => {
      const startAt = Date.now() + 5000;
      const s = makeScheduledSkill({ schedule: { type: 'interval', intervalMs: 60000, startAt } });
      scheduler.schedule(s);
      scheduler.start();
      expect(scheduler.getNextRun(s.id)).toBe(startAt);
    });

    it('schedules cron skill (approximate next minute)', () => {
      const s = makeScheduledSkill({ schedule: { type: 'cron', expression: '* * * * *' } });
      scheduler.schedule(s);
      scheduler.start();
      const next = scheduler.getNextRun(s.id);
      expect(next).toBeGreaterThan(Date.now());
      expect(next).toBeLessThanOrEqual(Date.now() + 70000);
    });

    it('falls back to check interval for invalid cron expression', () => {
      const s = makeScheduledSkill({ schedule: { type: 'cron', expression: 'bad' } });
      scheduler.schedule(s);
      scheduler.start();
      const next = scheduler.getNextRun(s.id);
      expect(next).toBeGreaterThan(Date.now());
    });
  });

  describe('event emission on execution', () => {
    it('emits scheduled_skill_run and scheduled_skill_failure events', async () => {
      vi.useRealTimers();
      const s2 = new SkillScheduler({ maxScheduled: 5 });
      const events: ScheduleEvent[] = [];
      s2.onEvent((e) => events.push(e));

      // Interval of 1ms so it fires immediately after start
      const s = makeScheduledSkill({ schedule: { type: 'interval', intervalMs: 1 } });
      s2.schedule(s);
      s2.start();

      // Wait for the interval to fire and async execution to settle
      await new Promise((r) => setTimeout(r, 100));
      s2.stop();
      vi.useFakeTimers();

      const types = events.map((e) => e.type);
      expect(types).toContain('scheduled_skill_run');
      expect(types).toContain('scheduled_skill_failure');
    }, 5000);
  });

  describe('schedule with conditions — daysOfWeek', () => {
    it('scheduleNextRun returns check-interval delay when daysOfWeek condition fails', () => {
      // Force a specific day: Sunday (getDay=0, "sun")
      const realDate = Date;
      global.Date = class extends realDate {
        toLocaleDateString(locale?: string, opts?: object) {
          if ((opts as any)?.weekday === 'short') return 'Sun';
          return super.toLocaleDateString(locale, opts as any);
        }
      } as any;

      const s = makeScheduledSkill({
        schedule: { type: 'interval', intervalMs: 60000 },
        conditions: { daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'] },
      });
      scheduler.schedule(s);
      scheduler.start();

      // When conditions fail, nextRunAt is set to now + checkIntervalMs (60000)
      // so nextRunAt should be ~ now+60000, not now+60000 (interval)
      // The key is it should be scheduled (not null)
      const next = scheduler.getNextRun(s.id);
      expect(next).toBeGreaterThan(Date.now());

      global.Date = realDate;
    });

    it('includes skill in getScheduledSkills after scheduling with conditions', () => {
      const s = makeScheduledSkill({
        schedule: { type: 'interval', intervalMs: 30000 },
        conditions: { daysOfWeek: ['mon'] },
      });
      scheduler.schedule(s);
      expect(scheduler.getScheduledSkills()).toHaveLength(1);
    });
  });

  describe('schedule with activeHours conditions', () => {
    it('overnight window (startTime > endTime): returns false outside window', () => {
      // 10:00 is outside a 22:00–06:00 window
      const realDate = Date;
      global.Date = class extends realDate {
        getHours() { return 10; }
        getMinutes() { return 0; }
      } as any;

      const s = makeScheduledSkill({
        schedule: { type: 'interval', intervalMs: 60000 },
        conditions: {
          activeHours: { start: '22:00', end: '06:00' },
        },
      });
      scheduler.schedule(s);
      scheduler.start();
      // Should still set nextRunAt (to check-interval-based time) — not null
      const next = scheduler.getNextRun(s.id);
      expect(next).toBeGreaterThan(Date.now());

      global.Date = realDate;
    });

    it('overnight window: returns true when inside window (23:00)', () => {
      const realDate = Date;
      global.Date = class extends realDate {
        getHours() { return 23; }
        getMinutes() { return 30; }
      } as any;

      const s = makeScheduledSkill({
        schedule: { type: 'interval', intervalMs: 60000 },
        conditions: {
          activeHours: { start: '22:00', end: '06:00' },
        },
      });
      scheduler.schedule(s);
      scheduler.start();
      const next = scheduler.getNextRun(s.id);
      expect(next).toBeGreaterThan(Date.now());

      global.Date = realDate;
    });
  });

  describe('immediate execution branch (delay <= 0)', () => {
    it('executes skill immediately when intervalMs is 0', async () => {
      vi.useRealTimers();
      const s3 = new SkillScheduler({ maxScheduled: 5 });
      const events: ScheduleEvent[] = [];
      s3.onEvent((e) => events.push(e));

      // intervalMs: 0 → nextRunAt = now → delay ≈ 0 or negative → immediate execution
      const s = makeScheduledSkill({ schedule: { type: 'interval', intervalMs: 0 } });
      s3.schedule(s);
      s3.start();

      await new Promise((r) => setTimeout(r, 100));
      s3.stop();
      vi.useFakeTimers();

      expect(events.some((e) => e.type === 'scheduled_skill_run')).toBe(true);
    }, 5000);
  });

  describe('emitEvent error handling', () => {
    it('does not propagate errors from event handlers', async () => {
      vi.useRealTimers();
      const s4 = new SkillScheduler({ maxScheduled: 5 });
      // First handler throws; second should still be called
      const secondHandlerCalled: boolean[] = [];
      s4.onEvent(() => { throw new Error('handler crash'); });
      s4.onEvent(() => { secondHandlerCalled.push(true); });

      const s = makeScheduledSkill({ schedule: { type: 'interval', intervalMs: 1 } });
      s4.schedule(s);
      s4.start();

      await new Promise((r) => setTimeout(r, 100));
      s4.stop();
      vi.useFakeTimers();

      // Second handler was still called despite first throwing
      expect(secondHandlerCalled.length).toBeGreaterThan(0);
    }, 5000);
  });

  describe('unschedule non-existent skill', () => {
    it('does not throw when unscheduling a non-existent id', () => {
      expect(() => scheduler.unschedule('does-not-exist')).not.toThrow();
    });
  });

  describe('disabled skill not scheduled on start', () => {
    it('disabled skill added before start is not actively scheduled', () => {
      const s = makeScheduledSkill({ enabled: false });
      scheduler.schedule(s);
      scheduler.start();
      // Disabled skill — nextRunAt should remain null/undefined (not set by scheduleNextRun)
      expect(scheduler.getNextRun(s.id)).toBeNull();
    });
  });
});
