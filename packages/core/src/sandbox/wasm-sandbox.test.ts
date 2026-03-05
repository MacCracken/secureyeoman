import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { WasmSandbox } from './wasm-sandbox.js';

describe('WasmSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isAvailable', () => {
    it('is always available (VM module is built-in)', () => {
      const sandbox = new WasmSandbox();
      expect(sandbox.isAvailable()).toBe(true);
    });
  });

  describe('getCapabilities', () => {
    it('reports wasm capability', () => {
      const sandbox = new WasmSandbox();
      const caps = sandbox.getCapabilities();
      expect((caps as any).wasm).toBe(true);
      expect(caps.landlock).toBe(false);
      expect(caps.seccomp).toBe(false);
    });

    it('reports correct platform', () => {
      const sandbox = new WasmSandbox();
      const caps = sandbox.getCapabilities();
      expect(['linux', 'darwin', 'win32', 'other']).toContain(caps.platform);
    });
  });

  describe('run', () => {
    it('executes a simple synchronous-returning function', async () => {
      const sandbox = new WasmSandbox();
      const result = await sandbox.run(async () => 42);
      expect(result.success).toBe(true);
      expect(result.result).toBe(42);
      expect(result.violations).toHaveLength(0);
    });

    it('executes a function returning a string', async () => {
      const sandbox = new WasmSandbox();
      const result = await sandbox.run(async () => 'hello world');
      expect(result.success).toBe(true);
      expect(result.result).toBe('hello world');
    });

    it('executes a function returning an object', async () => {
      const sandbox = new WasmSandbox();
      const result = await sandbox.run(async () => ({ key: 'value', num: 123 }));
      expect(result.success).toBe(true);
      expect(result.result).toEqual({ key: 'value', num: 123 });
    });

    it('executes a function returning an array', async () => {
      const sandbox = new WasmSandbox();
      const result = await sandbox.run(async () => [1, 2, 3]);
      expect(result.success).toBe(true);
      expect(result.result).toEqual([1, 2, 3]);
    });

    it('handles function errors gracefully', async () => {
      const sandbox = new WasmSandbox();
      const result = await sandbox.run(async () => {
        throw new Error('sandbox error');
      });
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('sandbox error');
    });

    it('tracks resource usage', async () => {
      const sandbox = new WasmSandbox();
      const result = await sandbox.run(async () => 1);
      expect(result.resourceUsage).toBeDefined();
      expect(result.resourceUsage!.cpuTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.resourceUsage!.memoryPeakMb).toBeGreaterThan(0);
    });

    it('respects timeout', async () => {
      const sandbox = new WasmSandbox({ maxExecutionMs: 100 });
      const result = await sandbox.run(
        async () => {
          // Infinite loop that should be caught by timeout
          let i = 0;
          while (true) i++;
          return i;
        },
        { timeoutMs: 100 }
      );
      expect(result.success).toBe(false);
    });

    it('uses Math and JSON inside sandbox', async () => {
      const sandbox = new WasmSandbox();
      const result = await sandbox.run(async () => {
        const val = Math.max(1, 2, 3);
        return JSON.parse(JSON.stringify({ max: val }));
      });
      expect(result.success).toBe(true);
      expect(result.result).toEqual({ max: 3 });
    });

    it('uses Date inside sandbox', async () => {
      const sandbox = new WasmSandbox();
      const result = await sandbox.run(async () => {
        return typeof Date.now() === 'number';
      });
      expect(result.success).toBe(true);
      expect(result.result).toBe(true);
    });

    it('uses Map and Set inside sandbox', async () => {
      const sandbox = new WasmSandbox();
      const result = await sandbox.run(async () => {
        const m = new Map([['a', 1]]);
        const s = new Set([1, 2, 3]);
        return { mapSize: m.size, setSize: s.size };
      });
      expect(result.success).toBe(true);
      expect(result.result).toEqual({ mapSize: 1, setSize: 3 });
    });

    it('blocks access to process', async () => {
      const sandbox = new WasmSandbox();
      const result = await sandbox.run(async () => {
        return (globalThis as any).process?.env?.HOME ?? 'blocked';
      });
      // process should not be available in the sandbox
      expect(result.success).toBe(true);
      expect(result.result).toBe('blocked');
    });

    it('blocks access to require', async () => {
      const sandbox = new WasmSandbox();
      const result = await sandbox.run(async () => {
        try {
          const r = (globalThis as any).require;
          if (!r) return 'blocked';
          return 'allowed';
        } catch {
          return 'blocked';
        }
      });
      expect(result.success).toBe(true);
      expect(result.result).toBe('blocked');
    });

    it('produces timeout violation in violations array', async () => {
      const sandbox = new WasmSandbox();
      const result = await sandbox.run(
        async () => {
          while (true) {} // infinite loop
        },
        { timeoutMs: 50 }
      );
      expect(result.success).toBe(false);
      expect(result.violations.some((v) => v.type === 'resource')).toBe(true);
    });

    it('returns correct result type for null', async () => {
      const sandbox = new WasmSandbox();
      const result = await sandbox.run(async () => null);
      expect(result.success).toBe(true);
      expect(result.result).toBeNull();
    });

    it('returns correct result type for undefined', async () => {
      const sandbox = new WasmSandbox();
      const result = await sandbox.run(async () => undefined);
      expect(result.success).toBe(true);
      expect(result.result).toBeUndefined();
    });

    it('handles non-Error throws', async () => {
      const sandbox = new WasmSandbox();
      const result = await sandbox.run(async () => {
        throw 'string error';
      });
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('string error');
    });
  });

  describe('constructor options', () => {
    it('accepts maxMemoryPages', () => {
      const sandbox = new WasmSandbox({ maxMemoryPages: 512 });
      expect(sandbox.isAvailable()).toBe(true);
    });

    it('accepts maxExecutionMs', () => {
      const sandbox = new WasmSandbox({ maxExecutionMs: 5000 });
      expect(sandbox.isAvailable()).toBe(true);
    });

    it('accepts preopenDirs', () => {
      const sandbox = new WasmSandbox({ preopenDirs: { '/data': '/tmp/data' } });
      expect(sandbox.isAvailable()).toBe(true);
    });
  });
});
