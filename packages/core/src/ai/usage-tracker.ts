/**
 * Usage Tracker
 *
 * Daily/monthly aggregation of token usage and cost per provider.
 * Persists records to PostgreSQL via UsageStorage so data survives restarts.
 * Enforces configurable daily token limits.
 */

import type { TokenUsage, AIProviderName } from '@secureyeoman/shared';
import type { UsageStorage } from './usage-storage.js';

export interface UsageRecord {
  provider: AIProviderName;
  model: string;
  usage: TokenUsage;
  costUsd: number;
  timestamp: number;
  personalityId?: string;
}

export interface UsageStats {
  tokensUsedToday: number;
  tokensCachedToday: number;
  costUsdToday: number;
  costUsdMonth: number;
  apiCallsTotal: number;
  apiErrorsTotal: number;
  apiLatencyTotalMs: number;
  apiCallCount: number;
  byProvider: Record<string, ProviderStats>;
}

interface ProviderStats {
  tokensUsed: number;
  costUsd: number;
  calls: number;
  errors: number;
}

function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function monthKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 7);
}

export class UsageTracker {
  private readonly records: UsageRecord[] = [];
  private readonly maxTokensPerDay: number | undefined;
  private readonly storage: UsageStorage | undefined;

  // Aggregate counters
  private apiCallsTotal = 0;
  private apiErrorsTotal = 0;
  private apiLatencyTotalMs = 0;

  constructor(maxTokensPerDay?: number, storage?: UsageStorage) {
    this.maxTokensPerDay = maxTokensPerDay;
    this.storage = storage;
  }

  /**
   * Load historical records from the database.
   * Call once during startup before any record() calls.
   */
  async init(): Promise<void> {
    if (!this.storage) return;
    const historical = await this.storage.loadRecent();
    this.records.push(...historical);
  }

  /**
   * Record a completed AI call and persist it to the database.
   */
  record(record: UsageRecord): void {
    this.records.push(record);
    this.apiCallsTotal++;
    if (this.storage) {
      // Fire-and-forget — never block the AI call on DB I/O
      void this.storage.insert(record).catch(() => {
        // Non-fatal: in-memory record is already stored above
      });
    }
  }

  /**
   * Record an API call latency.
   */
  recordLatency(ms: number): void {
    this.apiLatencyTotalMs += ms;
  }

  /**
   * Record an API error.
   */
  recordError(): void {
    this.apiErrorsTotal++;
    this.apiCallsTotal++;
  }

  /**
   * Check whether the daily token limit has been exceeded.
   * Returns { allowed: true } if no limit is set or not exceeded.
   */
  checkLimit(): { allowed: boolean; tokensUsedToday: number; limitPerDay?: number } {
    if (this.maxTokensPerDay === undefined) {
      return { allowed: true, tokensUsedToday: this.getTokensToday() };
    }

    const used = this.getTokensToday();
    return {
      allowed: used < this.maxTokensPerDay,
      tokensUsedToday: used,
      limitPerDay: this.maxTokensPerDay,
    };
  }

  /**
   * Get aggregated usage statistics.
   */
  getStats(): UsageStats {
    const now = Date.now();
    const today = dayKey(now);
    const thisMonth = monthKey(now);

    let tokensUsedToday = 0;
    let tokensCachedToday = 0;
    let costUsdToday = 0;
    let costUsdMonth = 0;
    const byProvider: Record<string, ProviderStats> = {};

    for (const r of this.records) {
      const rDay = dayKey(r.timestamp);
      const rMonth = monthKey(r.timestamp);

      // Per-provider aggregation
      if (!byProvider[r.provider]) {
        byProvider[r.provider] = { tokensUsed: 0, costUsd: 0, calls: 0, errors: 0 };
      }
      const providerStats = byProvider[r.provider]!;
      providerStats.tokensUsed += r.usage.totalTokens;
      providerStats.costUsd += r.costUsd;
      providerStats.calls++;

      if (rDay === today) {
        tokensUsedToday += r.usage.totalTokens;
        tokensCachedToday += r.usage.cachedTokens;
        costUsdToday += r.costUsd;
      }

      if (rMonth === thisMonth) {
        costUsdMonth += r.costUsd;
      }
    }

    return {
      tokensUsedToday,
      tokensCachedToday,
      costUsdToday,
      costUsdMonth,
      apiCallsTotal: this.apiCallsTotal,
      apiErrorsTotal: this.apiErrorsTotal,
      apiLatencyTotalMs: this.apiLatencyTotalMs,
      apiCallCount: this.apiCallsTotal - this.apiErrorsTotal,
      byProvider,
    };
  }

  private getTokensToday(): number {
    const today = dayKey(Date.now());
    let total = 0;
    for (const r of this.records) {
      if (dayKey(r.timestamp) === today) {
        total += r.usage.totalTokens;
      }
    }
    return total;
  }
}
