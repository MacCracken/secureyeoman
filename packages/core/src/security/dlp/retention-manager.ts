/**
 * Retention Manager — enforces data retention policies by periodically
 * purging classified content that has exceeded its retention period.
 */

import type { SecureLogger } from '../../logging/logger.js';
import type { RetentionStore } from './retention-store.js';
import type { RetentionPolicy, ClassificationLevel } from './types.js';

export interface PurgeResult {
  totalPurged: number;
  policiesApplied: number;
  details: {
    policyId: string;
    contentType: string;
    classificationLevel: ClassificationLevel | null;
    purgedCount: number;
  }[];
  durationMs: number;
}

export interface PurgePreview {
  totalEligible: number;
  details: {
    policyId: string;
    contentType: string;
    classificationLevel: ClassificationLevel | null;
    eligibleCount: number;
  }[];
}

export interface RetentionManagerDeps {
  retentionStore: RetentionStore;
  logger: SecureLogger;
  purgeIntervalMs?: number;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PURGE_INTERVAL_MS = ONE_DAY_MS;

export class RetentionManager {
  private readonly retentionStore: RetentionStore;
  private readonly logger: SecureLogger;
  private readonly purgeIntervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(deps: RetentionManagerDeps) {
    this.retentionStore = deps.retentionStore;
    this.logger = deps.logger;
    this.purgeIntervalMs = deps.purgeIntervalMs ?? DEFAULT_PURGE_INTERVAL_MS;
  }

  /**
   * Start the periodic purge timer.
   */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.runPurge().catch((err: unknown) => {
        this.logger.error({ err }, 'Retention purge failed');
      });
    }, this.purgeIntervalMs);
    this.logger.info({ intervalMs: this.purgeIntervalMs }, 'Retention manager started');
  }

  /**
   * Stop the periodic purge timer.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.info('Retention manager stopped');
    }
  }

  /**
   * Execute a retention purge — deletes classified content older than the
   * configured retention period for each active policy.
   */
  async runPurge(): Promise<PurgeResult> {
    const start = Date.now();
    const policies = await this.retentionStore.list();
    const enabledPolicies = policies.filter((p) => p.enabled);

    const details: PurgeResult['details'] = [];
    let totalPurged = 0;

    for (const policy of enabledPolicies) {
      const cutoff = Date.now() - policy.retentionDays * ONE_DAY_MS;
      const purged = await this.retentionStore.purgeClassifications(
        policy.contentType,
        cutoff,
        policy.classificationLevel
      );

      if (purged > 0) {
        details.push({
          policyId: policy.id,
          contentType: policy.contentType,
          classificationLevel: policy.classificationLevel,
          purgedCount: purged,
        });
        totalPurged += purged;

        await this.retentionStore.updateLastPurge(policy.id, Date.now());
      }
    }

    const durationMs = Date.now() - start;
    this.logger.info({
      totalPurged,
      policiesApplied: details.length,
      durationMs,
    }, 'Retention purge completed');

    return {
      totalPurged,
      policiesApplied: details.length,
      details,
      durationMs,
    };
  }

  /**
   * Preview what would be purged — counts only, no deletion.
   */
  async preview(): Promise<PurgePreview> {
    const policies = await this.retentionStore.list();
    const enabledPolicies = policies.filter((p) => p.enabled);

    const details: PurgePreview['details'] = [];
    let totalEligible = 0;

    for (const policy of enabledPolicies) {
      const cutoff = Date.now() - policy.retentionDays * ONE_DAY_MS;
      const count = await this.retentionStore.countEligible(
        policy.contentType,
        cutoff,
        policy.classificationLevel
      );

      if (count > 0) {
        details.push({
          policyId: policy.id,
          contentType: policy.contentType,
          classificationLevel: policy.classificationLevel,
          eligibleCount: count,
        });
        totalEligible += count;
      }
    }

    return { totalEligible, details };
  }
}
