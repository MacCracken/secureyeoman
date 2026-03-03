import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RuntimeGuard, RuntimeMonitor } from './runtime-guard.js';

describe('RuntimeGuard', () => {
  describe('checkNetwork', () => {
    it('blocks all hosts when allowlist is empty', () => {
      const guard = new RuntimeGuard({ allowedHosts: [] });
      const v = guard.checkNetwork('evil.com');
      expect(v).not.toBeNull();
      expect(v!.type).toBe('network');
      expect(v!.description).toContain('no hosts allowed');
      expect(v!.description).toContain('evil.com');
    });

    it('allows hosts on the allowlist', () => {
      const guard = new RuntimeGuard({ allowedHosts: ['api.example.com'] });
      expect(guard.checkNetwork('api.example.com')).toBeNull();
    });

    it('blocks hosts not on the allowlist', () => {
      const guard = new RuntimeGuard({ allowedHosts: ['api.example.com'] });
      const v = guard.checkNetwork('evil.com');
      expect(v).not.toBeNull();
      expect(v!.description).toContain('not in allowlist');
    });

    it('sets timestamp on violation', () => {
      const guard = new RuntimeGuard({ allowedHosts: [] });
      const before = Date.now();
      const v = guard.checkNetwork('evil.com');
      expect(v!.timestamp).toBeGreaterThanOrEqual(before);
    });
  });

  describe('checkFilesystem', () => {
    it('blocks default sensitive paths', () => {
      const guard = new RuntimeGuard();
      const v = guard.checkFilesystem('/etc/shadow');
      expect(v).not.toBeNull();
      expect(v!.type).toBe('filesystem');
      expect(v!.description).toContain('/etc/shadow');
    });

    it('blocks subpaths of sensitive paths', () => {
      const guard = new RuntimeGuard();
      const v = guard.checkFilesystem('/root/.ssh/id_rsa');
      expect(v).not.toBeNull();
    });

    it('allows non-sensitive paths', () => {
      const guard = new RuntimeGuard();
      expect(guard.checkFilesystem('/home/user/code.js')).toBeNull();
    });

    it('normalizes double slashes', () => {
      const guard = new RuntimeGuard();
      const v = guard.checkFilesystem('/etc//shadow');
      expect(v).not.toBeNull();
    });

    it('blocks custom paths', () => {
      const guard = new RuntimeGuard({ blockedPaths: ['/custom/secret'] });
      const v = guard.checkFilesystem('/custom/secret/data');
      expect(v).not.toBeNull();
    });

    it('includes path in violation', () => {
      const guard = new RuntimeGuard();
      const v = guard.checkFilesystem('/proc/self/environ');
      expect(v!.path).toBe('/proc/self/environ');
    });
  });

  describe('checkProcessCount', () => {
    it('allows within limit', () => {
      const guard = new RuntimeGuard({ maxProcesses: 10 });
      expect(guard.checkProcessCount(5)).toBeNull();
      expect(guard.checkProcessCount(10)).toBeNull();
    });

    it('detects fork bomb', () => {
      const guard = new RuntimeGuard({ maxProcesses: 10 });
      const v = guard.checkProcessCount(11);
      expect(v).not.toBeNull();
      expect(v!.type).toBe('resource');
      expect(v!.description).toContain('Fork bomb');
      expect(v!.description).toContain('11');
    });

    it('uses custom limit', () => {
      const guard = new RuntimeGuard({ maxProcesses: 3 });
      expect(guard.checkProcessCount(3)).toBeNull();
      expect(guard.checkProcessCount(4)).not.toBeNull();
    });
  });

  describe('checkDuration', () => {
    it('allows within 2x threshold', () => {
      const guard = new RuntimeGuard({ expectedDurationMs: 10_000 });
      expect(guard.checkDuration(10_000)).toBeNull();
      expect(guard.checkDuration(20_000)).toBeNull();
    });

    it('flags time anomaly beyond 2x', () => {
      const guard = new RuntimeGuard({ expectedDurationMs: 10_000 });
      const v = guard.checkDuration(20_001);
      expect(v).not.toBeNull();
      expect(v!.type).toBe('resource');
      expect(v!.description).toContain('Time anomaly');
    });

    it('includes actual duration in description', () => {
      const guard = new RuntimeGuard({ expectedDurationMs: 5_000 });
      const v = guard.checkDuration(15_000);
      expect(v!.description).toContain('15000ms');
    });
  });

  describe('default config', () => {
    it('uses sensible defaults', () => {
      const guard = new RuntimeGuard();
      // Empty allowlist → block all network
      expect(guard.checkNetwork('anything')).not.toBeNull();
      // Default blocked paths
      expect(guard.checkFilesystem('/etc/shadow')).not.toBeNull();
      expect(guard.checkFilesystem('/dev/mem')).not.toBeNull();
      expect(guard.checkFilesystem('/dev/kmem')).not.toBeNull();
      // Default max processes = 10
      expect(guard.checkProcessCount(10)).toBeNull();
      expect(guard.checkProcessCount(11)).not.toBeNull();
      // Default expected duration = 30s
      expect(guard.checkDuration(60_000)).toBeNull();
      expect(guard.checkDuration(60_001)).not.toBeNull();
    });
  });
});

