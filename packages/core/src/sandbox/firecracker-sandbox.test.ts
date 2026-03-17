import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockExecFileSync,
  mockExecFile,
  mockMkdtempSync,
  mockWriteFileSync,
  mockReadFileSync,
  mockRmSync,
  mockUnlinkSync,
  mockExistsSync,
} = vi.hoisted(() => ({
  mockExecFileSync: vi.fn(),
  mockExecFile: vi.fn(),
  mockMkdtempSync: vi.fn(() => '/tmp/sy-fc-test'),
  mockWriteFileSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockRmSync: vi.fn(),
  mockUnlinkSync: vi.fn(),
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
  readFileSync: mockReadFileSync,
  rmSync: mockRmSync,
  unlinkSync: mockUnlinkSync,
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

import { FirecrackerSandbox } from './firecracker-sandbox.js';

describe('FirecrackerSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isAvailable', () => {
    it('returns false on non-Linux platforms', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      const sandbox = new FirecrackerSandbox();
      expect(sandbox.isAvailable()).toBe(false);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('returns false when /dev/kvm is missing', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      mockExistsSync.mockReturnValue(false);
      const sandbox = new FirecrackerSandbox({
        kernelPath: '/opt/fc/vmlinux',
        rootfsPath: '/opt/fc/rootfs.ext4',
      });
      expect(sandbox.isAvailable()).toBe(false);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('returns false when /dev/kvm exists but firecracker binary is missing', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      mockExistsSync.mockImplementation((p: string) => p === '/dev/kvm');
      mockExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });
      const sandbox = new FirecrackerSandbox({
        kernelPath: '/opt/fc/vmlinux',
        rootfsPath: '/opt/fc/rootfs.ext4',
      });
      expect(sandbox.isAvailable()).toBe(false);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('returns false when kernel or rootfs paths are not configured', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      mockExistsSync.mockImplementation((p: string) => p === '/dev/kvm');
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'firecracker') return '/usr/bin/firecracker';
        return '';
      });
      const sandbox = new FirecrackerSandbox(); // no kernel/rootfs
      expect(sandbox.isAvailable()).toBe(false);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('returns true when all prerequisites are met', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      mockExistsSync.mockImplementation(
        (p: string) => p === '/dev/kvm' || p === '/opt/fc/vmlinux' || p === '/opt/fc/rootfs.ext4'
      );
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'firecracker') return '/usr/bin/firecracker';
        return '';
      });
      const sandbox = new FirecrackerSandbox({
        kernelPath: '/opt/fc/vmlinux',
        rootfsPath: '/opt/fc/rootfs.ext4',
      });
      expect(sandbox.isAvailable()).toBe(true);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('returns true when explicit firecrackerPath is valid', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      mockExistsSync.mockImplementation(
        (p: string) => p === '/dev/kvm' || p === '/opt/fc/vmlinux' || p === '/opt/fc/rootfs.ext4'
      );
      mockExecFileSync.mockReturnValue('Firecracker v1.7.0');
      const sandbox = new FirecrackerSandbox({
        firecrackerPath: '/custom/firecracker',
        kernelPath: '/opt/fc/vmlinux',
        rootfsPath: '/opt/fc/rootfs.ext4',
      });
      expect(sandbox.isAvailable()).toBe(true);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('caches availability result', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      const sandbox = new FirecrackerSandbox();
      sandbox.isAvailable();
      sandbox.isAvailable();
      expect(mockExecFileSync).not.toHaveBeenCalled();
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });

  describe('getCapabilities', () => {
    it('reports firecracker capability when available', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      mockExistsSync.mockImplementation(
        (p: string) => p === '/dev/kvm' || p === '/opt/fc/vmlinux' || p === '/opt/fc/rootfs.ext4'
      );
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'firecracker') return '/usr/bin/firecracker';
        return '';
      });
      const sandbox = new FirecrackerSandbox({
        kernelPath: '/opt/fc/vmlinux',
        rootfsPath: '/opt/fc/rootfs.ext4',
      });
      const caps = sandbox.getCapabilities();
      expect(caps.platform).toBe('linux');
      expect(caps.namespaces).toBe(true);
      expect((caps as any).firecracker).toBe(true);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('reports firecracker false when unavailable', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      const sandbox = new FirecrackerSandbox();
      const caps = sandbox.getCapabilities();
      expect((caps as any).firecracker).toBe(false);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });

  describe('run', () => {
    it('falls back gracefully when Firecracker is not available', async () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });
      const sandbox = new FirecrackerSandbox();
      const result = await sandbox.run(async () => 42);
      expect(result.success).toBe(true);
      expect(result.result).toBe(42);
      expect(result.violations).toHaveLength(0);
    });

    it('fallback tracks resource usage', async () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });
      const sandbox = new FirecrackerSandbox();
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
      const sandbox = new FirecrackerSandbox();
      const result = await sandbox.run(async () => {
        throw new Error('task failed');
      });
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('task failed');
    });

    it('executes via Firecracker when available', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      mockExistsSync.mockImplementation(
        (p: string) => p === '/dev/kvm' || p === '/opt/fc/vmlinux' || p === '/opt/fc/rootfs.ext4'
      );
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'firecracker') return '/usr/bin/firecracker';
        if (cmd === 'which' && args[0] === 'jailer') throw new Error('not found');
        return '';
      });

      mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
        cb(null, JSON.stringify({ success: true, result: 99 }), '');
        return { stderr: { on: vi.fn() } };
      });

      const sandbox = new FirecrackerSandbox({
        kernelPath: '/opt/fc/vmlinux',
        rootfsPath: '/opt/fc/rootfs.ext4',
      });
      const result = await sandbox.run(async () => 99);
      expect(result.success).toBe(true);
      expect(result.result).toBe(99);

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('handles Firecracker execution errors', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      mockExistsSync.mockImplementation(
        (p: string) => p === '/dev/kvm' || p === '/opt/fc/vmlinux' || p === '/opt/fc/rootfs.ext4'
      );
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'firecracker') return '/usr/bin/firecracker';
        if (cmd === 'which' && args[0] === 'jailer') throw new Error('not found');
        return '';
      });

      mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
        cb(new Error('microVM crashed'), '', 'fatal error');
        return { stderr: { on: vi.fn() } };
      });

      const sandbox = new FirecrackerSandbox({
        kernelPath: '/opt/fc/vmlinux',
        rootfsPath: '/opt/fc/rootfs.ext4',
      });
      const result = await sandbox.run(async () => 0);
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('microVM crashed');

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('handles malformed Firecracker output', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      mockExistsSync.mockImplementation(
        (p: string) => p === '/dev/kvm' || p === '/opt/fc/vmlinux' || p === '/opt/fc/rootfs.ext4'
      );
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'firecracker') return '/usr/bin/firecracker';
        if (cmd === 'which' && args[0] === 'jailer') throw new Error('not found');
        return '';
      });

      mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
        cb(null, 'not json', '');
        return { stderr: { on: vi.fn() } };
      });

      const sandbox = new FirecrackerSandbox({
        kernelPath: '/opt/fc/vmlinux',
        rootfsPath: '/opt/fc/rootfs.ext4',
      });
      const result = await sandbox.run(async () => 0);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Failed to parse Firecracker output');

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('records violations from stderr', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      mockExistsSync.mockImplementation(
        (p: string) => p === '/dev/kvm' || p === '/opt/fc/vmlinux' || p === '/opt/fc/rootfs.ext4'
      );
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'firecracker') return '/usr/bin/firecracker';
        if (cmd === 'which' && args[0] === 'jailer') throw new Error('not found');
        return '';
      });

      mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
        cb(null, JSON.stringify({ success: true, result: 1 }), 'security violation detected');
        return { stderr: { on: vi.fn() } };
      });

      const sandbox = new FirecrackerSandbox({
        kernelPath: '/opt/fc/vmlinux',
        rootfsPath: '/opt/fc/rootfs.ext4',
      });
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

      mockExistsSync.mockImplementation(
        (p: string) => p === '/dev/kvm' || p === '/opt/fc/vmlinux' || p === '/opt/fc/rootfs.ext4'
      );
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'firecracker') return '/usr/bin/firecracker';
        if (cmd === 'which' && args[0] === 'jailer') throw new Error('not found');
        return '';
      });

      mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
        cb(null, JSON.stringify({ success: true, result: 1 }), '');
        return { stderr: { on: vi.fn() } };
      });

      const sandbox = new FirecrackerSandbox({
        kernelPath: '/opt/fc/vmlinux',
        rootfsPath: '/opt/fc/rootfs.ext4',
      });
      await sandbox.run(async () => 1);
      expect(mockRmSync).toHaveBeenCalledWith('/tmp/sy-fc-test', {
        recursive: true,
        force: true,
      });

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('uses --no-api and --config-file flags when jailer is not available', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      mockExistsSync.mockImplementation(
        (p: string) => p === '/dev/kvm' || p === '/opt/fc/vmlinux' || p === '/opt/fc/rootfs.ext4'
      );
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'firecracker') return '/usr/bin/firecracker';
        if (cmd === 'which' && args[0] === 'jailer') throw new Error('not found');
        return '';
      });

      let capturedArgs: string[] = [];
      let capturedBin = '';
      mockExecFile.mockImplementation((cmd: string, args: string[], _opts: any, cb: Function) => {
        capturedBin = cmd;
        capturedArgs = args;
        cb(null, JSON.stringify({ success: true, result: 1 }), '');
        return { stderr: { on: vi.fn() } };
      });

      const sandbox = new FirecrackerSandbox({
        kernelPath: '/opt/fc/vmlinux',
        rootfsPath: '/opt/fc/rootfs.ext4',
        memorySizeMb: 256,
        vcpuCount: 2,
        useJailer: false,
      });
      await sandbox.run(async () => 1);

      expect(capturedBin).toBe('/usr/bin/firecracker');
      expect(capturedArgs).toContain('--no-api');
      expect(capturedArgs).toContain('--config-file');

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('uses jailer when available and useJailer is not false', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      mockExistsSync.mockImplementation(
        (p: string) => p === '/dev/kvm' || p === '/opt/fc/vmlinux' || p === '/opt/fc/rootfs.ext4'
      );
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'firecracker') return '/usr/bin/firecracker';
        if (cmd === 'which' && args[0] === 'jailer') return '/usr/bin/jailer';
        return '';
      });

      let capturedBin = '';
      let capturedArgs: string[] = [];
      mockExecFile.mockImplementation((cmd: string, args: string[], _opts: any, cb: Function) => {
        capturedBin = cmd;
        capturedArgs = args;
        cb(null, JSON.stringify({ success: true, result: 1 }), '');
        return { stderr: { on: vi.fn() } };
      });

      const sandbox = new FirecrackerSandbox({
        kernelPath: '/opt/fc/vmlinux',
        rootfsPath: '/opt/fc/rootfs.ext4',
      });
      await sandbox.run(async () => 1);

      expect(capturedBin).toBe('/usr/bin/jailer');
      expect(capturedArgs).toContain('--exec-file');
      // Jailer wraps firecracker, so --no-api should be in args after --
      expect(capturedArgs).toContain('--no-api');

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });

  describe('VM config generation', () => {
    it('produces valid VM config JSON via execution', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      mockExistsSync.mockImplementation(
        (p: string) => p === '/dev/kvm' || p === '/opt/fc/vmlinux' || p === '/opt/fc/rootfs.ext4'
      );
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'firecracker') return '/usr/bin/firecracker';
        if (cmd === 'which' && args[0] === 'jailer') throw new Error('not found');
        return '';
      });

      let writtenConfig = '';
      mockWriteFileSync.mockImplementation((_path: string, content: string) => {
        if (_path.endsWith('vm-config.json')) writtenConfig = content;
      });

      mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
        cb(null, JSON.stringify({ success: true, result: 1 }), '');
        return { stderr: { on: vi.fn() } };
      });

      const sandbox = new FirecrackerSandbox({
        kernelPath: '/opt/fc/vmlinux',
        rootfsPath: '/opt/fc/rootfs.ext4',
        memorySizeMb: 256,
        vcpuCount: 2,
      });
      await sandbox.run(async () => 1);

      const config = JSON.parse(writtenConfig);
      expect(config['boot-source'].kernel_image_path).toBe('/opt/fc/vmlinux');
      expect(config['boot-source'].boot_args).toContain('console=ttyS0');
      expect(config['machine-config']).toEqual({ vcpu_count: 2, mem_size_mib: 256, smt: false });
      expect(config.drives[0].drive_id).toBe('rootfs');
      expect(config.drives[0].is_read_only).toBe(true);
      expect(config['network-interfaces']).toBeUndefined();

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });
});
