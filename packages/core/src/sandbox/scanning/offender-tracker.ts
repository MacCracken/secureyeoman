/**
 * Offender Tracker — Rolling window repeat-offender detection (Phase 116-C)
 *
 * Tracks scan violations per user/personality in a rolling time window.
 * Auto-escalates response tier for repeat offenders based on configurable thresholds.
 */

import type { ScanResult } from '@secureyeoman/shared';

export interface OffenderTrackerConfig {
  /** Rolling window size in ms (default: 1 hour). */
  windowMs: number;
  /** Number of violations in window to trigger escalation. */
  escalationThreshold: number;
  /** Decay multiplier applied to older events (0-1, default 0.5). */
  decayFactor: number;
  /** Maximum tracked entries per key before pruning oldest. */
  maxEntries: number;
}

const DEFAULT_CONFIG: OffenderTrackerConfig = {
  windowMs: 60 * 60 * 1000, // 1 hour
  escalationThreshold: 3,
  decayFactor: 0.5,
  maxEntries: 100,
};

interface OffenseRecord {
  timestamp: number;
  verdict: string;
  worstSeverity: string;
  findingCount: number;
}

export interface OffenderStatus {
  key: string;
  recentOffenses: number;
  weightedScore: number;
  isRepeatOffender: boolean;
  recommendedTier: string;
}

/** Maximum number of unique keys tracked before pruning the oldest. */
const MAX_TRACKED_KEYS = 10_000;

export class OffenderTracker {
  private readonly config: OffenderTrackerConfig;
  private readonly records = new Map<string, OffenseRecord[]>();
  private pruneTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<OffenderTrackerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    // Auto-prune expired records every window interval
    this.pruneTimer = setInterval(() => this.prune(), this.config.windowMs);
    this.pruneTimer.unref();
  }

  /** Stop the auto-prune timer and clear all records. */
  stop(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
    this.records.clear();
  }

  /**
   * Track a scan result for a user/personality.
   * Only records non-pass verdicts.
   */
  track(userId: string | undefined, personalityId: string | undefined, scanResult: ScanResult): void {
    if (scanResult.verdict === 'pass') return;

    const keys = this.buildKeys(userId, personalityId);
    const record: OffenseRecord = {
      timestamp: Date.now(),
      verdict: scanResult.verdict,
      worstSeverity: scanResult.worstSeverity,
      findingCount: scanResult.findings.length,
    };

    for (const key of keys) {
      let list = this.records.get(key);
      if (!list) {
        // Evict oldest key if at global capacity
        if (this.records.size >= MAX_TRACKED_KEYS) {
          const oldest = this.records.keys().next().value;
          if (oldest !== undefined) this.records.delete(oldest);
        }
        list = [];
        this.records.set(key, list);
      }
      list.push(record);
      // Prune if over max
      if (list.length > this.config.maxEntries) {
        list.splice(0, list.length - this.config.maxEntries);
      }
    }
  }

  /**
   * Get the offender status for a user or personality.
   */
  getStatus(key: string): OffenderStatus {
    const now = Date.now();
    const list = this.records.get(key) ?? [];

    // Filter to rolling window
    const recent = list.filter((r) => now - r.timestamp <= this.config.windowMs);

    // Calculate weighted score with time decay
    let weightedScore = 0;
    for (const record of recent) {
      const age = now - record.timestamp;
      const decay = Math.pow(this.config.decayFactor, age / this.config.windowMs);
      const severityWeight = this.severityWeight(record.worstSeverity);
      weightedScore += severityWeight * decay;
    }

    const isRepeatOffender = recent.length >= this.config.escalationThreshold;
    const recommendedTier = this.recommendTier(weightedScore, recent.length);

    return {
      key,
      recentOffenses: recent.length,
      weightedScore: Math.round(weightedScore * 100) / 100,
      isRepeatOffender,
      recommendedTier,
    };
  }

  /**
   * Check if a user or personality is a repeat offender.
   */
  isRepeatOffender(userId: string | undefined, personalityId: string | undefined): boolean {
    const keys = this.buildKeys(userId, personalityId);
    return keys.some((key) => this.getStatus(key).isRepeatOffender);
  }

  /**
   * Get the recommended escalation tier for a user/personality.
   * Returns the highest tier across all matching keys.
   */
  getRecommendedTier(userId: string | undefined, personalityId: string | undefined): string {
    const keys = this.buildKeys(userId, personalityId);
    const tiers = keys.map((key) => this.getStatus(key).recommendedTier);
    return this.highestTier(tiers);
  }

  /**
   * Prune expired records from all keys.
   */
  prune(): void {
    const now = Date.now();
    for (const [key, list] of this.records) {
      const active = list.filter((r) => now - r.timestamp <= this.config.windowMs);
      if (active.length === 0) {
        this.records.delete(key);
      } else {
        this.records.set(key, active);
      }
    }
  }

  /**
   * Get all tracked keys.
   */
  getTrackedKeys(): string[] {
    return [...this.records.keys()];
  }

  /**
   * Clear all records.
   */
  clear(): void {
    this.records.clear();
  }

  private buildKeys(userId: string | undefined, personalityId: string | undefined): string[] {
    const keys: string[] = [];
    if (userId) keys.push(`user:${userId}`);
    if (personalityId) keys.push(`personality:${personalityId}`);
    if (keys.length === 0) keys.push('anonymous');
    return keys;
  }

  private severityWeight(severity: string): number {
    switch (severity) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 0.5;
    }
  }

  private recommendTier(weightedScore: number, count: number): string {
    if (count < this.config.escalationThreshold) return 'tier1_log';
    if (weightedScore >= 10) return 'tier4_revoke';
    if (weightedScore >= 6) return 'tier3_suspend';
    if (weightedScore >= 3) return 'tier2_alert';
    return 'tier1_log';
  }

  private highestTier(tiers: string[]): string {
    const rank: Record<string, number> = {
      tier1_log: 1,
      tier2_alert: 2,
      tier3_suspend: 3,
      tier4_revoke: 4,
    };
    let max = 'tier1_log';
    for (const t of tiers) {
      if ((rank[t] ?? 0) > (rank[max] ?? 0)) {
        max = t;
      }
    }
    return max;
  }
}
