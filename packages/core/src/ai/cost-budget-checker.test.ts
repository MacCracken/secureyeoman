import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CostBudgetChecker } from './cost-budget-checker.js';
import type { ProviderAccountStorage } from './provider-account-storage.js';
import type { AlertManager } from '../telemetry/alert-manager.js';

function mockStorage(daily = 0, monthly = 0): ProviderAccountStorage {
  return {
    getPersonalityCostTotal: vi
      .fn()
      .mockImplementation((_pid: string, from: number, _to: number) => {
        // Rough heuristic: if "from" is start-of-month (day=1), return monthly; else daily
        const d = new Date(from);
        return Promise.resolve(d.getUTCDate() === 1 && d.getUTCHours() === 0 ? monthly : daily);
      }),
  } as unknown as ProviderAccountStorage;
}

function mockAlertManager(): AlertManager {
  return { evaluate: vi.fn().mockResolvedValue(undefined) } as unknown as AlertManager;
}

describe('CostBudgetChecker', () => {
  let checker: CostBudgetChecker;
  let storage: ProviderAccountStorage;
  let alertMgr: AlertManager;

  beforeEach(() => {
    storage = mockStorage();
    alertMgr = mockAlertManager();
    checker = new CostBudgetChecker(storage, () => alertMgr);
  });

  it('returns allowed when no budget is set', async () => {
    const result = await checker.checkBudget('p1', undefined);
    expect(result.allowed).toBe(true);
    expect(result.dailyPct).toBe(0);
    expect(result.monthlyPct).toBe(0);
  });

  it('returns allowed when under daily limit', async () => {
    storage = mockStorage(5, 10);
    checker = new CostBudgetChecker(storage, () => alertMgr);

    const result = await checker.checkBudget('p1', { dailyUsd: 20, monthlyUsd: 100 });
    expect(result.allowed).toBe(true);
    expect(result.dailyUsed).toBe(5);
  });

  it('blocks when daily limit exceeded', async () => {
    storage = mockStorage(25, 25);
    checker = new CostBudgetChecker(storage, () => alertMgr);

    const result = await checker.checkBudget('p1', { dailyUsd: 20, monthlyUsd: 100 });
    expect(result.allowed).toBe(false);
    expect(result.blockedBy).toBe('daily');
  });

  it('blocks when monthly limit exceeded', async () => {
    storage = mockStorage(5, 120);
    checker = new CostBudgetChecker(storage, () => alertMgr);

    const result = await checker.checkBudget('p1', { dailyUsd: 20, monthlyUsd: 100 });
    expect(result.allowed).toBe(false);
    expect(result.blockedBy).toBe('monthly');
  });

  it('emits alert at 80% daily usage', async () => {
    storage = mockStorage(16, 10);
    checker = new CostBudgetChecker(storage, () => alertMgr);

    await checker.checkBudget('p1', { dailyUsd: 20, monthlyUsd: 100 });
    expect(alertMgr.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        costs: expect.objectContaining({
          budget_warning: expect.objectContaining({ personalityId: 'p1' }),
        }),
      })
    );
  });

  it('emits alert at 80% monthly usage', async () => {
    storage = mockStorage(5, 85);
    checker = new CostBudgetChecker(storage, () => alertMgr);

    await checker.checkBudget('p1', { dailyUsd: 20, monthlyUsd: 100 });
    expect(alertMgr.evaluate).toHaveBeenCalled();
  });

  it('does not emit alert when under 80%', async () => {
    storage = mockStorage(5, 10);
    checker = new CostBudgetChecker(storage, () => alertMgr);

    await checker.checkBudget('p1', { dailyUsd: 20, monthlyUsd: 100 });
    expect(alertMgr.evaluate).not.toHaveBeenCalled();
  });

  it('gracefully proceeds on storage error', async () => {
    const brokenStorage = {
      getPersonalityCostTotal: vi.fn().mockRejectedValue(new Error('db down')),
    } as unknown as ProviderAccountStorage;
    checker = new CostBudgetChecker(brokenStorage, () => alertMgr);

    const result = await checker.checkBudget('p1', { dailyUsd: 20, monthlyUsd: 100 });
    expect(result.allowed).toBe(true);
  });

  it('uses cached values within 30s', async () => {
    storage = mockStorage(5, 10);
    checker = new CostBudgetChecker(storage, () => alertMgr);

    await checker.checkBudget('p1', { dailyUsd: 20, monthlyUsd: 100 });
    const callCount = (storage.getPersonalityCostTotal as ReturnType<typeof vi.fn>).mock.calls
      .length;

    await checker.checkBudget('p1', { dailyUsd: 20, monthlyUsd: 100 });
    // Should not have made additional DB calls
    expect((storage.getPersonalityCostTotal as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      callCount
    );
  });

  it('works when only daily budget is set', async () => {
    storage = mockStorage(5, 0);
    checker = new CostBudgetChecker(storage, () => alertMgr);

    const result = await checker.checkBudget('p1', { dailyUsd: 20 });
    expect(result.allowed).toBe(true);
    expect(result.monthlyPct).toBe(0);
  });

  it('works when only monthly budget is set', async () => {
    storage = mockStorage(0, 50);
    checker = new CostBudgetChecker(storage, () => alertMgr);

    const result = await checker.checkBudget('p1', { monthlyUsd: 100 });
    expect(result.allowed).toBe(true);
    expect(result.dailyPct).toBe(0);
  });

  it('works without alert manager', async () => {
    storage = mockStorage(18, 90);
    checker = new CostBudgetChecker(storage);

    // Should not throw even when emitting alerts
    const result = await checker.checkBudget('p1', { dailyUsd: 20, monthlyUsd: 100 });
    expect(result.allowed).toBe(true);
  });

  it('handles alert manager evaluate rejection gracefully', async () => {
    const failAlertMgr = {
      evaluate: vi.fn().mockRejectedValue(new Error('alert failed')),
    } as unknown as AlertManager;
    storage = mockStorage(18, 90);
    checker = new CostBudgetChecker(storage, () => failAlertMgr);

    const result = await checker.checkBudget('p1', { dailyUsd: 20, monthlyUsd: 100 });
    // Should not throw and should still be allowed
    expect(result.allowed).toBe(true);
  });
});
