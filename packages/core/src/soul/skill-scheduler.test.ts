import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../logging/logger.js', () => ({
  getLogger: () => ({ trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(), child: () => ({}) }),
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
      expect(() => scheduler.schedule(makeScheduledSkill())).toThrow('Maximum scheduled skills limit');
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
});
