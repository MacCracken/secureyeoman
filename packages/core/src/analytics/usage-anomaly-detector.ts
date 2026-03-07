/**
 * UsageAnomalyDetector — in-memory rate tracking with persistent anomaly alerts
 * (Phase 96). Follows the AbuseDetector pattern.
 *
 * Three detection modes:
 *  1. Message rate spike  — current rate > 10x rolling average
 *  2. Off-hours activity  — messages outside configurable hours
 *  3. Credential stuffing — > 5 failed logins in 1 minute
 */

import type { SecureLogger } from '../logging/logger.js';
import type { AnalyticsStorage } from './analytics-storage.js';

// ── Config ───────────────────────────────────────────────────────────────────

export interface AnomalyDetectorConfig {
  enabled: boolean;
  rateSpikeFactor: number; // 10x default
  offHoursStart: number; // 22 (10 PM)
  offHoursEnd: number; // 6  (6 AM)
  credentialStuffingLimit: number; // 5
  credentialStuffingWindowMs: number; // 60_000
  sessionTtlMs: number; // 30 minutes
}

const DEFAULT_CONFIG: AnomalyDetectorConfig = {
  enabled: true,
  rateSpikeFactor: 10,
  offHoursStart: 22,
  offHoursEnd: 6,
  credentialStuffingLimit: 5,
  credentialStuffingWindowMs: 60_000,
  sessionTtlMs: 30 * 60 * 1000,
};

// ── Internal types ───────────────────────────────────────────────────────────

interface ActivityRecord {
  messageTimestamps: number[];
  failedLogins: number[];
  lastSeenMs: number;
}

// ── Detector ─────────────────────────────────────────────────────────────────

export class UsageAnomalyDetector {
  private readonly cfg: AnomalyDetectorConfig;
  private readonly activities = new Map<string, ActivityRecord>();
  private evictTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly storage: AnalyticsStorage | null,
    private readonly logger: SecureLogger,
    config?: Partial<AnomalyDetectorConfig>
  ) {
    this.cfg = { ...DEFAULT_CONFIG, ...config };
    if (this.cfg.enabled) {
      this.evictTimer = setInterval(() => {
        this.evictStale();
      }, 60_000);
      this.evictTimer.unref();
    }
  }

  stop(): void {
    if (this.evictTimer) {
      clearInterval(this.evictTimer);
      this.evictTimer = null;
    }
  }

  recordMessage(userId: string, personalityId?: string | null): void {
    if (!this.cfg.enabled) return;
    this.evictStale();

    const now = Date.now();
    const rec = this.getOrCreate(userId);
    rec.messageTimestamps.push(now);

    // Keep only last 100 timestamps
    if (rec.messageTimestamps.length > 100) {
      rec.messageTimestamps = rec.messageTimestamps.slice(-100);
    }

    // Check rate spike
    if (rec.messageTimestamps.length >= 10) {
      const recentWindow = 60_000; // 1 minute
      const recent = rec.messageTimestamps.filter((t) => now - t < recentWindow).length;
      const older = rec.messageTimestamps.filter((t) => now - t >= recentWindow).length;
      const olderRate = older > 0 ? older / ((now - rec.messageTimestamps[0]!) / 60_000) : 1;

      if (recent > olderRate * this.cfg.rateSpikeFactor && recent > 5) {
        this.recordAnomaly('message_rate_spike', userId, personalityId ?? null, 'high', {
          recentCount: recent,
          rollingRate: olderRate,
        });
      }
    }

    // Check off-hours (UTC)
    const hour = new Date(now).getUTCHours();
    const isOffHours =
      this.cfg.offHoursStart > this.cfg.offHoursEnd
        ? hour >= this.cfg.offHoursStart || hour < this.cfg.offHoursEnd
        : hour >= this.cfg.offHoursStart && hour < this.cfg.offHoursEnd;

    if (isOffHours) {
      this.recordAnomaly('off_hours_activity', userId, personalityId ?? null, 'low', {
        hour,
        offHoursStart: this.cfg.offHoursStart,
        offHoursEnd: this.cfg.offHoursEnd,
      });
    }
  }

  recordFailedLogin(userId: string): void {
    if (!this.cfg.enabled) return;
    this.evictStale();

    const now = Date.now();
    const rec = this.getOrCreate(userId);
    rec.failedLogins.push(now);

    // Keep only recent window
    const cutoff = now - this.cfg.credentialStuffingWindowMs;
    rec.failedLogins = rec.failedLogins.filter((t) => t >= cutoff);

    if (rec.failedLogins.length >= this.cfg.credentialStuffingLimit) {
      this.recordAnomaly('credential_stuffing', userId, null, 'critical', {
        failedAttempts: rec.failedLogins.length,
        windowMs: this.cfg.credentialStuffingWindowMs,
      });
      rec.failedLogins = []; // Reset after alert
    }
  }

  private recordAnomaly(
    anomalyType: string,
    userId: string,
    personalityId: string | null,
    severity: 'low' | 'medium' | 'high' | 'critical',
    details: Record<string, unknown>
  ): void {
    this.logger.warn(`UsageAnomalyDetector: ${anomalyType}`, { userId, severity, ...details });

    if (this.storage) {
      void this.storage
        .insertAnomaly({
          anomalyType,
          personalityId,
          userId,
          severity,
          details,
        })
        .catch((err: unknown) => {
          this.logger.error({
            error: err instanceof Error ? err.message : String(err),
          }, 'UsageAnomalyDetector: failed to persist anomaly');
        });
    }
  }

  private getOrCreate(userId: string): ActivityRecord {
    let rec = this.activities.get(userId);
    if (!rec) {
      rec = {
        messageTimestamps: [],
        failedLogins: [],
        lastSeenMs: Date.now(),
      };
      this.activities.set(userId, rec);
    }
    rec.lastSeenMs = Date.now();
    return rec;
  }

  private evictStale(): void {
    const cutoff = Date.now() - this.cfg.sessionTtlMs;
    for (const [key, rec] of this.activities) {
      if (rec.lastSeenMs < cutoff) this.activities.delete(key);
    }
  }
}
