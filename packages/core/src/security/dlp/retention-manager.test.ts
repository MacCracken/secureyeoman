import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RetentionManager } from './retention-manager.js';
import type { RetentionStore } from './retention-store.js';
import type { RetentionPolicy } from './types.js';

function makePolicy(overrides: Partial<RetentionPolicy> = {}): RetentionPolicy {
  return {
    id: 'pol-1',
    contentType: 'conversation',
    retentionDays: 30,
    classificationLevel: null,
    enabled: true,
    lastPurgeAt: null,
    createdAt: 1000,
    updatedAt: 1000,
    tenantId: 'default',
    ...overrides,
  };
}

function makeMockStore(): RetentionStore {
  return {
    create: vi.fn(),
    getByContentType: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    delete: vi.fn(),
    updateLastPurge: vi.fn(),
    purgeClassifications: vi.fn().mockResolvedValue(0),
    countEligible: vi.fn().mockResolvedValue(0),
    close: vi.fn(),
  } as unknown as RetentionStore;
}

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as any;
}

describe('RetentionManager', () => {
  let store: ReturnType<typeof makeMockStore>;
  let logger: ReturnType<typeof makeLogger>;
  let manager: RetentionManager;

  beforeEach(() => {
    vi.useFakeTimers();
    store = makeMockStore();
    logger = makeLogger();
    manager = new RetentionManager({ retentionStore: store, logger, purgeIntervalMs: 1000 });
  });

  afterEach(() => {
    manager.stop();
    vi.useRealTimers();
  });

  describe('runPurge', () => {
    it('purges content matching enabled policies', async () => {
      const policy = makePolicy({ retentionDays: 30 });
      (store.list as any).mockResolvedValue([policy]);
      (store.purgeClassifications as any).mockResolvedValue(5);

      const result = await manager.runPurge();

      expect(result.totalPurged).toBe(5);
      expect(result.policiesApplied).toBe(1);
      expect(result.details).toHaveLength(1);
      expect(result.details[0].policyId).toBe('pol-1');
      expect(result.details[0].purgedCount).toBe(5);
      expect(store.updateLastPurge).toHaveBeenCalledWith('pol-1', expect.any(Number));
    });

    it('skips disabled policies', async () => {
      const policy = makePolicy({ enabled: false });
      (store.list as any).mockResolvedValue([policy]);

      const result = await manager.runPurge();

      expect(result.totalPurged).toBe(0);
      expect(result.policiesApplied).toBe(0);
      expect(store.purgeClassifications).not.toHaveBeenCalled();
    });

    it('handles multiple policies', async () => {
      const p1 = makePolicy({ id: 'pol-1', contentType: 'conversation' });
      const p2 = makePolicy({ id: 'pol-2', contentType: 'document', classificationLevel: 'restricted' });
      (store.list as any).mockResolvedValue([p1, p2]);
      (store.purgeClassifications as any)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(7);

      const result = await manager.runPurge();

      expect(result.totalPurged).toBe(10);
      expect(result.policiesApplied).toBe(2);
      expect(store.purgeClassifications).toHaveBeenCalledTimes(2);
    });

    it('does not update lastPurge when nothing purged', async () => {
      const policy = makePolicy();
      (store.list as any).mockResolvedValue([policy]);
      (store.purgeClassifications as any).mockResolvedValue(0);

      const result = await manager.runPurge();

      expect(result.totalPurged).toBe(0);
      expect(store.updateLastPurge).not.toHaveBeenCalled();
    });

    it('passes correct cutoff timestamp to store', async () => {
      const policy = makePolicy({ retentionDays: 7 });
      (store.list as any).mockResolvedValue([policy]);
      (store.purgeClassifications as any).mockResolvedValue(1);

      const now = Date.now();
      await manager.runPurge();

      const callArgs = (store.purgeClassifications as any).mock.calls[0];
      expect(callArgs[0]).toBe('conversation');
      // cutoff should be approximately now - 7 days
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      expect(callArgs[1]).toBeGreaterThanOrEqual(now - sevenDaysMs - 100);
      expect(callArgs[1]).toBeLessThanOrEqual(now - sevenDaysMs + 100);
    });

    it('passes classification level to store when specified', async () => {
      const policy = makePolicy({ classificationLevel: 'confidential' });
      (store.list as any).mockResolvedValue([policy]);
      (store.purgeClassifications as any).mockResolvedValue(2);

      await manager.runPurge();

      const callArgs = (store.purgeClassifications as any).mock.calls[0];
      expect(callArgs[2]).toBe('confidential');
    });
  });

  describe('preview', () => {
    it('returns counts without deleting', async () => {
      const policy = makePolicy();
      (store.list as any).mockResolvedValue([policy]);
      (store.countEligible as any).mockResolvedValue(15);

      const preview = await manager.preview();

      expect(preview.totalEligible).toBe(15);
      expect(preview.details).toHaveLength(1);
      expect(preview.details[0].eligibleCount).toBe(15);
      expect(store.purgeClassifications).not.toHaveBeenCalled();
    });

    it('skips disabled policies in preview', async () => {
      const policy = makePolicy({ enabled: false });
      (store.list as any).mockResolvedValue([policy]);

      const preview = await manager.preview();

      expect(preview.totalEligible).toBe(0);
      expect(store.countEligible).not.toHaveBeenCalled();
    });

    it('omits policies with zero eligible', async () => {
      const policy = makePolicy();
      (store.list as any).mockResolvedValue([policy]);
      (store.countEligible as any).mockResolvedValue(0);

      const preview = await manager.preview();

      expect(preview.totalEligible).toBe(0);
      expect(preview.details).toHaveLength(0);
    });
  });

  describe('timer', () => {
    it('starts periodic purge timer', () => {
      manager.start();
      expect(logger.info).toHaveBeenCalledWith(
        { intervalMs: 1000 },
        'Retention manager started'
      );
    });

    it('stop clears the timer', () => {
      manager.start();
      manager.stop();
      expect(logger.info).toHaveBeenCalledWith('Retention manager stopped');
    });

    it('does not double-start', () => {
      manager.start();
      manager.start(); // second call should be no-op
      // Only one "started" log
      const startCalls = (logger.info as any).mock.calls.filter(
        (c: any[]) => typeof c[1] === 'string' && c[1].includes('started')
      );
      expect(startCalls).toHaveLength(1);
    });

    it('stop is safe to call when not started', () => {
      manager.stop(); // should not throw
      expect(logger.info).not.toHaveBeenCalledWith('Retention manager stopped');
    });

    it('timer triggers purge at interval', async () => {
      const policy = makePolicy();
      (store.list as any).mockResolvedValue([policy]);
      (store.purgeClassifications as any).mockResolvedValue(1);

      manager.start();

      // Advance timer by the purge interval
      await vi.advanceTimersByTimeAsync(1000);

      expect(store.list).toHaveBeenCalled();
      expect(store.purgeClassifications).toHaveBeenCalled();
    });
  });
});
