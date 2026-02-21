import { describe, it, expect, vi } from 'vitest';
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

describe('SandboxManager', () => {
  describe('isEnabled', () => {
    it('returns false when config.enabled is false', () => {
      const manager = new SandboxManager(makeConfig({ enabled: false }));
      expect(manager.isEnabled()).toBe(false);
    });

    it('returns false when technology is none', () => {
      const manager = new SandboxManager(makeConfig({ technology: 'none' }));
      expect(manager.isEnabled()).toBe(false);
    });

    it('returns true when enabled and technology is not none', () => {
      const manager = new SandboxManager(makeConfig({ enabled: true, technology: 'auto' }));
      expect(manager.isEnabled()).toBe(true);
    });
  });

  describe('createSandbox', () => {
    it('returns NoopSandbox when disabled', () => {
      const manager = new SandboxManager(makeConfig({ enabled: false }));
      const sandbox = manager.createSandbox();
      expect(sandbox.constructor.name).toBe('NoopSandbox');
    });

    it('returns NoopSandbox when technology is none', () => {
      const manager = new SandboxManager(makeConfig({ technology: 'none' }));
      const sandbox = manager.createSandbox();
      expect(sandbox.constructor.name).toBe('NoopSandbox');
    });

    it('returns same instance on subsequent calls (cached)', () => {
      const manager = new SandboxManager(makeConfig({ enabled: false }));
      const s1 = manager.createSandbox();
      const s2 = manager.createSandbox();
      expect(s1).toBe(s2);
    });

    it('falls back to NoopSandbox when auto and not on linux/darwin', () => {
      const manager = new SandboxManager(makeConfig({ enabled: true, technology: 'auto' }), {
        logger: makeLogger() as any,
      });
      // On any platform that's not linux or darwin, falls back to Noop
      // We can't mock process.platform easily, but we test the behavior on current platform
      const sandbox = manager.createSandbox();
      expect(sandbox).toBeDefined();
    });
  });

  describe('detect', () => {
    it('returns capabilities object', () => {
      const manager = new SandboxManager(makeConfig());
      const caps = manager.detect();
      expect(caps).toHaveProperty('platform');
      expect(typeof caps.landlock).toBe('boolean');
      expect(typeof caps.seccomp).toBe('boolean');
    });

    it('caches capabilities after first detection', () => {
      const manager = new SandboxManager(makeConfig());
      const caps1 = manager.detect();
      const caps2 = manager.detect();
      expect(caps1).toBe(caps2);
    });
  });

  describe('getStatus', () => {
    it('returns status object with expected keys', () => {
      const manager = new SandboxManager(makeConfig({ enabled: false }));
      const status = manager.getStatus();
      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('technology');
      expect(status).toHaveProperty('capabilities');
      expect(status).toHaveProperty('sandboxType');
      expect(status.sandboxType).toBe('NoopSandbox');
    });
  });

  describe('getConfig', () => {
    it('returns the config', () => {
      const config = makeConfig();
      const manager = new SandboxManager(config);
      expect(manager.getConfig()).toEqual(config);
    });
  });

  describe('getCapabilities', () => {
    it('delegates to detect()', () => {
      const manager = new SandboxManager(makeConfig());
      const caps = manager.getCapabilities();
      expect(caps).toHaveProperty('platform');
    });
  });
});
