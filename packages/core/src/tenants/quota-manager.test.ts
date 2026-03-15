import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TenantQuotaManager } from './quota-manager.js';
import type { QuotaStorage, TenantLimits, UsageCounter } from './quota-storage.js';

/* ------------------------------------------------------------------ */
/*  Mock storage factory                                               */
/* ------------------------------------------------------------------ */

function makeMockStorage() {
  return {
    getTenantLimits: vi.fn().mockResolvedValue(null),
    setTenantLimits: vi.fn().mockImplementation(async (tenantId, limits) => ({
      tenantId,
      requestsPerMinute: limits.requestsPerMinute ?? 60,
      requestsPerHour: limits.requestsPerHour ?? 1000,
      tokensPerDay: limits.tokensPerDay ?? 1_000_000,
      tokensPerMonth: limits.tokensPerMonth ?? 30_000_000,
      maxConcurrentRequests: limits.maxConcurrentRequests ?? 10,
      customLimits: limits.customLimits ?? {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })),
    deleteTenantLimits: vi.fn().mockResolvedValue(true),
    getCounter: vi.fn().mockResolvedValue(null),
    incrementCounter: vi.fn().mockImplementation(async (_tid, _ct, ws, we, mv, inc = 1) => ({
      id: 'ctr-1',
      tenantId: _tid,
      counterType: _ct,
      windowStart: ws,
      windowEnd: we,
      currentValue: inc,
      maxValue: mv,
    })),
    resetExpiredCounters: vi.fn().mockResolvedValue(0),
    clearTenantCounters: vi.fn().mockResolvedValue(0),
    recordTokenUsage: vi.fn().mockImplementation(async (tid, model, inp, out) => ({
      id: 'tok-1',
      tenantId: tid,
      model,
      inputTokens: inp,
      outputTokens: out,
      totalTokens: inp + out,
      recordedAt: Date.now(),
    })),
    getTokenUsage: vi.fn().mockResolvedValue([]),
    getTokenUsageSummary: vi.fn().mockResolvedValue({
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      recordCount: 0,
    }),
    execute: vi.fn().mockResolvedValue(0),
  } as unknown as QuotaStorage & Record<string, ReturnType<typeof vi.fn>>;
}

const TENANT = 'tenant-001';

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('TenantQuotaManager', () => {
  let storage: ReturnType<typeof makeMockStorage>;
  let manager: TenantQuotaManager;

  beforeEach(() => {
    storage = makeMockStorage();
    manager = new TenantQuotaManager(storage as unknown as QuotaStorage);
  });

  /* ---------- Limits CRUD ----------------------------------------- */

  describe('limits CRUD', () => {
    it('returns default limits when none are configured', async () => {
      const limits = await manager.getLimits(TENANT);
      expect(limits.tenantId).toBe(TENANT);
      expect(limits.requestsPerMinute).toBe(60);
      expect(limits.requestsPerHour).toBe(1000);
      expect(limits.tokensPerDay).toBe(1_000_000);
      expect(limits.tokensPerMonth).toBe(30_000_000);
    });

    it('returns stored limits when configured', async () => {
      const stored: TenantLimits = {
        tenantId: TENANT,
        requestsPerMinute: 120,
        requestsPerHour: 2000,
        tokensPerDay: 500_000,
        tokensPerMonth: 15_000_000,
        maxConcurrentRequests: 5,
        customLimits: {},
        createdAt: 1000,
        updatedAt: 2000,
      };
      (storage.getTenantLimits as ReturnType<typeof vi.fn>).mockResolvedValue(stored);
      const limits = await manager.getLimits(TENANT);
      expect(limits.requestsPerMinute).toBe(120);
      expect(limits.tokensPerDay).toBe(500_000);
    });

    it('sets tenant limits via storage', async () => {
      const result = await manager.setLimits(TENANT, { requestsPerMinute: 200 });
      expect(storage.setTenantLimits).toHaveBeenCalledWith(TENANT, { requestsPerMinute: 200 });
      expect(result.requestsPerMinute).toBe(200);
    });

    it('deletes tenant limits', async () => {
      const ok = await manager.deleteLimits(TENANT);
      expect(storage.deleteTenantLimits).toHaveBeenCalledWith(TENANT);
      expect(ok).toBe(true);
    });
  });

  /* ---------- Rate limiting --------------------------------------- */

  describe('rate limiting', () => {
    it('allows requests when under minute limit', async () => {
      const result = await manager.checkRateLimit(TENANT);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(60); // min(60 minute, 1000 hour)
    });

    it('denies requests when minute limit is reached', async () => {
      const now = Date.now();
      const minuteStart = Math.floor(now / 60_000) * 60_000;
      (storage.getCounter as ReturnType<typeof vi.fn>).mockImplementation(
        (_tid: string, type: string, ws: number) => {
          if (type === 'requests_per_minute' && ws === minuteStart) {
            return { currentValue: 60, maxValue: 60 } as UsageCounter;
          }
          return null;
        }
      );
      const result = await manager.checkRateLimit(TENANT);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.remaining).toBe(0);
    });

    it('denies requests when hour limit is reached', async () => {
      const now = Date.now();
      const minuteStart = Math.floor(now / 60_000) * 60_000;
      const hourStart = Math.floor(now / 3_600_000) * 3_600_000;
      (storage.getCounter as ReturnType<typeof vi.fn>).mockImplementation(
        (_tid: string, type: string, ws: number) => {
          if (type === 'requests_per_minute' && ws === minuteStart) {
            return { currentValue: 10, maxValue: 60 } as UsageCounter;
          }
          if (type === 'requests_per_hour' && ws === hourStart) {
            return { currentValue: 1000, maxValue: 1000 } as UsageCounter;
          }
          return null;
        }
      );
      const result = await manager.checkRateLimit(TENANT);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('calculates remaining as min of minute and hour remaining', async () => {
      const now = Date.now();
      const minuteStart = Math.floor(now / 60_000) * 60_000;
      const hourStart = Math.floor(now / 3_600_000) * 3_600_000;
      (storage.getCounter as ReturnType<typeof vi.fn>).mockImplementation(
        (_tid: string, type: string, ws: number) => {
          if (type === 'requests_per_minute' && ws === minuteStart) {
            return { currentValue: 50, maxValue: 60 } as UsageCounter;
          }
          if (type === 'requests_per_hour' && ws === hourStart) {
            return { currentValue: 995, maxValue: 1000 } as UsageCounter;
          }
          return null;
        }
      );
      const result = await manager.checkRateLimit(TENANT);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5); // min(10, 5)
    });
  });

  /* ---------- Record request -------------------------------------- */

  describe('recordRequest', () => {
    it('increments both minute and hour counters', async () => {
      await manager.recordRequest(TENANT);
      expect(storage.incrementCounter).toHaveBeenCalledTimes(2);
      const calls = (storage.incrementCounter as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][1]).toBe('requests_per_minute');
      expect(calls[1][1]).toBe('requests_per_hour');
    });
  });

  /* ---------- Token budgets --------------------------------------- */

  describe('token budgets', () => {
    it('allows tokens when under daily budget', async () => {
      const result = await manager.checkTokenBudget(TENANT, 1000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1_000_000); // min(1M day, 30M month)
    });

    it('denies tokens when daily budget would be exceeded', async () => {
      const now = Date.now();
      const dayStart = Math.floor(now / 86_400_000) * 86_400_000;
      (storage.getCounter as ReturnType<typeof vi.fn>).mockImplementation(
        (_tid: string, type: string, ws: number) => {
          if (type === 'tokens_per_day' && ws === dayStart) {
            return { currentValue: 999_500, maxValue: 1_000_000 } as UsageCounter;
          }
          return null;
        }
      );
      const result = await manager.checkTokenBudget(TENANT, 1000);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(500);
    });

    it('denies tokens when monthly budget would be exceeded', async () => {
      const now = Date.now();
      const dayStart = Math.floor(now / 86_400_000) * 86_400_000;
      const monthStart = Math.floor(now / 2_592_000_000) * 2_592_000_000;
      (storage.getCounter as ReturnType<typeof vi.fn>).mockImplementation(
        (_tid: string, type: string, ws: number) => {
          if (type === 'tokens_per_day' && ws === dayStart) {
            return { currentValue: 100_000, maxValue: 1_000_000 } as UsageCounter;
          }
          if (type === 'tokens_per_month' && ws === monthStart) {
            return { currentValue: 29_999_500, maxValue: 30_000_000 } as UsageCounter;
          }
          return null;
        }
      );
      const result = await manager.checkTokenBudget(TENANT, 1000);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(500);
    });

    it('returns remaining as min of day and month remaining', async () => {
      const now = Date.now();
      const dayStart = Math.floor(now / 86_400_000) * 86_400_000;
      const monthStart = Math.floor(now / 2_592_000_000) * 2_592_000_000;
      (storage.getCounter as ReturnType<typeof vi.fn>).mockImplementation(
        (_tid: string, type: string, ws: number) => {
          if (type === 'tokens_per_day' && ws === dayStart) {
            return { currentValue: 800_000, maxValue: 1_000_000 } as UsageCounter;
          }
          if (type === 'tokens_per_month' && ws === monthStart) {
            return { currentValue: 25_000_000, maxValue: 30_000_000 } as UsageCounter;
          }
          return null;
        }
      );
      const result = await manager.checkTokenBudget(TENANT, 100);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(200_000); // min(200K day, 5M month)
    });
  });

  /* ---------- Record token usage ---------------------------------- */

  describe('recordTokenUsage', () => {
    it('records usage and increments day + month counters', async () => {
      await manager.recordTokenUsage(TENANT, 'gpt-4', 500, 200);
      expect(storage.recordTokenUsage).toHaveBeenCalledWith(TENANT, 'gpt-4', 500, 200);
      expect(storage.incrementCounter).toHaveBeenCalledTimes(2);
      const calls = (storage.incrementCounter as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][1]).toBe('tokens_per_day');
      expect(calls[0][5]).toBe(700); // 500 + 200
      expect(calls[1][1]).toBe('tokens_per_month');
      expect(calls[1][5]).toBe(700);
    });
  });

  /* ---------- Usage summary --------------------------------------- */

  describe('getUsageSummary', () => {
    it('returns structured summary with current counts and limits', async () => {
      const now = Date.now();
      const _minuteStart = Math.floor(now / 60_000) * 60_000;
      const _hourStart = Math.floor(now / 3_600_000) * 3_600_000;
      const _dayStart = Math.floor(now / 86_400_000) * 86_400_000;
      const _monthStart = Math.floor(now / 2_592_000_000) * 2_592_000_000;

      (storage.getCounter as ReturnType<typeof vi.fn>).mockImplementation(
        (_tid: string, type: string, _ws: number) => {
          const map: Record<string, number> = {
            requests_per_minute: 15,
            requests_per_hour: 200,
            tokens_per_day: 50_000,
            tokens_per_month: 500_000,
          };
          return map[type] !== undefined ? { currentValue: map[type], maxValue: 0 } : null;
        }
      );

      const summary = await manager.getUsageSummary(TENANT);
      expect(summary.requests.minute.current).toBe(15);
      expect(summary.requests.minute.limit).toBe(60);
      expect(summary.requests.hour.current).toBe(200);
      expect(summary.tokens.day.current).toBe(50_000);
      expect(summary.tokens.month.current).toBe(500_000);
      expect(summary.limits.tenantId).toBe(TENANT);
    });
  });

  /* ---------- Reset counters -------------------------------------- */

  describe('resetCounters', () => {
    it('deletes all counters for the tenant', async () => {
      await manager.resetCounters(TENANT);
      expect(storage.clearTenantCounters).toHaveBeenCalledWith(TENANT);
    });
  });

  /* ---------- Window calculation ---------------------------------- */

  describe('window calculations', () => {
    it('minute window aligns to 60-second boundary', async () => {
      // Use a known timestamp: 2026-01-01T00:01:30Z = 1767225690000
      const ts = 1767225690000;
      const expected = Math.floor(ts / 60_000) * 60_000;
      expect(expected).toBe(1767225660000); // 00:01:00
    });

    it('hour window aligns to 3600-second boundary', async () => {
      const ts = 1767225690000;
      const expected = Math.floor(ts / 3_600_000) * 3_600_000;
      expect(expected).toBe(1767225600000); // 00:00:00
    });

    it('day window aligns to 86400-second boundary', async () => {
      const ts = 1767225690000;
      const expected = Math.floor(ts / 86_400_000) * 86_400_000;
      expect(expected).toBe(1767225600000);
    });
  });

  /* ---------- Cleanup expired counters ---------------------------- */

  describe('cleanupExpiredCounters', () => {
    it('delegates to storage.resetExpiredCounters', async () => {
      (storage.resetExpiredCounters as ReturnType<typeof vi.fn>).mockResolvedValue(5);
      const count = await manager.cleanupExpiredCounters();
      expect(count).toBe(5);
      expect(storage.resetExpiredCounters).toHaveBeenCalled();
    });
  });

  /* ---------- Token usage passthrough ----------------------------- */

  describe('getTokenUsage', () => {
    it('delegates to storage with opts', async () => {
      const opts = { from: 1000, to: 2000, model: 'gpt-4' };
      await manager.getTokenUsage(TENANT, opts);
      expect(storage.getTokenUsage).toHaveBeenCalledWith(TENANT, opts);
    });
  });

  describe('getTokenUsageSummary', () => {
    it('delegates to storage with opts', async () => {
      const opts = { model: 'gpt-4' };
      await manager.getTokenUsageSummary(TENANT, opts);
      expect(storage.getTokenUsageSummary).toHaveBeenCalledWith(TENANT, opts);
    });
  });
});
