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
  mockMkdtempSync: vi.fn(() => '/tmp/sy-sgx-test'),
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

import { SgxSandbox } from './sgx-sandbox.js';

describe('SgxSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isAvailable', () => {
    it('returns false on non-Linux platforms', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      const sandbox = new SgxSandbox();
      expect(sandbox.isAvailable()).toBe(false);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('returns false when SGX device is missing', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      mockExistsSync.mockReturnValue(false);
      const sandbox = new SgxSandbox();
      expect(sandbox.isAvailable()).toBe(false);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('returns false when SGX device exists but Gramine is missing', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      mockExistsSync.mockImplementation((p: string) => p === '/dev/sgx_enclave');
      mockExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });
      const sandbox = new SgxSandbox();
      expect(sandbox.isAvailable()).toBe(false);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('returns true when SGX device and Gramine are both available', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      mockExistsSync.mockImplementation((p: string) => p === '/dev/sgx_enclave');
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'gramine-sgx') return '/usr/bin/gramine-sgx';
        return '';
      });
      const sandbox = new SgxSandbox();
      expect(sandbox.isAvailable()).toBe(true);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('returns true with /dev/isgx legacy device', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      mockExistsSync.mockImplementation((p: string) => p === '/dev/isgx');
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'gramine-sgx') return '/usr/bin/gramine-sgx';
        return '';
      });
      const sandbox = new SgxSandbox();
      expect(sandbox.isAvailable()).toBe(true);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('returns true when explicit graminePath is valid', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      mockExistsSync.mockImplementation((p: string) => p === '/dev/sgx_enclave');
      mockExecFileSync.mockReturnValue('gramine version 1.5');
      const sandbox = new SgxSandbox({ graminePath: '/custom/gramine-sgx' });
      expect(sandbox.isAvailable()).toBe(true);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('caches availability result', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      const sandbox = new SgxSandbox();
      sandbox.isAvailable();
      sandbox.isAvailable();
      // Platform check short-circuits, no execFileSync needed
      expect(mockExecFileSync).not.toHaveBeenCalled();
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });

  describe('getCapabilities', () => {
    it('reports sgx capability when available', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      mockExistsSync.mockImplementation((p: string) => p === '/dev/sgx_enclave');
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'gramine-sgx') return '/usr/bin/gramine-sgx';
        return '';
      });
      const sandbox = new SgxSandbox();
      const caps = sandbox.getCapabilities();
      expect(caps.platform).toBe('linux');
      expect(caps.landlock).toBe(false);
      expect(caps.seccomp).toBe(false);
      expect((caps as any).sgx).toBe(true);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('reports sgx false when unavailable', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      const sandbox = new SgxSandbox();
      const caps = sandbox.getCapabilities();
      expect((caps as any).sgx).toBe(false);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });

  describe('run', () => {
    it('falls back gracefully when SGX is not available', async () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });
      const sandbox = new SgxSandbox();
      const result = await sandbox.run(async () => 42);
      expect(result.success).toBe(true);
      expect(result.result).toBe(42);
      expect(result.violations).toHaveLength(0);
    });

    it('fallback tracks resource usage', async () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });
      const sandbox = new SgxSandbox();
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
      const sandbox = new SgxSandbox();
      const result = await sandbox.run(async () => {
        throw new Error('task failed');
      });
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('task failed');
    });

    it('executes via gramine-sgx when available', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      mockExistsSync.mockImplementation((p: string) => p === '/dev/sgx_enclave');
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'gramine-sgx') return '/usr/bin/gramine-sgx';
        return '';
      });

      mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
        cb(null, JSON.stringify({ success: true, result: 99 }), '');
        return { stderr: { on: vi.fn() } };
      });

      const sandbox = new SgxSandbox();
      const result = await sandbox.run(async () => 99);
      expect(result.success).toBe(true);
      expect(result.result).toBe(99);

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('handles gramine execution errors', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      mockExistsSync.mockImplementation((p: string) => p === '/dev/sgx_enclave');
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'gramine-sgx') return '/usr/bin/gramine-sgx';
        return '';
      });

      mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
        cb(new Error('gramine crashed'), '', 'fatal error');
        return { stderr: { on: vi.fn() } };
      });

      const sandbox = new SgxSandbox();
      const result = await sandbox.run(async () => 0);
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('gramine crashed');

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('handles malformed SGX output', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      mockExistsSync.mockImplementation((p: string) => p === '/dev/sgx_enclave');
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'gramine-sgx') return '/usr/bin/gramine-sgx';
        return '';
      });

      mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
        cb(null, 'not json at all', '');
        return { stderr: { on: vi.fn() } };
      });

      const sandbox = new SgxSandbox();
      const result = await sandbox.run(async () => 0);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Failed to parse SGX output');

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('records violations from stderr', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      mockExistsSync.mockImplementation((p: string) => p === '/dev/sgx_enclave');
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'gramine-sgx') return '/usr/bin/gramine-sgx';
        return '';
      });

      mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
        cb(null, JSON.stringify({ success: true, result: 1 }), 'syscall DENIED by policy');
        return { stderr: { on: vi.fn() } };
      });

      const sandbox = new SgxSandbox();
      const result = await sandbox.run(async () => 1);
      expect(result.success).toBe(true);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].type).toBe('syscall');
      expect(result.violations[0].description).toContain('DENIED');

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('cleans up temp directory after execution', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      mockExistsSync.mockImplementation((p: string) => p === '/dev/sgx_enclave');
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'gramine-sgx') return '/usr/bin/gramine-sgx';
        return '';
      });

      mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
        cb(null, JSON.stringify({ success: true, result: 1 }), '');
        return { stderr: { on: vi.fn() } };
      });

      const sandbox = new SgxSandbox();
      await sandbox.run(async () => 1);
      expect(mockRmSync).toHaveBeenCalledWith('/tmp/sy-sgx-test', {
        recursive: true,
        force: true,
      });

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('writes manifest with custom enclave size', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      mockExistsSync.mockImplementation((p: string) => p === '/dev/sgx_enclave');
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'gramine-sgx') return '/usr/bin/gramine-sgx';
        return '';
      });

      mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
        cb(null, JSON.stringify({ success: true, result: 1 }), '');
        return { stderr: { on: vi.fn() } };
      });

      const sandbox = new SgxSandbox({ enclaveSize: '512M' });
      await sandbox.run(async () => 1);

      const manifestCall = mockWriteFileSync.mock.calls.find((c: any[]) =>
        String(c[0]).endsWith('.manifest.sgx')
      );
      expect(manifestCall).toBeDefined();
      expect(manifestCall![1]).toContain('512M');

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });
});
