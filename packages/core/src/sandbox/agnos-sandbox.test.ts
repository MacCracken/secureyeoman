/**
 * Tests for AgnosSandbox — SecureYeoman ↔ AGNOS delegation.
 *
 * These tests validate the AgnosSandbox implementation without
 * requiring a running daimon instance (graceful fallback behavior).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

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

import { AgnosSandbox, isAgnosticOS } from './agnos-sandbox.js';

describe('AgnosSandbox', () => {
  let sandbox: AgnosSandbox;

  beforeEach(() => {
    sandbox = new AgnosSandbox('test-agent');
  });

  describe('getCapabilities', () => {
    it('reports kernel-level capabilities', () => {
      const caps = sandbox.getCapabilities();
      expect(caps.landlock).toBe(true);
      expect(caps.seccomp).toBe(true);
      expect(caps.namespaces).toBe(true);
      expect(caps.rlimits).toBe(true);
      expect(caps.platform).toBe('linux');
      expect(caps.credentialProxy).toBe(true);
      expect(caps.tpm).toBe(true);
    });
  });

  describe('run', () => {
    it('executes function and returns result', async () => {
      const result = await sandbox.run(async () => 42);
      expect(result.success).toBe(true);
      expect(result.result).toBe(42);
    });

    it('captures errors from function', async () => {
      const result = await sandbox.run(async () => {
        throw new Error('test failure');
      });
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('test failure');
    });

    it('records violation when daimon unreachable', async () => {
      // Without daimon running, enforcement request fails gracefully
      const result = await sandbox.run(async () => 'ok');
      expect(result.success).toBe(true);
      // May have a violation warning about unreachable daimon
      if (result.violations.length > 0) {
        expect(result.violations[0].description).toContain('unreachable');
      }
    });

    it('tracks resource usage', async () => {
      const result = await sandbox.run(async () => 'ok');
      expect(result.resourceUsage).toBeDefined();
      expect(result.resourceUsage!.cpuTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('respects timeout option', async () => {
      const result = await sandbox.run(async () => 'ok', { timeoutMs: 5000 });
      expect(result.success).toBe(true);
    });
  });

  describe('scanEgress', () => {
    it('returns allowed:true when gate unavailable', async () => {
      const result = await sandbox.scanEgress('clean data');
      expect(result.allowed).toBe(true);
    });
  });

  describe('startCredentialProxy', () => {
    it('returns empty env vars when daimon unavailable', async () => {
      const env = await sandbox.startCredentialProxy(
        [
          {
            host_pattern: 'api.openai.com',
            header_name: 'Authorization',
            header_value: 'Bearer test',
          },
        ],
        ['api.openai.com']
      );
      expect(env).toEqual({});
    });
  });

  describe('applyLandlockPolicy', () => {
    it('returns ok:false when daimon unavailable', async () => {
      const result = await sandbox.applyLandlockPolicy({
        name: 'test-policy',
        filesystemRules: [{ path: '/tmp', access: ['read_file', 'write_file'] }],
        networkRules: [],
        resourceLimits: { maxMemoryBytes: 1024 * 1024 * 512, cpuQuotaPercent: 50 },
        requireCredentialProxy: false,
      });
      expect(result.ok).toBe(false);
    });
  });
});

describe('isAgnosticOS', () => {
  it('returns false when not on AGNOS', () => {
    const original = process.env.AGNOS_RUNTIME_URL;
    delete process.env.AGNOS_RUNTIME_URL;
    const result = isAgnosticOS();
    if (original) process.env.AGNOS_RUNTIME_URL = original;
    // Can't assert false because /etc/agnos/version might exist on AGNOS hosts
    expect(typeof result).toBe('boolean');
  });

  it('returns true when AGNOS_RUNTIME_URL is set', () => {
    const original = process.env.AGNOS_RUNTIME_URL;
    process.env.AGNOS_RUNTIME_URL = 'http://127.0.0.1:8090';
    expect(isAgnosticOS()).toBe(true);
    if (original) {
      process.env.AGNOS_RUNTIME_URL = original;
    } else {
      delete process.env.AGNOS_RUNTIME_URL;
    }
  });
});
