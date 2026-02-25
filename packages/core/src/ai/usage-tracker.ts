/**
 * Usage Tracker
 *
 * Daily/monthly aggregation of token usage and cost per provider.
 * Persists records to PostgreSQL via UsageStorage so data survives restarts.
 * Enforces configurable daily token limits.
 *
 * Memory design:
 *   - Only today's records are kept in memory (`todayRecords`).
 *   - Monthly cost and per-provider breakdowns are pre-seeded from the DB
 *     on init() and updated as new records arrive — no 90-day array in RAM.
 *   - Day-rollover is detected in record() so the in-memory slice stays bounded.
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
  inputTokensToday: number;
  outputTokensToday: number;
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
  inputTokensUsed: number;
  outputTokensUsed: number;
  tokensUsed: number;
  costUsd: number;
  calls: number;
  errors: number;
}

function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export class UsageTracker {
  /** In-memory records for today only — kept bounded by day-rollover trimming. */
  private readonly todayRecords: UsageRecord[] = [];
  private readonly maxTokensPerDay: number | undefined;
  private readonly storage: UsageStorage | undefined;

  // Aggregate counters — seeded from DB on init()
  private apiCallsTotal = 0;
  private apiErrorsTotal = 0;
  private apiLatencyTotalMs = 0;
  private latencyCallCount = 0;

  // Pre-aggregated stats seeded from DB on init() and kept up-to-date via record()
  private monthCostUsd = 0;
  private providerStats: Record<string, ProviderStats> = {};

  // Reset timestamps — loaded from DB so counters start from the right baseline
  private errorsResetAt = 0;
  private latencyResetAt = 0;

  // Day key for today — used to detect midnight rollover
  private currentDayKey = '';

  constructor(maxTokensPerDay?: number, storage?: UsageStorage) {
    this.maxTokensPerDay = maxTokensPerDay;
    this.storage = storage;
    this.currentDayKey = dayKey(Date.now());
  }

  /**
   * Load today's records from the database and seed all counters.
   * Call once during startup before any record() calls.
   */
  async init(): Promise<void> {
    if (!this.storage) return;

    // Load reset timestamps first so loadStats() uses the correct baselines
    this.errorsResetAt = await this.storage.getResetAt('errors');
    this.latencyResetAt = await this.storage.getResetAt('latency');

    // Only load today's records — avoids pulling 90 days of history into RAM
    const todayRows = await this.storage.loadToday();
    this.todayRecords.push(...todayRows);
    this.currentDayKey = dayKey(Date.now());

    // Seed total call counter from all records in the DB
    this.apiCallsTotal = await this.storage.getTotalCallCount();

    // Seed error count and latency from DB using reset timestamps as lower bounds
    const stats = await this.storage.loadStats(this.errorsResetAt, this.latencyResetAt);
    this.apiErrorsTotal = stats.errorCount;
    this.apiCallsTotal += stats.errorCount; // total = success + errors
    this.apiLatencyTotalMs = stats.latencyTotalMs;
    this.latencyCallCount = stats.latencyCallCount;

    // Seed monthly cost and per-provider breakdown from DB
    this.monthCostUsd = await this.storage.loadMonthCostUsd();
    this.providerStats = await this.storage.loadProviderStats();
  }

  /**
   * Record a completed AI call and persist it to the database.
   * Pass latencyMs for the call's end-to-end duration — stored in usage_records
   * and used to seed apiLatencyAvgMs across restarts.
   */
  record(record: UsageRecord): void {
    // Trim yesterday's records when the calendar day rolls over
    const today = dayKey(Date.now());
    if (today !== this.currentDayKey) {
      this.todayRecords.length = 0;
      this.currentDayKey = today;
    }

    this.todayRecords.push(record);
    this.apiCallsTotal++;

    // Update month cost accumulator
    this.monthCostUsd += record.costUsd;

    // Update per-provider accumulator
    if (!this.providerStats[record.provider]) {
      this.providerStats[record.provider] = {
        inputTokensUsed: 0, outputTokensUsed: 0, tokensUsed: 0,
        costUsd: 0, calls: 0, errors: 0,
      };
    }
    const ps = this.providerStats[record.provider]!;
    ps.inputTokensUsed += record.usage.inputTokens;
    ps.outputTokensUsed += record.usage.outputTokens;
    ps.tokensUsed += record.usage.totalTokens;
    ps.costUsd += record.costUsd;
    ps.calls++;

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
    this.apiCallsTotal = Math.max(0, this.apiCallsTotal - this.apiErrorsTotal);
    this.apiErrorsTotal = 0;
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
    const today = dayKey(Date.now());

    let inputTokensToday = 0;
    let outputTokensToday = 0;
    let tokensUsedToday = 0;
    let tokensCachedToday = 0;
    let costUsdToday = 0;

    for (const r of this.todayRecords) {
      if (dayKey(r.timestamp) === today) {
        inputTokensToday += r.usage.inputTokens;
        outputTokensToday += r.usage.outputTokens;
        tokensUsedToday += r.usage.totalTokens;
        tokensCachedToday += r.usage.cachedTokens;
        costUsdToday += r.costUsd;
      }
    }

    return {
      inputTokensToday,
      outputTokensToday,
      tokensUsedToday,
      tokensCachedToday,
      costUsdToday,
      costUsdMonth: this.monthCostUsd,
      apiCallsTotal: this.apiCallsTotal,
      apiErrorsTotal: this.apiErrorsTotal,
      apiLatencyTotalMs: this.apiLatencyTotalMs,
      apiCallCount: this.latencyCallCount,
      byProvider: this.providerStats,
    };
  }

  private getTokensToday(): number {
    const today = dayKey(Date.now());
    let total = 0;
    for (const r of this.todayRecords) {
      if (dayKey(r.timestamp) === today) {
        total += r.usage.totalTokens;
      }
    }
    return total;
  }
}
