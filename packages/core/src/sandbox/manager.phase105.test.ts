/**
 * SandboxManager — Phase 105 supplementary coverage tests.
 *
 * Tests platform-specific branches in detect()/createSandbox() and
 * the credential-proxy start/stop methods.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockLinuxGetCapabilities = vi.fn();
const mockDarwinGetCapabilities = vi.fn();
const mockProxyStart = vi.fn();
const mockProxyStop = vi.fn();

vi.mock('./linux-sandbox.js', () => ({
  LinuxSandbox: class MockLinuxSandbox {
    opts: any;
    constructor(opts?: any) {
      this.opts = opts;
    }
    getCapabilities() {
      return mockLinuxGetCapabilities();
    }
    readonly [Symbol.toStringTag] = 'LinuxSandbox';
  },
}));

vi.mock('./darwin-sandbox.js', () => ({
  DarwinSandbox: class MockDarwinSandbox {
    getCapabilities() {
      return mockDarwinGetCapabilities();
    }
    readonly [Symbol.toStringTag] = 'DarwinSandbox';
  },
}));

vi.mock('./credential-proxy.js', () => ({
  CredentialProxy: class MockCredentialProxy {
    constructor(_opts: any) {}
    start() {
      return mockProxyStart();
    }
  },
}));

vi.mock('../logging/logger.js', () => ({
  getLogger: vi.fn(() => {
    throw new Error('no global logger');
  }),
  createNoopLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: 'silent',
  })),
}));

import { SandboxManager } from './manager.js';

const makeLogger = () => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn().mockReturnThis(),
  level: 'info',
});

function makeConfig(overrides: any = {}) {
  return {
    enabled: true,
    technology: 'none' as const,
    allowedReadPaths: [],
    allowedWritePaths: [],
    maxMemoryMb: 256,
    maxCpuPercent: 50,
    maxFileSizeMb: 10,
    networkAllowed: false,
    ...overrides,
  };
}

describe('SandboxManager — Phase 105 platform + proxy coverage', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
    vi.clearAllMocks();
  });

  // ── detect() platform branches ───────────────────────────────────────

  describe('detect() on linux', () => {
    it('delegates to LinuxSandbox.getCapabilities()', () => {
      Object.defineProperty(process, 'platform', { value: 'linux', writable: true });
      mockLinuxGetCapabilities.mockReturnValue({
        landlock: true,
        seccomp: true,
        namespaces: true,
        rlimits: true,
        platform: 'linux',
      });
      const mgr = new SandboxManager(makeConfig(), { logger: makeLogger() as any });
      const caps = mgr.detect();
      expect(caps.platform).toBe('linux');
      expect(caps.landlock).toBe(true);
      expect(mockLinuxGetCapabilities).toHaveBeenCalled();
    });
  });

  describe('detect() on darwin', () => {
    it('delegates to DarwinSandbox.getCapabilities()', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', writable: true });
      mockDarwinGetCapabilities.mockReturnValue({
        landlock: false,
        seccomp: false,
        namespaces: false,
        rlimits: false,
        platform: 'darwin',
      });
      const mgr = new SandboxManager(makeConfig(), { logger: makeLogger() as any });
      const caps = mgr.detect();
      expect(caps.platform).toBe('darwin');
      expect(mockDarwinGetCapabilities).toHaveBeenCalled();
    });
  });

  describe('detect() on win32/other', () => {
    it('returns fallback capabilities for win32', () => {
      Object.defineProperty(process, 'platform', { value: 'win32', writable: true });
      const mgr = new SandboxManager(makeConfig(), { logger: makeLogger() as any });
      const caps = mgr.detect();
      expect(caps.platform).toBe('win32');
      expect(caps.landlock).toBe(false);
    });

    it('returns fallback capabilities for unknown platform', () => {
      Object.defineProperty(process, 'platform', { value: 'freebsd', writable: true });
      const mgr = new SandboxManager(makeConfig(), { logger: makeLogger() as any });
      const caps = mgr.detect();
      expect(caps.platform).toBe('other');
    });
  });

  // ── createSandbox() technology branches ──────────────────────────────

  describe('createSandbox() with auto on linux', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'linux', writable: true });
    });

    it('creates LinuxSandbox with enforceLandlock=true when landlock available', () => {
      mockLinuxGetCapabilities.mockReturnValue({
        landlock: true,
        seccomp: true,
        namespaces: true,
        rlimits: true,
        platform: 'linux',
      });
      const mgr = new SandboxManager(makeConfig({ enabled: true, technology: 'auto' }), {
        logger: makeLogger() as any,
      });
      const sb = mgr.createSandbox();
      expect((sb as any).opts).toEqual({ enforceLandlock: true });
    });

    it('creates LinuxSandbox with enforceLandlock=false when landlock unavailable', () => {
      mockLinuxGetCapabilities.mockReturnValue({
        landlock: false,
        seccomp: true,
        namespaces: true,
        rlimits: true,
        platform: 'linux',
      });
      const mgr = new SandboxManager(makeConfig({ enabled: true, technology: 'auto' }), {
        logger: makeLogger() as any,
      });
      const sb = mgr.createSandbox();
      expect((sb as any).opts).toEqual({ enforceLandlock: false });
    });
  });

  describe('createSandbox() with auto on darwin', () => {
    it('creates DarwinSandbox', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', writable: true });
      mockDarwinGetCapabilities.mockReturnValue({
        landlock: false,
        seccomp: false,
        namespaces: false,
        rlimits: false,
        platform: 'darwin',
      });
      const mgr = new SandboxManager(makeConfig({ enabled: true, technology: 'auto' }), {
        logger: makeLogger() as any,
      });
      const sb = mgr.createSandbox();
      expect(sb.constructor.name).toBe('MockDarwinSandbox');
    });
  });

  describe('createSandbox() with auto on other', () => {
    it('falls back to NoopSandbox', () => {
      Object.defineProperty(process, 'platform', { value: 'win32', writable: true });
      const logger = makeLogger();
      const mgr = new SandboxManager(makeConfig({ enabled: true, technology: 'auto' }), {
        logger: logger as any,
      });
      const sb = mgr.createSandbox();
      expect(sb.constructor.name).toBe('NoopSandbox');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No sandbox available'),
        expect.any(Object)
      );
    });
  });

  describe('createSandbox() with landlock technology', () => {
    it('creates LinuxSandbox with enforceLandlock on linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux', writable: true });
      mockLinuxGetCapabilities.mockReturnValue({
        landlock: true,
        seccomp: true,
        namespaces: true,
        rlimits: true,
        platform: 'linux',
      });
      const mgr = new SandboxManager(makeConfig({ enabled: true, technology: 'landlock' }), {
        logger: makeLogger() as any,
      });
      const sb = mgr.createSandbox();
      expect((sb as any).opts).toEqual({ enforceLandlock: true });
    });

    it('falls back to NoopSandbox when not on linux', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', writable: true });
      mockDarwinGetCapabilities.mockReturnValue({
        landlock: false,
        seccomp: false,
        namespaces: false,
        rlimits: false,
        platform: 'darwin',
      });
      const logger = makeLogger();
      const mgr = new SandboxManager(makeConfig({ enabled: true, technology: 'landlock' }), {
        logger: logger as any,
      });
      const sb = mgr.createSandbox();
      expect(sb.constructor.name).toBe('NoopSandbox');
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Landlock requested'));
    });
  });

  describe('createSandbox() with seccomp technology', () => {
    it('falls back to NoopSandbox (not implemented)', () => {
      Object.defineProperty(process, 'platform', { value: 'linux', writable: true });
      mockLinuxGetCapabilities.mockReturnValue({
        landlock: false,
        seccomp: false,
        namespaces: false,
        rlimits: false,
        platform: 'linux',
      });
      const logger = makeLogger();
      const mgr = new SandboxManager(makeConfig({ enabled: true, technology: 'seccomp' }), {
        logger: logger as any,
      });
      const sb = mgr.createSandbox();
      expect(sb.constructor.name).toBe('NoopSandbox');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('not implemented'),
        expect.objectContaining({ technology: 'seccomp' })
      );
    });
  });

  // ── getLogger fallback ───────────────────────────────────────────────

  describe('getLogger() fallback', () => {
    it('falls back to createNoopLogger when global logger throws', () => {
      const mgr = new SandboxManager(makeConfig({ enabled: false }));
      // createSandbox calls getLogger() internally
      const sb = mgr.createSandbox();
      expect(sb.constructor.name).toBe('NoopSandbox');
    });
  });

  // ── Credential proxy start/stop ──────────────────────────────────────

  describe('startProxy', () => {
    it('starts credential proxy and returns URL', async () => {
      mockProxyStart.mockResolvedValue({
        proxyUrl: 'http://127.0.0.1:9999',
        stop: mockProxyStop,
      });
      const mgr = new SandboxManager(makeConfig(), { logger: makeLogger() as any });
      const url = await mgr.startProxy(
        [{ match: '*.example.com', headers: { Authorization: 'Bearer tok' } }],
        ['example.com']
      );
      expect(url).toBe('http://127.0.0.1:9999');
    });

    it('stops existing proxy before starting new one', async () => {
      const stop1 = vi.fn().mockResolvedValue(undefined);
      mockProxyStart
        .mockResolvedValueOnce({ proxyUrl: 'http://127.0.0.1:9001', stop: stop1 })
        .mockResolvedValueOnce({ proxyUrl: 'http://127.0.0.1:9002', stop: vi.fn() });
      const mgr = new SandboxManager(makeConfig(), { logger: makeLogger() as any });
      await mgr.startProxy([], []);
      const url2 = await mgr.startProxy([], []);
      expect(stop1).toHaveBeenCalled();
      expect(url2).toBe('http://127.0.0.1:9002');
    });

    it('swallows error when stopping previous proxy', async () => {
      const stop1 = vi.fn().mockRejectedValue(new Error('already stopped'));
      mockProxyStart
        .mockResolvedValueOnce({ proxyUrl: 'http://127.0.0.1:9001', stop: stop1 })
        .mockResolvedValueOnce({ proxyUrl: 'http://127.0.0.1:9002', stop: vi.fn() });
      const mgr = new SandboxManager(makeConfig(), { logger: makeLogger() as any });
      await mgr.startProxy([], []);
      // Should not throw even though stop1 rejects
      const url2 = await mgr.startProxy([], []);
      expect(url2).toBe('http://127.0.0.1:9002');
    });
  });

  describe('stopProxy', () => {
    it('stops proxy and clears handle', async () => {
      const stop = vi.fn().mockResolvedValue(undefined);
      mockProxyStart.mockResolvedValue({ proxyUrl: 'http://127.0.0.1:9999', stop });
      const mgr = new SandboxManager(makeConfig(), { logger: makeLogger() as any });
      await mgr.startProxy([], []);
      await mgr.stopProxy();
      expect(stop).toHaveBeenCalled();
    });

    it('is a no-op when no proxy is running', async () => {
      const mgr = new SandboxManager(makeConfig(), { logger: makeLogger() as any });
      // Should not throw
      await mgr.stopProxy();
    });
  });

  describe('getStatus with proxy', () => {
    it('includes credentialProxyUrl when proxy is running', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux', writable: true });
      mockLinuxGetCapabilities.mockReturnValue({
        landlock: false,
        seccomp: false,
        namespaces: false,
        rlimits: false,
        platform: 'linux',
      });
      mockProxyStart.mockResolvedValue({
        proxyUrl: 'http://127.0.0.1:8888',
        stop: vi.fn(),
      });
      const mgr = new SandboxManager(makeConfig({ enabled: false }), {
        logger: makeLogger() as any,
      });
      await mgr.startProxy([], []);
      const status = mgr.getStatus();
      expect(status.credentialProxyUrl).toBe('http://127.0.0.1:8888');
    });
  });
});
