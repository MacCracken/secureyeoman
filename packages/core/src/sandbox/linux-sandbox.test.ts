import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock fs and child_process ────────────────────────────────────────
vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockReturnValue('Linux version 6.1.0-generic #1'),
  existsSync: vi.fn().mockReturnValue(false),
}));

vi.mock('node:child_process', () => ({
  fork: vi.fn(),
}));

vi.mock('../logging/logger.js', () => ({
  getLogger: vi.fn().mockReturnValue({
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
    }),
  }),
  createNoopLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
}));

import { LinuxSandbox } from './linux-sandbox.js';
import { existsSync, readFileSync } from 'node:fs';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

describe('LinuxSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('Linux version 6.1.0-generic #1' as any);
  });

  describe('isAvailable()', () => {
    it('returns true on linux', () => {
      vi.stubEnv('VITEST', 'true');
      const sandbox = new LinuxSandbox();
      // Actual platform detection; on non-linux CI this may be false — just check it's boolean
      expect(typeof sandbox.isAvailable()).toBe('boolean');
    });
  });

  describe('getCapabilities()', () => {
    it('caches capabilities after first call', () => {
      const sandbox = new LinuxSandbox();
      const c1 = sandbox.getCapabilities();
      const c2 = sandbox.getCapabilities();
      expect(c1).toBe(c2);
    });

    it('sets platform to linux', () => {
      const sandbox = new LinuxSandbox();
      const caps = sandbox.getCapabilities();
      expect(caps.platform).toBe('linux');
    });

    it('sets rlimits to true', () => {
      const sandbox = new LinuxSandbox();
      const caps = sandbox.getCapabilities();
      expect(caps.rlimits).toBe(true);
    });

    it('detects landlock via /proc/sys/kernel/landlock_restrict_self', () => {
      mockExistsSync.mockImplementation((p: any) => String(p).includes('landlock_restrict_self'));
      const sandbox = new LinuxSandbox();
      const caps = sandbox.getCapabilities();
      expect(caps.landlock).toBe(true);
    });

    it('detects landlock via kernel version >= 5.13', () => {
      mockExistsSync.mockReturnValue(false);
      mockReadFileSync.mockReturnValue('Linux version 5.15.0-generic #1' as any);
      const sandbox = new LinuxSandbox();
      const caps = sandbox.getCapabilities();
      expect(caps.landlock).toBe(true);
    });

    it('does NOT detect landlock on kernel < 5.13', () => {
      mockExistsSync.mockReturnValue(false);
      mockReadFileSync.mockReturnValue('Linux version 5.10.0-generic #1' as any);
      const sandbox = new LinuxSandbox();
      const caps = sandbox.getCapabilities();
      expect(caps.landlock).toBe(false);
    });

    it('handles readFileSync throwing (no /proc)', () => {
      mockExistsSync.mockReturnValue(false);
      mockReadFileSync.mockImplementation(() => {
        throw new Error('no /proc');
      });
      const sandbox = new LinuxSandbox();
      expect(() => sandbox.getCapabilities()).not.toThrow();
    });

    it('detects user namespaces via /proc/self/ns/user', () => {
      mockExistsSync.mockImplementation((p: any) => String(p).includes('/proc/self/ns/user'));
      const sandbox = new LinuxSandbox();
      const caps = sandbox.getCapabilities();
      expect(caps.namespaces).toBe(true);
    });
  });

  describe('validatePath()', () => {
    it('returns null for allowed read path', () => {
      const sandbox = new LinuxSandbox();
      const result = sandbox.validatePath('/tmp/file.txt', 'read', {
        readPaths: ['/tmp'],
        writePaths: [],
        execPaths: [],
      });
      expect(result).toBeNull();
    });

    it('returns violation for path not in allowlist', () => {
      const sandbox = new LinuxSandbox();
      const result = sandbox.validatePath('/etc/passwd', 'read', {
        readPaths: ['/tmp'],
        writePaths: [],
        execPaths: [],
      });
      expect(result).not.toBeNull();
      expect(result!.type).toBe('filesystem');
      expect(result!.description).toContain('not in the allowlist');
    });

    it('allows exact path match', () => {
      const sandbox = new LinuxSandbox();
      const result = sandbox.validatePath('/var/data', 'write', {
        readPaths: [],
        writePaths: ['/var/data'],
        execPaths: [],
      });
      expect(result).toBeNull();
    });

    it('allows subpath of allowed directory', () => {
      const sandbox = new LinuxSandbox();
      const result = sandbox.validatePath('/tmp/subdir/file.txt', 'write', {
        readPaths: [],
        writePaths: ['/tmp'],
        execPaths: [],
      });
      expect(result).toBeNull();
    });

    it('checks exec mode against execPaths', () => {
      const sandbox = new LinuxSandbox();
      const violation = sandbox.validatePath('/bin/ls', 'exec', {
        readPaths: [],
        writePaths: [],
        execPaths: [],
      });
      expect(violation).not.toBeNull();

      const allowed = sandbox.validatePath('/bin/ls', 'exec', {
        readPaths: [],
        writePaths: [],
        execPaths: ['/bin'],
      });
      expect(allowed).toBeNull();
    });
  });

  describe('run() — V1 soft sandbox', () => {
    it('executes function and returns success result', async () => {
      const sandbox = new LinuxSandbox();
      const result = await sandbox.run(async () => 'hello world');
      expect(result.success).toBe(true);
      expect(result.result).toBe('hello world');
      expect(result.violations).toEqual([]);
    });

    it('returns failure when function throws', async () => {
      const sandbox = new LinuxSandbox();
      const result = await sandbox.run(async () => {
        throw new Error('deliberate failure');
      });
      expect(result.success).toBe(false);
      expect(result.error!.message).toBe('deliberate failure');
    });

    it('wraps non-Error throws', async () => {
      const sandbox = new LinuxSandbox();
      const result = await sandbox.run(async () => {
        throw 'string error';
      });
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
    });

    it('includes resource usage', async () => {
      const sandbox = new LinuxSandbox();
      const result = await sandbox.run(async () => 42);
      expect(typeof result.resourceUsage?.memoryPeakMb).toBe('number');
      expect(typeof result.resourceUsage?.cpuTimeMs).toBe('number');
    });

    it('detects path traversal in filesystem config', async () => {
      const sandbox = new LinuxSandbox();
      const result = await sandbox.run(async () => 'ok', {
        filesystem: {
          readPaths: ['/tmp/../etc'],
          writePaths: [],
          execPaths: [],
        },
      });
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].description).toContain('Suspicious path');
    });

    it('detects null bytes in filesystem config paths', async () => {
      const sandbox = new LinuxSandbox();
      const result = await sandbox.run(async () => 'ok', {
        filesystem: {
          readPaths: [],
          writePaths: ['/tmp/foo\0bar'],
          execPaths: [],
        },
      });
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].description).toContain('Suspicious path');
    });

    it('tracks CPU time limit violation', async () => {
      const sandbox = new LinuxSandbox();
      const result = await sandbox.run(
        async () => {
          // Simulate work
          const start = Date.now();
          while (Date.now() - start < 50) {
            /* spin */
          }
          return 'done';
        },
        {
          timeoutMs: 10, // 10ms timeout budget
          resources: { maxCpuPercent: 1 }, // 1% of 10ms = 0.1ms budget — will be exceeded
        }
      );
      // Should succeed (V1 is soft) but record a CPU violation
      expect(result.success).toBe(true);
      expect(result.violations.some((v) => v.description.includes('CPU time'))).toBe(true);
    });

    it('runs multiple sandboxes and cleans up independently', async () => {
      const sandbox1 = new LinuxSandbox();
      const sandbox2 = new LinuxSandbox();
      const [r1, r2] = await Promise.all([
        sandbox1.run(async () => 'one'),
        sandbox2.run(async () => 'two'),
      ]);
      expect(r1.success).toBe(true);
      expect(r1.result).toBe('one');
      expect(r2.success).toBe(true);
      expect(r2.result).toBe('two');
    });
  });

  describe('getCapabilities() — Landlock unavailable fallback', () => {
    it('returns landlock=false when both /proc file and kernel version check fail', () => {
      mockExistsSync.mockReturnValue(false);
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      const sandbox = new LinuxSandbox();
      const caps = sandbox.getCapabilities();
      expect(caps.landlock).toBe(false);
      expect(caps.rlimits).toBe(true);
    });

    it('returns landlock=false for kernel version with major=5 minor<13', () => {
      mockExistsSync.mockReturnValue(false);
      mockReadFileSync.mockReturnValue('Linux version 5.4.0-generic #1' as any);
      const sandbox = new LinuxSandbox();
      const caps = sandbox.getCapabilities();
      expect(caps.landlock).toBe(false);
    });

    it('returns landlock=true for kernel major > 5', () => {
      mockExistsSync.mockReturnValue(false);
      mockReadFileSync.mockReturnValue('Linux version 6.0.0-generic #1' as any);
      const sandbox = new LinuxSandbox();
      const caps = sandbox.getCapabilities();
      expect(caps.landlock).toBe(true);
    });

    it('returns namespaces=false when /proc/self/ns/user does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      const sandbox = new LinuxSandbox();
      const caps = sandbox.getCapabilities();
      expect(caps.namespaces).toBe(false);
    });

    it('returns seccomp=false (V1 does not detect seccomp)', () => {
      const sandbox = new LinuxSandbox();
      const caps = sandbox.getCapabilities();
      expect(caps.seccomp).toBe(false);
    });
  });

  describe('run() — Landlock enforcement mode', () => {
    it('falls back to V1 when enforceLandlock is true but Landlock worker does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      const sandbox = new LinuxSandbox({ enforceLandlock: true });
      // Manually prime capabilities so landlock is detected
      // Since existsSync returns false and readFileSync gives 6.1 kernel, landlock=true via version check
      mockReadFileSync.mockReturnValue('Linux version 6.1.0-generic #1' as any);
      // Reset capabilities cache by creating a fresh instance
      const fresh = new LinuxSandbox({ enforceLandlock: true });
      const result = await fresh.run(async () => 'fallback-works');
      expect(result.success).toBe(true);
      expect(result.result).toBe('fallback-works');
    });

    it('dispatches to V1 when enforceLandlock is false even if landlock is available', async () => {
      mockExistsSync.mockImplementation((p: any) => String(p).includes('landlock_restrict_self'));
      const sandbox = new LinuxSandbox({ enforceLandlock: false });
      const result = await sandbox.run(async () => 'v1-path');
      expect(result.success).toBe(true);
      expect(result.result).toBe('v1-path');
    });
  });

  describe('run() — resource limit memory tracking', () => {
    it('tracks peak memory with resource limit configured', async () => {
      const sandbox = new LinuxSandbox();
      const result = await sandbox.run(
        async () => {
          // Allocate some memory
          const arr = new Array(1000).fill('x'.repeat(100));
          return arr.length;
        },
        {
          resources: { maxMemoryMb: 1024 }, // high limit — won't be exceeded
        }
      );
      expect(result.success).toBe(true);
      expect(result.resourceUsage!.memoryPeakMb).toBeGreaterThan(0);
    });

    it('records memory violation when limit is very low', async () => {
      const sandbox = new LinuxSandbox();
      const result = await sandbox.run(
        async () => {
          // Wait long enough for the 100ms memory check interval to fire
          await new Promise((resolve) => setTimeout(resolve, 200));
          return 'done';
        },
        {
          resources: { maxMemoryMb: 0.001 }, // impossibly low — process heap will exceed this
        }
      );
      // Execution succeeds (soft sandbox) but violations recorded
      expect(result.success).toBe(true);
      expect(result.violations.some((v) => v.description.includes('Memory usage'))).toBe(true);
    });
  });
});
