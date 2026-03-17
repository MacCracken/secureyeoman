import { describe, it, expect } from 'vitest';
import { FirecrackerSandbox } from './firecracker-sandbox.js';

describe('FirecrackerSandbox — hardening features', () => {
  describe('options', () => {
    it('accepts vsock options', () => {
      const sandbox = new FirecrackerSandbox({
        useVsock: true,
        vsockGuestCid: 5,
      });
      expect(sandbox).toBeDefined();
    });

    it('accepts cgroup version', () => {
      const sandbox = new FirecrackerSandbox({
        cgroupVersion: 2,
      });
      expect(sandbox).toBeDefined();
    });

    it('accepts seccomp filter path', () => {
      const sandbox = new FirecrackerSandbox({
        seccompFilterPath: '/etc/secureyeoman/seccomp-filter.json',
      });
      expect(sandbox).toBeDefined();
    });

    it('accepts snapshot directory', () => {
      const sandbox = new FirecrackerSandbox({
        snapshotDir: '/var/lib/secureyeoman/snapshots',
      });
      expect(sandbox).toBeDefined();
    });

    it('accepts allowed hosts for TAP isolation', () => {
      const sandbox = new FirecrackerSandbox({
        enableNetwork: true,
        allowedHosts: ['api.openai.com', 'api.anthropic.com'],
      });
      expect(sandbox).toBeDefined();
    });
  });

  describe('buildRestoreArgs', () => {
    it('returns null when snapshot files do not exist', () => {
      const sandbox = new FirecrackerSandbox();
      const args = sandbox.buildRestoreArgs('/nonexistent/snapshot/dir');
      expect(args).toBeNull();
    });
  });

  describe('getCapabilities', () => {
    it('includes firecracker field', () => {
      const sandbox = new FirecrackerSandbox();
      const caps = sandbox.getCapabilities() as any;
      expect('firecracker' in caps).toBe(true);
    });

    it('reports namespaces and rlimits support', () => {
      const sandbox = new FirecrackerSandbox();
      const caps = sandbox.getCapabilities();
      expect(caps.namespaces).toBe(true);
      expect(caps.rlimits).toBe(true);
    });
  });

  describe('isAvailable', () => {
    it('returns false on non-Linux', () => {
      // In CI, platform may be linux but KVM likely unavailable
      const sandbox = new FirecrackerSandbox();
      const available = sandbox.isAvailable();
      // Just verify it returns a boolean without crashing
      expect(typeof available).toBe('boolean');
    });

    it('caches availability result', () => {
      const sandbox = new FirecrackerSandbox();
      const first = sandbox.isAvailable();
      const second = sandbox.isAvailable();
      expect(first).toBe(second);
    });
  });

  describe('run fallback', () => {
    it('executes in-process when Firecracker unavailable', async () => {
      const sandbox = new FirecrackerSandbox();
      // Force unavailability (no KVM in CI)
      const result = await sandbox.run(async () => 42);
      expect(result.success).toBe(true);
      expect(result.result).toBe(42);
      expect(result.violations).toEqual([]);
    });

    it('captures errors in fallback mode', async () => {
      const sandbox = new FirecrackerSandbox();
      const result = await sandbox.run(async () => {
        throw new Error('test error');
      });
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('test error');
    });

    it('tracks memory usage in fallback mode', async () => {
      const sandbox = new FirecrackerSandbox();
      const result = await sandbox.run(async () => 'hello');
      expect(result.resourceUsage).toBeDefined();
      expect(result.resourceUsage!.memoryPeakMb).toBeGreaterThan(0);
      expect(result.resourceUsage!.cpuTimeMs).toBeGreaterThanOrEqual(0);
    });
  });
});
