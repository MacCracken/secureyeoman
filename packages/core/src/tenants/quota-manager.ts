/**
 * TenantQuotaManager — Business logic for per-tenant rate limiting and token budgets.
 *
 * Uses sliding windows for rate-limit counters:
 *   - minute window: floor(now / 60_000) * 60_000
 *   - hour window:   floor(now / 3_600_000) * 3_600_000
 *   - day window:    floor(now / 86_400_000) * 86_400_000
 *   - month window:  floor(now / 2_592_000_000) * 2_592_000_000  (30-day approx)
 */

import type {
  QuotaStorage,
  TenantLimits,
  TenantLimitsInput,
  TokenUsageQueryOpts,
  TokenUsageRecord,
  TokenUsageSummary,
} from './quota-storage.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const MONTH_MS = 2_592_000_000; // 30-day approximation

const DEFAULT_LIMITS: Omit<TenantLimits, 'tenantId' | 'createdAt' | 'updatedAt'> = {
  requestsPerMinute: 60,
  requestsPerHour: 1000,
  tokensPerDay: 1_000_000,
  tokensPerMonth: 30_000_000,
  maxConcurrentRequests: 10,
  customLimits: {},
};

/* ------------------------------------------------------------------ */
/*  Return types                                                       */
/* ------------------------------------------------------------------ */

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
  remaining: number;
}

export interface UsageSummary {
  requests: {
    minute: { current: number; limit: number };
    hour: { current: number; limit: number };
  };
  tokens: {
    day: { current: number; limit: number };
    month: { current: number; limit: number };
  };
  limits: TenantLimits;
}

/* ------------------------------------------------------------------ */
/*  Window helpers                                                     */
/* ------------------------------------------------------------------ */

function windowStart(now: number, size: number): number {
  return Math.floor(now / size) * size;
}

/* ------------------------------------------------------------------ */
/*  Manager                                                            */
/* ------------------------------------------------------------------ */

export class TenantQuotaManager {
  private readonly storage: QuotaStorage;

  constructor(storage: QuotaStorage) {
    this.storage = storage;
  }

  /* ---------- Limits CRUD ----------------------------------------- */

  async setLimits(tenantId: string, limits: TenantLimitsInput): Promise<TenantLimits> {
    return this.storage.setTenantLimits(tenantId, limits);
  }

  async getLimits(tenantId: string): Promise<TenantLimits> {
    const stored = await this.storage.getTenantLimits(tenantId);
    if (stored) return stored;

    // Return defaults when no custom limits are configured
    const now = Date.now();
    return {
      tenantId,
      ...DEFAULT_LIMITS,
      createdAt: now,
      updatedAt: now,
    };
  }

  async deleteLimits(tenantId: string): Promise<boolean> {
    return this.storage.deleteTenantLimits(tenantId);
  }

  /* ---------- Rate limiting --------------------------------------- */

  async checkRateLimit(tenantId: string): Promise<RateLimitResult> {
    const limits = await this.getLimits(tenantId);
    const now = Date.now();

    // Check per-minute window
    const minuteStart = windowStart(now, MINUTE_MS);
    const minuteCounter = await this.storage.getCounter(
      tenantId,
      'requests_per_minute',
      minuteStart
    );
    const minuteCurrent = minuteCounter?.currentValue ?? 0;

    if (minuteCurrent >= limits.requestsPerMinute) {
      const retryAfter = minuteStart + MINUTE_MS - now;
      return {
        allowed: false,
        retryAfter: Math.ceil(retryAfter / 1000),
        remaining: 0,
      };
    }

    // Check per-hour window
    const hourStart = windowStart(now, HOUR_MS);
    const hourCounter = await this.storage.getCounter(tenantId, 'requests_per_hour', hourStart);
    const hourCurrent = hourCounter?.currentValue ?? 0;

    if (hourCurrent >= limits.requestsPerHour) {
      const retryAfter = hourStart + HOUR_MS - now;
      return {
        allowed: false,
        retryAfter: Math.ceil(retryAfter / 1000),
        remaining: 0,
      };
    }

    const minuteRemaining = limits.requestsPerMinute - minuteCurrent;
    const hourRemaining = limits.requestsPerHour - hourCurrent;

    return {
      allowed: true,
      remaining: Math.min(minuteRemaining, hourRemaining),
    };
  }

  async recordRequest(tenantId: string): Promise<void> {
    const limits = await this.getLimits(tenantId);
    const now = Date.now();

    const minuteStart = windowStart(now, MINUTE_MS);
    const hourStart = windowStart(now, HOUR_MS);

    await Promise.all([
      this.storage.incrementCounter(
        tenantId,
        'requests_per_minute',
        minuteStart,
        minuteStart + MINUTE_MS,
        limits.requestsPerMinute
      ),
      this.storage.incrementCounter(
        tenantId,
        'requests_per_hour',
        hourStart,
        hourStart + HOUR_MS,
        limits.requestsPerHour
      ),
    ]);
  }

  /* ---------- Token budgets --------------------------------------- */

