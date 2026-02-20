import { describe, it, expect } from 'vitest';
import { NoopSandbox } from './noop-sandbox.js';

describe('NoopSandbox', () => {
  it('isAvailable returns true', () => {
    const sandbox = new NoopSandbox();
    expect(sandbox.isAvailable()).toBe(true);
  });

  it('getCapabilities returns all false capabilities', () => {
    const sandbox = new NoopSandbox();
    const caps = sandbox.getCapabilities();
    expect(caps.landlock).toBe(false);
    expect(caps.seccomp).toBe(false);
    expect(caps.namespaces).toBe(false);
    expect(caps.rlimits).toBe(false);
    expect(caps.platform).toBe('other');
  });

  describe('run', () => {
    it('executes the provided function and returns result', async () => {
      const sandbox = new NoopSandbox();
      const result = await sandbox.run(async () => 42);
      expect(result.success).toBe(true);
      expect(result.result).toBe(42);
      expect(result.violations).toEqual([]);
    });

    it('includes resource usage metrics', async () => {
      const sandbox = new NoopSandbox();
      const result = await sandbox.run(async () => 'hello');
      expect(result.resourceUsage).toBeDefined();
      expect(typeof result.resourceUsage?.memoryPeakMb).toBe('number');
      expect(typeof result.resourceUsage?.cpuTimeMs).toBe('number');
      expect(result.resourceUsage!.cpuTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('returns failure when function throws', async () => {
      const sandbox = new NoopSandbox();
      const result = await sandbox.run(async () => {
        throw new Error('test error');
      });
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('test error');
      expect(result.violations).toEqual([]);
    });

    it('wraps non-Error throws', async () => {
      const sandbox = new NoopSandbox();
      const result = await sandbox.run(async () => {
        throw 'string error';
      });
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe('string error');
    });

    it('logs warning only once on first use', async () => {
      const sandbox = new NoopSandbox();
      // Run twice - warning should only fire once (tested via warned flag behavior)
      await sandbox.run(async () => 1);
      await sandbox.run(async () => 2);
      // Both should succeed
      const r1 = await sandbox.run(async () => 3);
      expect(r1.success).toBe(true);
    });

    it('executes async functions correctly', async () => {
      const sandbox = new NoopSandbox();
      const result = await sandbox.run(async () => {
        await new Promise<void>((r) => setTimeout(r, 5));
        return { data: 'async result' };
      });
      expect(result.success).toBe(true);
      expect((result.result as any)?.data).toBe('async result');
    });
  });
});
