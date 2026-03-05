import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockExecFileSync,
  mockExecFile,
  mockMkdtempSync,
  mockWriteFileSync,
  mockRmSync,
  mockExistsSync,
} = vi.hoisted(() => ({
  mockExecFileSync: vi.fn(),
  mockExecFile: vi.fn(),
  mockMkdtempSync: vi.fn(() => '/tmp/sy-sev-test'),
  mockWriteFileSync: vi.fn(),
  mockRmSync: vi.fn(),
  mockExistsSync: vi.fn(() => false),
}));

vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync,
  execFile: mockExecFile,
}));

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
  mkdtempSync: mockMkdtempSync,
  writeFileSync: mockWriteFileSync,
  rmSync: mockRmSync,
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

import { SevSandbox } from './sev-sandbox.js';

describe('SevSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isAvailable', () => {
    it('returns false on non-Linux platforms', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      const sandbox = new SevSandbox();
      expect(sandbox.isAvailable()).toBe(false);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('returns false when /dev/sev is missing', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      mockExistsSync.mockReturnValue(false);
      const sandbox = new SevSandbox();
      expect(sandbox.isAvailable()).toBe(false);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('returns false when /dev/sev exists but QEMU is missing', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      mockExistsSync.mockImplementation((p: string) => p === '/dev/sev');
      mockExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });
      const sandbox = new SevSandbox();
      expect(sandbox.isAvailable()).toBe(false);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('returns true when /dev/sev and QEMU are both available', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      mockExistsSync.mockImplementation((p: string) => p === '/dev/sev');
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'qemu-system-x86_64')
          return '/usr/bin/qemu-system-x86_64';
        return '';
      });
      const sandbox = new SevSandbox();
      expect(sandbox.isAvailable()).toBe(true);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('returns true when explicit qemuPath is valid', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      mockExistsSync.mockImplementation((p: string) => p === '/dev/sev');
      mockExecFileSync.mockReturnValue('QEMU emulator version 8.2');
      const sandbox = new SevSandbox({ qemuPath: '/custom/qemu-system-x86_64' });
      expect(sandbox.isAvailable()).toBe(true);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('caches availability result', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      const sandbox = new SevSandbox();
      sandbox.isAvailable();
      sandbox.isAvailable();
      expect(mockExecFileSync).not.toHaveBeenCalled();
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });

  describe('getCapabilities', () => {
    it('reports sev capability when available', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      mockExistsSync.mockImplementation((p: string) => p === '/dev/sev');
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'qemu-system-x86_64')
          return '/usr/bin/qemu-system-x86_64';
        return '';
      });
      const sandbox = new SevSandbox();
      const caps = sandbox.getCapabilities();
      expect(caps.platform).toBe('linux');
      expect((caps as any).sev).toBe(true);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('reports sev false when unavailable', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      const sandbox = new SevSandbox();
      const caps = sandbox.getCapabilities();
      expect((caps as any).sev).toBe(false);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });

  describe('run', () => {
    it('falls back gracefully when SEV is not available', async () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });
      const sandbox = new SevSandbox();
      const result = await sandbox.run(async () => 42);
      expect(result.success).toBe(true);
      expect(result.result).toBe(42);
      expect(result.violations).toHaveLength(0);
    });

    it('fallback tracks resource usage', async () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });
      const sandbox = new SevSandbox();
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
      const sandbox = new SevSandbox();
      const result = await sandbox.run(async () => {
        throw new Error('task failed');
      });
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('task failed');
    });

    it('executes via QEMU when available', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      mockExistsSync.mockImplementation((p: string) => p === '/dev/sev');
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'qemu-system-x86_64')
          return '/usr/bin/qemu-system-x86_64';
        return '';
      });

      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: any, cb: Function) => {
          cb(null, JSON.stringify({ success: true, result: 99 }), '');
          return { stderr: { on: vi.fn() } };
        }
      );

      const sandbox = new SevSandbox();
      const result = await sandbox.run(async () => 99);
      expect(result.success).toBe(true);
      expect(result.result).toBe(99);

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('handles QEMU execution errors', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      mockExistsSync.mockImplementation((p: string) => p === '/dev/sev');
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'qemu-system-x86_64')
          return '/usr/bin/qemu-system-x86_64';
        return '';
      });

      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: any, cb: Function) => {
          cb(new Error('qemu crashed'), '', 'fatal error');
          return { stderr: { on: vi.fn() } };
        }
      );

      const sandbox = new SevSandbox();
      const result = await sandbox.run(async () => 0);
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('qemu crashed');

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('handles malformed SEV output', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      mockExistsSync.mockImplementation((p: string) => p === '/dev/sev');
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'qemu-system-x86_64')
          return '/usr/bin/qemu-system-x86_64';
        return '';
      });

      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: any, cb: Function) => {
          cb(null, 'not json', '');
          return { stderr: { on: vi.fn() } };
        }
      );

      const sandbox = new SevSandbox();
      const result = await sandbox.run(async () => 0);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Failed to parse SEV output');

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('records violations from stderr', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      mockExistsSync.mockImplementation((p: string) => p === '/dev/sev');
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'qemu-system-x86_64')
          return '/usr/bin/qemu-system-x86_64';
        return '';
      });

      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: any, cb: Function) => {
          cb(null, JSON.stringify({ success: true, result: 1 }), 'security violation detected');
          return { stderr: { on: vi.fn() } };
        }
      );

      const sandbox = new SevSandbox();
      const result = await sandbox.run(async () => 1);
      expect(result.success).toBe(true);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].type).toBe('syscall');
      expect(result.violations[0].description).toContain('violation');

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('cleans up temp directory after execution', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      mockExistsSync.mockImplementation((p: string) => p === '/dev/sev');
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'qemu-system-x86_64')
          return '/usr/bin/qemu-system-x86_64';
        return '';
      });

      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: any, cb: Function) => {
          cb(null, JSON.stringify({ success: true, result: 1 }), '');
          return { stderr: { on: vi.fn() } };
        }
      );

      const sandbox = new SevSandbox();
      await sandbox.run(async () => 1);
      expect(mockRmSync).toHaveBeenCalledWith('/tmp/sy-sev-test', {
        recursive: true,
        force: true,
      });

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('passes SEV-SNP flags to QEMU', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      mockExistsSync.mockImplementation((p: string) => p === '/dev/sev');
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'qemu-system-x86_64')
          return '/usr/bin/qemu-system-x86_64';
        return '';
      });

      let capturedArgs: string[] = [];
      mockExecFile.mockImplementation(
        (_cmd: string, args: string[], _opts: any, cb: Function) => {
          capturedArgs = args;
          cb(null, JSON.stringify({ success: true, result: 1 }), '');
          return { stderr: { on: vi.fn() } };
        }
      );

      const sandbox = new SevSandbox({ memorySize: '1G', vcpus: 4 });
      await sandbox.run(async () => 1);

      expect(capturedArgs.some((a: string) => a.includes('sev-snp-guest'))).toBe(true);
      expect(capturedArgs.some((a: string) => a.includes('EPYC'))).toBe(true);
      expect(capturedArgs).toContain('4'); // vcpus
      expect(capturedArgs).toContain('1G'); // memory

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });
});
