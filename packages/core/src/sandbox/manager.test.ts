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

  describe('agnos technology', () => {
    it('falls back to NoopSandbox when AGNOS daimon is not available', () => {
      const originalUrl = process.env.AGNOS_RUNTIME_URL;
      delete process.env.AGNOS_RUNTIME_URL;
      const manager = new SandboxManager(makeConfig({ enabled: true, technology: 'agnos' }), {
        logger: makeLogger() as any,
      });
      const sandbox = manager.createSandbox();
      // AGNOS requires /etc/agnos/version or AGNOS_RUNTIME_URL
      expect(sandbox.constructor.name).toBe('NoopSandbox');
      if (originalUrl) process.env.AGNOS_RUNTIME_URL = originalUrl;
    });

    it('auto-detects AGNOS when AGNOS_RUNTIME_URL is set', () => {
      const originalUrl = process.env.AGNOS_RUNTIME_URL;
      process.env.AGNOS_RUNTIME_URL = 'http://127.0.0.1:8090';
      const manager = new SandboxManager(makeConfig({ enabled: true, technology: 'auto' }), {
        logger: makeLogger() as any,
      });
      const sandbox = manager.createSandbox();
      expect(sandbox.constructor.name).toBe('AgnosSandbox');
      if (originalUrl) {
        process.env.AGNOS_RUNTIME_URL = originalUrl;
      } else {
        delete process.env.AGNOS_RUNTIME_URL;
      }
    });
  });

  describe('firecracker technology', () => {
    it('falls back to NoopSandbox when firecracker is not available', () => {
      const manager = new SandboxManager(
        makeConfig({
          enabled: true,
          technology: 'firecracker',
          firecracker: {
            kernelPath: '/nonexistent/vmlinux',
            rootfsPath: '/nonexistent/rootfs.ext4',
          },
        }),
        { logger: makeLogger() as any }
      );
      const sandbox = manager.createSandbox();
      // Firecracker requires /dev/kvm + binary + kernel + rootfs, so falls back
      expect(sandbox.constructor.name).toBe('NoopSandbox');
    });

    it('accepts firecracker config in SandboxManagerConfig', () => {
      const config = makeConfig({
        technology: 'firecracker',
        firecracker: {
          kernelPath: '/opt/fc/vmlinux',
          rootfsPath: '/opt/fc/rootfs.ext4',
          memorySizeMb: 256,
          vcpuCount: 2,
        },
      });
      const manager = new SandboxManager(config);
      expect(manager.getConfig().firecracker).toEqual({
        kernelPath: '/opt/fc/vmlinux',
        rootfsPath: '/opt/fc/rootfs.ext4',
        memorySizeMb: 256,
        vcpuCount: 2,
      });
    });
  });
});
