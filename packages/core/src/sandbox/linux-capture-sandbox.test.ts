import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock node:os (platform detection) ───────────────────────────────
const mockPlatform = vi.fn().mockReturnValue('linux');
vi.mock('node:os', () => ({
  platform: () => mockPlatform(),
}));

// ─── Mock logger ─────────────────────────────────────────────────────
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

import { LinuxCaptureSandbox, createCaptureSandbox } from './linux-capture-sandbox.js';

describe('LinuxCaptureSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlatform.mockReturnValue('linux');
  });

  describe('isAvailable()', () => {
    it('returns true on linux', () => {
      mockPlatform.mockReturnValue('linux');
      const sandbox = new LinuxCaptureSandbox();
      expect(sandbox.isAvailable()).toBe(true);
    });

    it('returns false on darwin', () => {
      mockPlatform.mockReturnValue('darwin');
      const sandbox = new LinuxCaptureSandbox();
      expect(sandbox.isAvailable()).toBe(false);
    });

    it('returns false on win32', () => {
      mockPlatform.mockReturnValue('win32');
      const sandbox = new LinuxCaptureSandbox();
      expect(sandbox.isAvailable()).toBe(false);
    });
  });

  describe('initialize()', () => {
    it('sets initialized to true on linux', async () => {
      const sandbox = new LinuxCaptureSandbox();
      expect(sandbox.isInitialized()).toBe(false);
      await sandbox.initialize();
      expect(sandbox.isInitialized()).toBe(true);
    });

    it('throws on non-linux platform', async () => {
      mockPlatform.mockReturnValue('darwin');
      const sandbox = new LinuxCaptureSandbox();
      await expect(sandbox.initialize()).rejects.toThrow('only available on Linux');
    });
  });

  describe('isInitialized()', () => {
    it('is false before initialize', () => {
      const sandbox = new LinuxCaptureSandbox();
      expect(sandbox.isInitialized()).toBe(false);
    });

    it('is true after initialize', async () => {
      const sandbox = new LinuxCaptureSandbox();
      await sandbox.initialize();
      expect(sandbox.isInitialized()).toBe(true);
    });
  });

  describe('getConfig()', () => {
    it('returns config with defaults', () => {
      const sandbox = new LinuxCaptureSandbox();
      const cfg = sandbox.getConfig();
      expect(cfg.maxMemory).toBe(512);
      expect(cfg.maxCpuPercent).toBe(50);
      expect(cfg.syscallPolicy).toBe('capture-only');
      expect(cfg.allowNetwork).toBe(false);
    });

    it('merges constructor overrides', () => {
      const sandbox = new LinuxCaptureSandbox({ maxMemory: 1024, allowNetwork: true });
      const cfg = sandbox.getConfig();
      expect(cfg.maxMemory).toBe(1024);
      expect(cfg.allowNetwork).toBe(true);
    });

    it('returns a copy (not reference)', () => {
      const sandbox = new LinuxCaptureSandbox();
      const cfg = sandbox.getConfig();
      cfg.maxMemory = 9999;
      expect(sandbox.getConfig().maxMemory).toBe(512);
    });
  });

  describe('run()', () => {
    it('auto-initializes when not yet initialized', async () => {
      const sandbox = new LinuxCaptureSandbox();
      expect(sandbox.isInitialized()).toBe(false);
      await sandbox.run(async () => 'ok');
      expect(sandbox.isInitialized()).toBe(true);
    });

    it('returns success result', async () => {
      const sandbox = new LinuxCaptureSandbox();
      const result = await sandbox.run(async () => 42);
      expect(result.success).toBe(true);
      expect(result.result).toBe(42);
      expect(result.violations).toEqual([]);
    });

    it('returns failure when function throws', async () => {
      const sandbox = new LinuxCaptureSandbox();
      const result = await sandbox.run(async () => { throw new Error('capture failed'); });
      expect(result.success).toBe(false);
      expect(result.error!.message).toBe('capture failed');
    });

    it('wraps non-Error throws', async () => {
      const sandbox = new LinuxCaptureSandbox();
      const result = await sandbox.run(async () => { throw 'string error'; });
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
    });

    it('resets violations at start of each run', async () => {
      const sandbox = new LinuxCaptureSandbox();
      await sandbox.initialize();
      sandbox.recordViolation({ type: 'filesystem', description: 'test', timestamp: Date.now(), severity: 'low' });
      const result = await sandbox.run(async () => 'ok');
      expect(result.violations).toEqual([]);
    });
  });

  describe('validatePath()', () => {
    it('blocks paths in blockedPaths', () => {
      const sandbox = new LinuxCaptureSandbox();
      const allowed = sandbox.validatePath('/etc/passwd', 'read');
      expect(allowed).toBe(false);
      const violations = sandbox.getViolations();
      expect(violations[0].type).toBe('filesystem');
      expect(violations[0].description).toContain('blocked path');
    });

    it('allows read for paths in allowedPaths', () => {
      const sandbox = new LinuxCaptureSandbox();
      const allowed = sandbox.validatePath('/usr/lib/libX11.so', 'read');
      expect(allowed).toBe(true);
    });

    it('denies read for paths not in allowedPaths', () => {
      const sandbox = new LinuxCaptureSandbox();
      const allowed = sandbox.validatePath('/home/user/file.txt', 'read');
      expect(allowed).toBe(false);
      expect(sandbox.getViolations()[0].description).toContain('non-allowed path');
    });

    it('allows write for paths matching writePaths wildcard', () => {
      const sandbox = new LinuxCaptureSandbox();
      const allowed = sandbox.validatePath('/tmp/capture-screen.png', 'write');
      expect(allowed).toBe(true);
    });

    it('denies write for non-writable paths', () => {
      const sandbox = new LinuxCaptureSandbox();
      const allowed = sandbox.validatePath('/usr/lib/something.so', 'write');
      expect(allowed).toBe(false);
      expect(sandbox.getViolations()[0].description).toContain('non-temp path');
    });

    it('exact path match for blocked path', () => {
      const sandbox = new LinuxCaptureSandbox({ blockedPaths: ['/secret/file'] });
      expect(sandbox.validatePath('/secret/file', 'read')).toBe(false);
    });
  });

  describe('checkResourceLimits()', () => {
    it('returns true when within limits', () => {
      const sandbox = new LinuxCaptureSandbox({ maxMemory: 512, maxCpuPercent: 50 });
      expect(sandbox.checkResourceLimits({ memoryMb: 100, cpuPercent: 30 })).toBe(true);
      expect(sandbox.getViolations()).toHaveLength(0);
    });

    it('returns false and records violation when memory exceeded', () => {
      const sandbox = new LinuxCaptureSandbox({ maxMemory: 512 });
      const ok = sandbox.checkResourceLimits({ memoryMb: 600 });
      expect(ok).toBe(false);
      const v = sandbox.getViolations()[0];
      expect(v.type).toBe('resource');
      expect(v.severity).toBe('critical');
      expect(v.description).toContain('Memory limit exceeded');
    });

    it('returns false and records violation when cpu exceeded', () => {
      const sandbox = new LinuxCaptureSandbox({ maxCpuPercent: 50 });
      const ok = sandbox.checkResourceLimits({ cpuPercent: 90 });
      expect(ok).toBe(false);
      const v = sandbox.getViolations()[0];
      expect(v.type).toBe('resource');
      expect(v.severity).toBe('high');
      expect(v.description).toContain('CPU limit exceeded');
    });

    it('returns true when no usage provided', () => {
      const sandbox = new LinuxCaptureSandbox();
      expect(sandbox.checkResourceLimits({})).toBe(true);
    });
  });

  describe('violations', () => {
    it('recordViolation adds to violations list', () => {
      const sandbox = new LinuxCaptureSandbox();
      sandbox.recordViolation({ type: 'network', description: 'blocked', timestamp: Date.now(), severity: 'high' });
      expect(sandbox.getViolations()).toHaveLength(1);
    });

    it('clearViolations empties the list', () => {
      const sandbox = new LinuxCaptureSandbox();
      sandbox.recordViolation({ type: 'network', description: 'blocked', timestamp: Date.now(), severity: 'high' });
      sandbox.clearViolations();
      expect(sandbox.getViolations()).toHaveLength(0);
    });

    it('getViolations returns a copy', () => {
      const sandbox = new LinuxCaptureSandbox();
      const violations = sandbox.getViolations();
      violations.push({ type: 'network', description: 'test', timestamp: 0, severity: 'low' });
      expect(sandbox.getViolations()).toHaveLength(0);
    });
  });

  describe('syscall lists', () => {
    it('getAllowedSyscalls returns non-empty array', () => {
      const sandbox = new LinuxCaptureSandbox();
      const allowed = sandbox.getAllowedSyscalls();
      expect(allowed.length).toBeGreaterThan(0);
      expect(allowed).toContain('read');
      expect(allowed).toContain('write');
    });

    it('getBlockedSyscalls returns non-empty array', () => {
      const sandbox = new LinuxCaptureSandbox();
      const blocked = sandbox.getBlockedSyscalls();
      expect(blocked.length).toBeGreaterThan(0);
      expect(blocked).toContain('socket');
      expect(blocked).toContain('execve');
    });

    it('returns copies (not references)', () => {
      const sandbox = new LinuxCaptureSandbox();
      const a1 = sandbox.getAllowedSyscalls();
      const a2 = sandbox.getAllowedSyscalls();
      expect(a1).not.toBe(a2);
    });
  });

  describe('createCaptureSandbox()', () => {
    it('returns a LinuxCaptureSandbox instance', () => {
      const sandbox = createCaptureSandbox();
      expect(sandbox).toBeInstanceOf(LinuxCaptureSandbox);
    });

    it('passes config to instance', () => {
      const sandbox = createCaptureSandbox({ maxMemory: 256 });
      expect(sandbox.getConfig().maxMemory).toBe(256);
    });
  });
});
