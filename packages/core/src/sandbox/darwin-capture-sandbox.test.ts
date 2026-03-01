import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock node:os (platform detection) ───────────────────────────────
const mockPlatform = vi.fn().mockReturnValue('darwin');
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

import { DarwinCaptureSandbox, createCaptureSandbox } from './darwin-capture-sandbox.js';

describe('DarwinCaptureSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlatform.mockReturnValue('darwin');
  });

  describe('isAvailable()', () => {
    it('returns true on darwin', () => {
      mockPlatform.mockReturnValue('darwin');
      const sandbox = new DarwinCaptureSandbox();
      expect(sandbox.isAvailable()).toBe(true);
    });

    it('returns false on linux', () => {
      mockPlatform.mockReturnValue('linux');
      const sandbox = new DarwinCaptureSandbox();
      expect(sandbox.isAvailable()).toBe(false);
    });

    it('returns false on win32', () => {
      mockPlatform.mockReturnValue('win32');
      const sandbox = new DarwinCaptureSandbox();
      expect(sandbox.isAvailable()).toBe(false);
    });
  });

  describe('initialize()', () => {
    it('sets initialized to true on darwin', async () => {
      const sandbox = new DarwinCaptureSandbox();
      expect(sandbox.isInitialized()).toBe(false);
      await sandbox.initialize();
      expect(sandbox.isInitialized()).toBe(true);
    });

    it('throws on non-darwin platform', async () => {
      mockPlatform.mockReturnValue('linux');
      const sandbox = new DarwinCaptureSandbox();
      await expect(sandbox.initialize()).rejects.toThrow('only available on macOS');
    });
  });

  describe('isInitialized()', () => {
    it('is false before initialize', () => {
      const sandbox = new DarwinCaptureSandbox();
      expect(sandbox.isInitialized()).toBe(false);
    });

    it('is true after initialize', async () => {
      const sandbox = new DarwinCaptureSandbox();
      await sandbox.initialize();
      expect(sandbox.isInitialized()).toBe(true);
    });
  });

  describe('getConfig()', () => {
    it('returns config with defaults', () => {
      const sandbox = new DarwinCaptureSandbox();
      const cfg = sandbox.getConfig();
      expect(cfg.maxMemory).toBe(512);
      expect(cfg.maxCpuPercent).toBe(50);
      expect(cfg.syscallPolicy).toBe('capture-only');
      expect(cfg.allowNetwork).toBe(false);
    });

    it('merges constructor overrides', () => {
      const sandbox = new DarwinCaptureSandbox({ maxMemory: 2048, allowNetwork: true });
      const cfg = sandbox.getConfig();
      expect(cfg.maxMemory).toBe(2048);
      expect(cfg.allowNetwork).toBe(true);
    });

    it('returns a copy (not reference)', () => {
      const sandbox = new DarwinCaptureSandbox();
      const cfg = sandbox.getConfig();
      cfg.maxMemory = 9999;
      expect(sandbox.getConfig().maxMemory).toBe(512);
    });
  });

  describe('run()', () => {
    it('auto-initializes when not yet initialized', async () => {
      const sandbox = new DarwinCaptureSandbox();
      expect(sandbox.isInitialized()).toBe(false);
      await sandbox.run(async () => 'ok');
      expect(sandbox.isInitialized()).toBe(true);
    });

    it('returns success result', async () => {
      const sandbox = new DarwinCaptureSandbox();
      const result = await sandbox.run(async () => 'screen captured');
      expect(result.success).toBe(true);
      expect(result.result).toBe('screen captured');
      expect(result.violations).toEqual([]);
    });

    it('returns failure when function throws', async () => {
      const sandbox = new DarwinCaptureSandbox();
      const result = await sandbox.run(async () => { throw new Error('capture error'); });
      expect(result.success).toBe(false);
      expect(result.error!.message).toBe('capture error');
    });

    it('wraps non-Error throws', async () => {
      const sandbox = new DarwinCaptureSandbox();
      const result = await sandbox.run(async () => { throw 42; });
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
    });

    it('resets violations at start of each run', async () => {
      const sandbox = new DarwinCaptureSandbox();
      await sandbox.initialize();
      sandbox.recordViolation({ type: 'filesystem', description: 'old', timestamp: Date.now(), severity: 'low' });
      const result = await sandbox.run(async () => 'ok');
      expect(result.violations).toEqual([]);
    });

    it('rejects when not on darwin (initialize is outside try/catch)', async () => {
      mockPlatform.mockReturnValue('linux');
      const sandbox = new DarwinCaptureSandbox();
      // initialize() throws before the try/catch in run(), so it propagates
      await expect(sandbox.run(async () => 'ok')).rejects.toThrow('only available on macOS');
    });
  });

  describe('validatePath()', () => {
    it('blocks paths in blockedPaths', () => {
      const sandbox = new DarwinCaptureSandbox();
      const allowed = sandbox.validatePath('/etc/passwd', 'read');
      expect(allowed).toBe(false);
      const v = sandbox.getViolations()[0];
      expect(v.type).toBe('filesystem');
      expect(v.description).toContain('blocked path');
    });

    it('allows read for paths in allowedPaths', () => {
      const sandbox = new DarwinCaptureSandbox();
      const allowed = sandbox.validatePath('/usr/lib/libX11.dylib', 'read');
      expect(allowed).toBe(true);
    });

    it('denies read for paths not in allowedPaths', () => {
      const sandbox = new DarwinCaptureSandbox();
      const allowed = sandbox.validatePath('/home/user/secrets.txt', 'read');
      expect(allowed).toBe(false);
      expect(sandbox.getViolations()[0].description).toContain('non-allowed path');
    });

    it('allows write for paths matching writePaths wildcard', () => {
      const sandbox = new DarwinCaptureSandbox();
      const allowed = sandbox.validatePath('/tmp/capture-frame.png', 'write');
      expect(allowed).toBe(true);
    });

    it('denies write for non-writable paths', () => {
      const sandbox = new DarwinCaptureSandbox();
      const allowed = sandbox.validatePath('/usr/lib/something.dylib', 'write');
      expect(allowed).toBe(false);
      expect(sandbox.getViolations()[0].description).toContain('non-temp path');
    });

    it('exact path match for blocked path', () => {
      const sandbox = new DarwinCaptureSandbox({ blockedPaths: ['/secret/file'] });
      expect(sandbox.validatePath('/secret/file', 'read')).toBe(false);
    });
  });

  describe('checkResourceLimits()', () => {
    it('returns true when within limits', () => {
      const sandbox = new DarwinCaptureSandbox({ maxMemory: 512, maxCpuPercent: 50 });
      expect(sandbox.checkResourceLimits({ memoryMb: 256, cpuPercent: 25 })).toBe(true);
      expect(sandbox.getViolations()).toHaveLength(0);
    });

    it('records violation and returns false when memory exceeded', () => {
      const sandbox = new DarwinCaptureSandbox({ maxMemory: 512 });
      const ok = sandbox.checkResourceLimits({ memoryMb: 700 });
      expect(ok).toBe(false);
      const v = sandbox.getViolations()[0];
      expect(v.type).toBe('resource');
      expect(v.severity).toBe('critical');
    });

    it('records violation and returns false when cpu exceeded', () => {
      const sandbox = new DarwinCaptureSandbox({ maxCpuPercent: 50 });
      const ok = sandbox.checkResourceLimits({ cpuPercent: 95 });
      expect(ok).toBe(false);
      const v = sandbox.getViolations()[0];
      expect(v.severity).toBe('high');
      expect(v.description).toContain('CPU limit exceeded');
    });

    it('returns true when no usage provided', () => {
      const sandbox = new DarwinCaptureSandbox();
      expect(sandbox.checkResourceLimits({})).toBe(true);
    });
  });

  describe('generateSeatbeltProfile()', () => {
    it('starts with (version 1)', () => {
      const sandbox = new DarwinCaptureSandbox();
      const profile = sandbox.generateSeatbeltProfile();
      expect(profile).toContain('(version 1)');
    });

    it('contains (deny default)', () => {
      const sandbox = new DarwinCaptureSandbox();
      const profile = sandbox.generateSeatbeltProfile();
      expect(profile).toContain('(deny default)');
    });

    it('contains IOFramebuffer reference', () => {
      const sandbox = new DarwinCaptureSandbox();
      const profile = sandbox.generateSeatbeltProfile();
      expect(profile).toContain('IOFramebuffer');
    });

    it('contains CoreGraphics preference domain', () => {
      const sandbox = new DarwinCaptureSandbox();
      const profile = sandbox.generateSeatbeltProfile();
      expect(profile).toContain('com.apple.coregraphics');
    });

    it('includes (deny network*) when allowNetwork is false', () => {
      const sandbox = new DarwinCaptureSandbox({ allowNetwork: false });
      const profile = sandbox.generateSeatbeltProfile();
      expect(profile).toContain('(deny network*)');
      expect(profile).not.toContain('(allow network*');
    });

    it('includes (allow network*) when allowNetwork is true', () => {
      const sandbox = new DarwinCaptureSandbox({ allowNetwork: true });
      const profile = sandbox.generateSeatbeltProfile();
      expect(profile).toContain('(allow network*');
    });

    it('includes allowed hosts when allowNetwork and allowedHosts set', () => {
      const sandbox = new DarwinCaptureSandbox({
        allowNetwork: true,
        allowedHosts: ['api.example.com'],
      });
      const profile = sandbox.generateSeatbeltProfile();
      expect(profile).toContain('api.example.com');
    });

    it('blocks sensitive system paths', () => {
      const sandbox = new DarwinCaptureSandbox();
      const profile = sandbox.generateSeatbeltProfile();
      expect(profile).toContain('/etc');
      expect(profile).toContain('/Users');
    });
  });

  describe('violations', () => {
    it('recordViolation adds to violations list', () => {
      const sandbox = new DarwinCaptureSandbox();
      sandbox.recordViolation({ type: 'syscall', description: 'blocked syscall', timestamp: Date.now(), severity: 'high' });
      expect(sandbox.getViolations()).toHaveLength(1);
    });

    it('clearViolations empties the list', () => {
      const sandbox = new DarwinCaptureSandbox();
      sandbox.recordViolation({ type: 'syscall', description: 'blocked', timestamp: Date.now(), severity: 'high' });
      sandbox.clearViolations();
      expect(sandbox.getViolations()).toHaveLength(0);
    });

    it('getViolations returns a copy', () => {
      const sandbox = new DarwinCaptureSandbox();
      const violations = sandbox.getViolations();
      violations.push({ type: 'network', description: 'test', timestamp: 0, severity: 'low' });
      expect(sandbox.getViolations()).toHaveLength(0);
    });
  });

  describe('createCaptureSandbox()', () => {
    it('returns a DarwinCaptureSandbox instance', () => {
      const sandbox = createCaptureSandbox();
      expect(sandbox).toBeInstanceOf(DarwinCaptureSandbox);
    });

    it('passes config to instance', () => {
      const sandbox = createCaptureSandbox({ maxMemory: 1024 });
      expect(sandbox.getConfig().maxMemory).toBe(1024);
    });
  });
});
