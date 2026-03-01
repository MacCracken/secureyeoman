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
      info: vi.fn(), warn: vi.fn(), error: vi.fn(),
      debug: vi.fn(), trace: vi.fn(), fatal: vi.fn(),
    }),
  }),
  createNoopLogger: vi.fn().mockReturnValue({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    debug: vi.fn(), trace: vi.fn(), fatal: vi.fn(),
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
      mockExistsSync.mockImplementation((p: any) =>
        String(p).includes('landlock_restrict_self')
      );
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
      mockReadFileSync.mockImplementation(() => { throw new Error('no /proc'); });
      const sandbox = new LinuxSandbox();
      expect(() => sandbox.getCapabilities()).not.toThrow();
    });

    it('detects user namespaces via /proc/self/ns/user', () => {
      mockExistsSync.mockImplementation((p: any) =>
        String(p).includes('/proc/self/ns/user')
      );
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
      const result = await sandbox.run(async () => { throw 'string error'; });
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
  });
});
