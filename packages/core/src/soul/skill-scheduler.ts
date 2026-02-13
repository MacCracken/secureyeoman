/**
 * Skill Scheduler
 *
 * Schedules and executes skill actions on cron/interval schedules.
 * See ADR 023: Scheduled Skill Execution
 */

import type { Skill, SkillAction } from '@friday/shared';

export interface ScheduledSkill {
  id: string;
  skillId: string;
  skillName: string;
  actionId?: string;

  schedule: CronSchedule | IntervalSchedule | OneTimeSchedule;

  conditions?: ScheduleConditions;

  timeoutMs: number;
  retryCount: number;
  retryDelayMs: number;

  notifications?: SkillNotificationConfig;

  enabled: boolean;
  lastRunAt?: number;
  nextRunAt?: number;
  runCount: number;

  createdAt: number;
  updatedAt: number;
}

export interface CronSchedule {
  type: 'cron';
  expression: string;
  timezone?: string;
}

export interface IntervalSchedule {
  type: 'interval';
  intervalMs: number;
  startAt?: number;
}

export interface OneTimeSchedule {
  type: 'once';
  timestamp: number;
}

export interface ScheduleConditions {
  activeHours?: {
    start: string;
    end: string;
    timezone?: string;
  };
  daysOfWeek?: string[];
  environment?: string[];
  sessionActive?: boolean;
}

export interface SkillNotificationConfig {
  onSuccess?: NotificationConfig;
  onFailure?: NotificationConfig;
  onSkip?: NotificationConfig;
}

export interface NotificationConfig {
  type: 'webhook' | 'log' | 'memory';
  config: Record<string, unknown>;
}

export interface ScheduledSkillExecution {
  scheduledSkillId: string;
  skillId: string;
  actionId?: string;
  startedAt: number;
  completedAt?: number;
  success: boolean;
  result?: unknown;
  error?: string;
}

export type ScheduleEventType =
  | 'scheduled_skill_run'
  | 'scheduled_skill_success'
  | 'scheduled_skill_failure'
  | 'scheduled_skill_skipped';

export interface ScheduleEvent {
  type: ScheduleEventType;
  scheduledSkillId: string;
  skillId: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

type ScheduleEventHandler = (event: ScheduleEvent) => void | Promise<void>;

export class SkillScheduler {
  private scheduledSkills: Map<string, ScheduledSkill> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private eventHandlers: Set<ScheduleEventHandler> = new Set();
  private isRunning = false;
  private checkIntervalMs = 60000;
  private checkTimer?: NodeJS.Timeout;

  constructor(
    private config: {
      maxScheduled?: number;
      defaultTimeoutMs?: number;
      defaultRetryCount?: number;
    } = {}
  ) {
    this.config.maxScheduled ??= 20;
    this.config.defaultTimeoutMs ??= 30000;
    this.config.defaultRetryCount ??= 2;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.scheduleAll();
    this.startCheckTimer();
  }

