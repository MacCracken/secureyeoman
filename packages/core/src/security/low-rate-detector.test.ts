import { describe, it, expect, vi, afterEach } from 'vitest';
import { LowRateDetector, createLowRateDetectorHook } from './low-rate-detector.js';
import type { LowRateDetectionConfig } from '@secureyeoman/shared';
import type { IpReputationManager } from './ip-reputation.js';

// Silence logger
vi.mock('../logging/logger.js', () => {
  const noop = () => {};
  const noopLogger = {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    child: () => noopLogger,
  };
  return {
    getLogger: () => noopLogger,
    createNoopLogger: () => noopLogger,
  };
});

function makeConfig(overrides: Partial<LowRateDetectionConfig> = {}): LowRateDetectionConfig {
  return {
    enabled: true,
    windowMs: 300_000,
    uniqueIpThreshold: 5,
    baselineMultiplier: 3,
    autoBlockParticipants: false,
    reputationPenalty: 15,
    ...overrides,
  };
}

function makeMockReputationManager(): IpReputationManager {
  return {
    recordViolation: vi.fn(),
    isBlocked: vi.fn().mockReturnValue({ blocked: false }),
    getReputation: vi.fn(),
    getStats: vi.fn(),
    manualBlock: vi.fn(),
    manualAllow: vi.fn(),
    stop: vi.fn(),
  } as unknown as IpReputationManager;
}

