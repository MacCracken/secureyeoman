/**
 * Memory Audit Scheduler — Three cron schedules for daily/weekly/monthly audits.
 *
 * Uses brain.meta for schedule persistence and concurrency locking.
 * 60-second check interval (same pattern as ConsolidationManager).
 *
 * Phase 118: Memory Audits, Compression & Reorganization.
 */

import type { BrainStorage } from '../storage.js';
import type { SecureLogger } from '../../logging/logger.js';
import type { MemoryAuditScope, MemoryAuditReport } from '@secureyeoman/shared';
import type { MemoryAuditEngine } from './engine.js';
import type { MemoryAuditPolicy } from './policy.js';

const META_PREFIX = 'audit:schedule:';
const LOCK_KEY = 'audit:lock';
const LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class MemoryAuditScheduler {
  private readonly brainStorage: BrainStorage;
  private readonly engine: MemoryAuditEngine;
  private readonly policy: MemoryAuditPolicy;
  private readonly logger: SecureLogger;
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  private history: MemoryAuditReport[] = [];
  private schedules: Record<MemoryAuditScope, string>;
  private running = false;

  constructor(opts: {
    brainStorage: BrainStorage;
    engine: MemoryAuditEngine;
    policy: MemoryAuditPolicy;
    logger: SecureLogger;
  }) {
    this.brainStorage = opts.brainStorage;
    this.engine = opts.engine;
    this.policy = opts.policy;
    this.logger = opts.logger;

    // Initialize from policy defaults
    this.schedules = {
      daily: this.policy.getSchedule('daily'),
      weekly: this.policy.getSchedule('weekly'),
      monthly: this.policy.getSchedule('monthly'),
    };
  }

  // ── Lifecycle ──────────────────────────────────────────────

  start(): void {
    if (this.schedulerTimer) return;
    if (!this.policy.isEnabled()) {
      this.logger.info('Memory audit scheduler disabled by policy');
      return;
    }

    // Load persisted schedules
    void this.loadSchedules().catch((e: unknown) => {
      this.logger.warn('Failed to load audit schedules', { error: String(e) });
    });

    this.schedulerTimer = setInterval(() => {
      this.checkSchedules();
    }, 60 * 1000);

    this.logger.info('Memory audit scheduler started', {
      schedules: JSON.stringify(this.schedules),
    });
  }

  stop(): void {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    this.logger.info('Memory audit scheduler stopped');
  }

  // ── Schedule Management ────────────────────────────────────

  getSchedules(): Record<MemoryAuditScope, string> {
    return { ...this.schedules };
  }

  async setSchedule(scope: MemoryAuditScope, cron: string): Promise<void> {
    this.schedules[scope] = cron;
    await this.brainStorage.setMeta(`${META_PREFIX}${scope}`, cron);
    this.logger.info('Audit schedule updated', { scope, cron });
  }

  // ── Manual Audit ───────────────────────────────────────────

  async runManualAudit(
    scope: MemoryAuditScope,
    personalityId?: string
  ): Promise<MemoryAuditReport> {
    this.logger.info('Manual audit triggered', { scope, personalityId });
    const report = await this.engine.runAudit(scope, personalityId);
    this.history.unshift(report);
    if (this.history.length > 50) this.history.length = 50;
    return report;
  }

  getHistory(): MemoryAuditReport[] {
    return [...this.history];
  }

  // ── Private ────────────────────────────────────────────────

  private async loadSchedules(): Promise<void> {
    for (const scope of ['daily', 'weekly', 'monthly'] as MemoryAuditScope[]) {
      try {
        const val = await this.brainStorage.getMeta(`${META_PREFIX}${scope}`);
        if (val) this.schedules[scope] = val;
      } catch {
        // Use policy defaults
      }
    }
  }

  private checkSchedules(): void {
    if (this.running) return;

    const now = new Date();
    for (const scope of ['daily', 'weekly', 'monthly'] as MemoryAuditScope[]) {
      if (this.matchesCron(this.schedules[scope], now)) {
        void this.runScheduledAudit(scope);
        return; // Only one audit at a time
      }
    }
  }

  private async runScheduledAudit(scope: MemoryAuditScope): Promise<void> {
    if (this.running) return;

    // Acquire lock
    const locked = await this.acquireLock();
    if (!locked) {
      this.logger.debug('Audit lock held by another process, skipping');
      return;
    }

    this.running = true;
    try {
      const report = await this.engine.runAudit(scope);
      this.history.unshift(report);
      if (this.history.length > 50) this.history.length = 50;
    } catch (err) {
      this.logger.error('Scheduled audit failed', { error: String(err), scope });
    } finally {
      this.running = false;
      await this.releaseLock();
    }
  }

  private async acquireLock(): Promise<boolean> {
    try {
      const existing = await this.brainStorage.getMeta(LOCK_KEY);
      if (existing) {
        const lockTime = parseInt(existing, 10);
        if (Date.now() - lockTime < LOCK_TTL_MS) return false;
      }
      await this.brainStorage.setMeta(LOCK_KEY, String(Date.now()));
      return true;
    } catch {
      return false;
    }
  }

  private async releaseLock(): Promise<void> {
    try {
      await this.brainStorage.setMeta(LOCK_KEY, '0');
    } catch {
      // Best effort
    }
  }

  /** Full 5-field cron matching (reused from ConsolidationManager pattern). */
  private matchesCron(cron: string, now: Date): boolean {
    const parts = cron.split(/\s+/);
    if (parts.length < 5) return false;

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    const matches = (field: string | undefined, value: number): boolean => {
      if (!field || field === '*') return true;
      return field.split(',').some((f) => parseInt(f.trim(), 10) === value);
    };

    const matchesMinute = matches(minute, now.getMinutes());
    const matchesHour = matches(hour, now.getHours());
    const matchesDayOfMonth = matches(dayOfMonth, now.getDate());
    const matchesMonth = matches(month, now.getMonth() + 1);

    const currentDow = now.getDay();
    const matchesDayOfWeek =
      dayOfWeek === '*' ||
      dayOfWeek!.split(',').some((f) => {
        const v = parseInt(f.trim(), 10);
        return v === currentDow || (v === 7 && currentDow === 0);
      });

    return matchesMinute && matchesHour && matchesDayOfMonth && matchesMonth && matchesDayOfWeek;
  }
}
