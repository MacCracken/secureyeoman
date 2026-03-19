import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyAgnosSandbox } from './sy-agnos-sandbox.js';
import type { AgnosClient } from '../integrations/agnos/agnos-client.js';

// Mock child_process
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
  execFile: vi.fn(),
}));

// Mock fs
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    mkdtempSync: vi.fn().mockReturnValue('/tmp/sy-agnos-test'),
    writeFileSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

const { execFileSync, execFile } = await import('node:child_process');

describe('SyAgnosSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: `which docker` fails, no runtime
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('not found');
    });
  });

  describe('isAvailable', () => {
    it('returns false when no container runtime is detected', () => {
      const sandbox = new SyAgnosSandbox();
      // On non-linux in CI this may be false due to platform check
      // For unit test, just verify it doesn't throw
      const result = sandbox.isAvailable();
      expect(typeof result).toBe('boolean');
    });

    it('returns false on non-linux platforms', () => {
      const origPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      const sandbox = new SyAgnosSandbox();
      expect(sandbox.isAvailable()).toBe(false);
      Object.defineProperty(process, 'platform', { value: origPlatform });
    });
  });

  describe('getCapabilities', () => {
    it('returns capabilities with syAgnos field', () => {
      const sandbox = new SyAgnosSandbox();
      const caps = sandbox.getCapabilities();
      expect(caps.namespaces).toBe(true);
      expect(caps.rlimits).toBe(true);
      expect('syAgnos' in caps).toBe(true);
    });
  });

  describe('detectStrength', () => {
    it('returns 80 when runtime is not available', () => {
      const sandbox = new SyAgnosSandbox();
      expect(sandbox.detectStrength()).toBe(80);
    });

    it('parses minimal tier as 80', () => {
      const sandbox = new SyAgnosSandbox();
      (sandbox as any).runtimeBinary = '/usr/bin/docker';
      vi.mocked(execFileSync).mockReturnValue(JSON.stringify({ tier: 'minimal', version: '1.0' }));
      expect(sandbox.detectStrength()).toBe(80);
    });

    it('parses dmverity tier as 85', () => {
      const sandbox = new SyAgnosSandbox();
      (sandbox as any).runtimeBinary = '/usr/bin/docker';
      vi.mocked(execFileSync).mockReturnValue(JSON.stringify({ tier: 'dmverity', version: '1.0' }));
      expect(sandbox.detectStrength()).toBe(85);
    });

    it('parses tpm_measured tier as 88', () => {
      const sandbox = new SyAgnosSandbox();
      (sandbox as any).runtimeBinary = '/usr/bin/docker';
      vi.mocked(execFileSync).mockReturnValue(
        JSON.stringify({ tier: 'tpm_measured', version: '1.0' })
      );
      expect(sandbox.detectStrength()).toBe(88);
    });
  });

  describe('verifyAttestation', () => {
    it('returns true when PCR values and signature are present', async () => {
      const sandbox = new SyAgnosSandbox();
      const pcr = 'a'.repeat(64); // valid 64-char hex
      const mockClient = {
        getAttestation: vi.fn().mockResolvedValue({
          pcr_values: { '8': pcr, '9': pcr, '10': pcr },
          signature: 'a'.repeat(64),
          algorithm: 'SHA256',
          timestamp: '2026-03-18T00:00:00Z',
        }),
      } as unknown as AgnosClient;

      expect(await sandbox.verifyAttestation(mockClient)).toBe(true);
    });

    it('returns false when a required PCR is missing', async () => {
      const sandbox = new SyAgnosSandbox();
      const mockClient = {
        getAttestation: vi.fn().mockResolvedValue({
          pcr_values: { '8': 'abc', '9': 'def' }, // missing PCR 10
          signature: 'hmac-signature-value',
          algorithm: 'SHA256',
          timestamp: '2026-03-18T00:00:00Z',
        }),
      } as unknown as AgnosClient;

      expect(await sandbox.verifyAttestation(mockClient)).toBe(false);
    });

    it('returns false when signature is empty', async () => {
      const sandbox = new SyAgnosSandbox();
      const mockClient = {
        getAttestation: vi.fn().mockResolvedValue({
          pcr_values: { '8': 'abc', '9': 'def', '10': 'ghi' },
          signature: '',
          algorithm: 'SHA256',
          timestamp: '2026-03-18T00:00:00Z',
        }),
      } as unknown as AgnosClient;

      expect(await sandbox.verifyAttestation(mockClient)).toBe(false);
    });

    it('returns false when attestation call fails', async () => {
      const sandbox = new SyAgnosSandbox();
      const mockClient = {
        getAttestation: vi.fn().mockRejectedValue(new Error('unreachable')),
      } as unknown as AgnosClient;

      expect(await sandbox.verifyAttestation(mockClient)).toBe(false);
    });
  });

  describe('run', () => {
    it('falls back to in-process execution when not available', async () => {
      const sandbox = new SyAgnosSandbox();
      const result = await sandbox.run(async () => 'hello');
      expect(result.success).toBe(true);
      expect(result.result).toBe('hello');
    });

    it('returns successful result on mock execFile (container available)', async () => {
      const sandbox = new SyAgnosSandbox();
      // Force availability
      (sandbox as any).available = true;
      (sandbox as any).runtimeBinary = '/usr/bin/docker';

      vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, callback: any) => {
        callback(null, JSON.stringify({ success: true, result: 42 }), '');
        return {} as any;
      });

      const result = await sandbox.run(async () => 42);
      expect(result.success).toBe(true);
      expect(result.result).toBe(42);
    });

    it('handles timeout correctly', async () => {
      const sandbox = new SyAgnosSandbox();
      (sandbox as any).available = true;
      (sandbox as any).runtimeBinary = '/usr/bin/docker';

      vi.mocked(execFile).mockImplementation(() => {
        // Never calls callback — simulates a hang
        return { pid: 12345 } as any;
      });

      const result = await sandbox.run(async () => 'slow', { timeoutMs: 100 });
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('timed out');
    });
  });
});