describe('LowRateDetector', () => {
  let detector: LowRateDetector;

  afterEach(() => {
    detector?.stop();
  });

  describe('record', () => {
    it('should add IPs to the correct route bucket', () => {
      detector = new LowRateDetector(makeConfig());

      detector.record('10.0.0.1', '/api/v1/auth/login');
      detector.record('10.0.0.2', '/api/v1/auth/register');
      detector.record('10.0.0.1', '/api/v1/chat/send');

      const stats = detector.getStats();
      expect(stats.activeBuckets).toBe(2);
      expect(stats.totalRecords).toBe(3);
    });

    it('should extract route prefix correctly from various URL patterns', () => {
      detector = new LowRateDetector(makeConfig());

      // Standard API paths
      detector.record('10.0.0.1', '/api/v1/auth/login');
      detector.record('10.0.0.2', '/api/v1/auth/register');
      // Different route prefix
      detector.record('10.0.0.3', '/api/v2/chat/send');

      const stats = detector.getStats();
      expect(stats.activeBuckets).toBe(2); // "auth" and "chat"
    });

    it('should handle URLs with query strings', () => {
      detector = new LowRateDetector(makeConfig());

      detector.record('10.0.0.1', '/api/v1/auth/login?redirect=true');
      detector.record('10.0.0.2', '/api/v1/auth/register?source=web');

      const stats = detector.getStats();
      expect(stats.activeBuckets).toBe(1); // both map to "auth"
    });
  });

  describe('window rotation', () => {
    it('should create a new bucket when window expires', () => {
      const config = makeConfig({ windowMs: 100 });
      detector = new LowRateDetector(config);

      detector.record('10.0.0.1', '/api/v1/auth/login');
      expect(detector.getStats().totalRecords).toBe(1);

      // Simulate window expiry by advancing time
      vi.useFakeTimers();
      vi.advanceTimersByTime(150);

      // Next record should trigger rotation
      detector.record('10.0.0.2', '/api/v1/auth/login');
      expect(detector.getStats().totalRecords).toBe(2);

      vi.useRealTimers();
    });
  });

  describe('analyze', () => {
    it('should detect attack pattern when many IPs exceed baseline', () => {
      detector = new LowRateDetector(makeConfig({ uniqueIpThreshold: 3, baselineMultiplier: 2 }));

      // Build baseline: push several history entries by manually recording + rotating
      // We need to simulate completed windows to build a baseline
      vi.useFakeTimers({ now: 0 });

      // Window 1: normal traffic (5 requests)
      for (let i = 0; i < 5; i++) {
        detector.record(`10.0.0.${i}`, '/api/v1/auth/login');
      }
      // Advance time to rotate the window
      vi.advanceTimersByTime(300_001);
      detector.record('10.0.0.100', '/api/v1/auth/login'); // triggers rotation

      // Window 2: normal traffic (5 requests)
      for (let i = 10; i < 15; i++) {
        detector.record(`10.0.0.${i}`, '/api/v1/auth/login');
      }
      vi.advanceTimersByTime(300_001);
      detector.record('10.0.0.100', '/api/v1/auth/login'); // triggers rotation

      // Window 3: normal traffic (5 requests)
      for (let i = 20; i < 25; i++) {
        detector.record(`10.0.0.${i}`, '/api/v1/auth/login');
      }
      vi.advanceTimersByTime(300_001);
      detector.record('10.0.0.100', '/api/v1/auth/login'); // triggers rotation

      // Now current window: attack traffic - many IPs with high count
      // Baseline should be around 6 (5 normal + 1 trigger record per window)
      // So we need > 6 * 2 = 12 requests and > 3 unique IPs
      for (let i = 50; i < 70; i++) {
        detector.record(`10.0.0.${i}`, '/api/v1/auth/login');
      }

      // Analyze current window
      detector.analyze();

      const alerts = detector.getAlerts();
      expect(alerts.length).toBe(1);
      expect(alerts[0]!.routePrefix).toBe('auth');
      expect(alerts[0]!.uniqueIps).toBeGreaterThan(3);
      expect(alerts[0]!.count).toBeGreaterThan(0);
      expect(alerts[0]!.baseline).toBeGreaterThan(0);
      expect(detector.getStats().alertsTriggered).toBe(1);

      vi.useRealTimers();
    });

    it('should ignore normal traffic below thresholds', () => {
      detector = new LowRateDetector(makeConfig({ uniqueIpThreshold: 50 }));

      vi.useFakeTimers({ now: 0 });

      // Build baseline
      for (let w = 0; w < 3; w++) {
        for (let i = 0; i < 5; i++) {
          detector.record(`10.0.0.${i}`, '/api/v1/auth/login');
        }
        vi.advanceTimersByTime(300_001);
        detector.record('10.0.0.100', '/api/v1/auth/login');
      }

      // Normal traffic — only 3 unique IPs, below threshold of 50
      for (let i = 0; i < 3; i++) {
        detector.record(`10.0.0.${i}`, '/api/v1/auth/login');
      }

      detector.analyze();

      expect(detector.getAlerts()).toHaveLength(0);
      expect(detector.getStats().alertsTriggered).toBe(0);

      vi.useRealTimers();
    });

    it('should not alert when there is no baseline history', () => {
      detector = new LowRateDetector(makeConfig({ uniqueIpThreshold: 2 }));

      // Many unique IPs but no baseline yet
      for (let i = 0; i < 100; i++) {
        detector.record(`10.0.0.${i}`, '/api/v1/auth/login');
      }

      detector.analyze();

      // No baseline → no alert
      expect(detector.getAlerts()).toHaveLength(0);

      vi.useRealTimers();
    });
  });

  describe('baseline computation', () => {
    it('should compute baseline from historical windows', () => {
      detector = new LowRateDetector(makeConfig({ uniqueIpThreshold: 2, baselineMultiplier: 2 }));

      vi.useFakeTimers({ now: 0 });

      // Build up history with varying counts
      const windowCounts = [10, 20, 15, 25, 12];
      for (const count of windowCounts) {
        for (let i = 0; i < count; i++) {
          detector.record(`10.0.${count}.${i}`, '/api/v1/auth/login');
        }
        vi.advanceTimersByTime(300_001);
        detector.record('10.0.0.200', '/api/v1/auth/login'); // triggers rotation
      }

      // Sorted counts: [11, 13, 16, 21, 26] (each window has count + 1 for the trigger)
      // Median of 5 values = 16
      // Need > 16 * 2 = 32 requests and > 2 unique IPs to trigger
      for (let i = 0; i < 40; i++) {
        detector.record(`10.0.1.${i}`, '/api/v1/auth/login');
      }

      detector.analyze();

      const alerts = detector.getAlerts();
      expect(alerts.length).toBe(1);
      expect(alerts[0]!.baseline).toBeGreaterThan(0);

      vi.useRealTimers();
    });
  });

  describe('reputation penalty', () => {
    it('should apply reputation penalty when autoBlockParticipants is true', () => {
      const reputationMgr = makeMockReputationManager();
      detector = new LowRateDetector(
        makeConfig({
          uniqueIpThreshold: 2,
          baselineMultiplier: 2,
          autoBlockParticipants: true,
          reputationPenalty: 15,
        }),
        reputationMgr
      );

      vi.useFakeTimers({ now: 0 });

      // Build baseline
      for (let w = 0; w < 3; w++) {
        for (let i = 0; i < 5; i++) {
          detector.record(`10.0.0.${i}`, '/api/v1/auth/login');
        }
        vi.advanceTimersByTime(300_001);
        detector.record('10.0.0.100', '/api/v1/auth/login');
      }

      // Attack traffic — these IPs plus 10.0.0.100 (from rotation trigger) are in the bucket
      const attackIps = ['192.168.1.1', '192.168.1.2', '192.168.1.3', '192.168.1.4'];
      for (let i = 0; i < 50; i++) {
        detector.record(attackIps[i % attackIps.length]!, '/api/v1/auth/login');
      }

      detector.analyze();

      expect(detector.getAlerts().length).toBe(1);
      // Each unique participating IP should get a recordViolation call
      // The bucket includes attackIps + the rotation trigger IP (10.0.0.100)
      expect(reputationMgr.recordViolation).toHaveBeenCalledTimes(attackIps.length + 1);
      for (const ip of attackIps) {
        expect(reputationMgr.recordViolation).toHaveBeenCalledWith(ip, 15, 'low_rate_attack');
      }

      vi.useRealTimers();
    });

    it('should not apply reputation penalty when autoBlockParticipants is false', () => {
      const reputationMgr = makeMockReputationManager();
      detector = new LowRateDetector(
        makeConfig({ uniqueIpThreshold: 2, baselineMultiplier: 2, autoBlockParticipants: false }),
        reputationMgr
      );

      vi.useFakeTimers({ now: 0 });

      // Build baseline
      for (let w = 0; w < 3; w++) {
        for (let i = 0; i < 5; i++) {
          detector.record(`10.0.0.${i}`, '/api/v1/auth/login');
        }
        vi.advanceTimersByTime(300_001);
        detector.record('10.0.0.100', '/api/v1/auth/login');
      }

      // Attack traffic
      for (let i = 0; i < 50; i++) {
        detector.record(`192.168.1.${i % 10}`, '/api/v1/auth/login');
      }

      detector.analyze();

      expect(detector.getAlerts().length).toBe(1);
      expect(reputationMgr.recordViolation).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('getAlerts', () => {
    it('should return recent detections', () => {
      detector = new LowRateDetector(makeConfig({ uniqueIpThreshold: 2, baselineMultiplier: 2 }));

      vi.useFakeTimers({ now: 0 });

      // Build baseline
      for (let w = 0; w < 3; w++) {
        for (let i = 0; i < 5; i++) {
          detector.record(`10.0.0.${i}`, '/api/v1/auth/login');
        }
        vi.advanceTimersByTime(300_001);
        detector.record('10.0.0.100', '/api/v1/auth/login');
      }

      // Trigger an alert
      for (let i = 0; i < 50; i++) {
        detector.record(`10.0.1.${i}`, '/api/v1/auth/login');
      }
      detector.analyze();

      const alerts = detector.getAlerts();
      expect(alerts.length).toBe(1);
      expect(alerts[0]).toMatchObject({
        routePrefix: 'auth',
        detectedAt: expect.any(Number),
      });
      expect(alerts[0]!.uniqueIps).toBeGreaterThan(2);
      expect(alerts[0]!.count).toBeGreaterThan(0);
      expect(alerts[0]!.baseline).toBeGreaterThan(0);

      vi.useRealTimers();
    });
  });

  describe('getStats', () => {
    it('should return correct aggregate stats', () => {
      detector = new LowRateDetector(makeConfig());

      expect(detector.getStats()).toEqual({
        activeBuckets: 0,
        totalRecords: 0,
        alertsTriggered: 0,
      });

      detector.record('10.0.0.1', '/api/v1/auth/login');
      detector.record('10.0.0.2', '/api/v1/chat/send');

      expect(detector.getStats()).toEqual({
        activeBuckets: 2,
        totalRecords: 2,
        alertsTriggered: 0,
      });
    });
  });

  describe('disabled detector', () => {
    it('should do nothing when disabled', () => {
      detector = new LowRateDetector(makeConfig({ enabled: false }));

      detector.record('10.0.0.1', '/api/v1/auth/login');
      detector.record('10.0.0.2', '/api/v1/auth/register');

      expect(detector.getStats()).toEqual({
        activeBuckets: 0,
        totalRecords: 0,
        alertsTriggered: 0,
      });

      detector.analyze();
      expect(detector.getAlerts()).toHaveLength(0);
    });
  });

  describe('createLowRateDetectorHook', () => {
    it('should return a function that calls detector.record', async () => {
      detector = new LowRateDetector(makeConfig());
      const hook = createLowRateDetectorHook(detector);

      const request = { ip: '10.0.0.1', url: '/api/v1/auth/login' } as any;
      const reply = {} as any;

      await hook(request, reply);

      expect(detector.getStats().totalRecords).toBe(1);
    });
  });
});
