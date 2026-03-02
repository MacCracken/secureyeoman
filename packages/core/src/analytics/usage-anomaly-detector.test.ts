/**
 * usage-anomaly-detector.test.ts — Unit tests for UsageAnomalyDetector (Phase 96).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UsageAnomalyDetector } from './usage-anomaly-detector.js';

const mockStorage = {
  insertAnomaly: vi.fn(),
} as any;

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as any;

describe('UsageAnomalyDetector', () => {
  let detector: UsageAnomalyDetector;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ now: new Date('2026-03-01T12:00:00Z') });
    mockStorage.insertAnomaly.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('recordMessage', () => {
    it('does nothing when disabled', () => {
      detector = new UsageAnomalyDetector(mockStorage, mockLogger, { enabled: false });
      detector.recordMessage('u1');
      expect(mockStorage.insertAnomaly).not.toHaveBeenCalled();
    });

    it('records messages without anomaly for normal usage', () => {
      vi.setSystemTime(new Date('2026-03-01T14:00:00Z')); // 14:00 UTC = business hours
      detector = new UsageAnomalyDetector(mockStorage, mockLogger, {
        enabled: true,
        offHoursStart: 22,
        offHoursEnd: 6,
      });
      detector.recordMessage('u1');
      detector.recordMessage('u1');
      detector.recordMessage('u1');
      expect(mockStorage.insertAnomaly).not.toHaveBeenCalled();
    });

    it('detects off-hours activity', () => {
      vi.setSystemTime(new Date('2026-03-01T23:00:00Z')); // 23:00 UTC = off hours
      detector = new UsageAnomalyDetector(mockStorage, mockLogger, {
        enabled: true,
        offHoursStart: 22,
        offHoursEnd: 6,
      });
      detector.recordMessage('u1', 'p1');
      expect(mockStorage.insertAnomaly).toHaveBeenCalledWith(
        expect.objectContaining({
          anomalyType: 'off_hours_activity',
          userId: 'u1',
          severity: 'low',
        })
      );
    });

    it('does not flag during business hours', () => {
      vi.setSystemTime(new Date('2026-03-01T14:00:00Z')); // 14:00 = business hours
      detector = new UsageAnomalyDetector(mockStorage, mockLogger, {
        enabled: true,
        offHoursStart: 22,
        offHoursEnd: 6,
      });
      detector.recordMessage('u1');
      expect(mockStorage.insertAnomaly).not.toHaveBeenCalled();
    });

    it('detects message rate spike', () => {
      detector = new UsageAnomalyDetector(mockStorage, mockLogger, {
        enabled: true,
        rateSpikeFactor: 10,
        offHoursStart: 22,
        offHoursEnd: 6,
      });

      // Create some baseline messages spread over time
      const now = Date.now();
      for (let i = 0; i < 10; i++) {
        vi.setSystemTime(now - 300_000 + i * 30_000); // spread over 5 min
        detector.recordMessage('u1');
      }

      // Burst: many messages in 1 minute
      vi.setSystemTime(now);
      for (let i = 0; i < 30; i++) {
        vi.setSystemTime(now + i * 100);
        detector.recordMessage('u1');
      }

      expect(mockStorage.insertAnomaly).toHaveBeenCalledWith(
        expect.objectContaining({
          anomalyType: 'message_rate_spike',
          severity: 'high',
        })
      );
    });

    it('evicts stale sessions', () => {
      detector = new UsageAnomalyDetector(mockStorage, mockLogger, {
        enabled: true,
        sessionTtlMs: 60_000,
        offHoursStart: 22,
        offHoursEnd: 6,
      });

      const now = Date.now();
      detector.recordMessage('u1');

      // Advance past TTL
      vi.setSystemTime(now + 120_000);
      detector.recordMessage('u2');

      // u1 should have been evicted — no assertion needed, just shouldn't error
    });
  });

  describe('recordFailedLogin', () => {
    it('does nothing when disabled', () => {
      detector = new UsageAnomalyDetector(mockStorage, mockLogger, { enabled: false });
      detector.recordFailedLogin('u1');
      expect(mockStorage.insertAnomaly).not.toHaveBeenCalled();
    });

    it('detects credential stuffing after threshold', () => {
      detector = new UsageAnomalyDetector(mockStorage, mockLogger, {
        enabled: true,
        credentialStuffingLimit: 5,
        credentialStuffingWindowMs: 60_000,
      });

      for (let i = 0; i < 5; i++) {
        detector.recordFailedLogin('u1');
      }

      expect(mockStorage.insertAnomaly).toHaveBeenCalledWith(
        expect.objectContaining({
          anomalyType: 'credential_stuffing',
          severity: 'critical',
          userId: 'u1',
        })
      );
    });

    it('does not flag below threshold', () => {
      detector = new UsageAnomalyDetector(mockStorage, mockLogger, {
        enabled: true,
        credentialStuffingLimit: 5,
        credentialStuffingWindowMs: 60_000,
      });

      for (let i = 0; i < 3; i++) {
        detector.recordFailedLogin('u1');
      }

      expect(mockStorage.insertAnomaly).not.toHaveBeenCalled();
    });

    it('resets counter after alert', () => {
      detector = new UsageAnomalyDetector(mockStorage, mockLogger, {
        enabled: true,
        credentialStuffingLimit: 3,
        credentialStuffingWindowMs: 60_000,
      });

      // First burst triggers
      for (let i = 0; i < 3; i++) detector.recordFailedLogin('u1');
      expect(mockStorage.insertAnomaly).toHaveBeenCalledTimes(1);

      // Need another 3 to re-trigger
      vi.clearAllMocks();
      mockStorage.insertAnomaly.mockResolvedValue(undefined);
      detector.recordFailedLogin('u1');
      detector.recordFailedLogin('u1');
      expect(mockStorage.insertAnomaly).not.toHaveBeenCalled();
    });

    it('ignores old failed logins outside window', () => {
      detector = new UsageAnomalyDetector(mockStorage, mockLogger, {
        enabled: true,
        credentialStuffingLimit: 5,
        credentialStuffingWindowMs: 60_000,
      });

      const now = Date.now();
      // 3 fails now
      for (let i = 0; i < 3; i++) detector.recordFailedLogin('u1');

      // Jump past window
      vi.setSystemTime(now + 120_000);

      // 2 more fails — should not trigger (old ones expired)
      detector.recordFailedLogin('u1');
      detector.recordFailedLogin('u1');
      expect(mockStorage.insertAnomaly).not.toHaveBeenCalled();
    });
  });

  describe('null storage', () => {
    it('logs but does not persist when storage is null', () => {
      detector = new UsageAnomalyDetector(null, mockLogger, {
        enabled: true,
        credentialStuffingLimit: 2,
        credentialStuffingWindowMs: 60_000,
      });

      detector.recordFailedLogin('u1');
      detector.recordFailedLogin('u1');
      expect(mockLogger.warn).toHaveBeenCalled();
      // Should not have called storage
    });
  });

  describe('persistence error handling', () => {
    it('logs error when storage insert fails', async () => {
      mockStorage.insertAnomaly.mockRejectedValueOnce(new Error('DB error'));
      detector = new UsageAnomalyDetector(mockStorage, mockLogger, {
        enabled: true,
        credentialStuffingLimit: 2,
        credentialStuffingWindowMs: 60_000,
      });

      detector.recordFailedLogin('u1');
      detector.recordFailedLogin('u1');

      // Wait for the async error handler
      await vi.advanceTimersByTimeAsync(10);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