describe('RuntimeMonitor', () => {
  let guard: RuntimeGuard;
  let monitor: RuntimeMonitor;

  beforeEach(() => {
    guard = new RuntimeGuard({
      allowedHosts: ['safe.com'],
      maxProcesses: 5,
      expectedDurationMs: 1_000,
    });
    monitor = new RuntimeMonitor(guard);
  });

  it('starts with no violations', () => {
    expect(monitor.hasViolations()).toBe(false);
    expect(monitor.getViolations()).toEqual([]);
  });

  it('tracks network violations', () => {
    const v = monitor.onNetworkAccess('evil.com');
    expect(v).not.toBeNull();
    expect(monitor.hasViolations()).toBe(true);
    expect(monitor.getViolations()).toHaveLength(1);
    expect(monitor.getViolations()[0]!.type).toBe('network');
  });

  it('does not track allowed network access', () => {
    const v = monitor.onNetworkAccess('safe.com');
    expect(v).toBeNull();
    expect(monitor.hasViolations()).toBe(false);
  });

  it('tracks filesystem violations', () => {
    const v = monitor.onFileAccess('/etc/shadow');
    expect(v).not.toBeNull();
    expect(monitor.getViolations()).toHaveLength(1);
    expect(monitor.getViolations()[0]!.type).toBe('filesystem');
  });

  it('tracks process violations', () => {
    const v = monitor.onProcessSpawn(10);
    expect(v).not.toBeNull();
    expect(monitor.getViolations()).toHaveLength(1);
    expect(monitor.getViolations()[0]!.type).toBe('process');
  });

  it('accumulates multiple violations', () => {
    monitor.onNetworkAccess('evil.com');
    monitor.onFileAccess('/etc/shadow');
    monitor.onProcessSpawn(100);
    expect(monitor.getViolations()).toHaveLength(3);
  });

  it('returns copies of violation list', () => {
    monitor.onNetworkAccess('evil.com');
    const v1 = monitor.getViolations();
    const v2 = monitor.getViolations();
    expect(v1).toEqual(v2);
    expect(v1).not.toBe(v2);
  });

  it('tracks duration violations', () => {
    // Manually construct a monitor with a known start time
    vi.useFakeTimers();
    const m = new RuntimeMonitor(guard);
    vi.advanceTimersByTime(3000); // 3s > 2x 1s expected
    const v = m.checkDuration();
    expect(v).not.toBeNull();
    expect(m.hasViolations()).toBe(true);
    vi.useRealTimers();
  });

  it('does not flag duration within threshold', () => {
    vi.useFakeTimers();
    const m = new RuntimeMonitor(guard);
    vi.advanceTimersByTime(500); // 500ms < 2x 1s
    const v = m.checkDuration();
    expect(v).toBeNull();
    expect(m.hasViolations()).toBe(false);
    vi.useRealTimers();
  });
});