  stop(): void {
    this.isRunning = false;
    if (this.checkTimer) {
      clearTimeout(this.checkTimer);
      this.checkTimer = undefined;
    }
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  schedule(scheduledSkill: ScheduledSkill): void {
    const maxScheduled = this.config.maxScheduled ?? 20;
    if (this.scheduledSkills.size >= maxScheduled && !this.scheduledSkills.has(scheduledSkill.id)) {
      throw new Error(`Maximum scheduled skills limit (${maxScheduled}) reached`);
    }

    this.scheduledSkills.set(scheduledSkill.id, scheduledSkill);

    if (this.isRunning && scheduledSkill.enabled) {
      this.scheduleNextRun(scheduledSkill);
    }
  }

  unschedule(scheduledSkillId: string): void {
    const timer = this.timers.get(scheduledSkillId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(scheduledSkillId);
    }
    this.scheduledSkills.delete(scheduledSkillId);
  }

  pause(scheduledSkillId: string): void {
    const skill = this.scheduledSkills.get(scheduledSkillId);
    if (!skill) {
      throw new Error('Scheduled skill not found');
    }

    const timer = this.timers.get(scheduledSkillId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(scheduledSkillId);
    }

    skill.enabled = false;
    skill.nextRunAt = undefined;
  }

  resume(scheduledSkillId: string): void {
    const skill = this.scheduledSkills.get(scheduledSkillId);
    if (!skill) {
      throw new Error('Scheduled skill not found');
    }

    skill.enabled = true;
    this.scheduleNextRun(skill);
  }

  getScheduledSkills(): ScheduledSkill[] {
    return Array.from(this.scheduledSkills.values());
  }

  getNextRun(scheduledSkillId: string): number | null {
    const skill = this.scheduledSkills.get(scheduledSkillId);
    return skill?.nextRunAt ?? null;
  }

  onEvent(handler: ScheduleEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  async triggerNow(_skillId: string, _actionId?: string): Promise<ScheduledSkillExecution> {
    return {
      scheduledSkillId: '',
      skillId: _skillId,
      actionId: _actionId,
      startedAt: Date.now(),
      success: false,
      error: 'SkillExecutor not implemented yet',
    };
  }

  private scheduleAll(): void {
    for (const skill of this.scheduledSkills.values()) {
      if (skill.enabled) {
        this.scheduleNextRun(skill);
      }
    }
  }

  private scheduleNextRun(skill: ScheduledSkill): void {
    const nextRunAt = this.calculateNextRun(skill);
    if (!nextRunAt) return;

    skill.nextRunAt = nextRunAt;

    const delay = nextRunAt - Date.now();
    if (delay <= 0) {
      this.executeScheduledSkill(skill);
      return;
    }

    const timer = setTimeout(() => {
      this.executeScheduledSkill(skill);
    }, delay);

    this.timers.set(skill.id, timer);
  }

  private calculateNextRun(skill: ScheduledSkill): number | null {
    const now = Date.now();

    if (!this.checkConditions(skill.conditions)) {
      return now + this.checkIntervalMs;
    }

    switch (skill.schedule.type) {
      case 'cron':
        return this.nextCronRun(skill.schedule.expression, now);
      case 'interval':
        if (skill.schedule.startAt && now < skill.schedule.startAt) {
          return skill.schedule.startAt;
        }
        return now + skill.schedule.intervalMs;
      case 'once':
        if (skill.schedule.timestamp > now) {
          return skill.schedule.timestamp;
        }
        return null;
      default:
        return null;
    }
  }

  private nextCronRun(expression: string, from: number): number {
    const parts = expression.split(' ');
    if (parts.length < 5) {
      return from + this.checkIntervalMs;
    }

    const date = new Date(from);
    date.setMinutes(date.getMinutes() + 1);
    date.setSeconds(0);
    date.setMilliseconds(0);

    return date.getTime();
  }

  private checkConditions(conditions?: ScheduleConditions): boolean {
    if (!conditions) return true;

    if (conditions.activeHours) {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentTime = currentHour * 60 + currentMinute;

      const startParts = conditions.activeHours.start.split(':');
      const endParts = conditions.activeHours.end.split(':');
      const startHour = parseInt(startParts[0] ?? '0', 10);
      const startMin = parseInt(startParts[1] ?? '0', 10);
      const endHour = parseInt(endParts[0] ?? '0', 10);
      const endMin = parseInt(endParts[1] ?? '0', 10);
      const startTime = startHour * 60 + startMin;
      const endTime = endHour * 60 + endMin;

      if (startTime <= endTime) {
        if (currentTime < startTime || currentTime > endTime) {
          return false;
        }
      } else {
        if (currentTime < startTime && currentTime > endTime) {
          return false;
        }
      }
    }

    if (conditions.daysOfWeek?.length) {
      const day = new Date().toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
      if (!conditions.daysOfWeek.includes(day)) {
        return false;
      }
    }

    return true;
  }

  private async executeScheduledSkill(skill: ScheduledSkill): Promise<void> {
    this.timers.delete(skill.id);

    const execution: ScheduledSkillExecution = {
      scheduledSkillId: skill.id,
      skillId: skill.skillId,
      actionId: skill.actionId,
      startedAt: Date.now(),
      success: false,
    };

    this.emitEvent({
      type: 'scheduled_skill_run',
      scheduledSkillId: skill.id,
      skillId: skill.skillId,
      timestamp: Date.now(),
    });

    try {
      const result = await this.triggerNow(skill.skillId, skill.actionId);
      execution.completedAt = result.completedAt;
      execution.success = result.success;
      execution.result = result.result;
      execution.error = result.error;

      if (result.success) {
        this.emitEvent({
          type: 'scheduled_skill_success',
          scheduledSkillId: skill.id,
          skillId: skill.skillId,
          timestamp: Date.now(),
          data: { result: result.result },
        });
      } else {
        this.emitEvent({
          type: 'scheduled_skill_failure',
          scheduledSkillId: skill.id,
          skillId: skill.skillId,
          timestamp: Date.now(),
          data: { error: result.error },
        });
      }
    } catch (err) {
      execution.completedAt = Date.now();
      execution.success = false;
      execution.error = err instanceof Error ? err.message : 'Unknown error';

      this.emitEvent({
        type: 'scheduled_skill_failure',
        scheduledSkillId: skill.id,
        skillId: skill.skillId,
        timestamp: Date.now(),
        data: { error: execution.error },
      });
    }

    skill.lastRunAt = execution.startedAt;
    skill.runCount++;

    if (skill.enabled) {
      this.scheduleNextRun(skill);
    }
  }

  private startCheckTimer(): void {
    this.checkTimer = setTimeout(() => {
      if (!this.isRunning) return;

      for (const skill of this.scheduledSkills.values()) {
        if (skill.enabled && skill.nextRunAt) {
          if (!this.checkConditions(skill.conditions)) {
            this.scheduleNextRun(skill);
          }
        }
      }

      this.startCheckTimer();
    }, this.checkIntervalMs);
  }

  private emitEvent(event: ScheduleEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.error('Schedule event handler error:', err);
      }
    }
  }
}
