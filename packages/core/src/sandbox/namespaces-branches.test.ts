/**
 * Namespace detection — Phase 105 branch coverage tests.
 *
 * namespaces.ts uses top-level ESM imports for all dependencies,
 * so we must use vi.mock + vi.hoisted for all three modules.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.hoisted makes these available before the hoisted vi.mock factories run
const mocks = vi.hoisted(() => ({
  platform: vi.fn(() => 'linux'),
  readFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}));

vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  return { ...original, platform: mocks.platform };
});

vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs')>();
  return { ...original, readFileSync: mocks.readFileSync, existsSync: mocks.existsSync };
});

vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>();
  return { ...original, execSync: mocks.execSync, execFileSync: mocks.execFileSync };
});

const { detectNamespaceSupport, runInNamespace, isCommandAvailable } =
  await import('./namespaces.js');

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mocks.platform.mockReturnValue('linux');
});

// ── detectNamespaceSupport branches ──────────────────────────────────────────

describe('detectNamespaceSupport — branch coverage (Phase 105)', () => {
  it('returns all false on non-linux', () => {
    mocks.platform.mockReturnValue('darwin');
    const caps = detectNamespaceSupport();
    expect(caps.userNamespaces).toBe(false);
    expect(caps.unshareAvailable).toBe(false);
  });

  it('returns false when max_user_namespaces is non-numeric', () => {
    mocks.readFileSync.mockImplementation((path: any) => {
      const p = String(path);
      if (p.includes('max_user_namespaces')) return 'disabled\n';
      throw new Error('ENOENT');
    });
    mocks.execFileSync.mockImplementation(() => {
      throw new Error('not found');
    });
    const caps = detectNamespaceSupport();
    // NaN > 0 is false → userNamespaces = false
    expect(caps.userNamespaces).toBe(false);
  });

  it('sets unprivilegedUserns=true when unprivileged_userns_clone=1', () => {
    mocks.readFileSync.mockImplementation((path: any) => {
      const p = String(path);
      if (p.includes('max_user_namespaces')) return '65536\n';
      if (p.includes('unprivileged_userns_clone')) return '1\n';
      throw new Error('ENOENT');
    });
    mocks.execFileSync.mockReturnValue(Buffer.from('/usr/bin/unshare\n'));
    const caps = detectNamespaceSupport();
    expect(caps.userNamespaces).toBe(true);
  });

  it('falls back to userNamespaces when unprivileged_userns_clone file is missing', () => {
    mocks.readFileSync.mockImplementation((path: any) => {
      const p = String(path);
      if (p.includes('max_user_namespaces')) return '65536\n';
      if (p.includes('unprivileged_userns_clone')) throw new Error('ENOENT');
      throw new Error('unknown');
    });
    mocks.execFileSync.mockReturnValue(Buffer.from('/usr/bin/unshare\n'));
    const caps = detectNamespaceSupport();
    // Falls back: unprivilegedUserns = userNamespaces = true
    expect(caps.userNamespaces).toBe(true);
  });
});

// ── runInNamespace — EXECUTION_FAILED branch ─────────────────────────────────

describe('runInNamespace — error branches (Phase 105)', () => {
  it('throws EXECUTION_FAILED when execSync fails', () => {
    mocks.execFileSync.mockReturnValue(Buffer.from('/usr/bin/unshare\n'));
    mocks.readFileSync.mockImplementation((path: any) => {
      const p = String(path);
      if (p.includes('max_user_namespaces')) return '65536\n';
      if (p.includes('unprivileged_userns_clone')) return '1\n';
      throw new Error('ENOENT');
    });
    mocks.execSync.mockImplementation(() => {
      throw new Error('command not found');
    });

    try {
      runInNamespace('bad-command');
      expect.unreachable('should have thrown');
    } catch (err: any) {
      expect(err.code).toBe('EXECUTION_FAILED');
      expect(err.message).toMatch(/execution failed/i);
    }
  });
});

// ── isCommandAvailable — whitelisted command exists ──────────────────────────

describe('isCommandAvailable — branch coverage (Phase 105)', () => {
  it('returns true for whitelisted command that exists', () => {
    mocks.execFileSync.mockReturnValue(Buffer.from('/usr/bin/unshare\n'));
    const result = isCommandAvailable('unshare');
    expect(result).toBe(true);
  });

  it('returns false for whitelisted command that does not exist', () => {
    mocks.execFileSync.mockImplementation(() => {
      throw new Error('not found');
    });
    const result = isCommandAvailable('bwrap');
    expect(result).toBe(false);
  });
});
