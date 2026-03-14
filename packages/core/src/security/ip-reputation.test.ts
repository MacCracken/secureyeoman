import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IpReputationManager, createIpReputationHook } from './ip-reputation.js';
import type { IpReputationConfig } from '@secureyeoman/shared';

// Suppress logger initialisation side-effects during tests
vi.mock('../logging/logger.js', () => {
  const noop = () => {};
  const noopLogger = {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    trace: noop,
    fatal: noop,
    child: () => noopLogger,
  };
  return {
    getLogger: () => noopLogger,
    createNoopLogger: () => noopLogger,
  };
});

const defaultConfig: IpReputationConfig = {
  enabled: true,
  autoBlockThreshold: 80,
  scoreDecayHalfLifeMs: 3_600_000, // 1 hour
  blockDurationMs: 86_400_000, // 24 hours
  maxCacheSize: 10_000,
};

describe('IpReputationManager', () => {
  let manager: IpReputationManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new IpReputationManager(defaultConfig);
  });

  afterEach(() => {
    manager.stop();
    vi.useRealTimers();
  });

  // ── recordViolation ────────────────────────────────────────────

  it('should increment score on violation', () => {
    manager.recordViolation('1.2.3.4', 10, 'test');
    const rep = manager.getReputation('1.2.3.4');
    expect(rep).not.toBeNull();
    expect(rep!.score).toBeCloseTo(10);
    expect(rep!.blocked).toBe(false);
  });

  it('should accumulate violations', () => {
    manager.recordViolation('1.2.3.4', 30, 'a');
    manager.recordViolation('1.2.3.4', 30, 'b');
    const rep = manager.getReputation('1.2.3.4');
    expect(rep!.score).toBeCloseTo(60);
    expect(rep!.blocked).toBe(false);
  });

  // ── auto-block ─────────────────────────────────────────────────

  it('should auto-block when score exceeds threshold', () => {
    manager.recordViolation('1.2.3.4', 50, 'a');
    manager.recordViolation('1.2.3.4', 40, 'b');
    const rep = manager.getReputation('1.2.3.4');
    expect(rep!.blocked).toBe(true);

    const check = manager.isBlocked('1.2.3.4');
    expect(check.blocked).toBe(true);
    expect(check.reason).toBe('b');
  });

  // ── score decay ────────────────────────────────────────────────

  it('should decay score over time', () => {
    manager.recordViolation('1.2.3.4', 80, 'test');
    // Score exactly at threshold → blocked
    expect(manager.isBlocked('1.2.3.4').blocked).toBe(true);

    // Advance one half-life (1 hour)
    vi.advanceTimersByTime(3_600_000);

    // Score should have decayed to ~40 which is below 80 threshold
    const check = manager.isBlocked('1.2.3.4');
    expect(check.blocked).toBe(false);

    const rep = manager.getReputation('1.2.3.4');
    // isBlocked already decayed and updated lastUpdated, so getReputation sees 0 additional elapsed
    expect(rep!.score).toBeCloseTo(40, 0);
  });

  it('should auto-unblock when decayed score drops below threshold', () => {
    manager.recordViolation('1.2.3.4', 100, 'test');
    expect(manager.isBlocked('1.2.3.4').blocked).toBe(true);

    // After one half-life, score ~50 — below 80
    vi.advanceTimersByTime(3_600_000);
    const check = manager.isBlocked('1.2.3.4');
    expect(check.blocked).toBe(false);
  });

  // ── block expiry ───────────────────────────────────────────────

  it('should expire block after blockDurationMs', () => {
    manager.recordViolation('1.2.3.4', 100, 'test');
    expect(manager.isBlocked('1.2.3.4').blocked).toBe(true);

    // Advance past block duration (24 hours)
    vi.advanceTimersByTime(86_400_001);
    const check = manager.isBlocked('1.2.3.4');
    expect(check.blocked).toBe(false);
  });

  // ── manual block / allow ───────────────────────────────────────

  it('should manually block an IP', () => {
    manager.manualBlock('5.6.7.8', 'suspicious activity');
    const check = manager.isBlocked('5.6.7.8');
    expect(check.blocked).toBe(true);
    expect(check.reason).toBe('suspicious activity');
    expect(check.retryAfter).toBeGreaterThan(0);
  });

  it('should manually allow (unblock) an IP', () => {
    manager.recordViolation('1.2.3.4', 100, 'test');
    expect(manager.isBlocked('1.2.3.4').blocked).toBe(true);

    manager.manualAllow('1.2.3.4');
    expect(manager.isBlocked('1.2.3.4').blocked).toBe(false);
    expect(manager.getReputation('1.2.3.4')).toBeNull();
  });

  it('should support manual block with custom duration', () => {
    manager.manualBlock('5.6.7.8', 'temp block', 5000);
    expect(manager.isBlocked('5.6.7.8').blocked).toBe(true);

    vi.advanceTimersByTime(5001);
    expect(manager.isBlocked('5.6.7.8').blocked).toBe(false);
  });

  // ── LRU eviction ──────────────────────────────────────────────

  it('should evict least-recently-used entries but not blocked IPs', () => {
    const smallConfig: IpReputationConfig = { ...defaultConfig, maxCacheSize: 3 };
    const mgr = new IpReputationManager(smallConfig);

    // Add 3 IPs — the third one triggers a block
    mgr.recordViolation('10.0.0.1', 5, 'a');
    mgr.recordViolation('10.0.0.2', 5, 'b');
    mgr.recordViolation('10.0.0.3', 100, 'c'); // blocked

    // Now add a 4th — should evict 10.0.0.1 (oldest non-blocked)
    mgr.recordViolation('10.0.0.4', 5, 'd');

    expect(mgr.getReputation('10.0.0.1')).toBeNull();
    expect(mgr.getReputation('10.0.0.3')).not.toBeNull();
    expect(mgr.getReputation('10.0.0.3')!.blocked).toBe(true);
    expect(mgr.getReputation('10.0.0.4')).not.toBeNull();

    mgr.stop();
  });

  // ── isBlocked retry-after ──────────────────────────────────────

  it('should return retry-after in seconds', () => {
    manager.manualBlock('1.2.3.4', 'test');
    const check = manager.isBlocked('1.2.3.4');
    expect(check.blocked).toBe(true);
    // retryAfter should be approximately blockDurationMs / 1000
    expect(check.retryAfter).toBe(Math.ceil(86_400_000 / 1000));
  });

  // ── getStats ───────────────────────────────────────────────────

  it('should return correct stats', () => {
    manager.recordViolation('1.1.1.1', 100, 'a');
    manager.recordViolation('2.2.2.2', 10, 'b');
    manager.recordViolation('3.3.3.3', 5, 'c');

    const stats = manager.getStats();
    expect(stats.trackedIps).toBe(3);
    expect(stats.blockedIps).toBe(1); // only 1.1.1.1 exceeds threshold
    expect(stats.totalViolations).toBe(3);
  });

  // ── isBlocked for unknown IP ───────────────────────────────────

  it('should return not blocked for unknown IP', () => {
    const check = manager.isBlocked('9.9.9.9');
    expect(check.blocked).toBe(false);
    expect(check.reason).toBeUndefined();
  });
});

// ── Fastify hook ──────────────────────────────────────────────────

describe('createIpReputationHook', () => {
  let manager: IpReputationManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new IpReputationManager(defaultConfig);
  });

  afterEach(() => {
    manager.stop();
    vi.useRealTimers();
  });

  it('should return 403 for blocked IPs', async () => {
    manager.manualBlock('1.2.3.4', 'bad actor');

    const hook = createIpReputationHook(manager);

    const headers: Record<string, string> = {};
    const request = { ip: '1.2.3.4' } as any;
    const reply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      header: vi.fn().mockImplementation((k: string, v: string) => {
        headers[k] = v;
        return reply;
      }),
    } as any;

    await hook(request, reply);

    expect(reply.code).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(headers['Retry-After']).toBeDefined();
  });

  it('should pass through for non-blocked IPs', async () => {
    const hook = createIpReputationHook(manager);

    const request = { ip: '5.6.7.8' } as any;
    const reply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
    } as any;

    await hook(request, reply);

    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });
});
