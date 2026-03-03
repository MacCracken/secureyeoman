/**
 * CostBudgetChecker — per-personality cost budget enforcement.
 *
 * Checks daily and monthly spend against configured budgets.
 * Emits alert at 80% usage, blocks requests at 100%.
 * Uses a 30s in-memory cache per personality to avoid per-request DB queries.
 *
 * Phase 119 — LLM Provider Improvements
 */

import type { CostBudget } from '@secureyeoman/shared';
import type { ProviderAccountStorage } from './provider-account-storage.js';
import type { AlertManager } from '../telemetry/alert-manager.js';

export interface BudgetCheckResult {
  allowed: boolean;
  dailyUsed: number;
  monthlyUsed: number;
  dailyPct: number;
  monthlyPct: number;
  blockedBy?: 'daily' | 'monthly';
}

interface CacheEntry {
  dailyUsed: number;
  monthlyUsed: number;
  ts: number;
}

const CACHE_TTL_MS = 30_000;
const ALERT_THRESHOLD = 0.8;

export class CostBudgetChecker {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly storage: ProviderAccountStorage,
    private readonly getAlertManager?: () => AlertManager | null
  ) {}

  async checkBudget(personalityId: string, budget: CostBudget): Promise<BudgetCheckResult> {
    if (!budget) {
      return { allowed: true, dailyUsed: 0, monthlyUsed: 0, dailyPct: 0, monthlyPct: 0 };
    }

    let dailyUsed: number;
    let monthlyUsed: number;

    const cached = this.cache.get(personalityId);
    const now = Date.now();

    if (cached && now - cached.ts < CACHE_TTL_MS) {
      dailyUsed = cached.dailyUsed;
      monthlyUsed = cached.monthlyUsed;
    } else {
      try {
        const todayStart = this.getUtcDayStartMs(now);
        const monthStart = this.getUtcMonthStartMs(now);

        [dailyUsed, monthlyUsed] = await Promise.all([
          budget.dailyUsd
            ? this.storage.getPersonalityCostTotal(personalityId, todayStart, now)
            : Promise.resolve(0),
          budget.monthlyUsd
            ? this.storage.getPersonalityCostTotal(personalityId, monthStart, now)
            : Promise.resolve(0),
        ]);

        this.cache.set(personalityId, { dailyUsed, monthlyUsed, ts: now });
      } catch {
        // On storage error, allow the request (graceful degradation)
        return { allowed: true, dailyUsed: 0, monthlyUsed: 0, dailyPct: 0, monthlyPct: 0 };
      }
    }

    const dailyPct = budget.dailyUsd ? dailyUsed / budget.dailyUsd : 0;
    const monthlyPct = budget.monthlyUsd ? monthlyUsed / budget.monthlyUsd : 0;

    // Emit alert at 80%
    if (dailyPct >= ALERT_THRESHOLD || monthlyPct >= ALERT_THRESHOLD) {
      this.emitBudgetAlert(personalityId, dailyUsed, monthlyUsed, budget);
    }

    // Block at 100%
    if (budget.dailyUsd && dailyUsed >= budget.dailyUsd) {
      return { allowed: false, dailyUsed, monthlyUsed, dailyPct, monthlyPct, blockedBy: 'daily' };
    }
    if (budget.monthlyUsd && monthlyUsed >= budget.monthlyUsd) {
      return {
        allowed: false,
        dailyUsed,
        monthlyUsed,
        dailyPct,
        monthlyPct,
        blockedBy: 'monthly',
      };
    }

    return { allowed: true, dailyUsed, monthlyUsed, dailyPct, monthlyPct };
  }

  private emitBudgetAlert(
    personalityId: string,
    dailyUsed: number,
    monthlyUsed: number,
    budget: CostBudget
  ): void {
    const alertManager = this.getAlertManager?.();
    if (!alertManager) return;

    alertManager
      .evaluate({
        costs: {
          budget_warning: {
            personalityId,
            dailyUsed,
            monthlyUsed,
            dailyLimit: budget?.dailyUsd ?? null,
            monthlyLimit: budget?.monthlyUsd ?? null,
          },
        },
      })
      .catch(() => {
        /* alert failures are non-fatal */
      });
  }

  private getUtcDayStartMs(now: number): number {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  }

  private getUtcMonthStartMs(now: number): number {
    const d = new Date(now);
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  }
}