  async checkTokenBudget(tenantId: string, estimatedTokens: number): Promise<RateLimitResult> {
    const limits = await this.getLimits(tenantId);
    const now = Date.now();

    // Check daily budget
    const dayStart = windowStart(now, DAY_MS);
    const dayCounter = await this.storage.getCounter(tenantId, 'tokens_per_day', dayStart);
    const dayCurrent = dayCounter?.currentValue ?? 0;

    if (dayCurrent + estimatedTokens > limits.tokensPerDay) {
      const retryAfter = dayStart + DAY_MS - now;
      return {
        allowed: false,
        retryAfter: Math.ceil(retryAfter / 1000),
        remaining: Math.max(0, limits.tokensPerDay - dayCurrent),
      };
    }

    // Check monthly budget
    const monthStart = windowStart(now, MONTH_MS);
    const monthCounter = await this.storage.getCounter(tenantId, 'tokens_per_month', monthStart);
    const monthCurrent = monthCounter?.currentValue ?? 0;

    if (monthCurrent + estimatedTokens > limits.tokensPerMonth) {
      const retryAfter = monthStart + MONTH_MS - now;
      return {
        allowed: false,
        retryAfter: Math.ceil(retryAfter / 1000),
        remaining: Math.max(0, limits.tokensPerMonth - monthCurrent),
      };
    }

    const dayRemaining = limits.tokensPerDay - dayCurrent;
    const monthRemaining = limits.tokensPerMonth - monthCurrent;

    return {
      allowed: true,
      remaining: Math.min(dayRemaining, monthRemaining),
    };
  }

  async recordTokenUsage(
    tenantId: string,
    model: string,
    inputTokens: number,
    outputTokens: number
  ): Promise<void> {
    const limits = await this.getLimits(tenantId);
    const now = Date.now();
    const totalTokens = inputTokens + outputTokens;

    const dayStart = windowStart(now, DAY_MS);
    const monthStart = windowStart(now, MONTH_MS);

    await Promise.all([
      this.storage.recordTokenUsage(tenantId, model, inputTokens, outputTokens),
      this.storage.incrementCounter(
        tenantId,
        'tokens_per_day',
        dayStart,
        dayStart + DAY_MS,
        limits.tokensPerDay,
        totalTokens
      ),
      this.storage.incrementCounter(
        tenantId,
        'tokens_per_month',
        monthStart,
        monthStart + MONTH_MS,
        limits.tokensPerMonth,
        totalTokens
      ),
    ]);
  }

  /* ---------- Usage summaries ------------------------------------- */

  async getUsageSummary(tenantId: string, opts?: TokenUsageQueryOpts): Promise<UsageSummary> {
    const limits = await this.getLimits(tenantId);
    const now = Date.now();

    const minuteStart = windowStart(now, MINUTE_MS);
    const hourStart = windowStart(now, HOUR_MS);
    const dayStart = windowStart(now, DAY_MS);
    const monthStart = windowStart(now, MONTH_MS);

    const [minuteCounter, hourCounter, dayCounter, monthCounter] = await Promise.all([
      this.storage.getCounter(tenantId, 'requests_per_minute', minuteStart),
      this.storage.getCounter(tenantId, 'requests_per_hour', hourStart),
      this.storage.getCounter(tenantId, 'tokens_per_day', dayStart),
      this.storage.getCounter(tenantId, 'tokens_per_month', monthStart),
    ]);

    return {
      requests: {
        minute: {
          current: minuteCounter?.currentValue ?? 0,
          limit: limits.requestsPerMinute,
        },
        hour: {
          current: hourCounter?.currentValue ?? 0,
          limit: limits.requestsPerHour,
        },
      },
      tokens: {
        day: {
          current: dayCounter?.currentValue ?? 0,
          limit: limits.tokensPerDay,
        },
        month: {
          current: monthCounter?.currentValue ?? 0,
          limit: limits.tokensPerMonth,
        },
      },
      limits,
    };
  }

  async getTokenUsage(tenantId: string, opts?: TokenUsageQueryOpts): Promise<TokenUsageRecord[]> {
    return this.storage.getTokenUsage(tenantId, opts);
  }

  async getTokenUsageSummary(
    tenantId: string,
    opts?: TokenUsageQueryOpts
  ): Promise<TokenUsageSummary> {
    return this.storage.getTokenUsageSummary(tenantId, opts);
  }

  /* ---------- Admin operations ------------------------------------ */

  async resetCounters(tenantId: string): Promise<void> {
    // Delete all counters for this tenant by resetting expired + active
    const now = Date.now();
    // Reset all windows by deleting counters
    await Promise.all([
      this.storage.getCounter(tenantId, 'requests_per_minute', windowStart(now, MINUTE_MS)),
      this.storage.getCounter(tenantId, 'requests_per_hour', windowStart(now, HOUR_MS)),
      this.storage.getCounter(tenantId, 'tokens_per_day', windowStart(now, DAY_MS)),
      this.storage.getCounter(tenantId, 'tokens_per_month', windowStart(now, MONTH_MS)),
    ]);
    // Use resetExpiredCounters + set window_end to 0 to force expiry
    // For simplicity, we execute a direct delete
    await this.storage['execute']('DELETE FROM quotas.usage_counters WHERE tenant_id = $1', [
      tenantId,
    ]);
  }

  async cleanupExpiredCounters(): Promise<number> {
    return this.storage.resetExpiredCounters();
  }
}
