/**
 * Usage Tracker
 *
 * Daily/monthly aggregation of token usage and cost per provider.
 * Persists records to PostgreSQL via UsageStorage so data survives restarts.
 * Enforces configurable daily token limits.
 *
 * Counter persistence across restarts:
 *   - apiCallsTotal    — seeded from usage_records count on init
 *   - apiErrorsTotal   — seeded from usage_error_records count (since last reset) on init
 *   - apiLatencyTotalMs / latencyCallCount — seeded from usage_records sum on init
 *   - Reset timestamps stored in usage_resets table
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
  /** Milliseconds from request start to first token / response complete. */
  latencyMs?: number;
}

export interface UsageStats {
  tokensUsedToday: number;
  tokensCachedToday: number;
  costUsdToday: number;
  costUsdMonth: number;
  apiCallsTotal: number;
  apiErrorsTotal: number;
  apiLatencyTotalMs: number;
  /** Number of calls for which latency was measured (denominator for avg). */
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

  // Aggregate counters — seeded from DB on init()
  private apiCallsTotal = 0;
  private apiErrorsTotal = 0;
  private apiLatencyTotalMs = 0;
  private latencyCallCount = 0;

  // Reset timestamps — loaded from DB so counters start from the right baseline
  private errorsResetAt = 0;
  private latencyResetAt = 0;

  constructor(maxTokensPerDay?: number, storage?: UsageStorage) {
    this.maxTokensPerDay = maxTokensPerDay;
    this.storage = storage;
  }

  /**
   * Load historical records from the database and seed all counters.
   * Call once during startup before any record() calls.
   */
  async init(): Promise<void> {
    if (!this.storage) return;

    // Load reset timestamps first so loadStats() uses the correct baselines
    this.errorsResetAt = await this.storage.getResetAt('errors');
    this.latencyResetAt = await this.storage.getResetAt('latency');

    const historical = await this.storage.loadRecent();
    this.records.push(...historical);

    // Seed call counter from DB records (only successful calls are in usage_records;
    // error counts from previous sessions are recovered via usage_error_records)
    this.apiCallsTotal = historical.length;

    // Seed error count and latency from DB using reset timestamps as lower bounds
    const stats = await this.storage.loadStats(this.errorsResetAt, this.latencyResetAt);
    this.apiErrorsTotal = stats.errorCount;
    this.apiCallsTotal += stats.errorCount; // total = success + errors
    this.apiLatencyTotalMs = stats.latencyTotalMs;
    this.latencyCallCount = stats.latencyCallCount;
  }

  /**
   * Record a completed AI call and persist it to the database.
   * Pass latencyMs for the call's end-to-end duration — stored in usage_records
   * and used to seed apiLatencyAvgMs across restarts.
   */
  record(record: UsageRecord): void {
    this.records.push(record);
    this.apiCallsTotal++;
    if (record.latencyMs !== undefined) {
      this.apiLatencyTotalMs += record.latencyMs;
      this.latencyCallCount++;
    }
    if (this.storage) {
      // Fire-and-forget — never block the AI call on DB I/O
      void this.storage.insert(record).catch(() => {
        // Non-fatal: in-memory record is already stored above
      });
    }
  }

  /**
   * Record an API call latency for cases where latency is not attached to a
   * usage record (e.g. error paths without a corresponding record() call).
   * Not persisted — resets on restart. Use record({ latencyMs }) for persisted latency.
   */
  recordLatency(ms: number): void {
    this.apiLatencyTotalMs += ms;
    this.latencyCallCount++;
  }

  /**
   * Record an API error. Persists to usage_error_records so the count
   * survives restarts and can be reset independently.
   */
  recordError(provider = '', model = ''): void {
    this.apiErrorsTotal++;
    this.apiCallsTotal++;
    if (this.storage) {
      void this.storage.insertError(provider, model, Date.now()).catch(() => {});
    }
  }

  /**
   * Reset the API error counter to zero.
   * Stores a reset timestamp in the DB so the counter stays at zero after restart.
   */
  async resetErrors(): Promise<void> {
    const now = Date.now();
    this.errorsResetAt = now;
    this.apiErrorsTotal = 0;
    // Recalculate apiCallsTotal to exclude the now-reset errors
    // (re-count from records so we don't under-count successes)
    this.apiCallsTotal = this.records.length;
    await this.storage?.setResetAt('errors', now);
  }

  /**
   * Reset the latency accumulator to zero.
   * Stores a reset timestamp in the DB so the avg restarts from zero after restart.
   */
  async resetLatency(): Promise<void> {
    const now = Date.now();
    this.latencyResetAt = now;
    this.apiLatencyTotalMs = 0;
    this.latencyCallCount = 0;
    await this.storage?.setResetAt('latency', now);
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
      apiCallCount: this.latencyCallCount,
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
