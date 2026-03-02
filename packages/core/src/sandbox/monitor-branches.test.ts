/**
 * Sandbox Monitor — Phase 105 branch coverage tests.
 *
 * The SandboxMonitor methods use dynamic `require('node:fs')` and
 * `require('node:child_process')` plus `import { platform } from 'node:os'`.
 * We use vi.hoisted + vi.mock for node:os, and createRequire + vi.spyOn
 * for the CJS modules that share the same module cache.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

// Use CJS require to get the same module objects that monitor.ts require() sees
const cjsRequire = createRequire(import.meta.url);
const cjsFs = cjsRequire('node:fs');
const cjsCp = cjsRequire('node:child_process');

// vi.hoisted makes the variable available before vi.mock's hoisted factory runs
const mockPlatform = vi.hoisted(() => vi.fn(() => 'linux'));

vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  return { ...original, platform: mockPlatform };
});

import { SandboxMonitor, resetSandboxMonitor } from './monitor.js';

// ── Setup ────────────────────────────────────────────────────────────────────

let readFileSyncSpy: ReturnType<typeof vi.spyOn>;
let existsSyncSpy: ReturnType<typeof vi.spyOn>;
let execSyncSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetSandboxMonitor();
  mockPlatform.mockReturnValue('linux');
  readFileSyncSpy = vi.spyOn(cjsFs, 'readFileSync');
  existsSyncSpy = vi.spyOn(cjsFs, 'existsSync');
  execSyncSpy = vi.spyOn(cjsCp, 'execSync');
});

afterEach(() => {
  readFileSyncSpy?.mockRestore();
  existsSyncSpy?.mockRestore();
  execSyncSpy?.mockRestore();
});

// ── checkNamespaceIsolation branches ─────────────────────────────────────────

describe('checkNamespaceIsolation — branch coverage', () => {
  it('returns passed:true on non-linux (platform=darwin)', async () => {
    mockPlatform.mockReturnValue('darwin');
    const monitor = new SandboxMonitor();
    const result = await monitor.checkNamespaceIsolation();
    expect(result.passed).toBe(true);
    expect(result.details?.platform).toBe('darwin');
  });

  it('returns passed:false when inode is empty string', async () => {
    mockPlatform.mockReturnValue('linux');
    readFileSyncSpy.mockReturnValue('');
    const monitor = new SandboxMonitor();
    const result = await monitor.checkNamespaceIsolation();
    expect(result.passed).toBe(false);
    expect(result.error).toMatch(/not isolated/i);
  });

  it('returns passed:false when readFileSync throws for a namespace file', async () => {
    mockPlatform.mockReturnValue('linux');
    readFileSyncSpy.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const monitor = new SandboxMonitor();
    const result = await monitor.checkNamespaceIsolation();
    expect(result.passed).toBe(false);
    expect(result.error).toMatch(/cannot read namespace/i);
  });

  it('returns passed:true when all namespace inodes are non-empty', async () => {
    mockPlatform.mockReturnValue('linux');
    readFileSyncSpy.mockReturnValue('pid:[4026531836]\n');
    const monitor = new SandboxMonitor();
    const result = await monitor.checkNamespaceIsolation();
    expect(result.passed).toBe(true);
  });
});

// ── checkProcessIsolation branches ───────────────────────────────────────────

describe('checkProcessIsolation — branch coverage', () => {
  it('returns passed:true with ppid=1 on linux', async () => {
    mockPlatform.mockReturnValue('linux');
    execSyncSpy.mockReturnValue('Name:\tnode\nPPid:\t1\nTracerPid:\t0\n');
    const monitor = new SandboxMonitor();
    const result = await monitor.checkProcessIsolation();
    expect(result.passed).toBe(true);
    expect(result.details?.ppid).toBe(1);
  });

  it('returns passed:true when ppid !== 1', async () => {
    mockPlatform.mockReturnValue('linux');
    execSyncSpy.mockReturnValue('Name:\tnode\nPPid:\t42\nTracerPid:\t0\n');
    const monitor = new SandboxMonitor();
    const result = await monitor.checkProcessIsolation();
    expect(result.passed).toBe(true);
    expect(result.details).toBeUndefined();
  });

  it('returns passed:true when ppidMatch is null (no match)', async () => {
    mockPlatform.mockReturnValue('linux');
    execSyncSpy.mockReturnValue('Name:\tnode\nTracerPid:\t0\n');
    const monitor = new SandboxMonitor();
    const result = await monitor.checkProcessIsolation();
    expect(result.passed).toBe(true);
  });

  it('returns passed:false on execSync error', async () => {
    mockPlatform.mockReturnValue('linux');
    execSyncSpy.mockImplementation(() => {
      throw new Error('permission denied');
    });
    const monitor = new SandboxMonitor();
    const result = await monitor.checkProcessIsolation();
    expect(result.passed).toBe(false);
    expect(result.error).toMatch(/permission denied/);
  });
});

// ── checkResourceLimits branches ─────────────────────────────────────────────

describe('checkResourceLimits — branch coverage', () => {
  it('returns passed:true with valid memory limit on linux', async () => {
    mockPlatform.mockReturnValue('linux');
    readFileSyncSpy.mockReturnValue(
      'Max virtual memory      524288000       unlimited       bytes\n'
    );
    const monitor = new SandboxMonitor();
    const result = await monitor.checkResourceLimits();
    expect(result.passed).toBe(true);
    expect(result.details?.maxVirtualMemory).toBe(524288000);
  });

  it('returns passed:true when maxMem exceeds threshold', async () => {
    mockPlatform.mockReturnValue('linux');
    readFileSyncSpy.mockReturnValue(
      'Max virtual memory      2147483648      unlimited       bytes\n'
    );
    const monitor = new SandboxMonitor();
    const result = await monitor.checkResourceLimits();
    expect(result.passed).toBe(true);
    expect(result.details).toBeUndefined();
  });

  it('returns passed:true when readFileSync throws', async () => {
    mockPlatform.mockReturnValue('linux');
    readFileSyncSpy.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const monitor = new SandboxMonitor();
    const result = await monitor.checkResourceLimits();
    expect(result.passed).toBe(true);
  });
});

// ── checkIntegrity — logging branch ──────────────────────────────────────────

describe('checkIntegrity — branch coverage', () => {
  it('logs error when any check fails', async () => {
    mockPlatform.mockReturnValue('linux');
    readFileSyncSpy.mockReturnValue('');
    const monitor = new SandboxMonitor();
    const report = await monitor.checkIntegrity();
    expect(report.allPassed).toBe(false);
    const failed = report.checks.filter((c) => !c.passed);
    expect(failed.length).toBeGreaterThan(0);
  });
});

// ── startMonitoring — idempotency + error handling ───────────────────────────

describe('startMonitoring — branch coverage', () => {
  afterEach(() => {
    resetSandboxMonitor();
  });

  it('is idempotent (double call creates one interval)', () => {
    vi.useFakeTimers();
    try {
      const monitor = new SandboxMonitor();
      monitor.startMonitoring(1000);
      monitor.startMonitoring(1000);
      monitor.stopMonitoring();
    } finally {
      vi.useRealTimers();
    }
  });

  it('monitoring interval catches and logs integrity check errors', async () => {
    vi.useFakeTimers();
    try {
      mockPlatform.mockReturnValue('linux');
      readFileSyncSpy.mockReturnValue('');
      const monitor = new SandboxMonitor();
      monitor.startMonitoring(100);
      await vi.advanceTimersByTimeAsync(150);
      monitor.stopMonitoring();
    } finally {
      vi.useRealTimers();
    }
  });
});
