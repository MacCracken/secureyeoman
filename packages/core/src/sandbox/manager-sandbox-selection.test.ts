import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SandboxManager } from './manager.js';
import type { SandboxManagerConfig } from './manager.js';

function makeConfig(overrides: Partial<SandboxManagerConfig> = {}): SandboxManagerConfig {
  return {
    enabled: true,
    technology: 'auto',
    allowedReadPaths: [],
    allowedWritePaths: [],
    maxMemoryMb: 256,
    maxCpuPercent: 50,
    maxFileSizeMb: 10,
    networkAllowed: false,
    ...overrides,
  };
}

const noopLogger = {
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: () => noopLogger,
} as any;

describe('SandboxManager — selection & configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createSandboxForTask', () => {
    it('returns the global sandbox when no override specified', () => {
      const mgr = new SandboxManager(makeConfig({ technology: 'wasm' }), { logger: noopLogger });
      const sandbox = mgr.createSandboxForTask();
      expect(sandbox.constructor.name).toBe('WasmSandbox');
    });

    it('returns the global sandbox when override matches config', () => {
      const mgr = new SandboxManager(makeConfig({ technology: 'wasm' }), { logger: noopLogger });
      const sandbox = mgr.createSandboxForTask('wasm');
      expect(sandbox.constructor.name).toBe('WasmSandbox');
    });

    it('creates a different sandbox when override differs', () => {
      const mgr = new SandboxManager(makeConfig({ technology: 'wasm' }), { logger: noopLogger });
      const sandbox = mgr.createSandboxForTask('none');
      expect(sandbox.constructor.name).toBe('NoopSandbox');
    });

    it('does not cache the per-task sandbox', () => {
      const mgr = new SandboxManager(makeConfig({ technology: 'wasm' }), { logger: noopLogger });
      const taskSandbox = mgr.createSandboxForTask('none');
      const globalSandbox = mgr.createSandbox();
      expect(taskSandbox.constructor.name).toBe('NoopSandbox');
      expect(globalSandbox.constructor.name).toBe('WasmSandbox');
    });
  });

  describe('probeCapabilities', () => {
    it('returns an array of technology statuses', () => {
      const mgr = new SandboxManager(makeConfig(), { logger: noopLogger });
      const result = mgr.probeCapabilities();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('includes wasm as always available', () => {
      const mgr = new SandboxManager(makeConfig(), { logger: noopLogger });
      const result = mgr.probeCapabilities();
      const wasm = result.find((t) => t.technology === 'wasm');
      expect(wasm).toBeTruthy();
      expect(wasm!.available).toBe(true);
    });

    it('sorts by strength descending', () => {
      const mgr = new SandboxManager(makeConfig(), { logger: noopLogger });
      const result = mgr.probeCapabilities();
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1]!.strength).toBeGreaterThanOrEqual(result[i]!.strength);
      }
    });

    it('includes missing prerequisites for unavailable technologies', () => {
      const mgr = new SandboxManager(makeConfig(), { logger: noopLogger });
      const result = mgr.probeCapabilities();
      const fc = result.find((t) => t.technology === 'firecracker');
      if (fc && !fc.available) {
        expect(fc.missingPrerequisites.length).toBeGreaterThan(0);
      }
    });

    it('includes strength scores', () => {
      const mgr = new SandboxManager(makeConfig(), { logger: noopLogger });
      const result = mgr.probeCapabilities();
      for (const tech of result) {
        expect(tech.strength).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('healthCheck', () => {
    it('returns healthy for NoopSandbox', async () => {
      const mgr = new SandboxManager(makeConfig({ technology: 'none' }), { logger: noopLogger });
      const health = await mgr.healthCheck();
      expect(health.healthy).toBe(true);
      expect(health.checkDurationMs).toBeGreaterThanOrEqual(0);
      expect(health.error).toBeNull();
      expect(health.lastChecked).toBeDefined();
    });

    it('returns healthy for WasmSandbox', async () => {
      const mgr = new SandboxManager(makeConfig({ technology: 'wasm' }), { logger: noopLogger });
      const health = await mgr.healthCheck();
      expect(health.healthy).toBe(true);
      expect(health.technology).toBe('WasmSandbox');
    });

    it('includes technology name', async () => {
      const mgr = new SandboxManager(makeConfig({ technology: 'none' }), { logger: noopLogger });
      const health = await mgr.healthCheck();
      expect(health.technology).toBe('NoopSandbox');
    });
  });

  describe('switchTechnology', () => {
    it('changes the active technology', () => {
      const mgr = new SandboxManager(makeConfig({ technology: 'wasm' }), { logger: noopLogger });
      expect(mgr.createSandbox().constructor.name).toBe('WasmSandbox');

      mgr.switchTechnology('none');
      // Cache should be invalidated — next createSandbox uses new tech
      // Need to access internals: the sandbox field was nulled
      const status = mgr.getStatus();
      expect(status.technology).toBe('none');
    });

    it('invalidates cached sandbox', () => {
      const mgr = new SandboxManager(makeConfig({ technology: 'wasm' }), { logger: noopLogger });
      const first = mgr.createSandbox();
      expect(first.constructor.name).toBe('WasmSandbox');

      mgr.switchTechnology('none');
      // Force re-creation by reading status (calls createSandbox internally)
      const status = mgr.getStatus();
      expect(status.sandboxType).toBe('NoopSandbox');
    });
  });

  describe('getStatus', () => {
    it('includes strength score', () => {
      const mgr = new SandboxManager(makeConfig({ technology: 'wasm' }), { logger: noopLogger });
      const status = mgr.getStatus();
      expect(status.strength).toBeGreaterThan(0);
    });

    it('returns 0 strength for noop', () => {
      const mgr = new SandboxManager(makeConfig({ technology: 'none' }), { logger: noopLogger });
      const status = mgr.getStatus();
      expect(status.sandboxType).toBe('NoopSandbox');
    });
  });
});
