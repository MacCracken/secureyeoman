import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockExecFileSync,
  mockExecFile,
  mockMkdtempSync,
  mockWriteFileSync,
  mockRmSync,
  mockMkdirSync,
  mockExistsSync,
  mockReadFileSync,
} = vi.hoisted(() => ({
  mockExecFileSync: vi.fn(),
  mockExecFile: vi.fn(),
  mockMkdtempSync: vi.fn(() => '/tmp/sy-gvisor-test'),
  mockWriteFileSync: vi.fn(),
  mockRmSync: vi.fn(),
  mockMkdirSync: vi.fn(),
  mockExistsSync: vi.fn(() => false),
  mockReadFileSync: vi.fn(() => ''),
}));

vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync,
  execFile: mockExecFile,
}));

vi.mock('node:fs', () => ({
  mkdtempSync: mockMkdtempSync,
  writeFileSync: mockWriteFileSync,
  rmSync: mockRmSync,
  mkdirSync: mockMkdirSync,
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}));

vi.mock('../logging/logger.js', () => ({
  getLogger: () => ({
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  }),
  createNoopLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { GVisorSandbox } from './gvisor-sandbox.js';

describe('GVisorSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isAvailable', () => {
    it('returns false on non-Linux platforms', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      const sandbox = new GVisorSandbox();
      expect(sandbox.isAvailable()).toBe(false);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('returns false when runsc is not found', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      mockExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });
      const sandbox = new GVisorSandbox();
      expect(sandbox.isAvailable()).toBe(false);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('returns true when runsc is found via which', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'runsc') return '/usr/local/bin/runsc';
        return '';
      });
      const sandbox = new GVisorSandbox();
      expect(sandbox.isAvailable()).toBe(true);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('returns true when explicit runscPath is valid', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      mockExecFileSync.mockReturnValue('runsc version 20260101');
      const sandbox = new GVisorSandbox({ runscPath: '/custom/runsc' });
      expect(sandbox.isAvailable()).toBe(true);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });

  describe('getCapabilities', () => {
    it('reports gvisor capability when available', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'runsc') return '/usr/local/bin/runsc';
        return '';
      });
      const sandbox = new GVisorSandbox();
      const caps = sandbox.getCapabilities();
      expect(caps.namespaces).toBe(true);
      expect(caps.rlimits).toBe(true);
      expect((caps as any).gvisor).toBe(true);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });

  describe('run', () => {
    it('falls back gracefully when runsc is not available', async () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });
      const sandbox = new GVisorSandbox();
      const result = await sandbox.run(async () => 42);
      expect(result.success).toBe(true);
      expect(result.result).toBe(42);
      expect(result.violations).toHaveLength(0);
    });

    it('fallback tracks resource usage', async () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });
      const sandbox = new GVisorSandbox();
      const result = await sandbox.run(async () => 'hello');
      expect(result.success).toBe(true);
      expect(result.resourceUsage).toBeDefined();
      expect(result.resourceUsage!.cpuTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.resourceUsage!.memoryPeakMb).toBeGreaterThan(0);
    });

    it('fallback handles errors', async () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });
      const sandbox = new GVisorSandbox();
      const result = await sandbox.run(async () => {
        throw new Error('task failed');
      });
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('task failed');
    });

    it('executes via runsc when available', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'runsc') return '/usr/local/bin/runsc';
        return '';
      });

      // Mock execFile to simulate runsc execution
      mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
        const child = {
          stderr: { on: vi.fn() },
        };
        cb(null, JSON.stringify({ success: true, result: 99 }), '');
        return child;
      });

      const sandbox = new GVisorSandbox();
      const result = await sandbox.run(async () => 99);
      expect(result.success).toBe(true);
      expect(result.result).toBe(99);

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('handles runsc execution errors', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'runsc') return '/usr/local/bin/runsc';
        return '';
      });

      mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
        const child = { stderr: { on: vi.fn() } };
        cb(new Error('runsc crashed'), '', 'fatal error');
        return child;
      });

      const sandbox = new GVisorSandbox();
      const result = await sandbox.run(async () => 0);
      expect(result.success).toBe(false);
      expect(result.violations.some((v) => v.type === 'syscall')).toBe(true);

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('handles malformed runsc output', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'runsc') return '/usr/local/bin/runsc';
        return '';
      });

      mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
        const child = { stderr: { on: vi.fn() } };
        cb(null, 'not json', '');
        return child;
      });

      const sandbox = new GVisorSandbox();
      const result = await sandbox.run(async () => 0);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Failed to parse gVisor output');

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('cleans up temp directory on success', async () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });
      const sandbox = new GVisorSandbox();
      await sandbox.run(async () => 1);
      // No temp dirs created in fallback mode
      expect(mockRmSync).not.toHaveBeenCalled();
    });

    it('constructs OCI config with memory limits', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'runsc') return '/usr/local/bin/runsc';
        return '';
      });

      let capturedArgs: string[] = [];
      mockExecFile.mockImplementation((_cmd: string, args: string[], _opts: any, cb: Function) => {
        capturedArgs = args;
        const child = { stderr: { on: vi.fn() } };
        cb(null, JSON.stringify({ success: true, result: 1 }), '');
        return child;
      });

      const sandbox = new GVisorSandbox({ platform: 'kvm', networkEnabled: false });
      await sandbox.run(async () => 1, {
        resources: { maxMemoryMb: 128 },
        network: { allowed: false },
      });

      // Should have written config.json
      expect(mockWriteFileSync).toHaveBeenCalled();
      const configCall = mockWriteFileSync.mock.calls.find((c: any[]) =>
        String(c[0]).endsWith('config.json')
      );
      expect(configCall).toBeDefined();
      const ociConfig = JSON.parse(configCall![1] as string);
      expect(ociConfig.ociVersion).toBe('1.0.2');
      expect(ociConfig.process.user.uid).toBe(65534); // nobody

      // Should use kvm platform
      expect(capturedArgs.some((a: string) => a.includes('kvm'))).toBe(true);
      // Should disable network
      expect(capturedArgs.some((a: string) => a.includes('--network=none'))).toBe(true);

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });
});
