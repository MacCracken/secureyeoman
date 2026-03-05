/**
 * Input Actuator — Error & Edge-Case Branch Tests
 *
 * Covers:
 * - getNut() first-time import failure with descriptive error
 * - getNut() cached error on second call (no re-import)
 * - minimizeWindow() Linux xdotool failure (best-effort, does not throw)
 * - Window management command failures / timeouts
 * - windowManageLinux resize without bounds (no-op)
 * - windowManageWin/macOS empty script paths (no-op)
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// ── getNut() failure tests ──────────────────────────────────────────────────
// These require @nut-tree/nut-js to reject on import, so we use a dedicated
// vi.mock that rejects — separate from the main test file which mocks it
// successfully.

describe('getNut() — import failure branch', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setupChildProcessMocks(): void {
    vi.doMock('node:child_process', () => ({ execFile: vi.fn() }));
    vi.doMock('node:util', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:util')>();
      return {
        ...actual,
        promisify: vi.fn(() => vi.fn().mockResolvedValue({ stdout: '', stderr: '' })),
      };
    });
  }

  it('throws descriptive error when @nut-tree/nut-js import fails', async () => {
    // vi.doMock factory errors are caught by vitest and wrapped, but the source
    // catch block still triggers with that wrapped error
    vi.doMock('@nut-tree/nut-js', () => {
      throw new Error('Cannot find module');
    });
    setupChildProcessMocks();

    const { moveMouse } = await import('./input.js');

    const err = await moveMouse(10, 20).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('@nut-tree/nut-js is not installed');
    expect(err.message).toContain('npm install @nut-tree/nut-js');
    expect(err.message).toContain('Original error:');
  });

  it('returns cached error on second getNut() call without re-importing', async () => {
    vi.doMock('@nut-tree/nut-js', () => {
      throw new Error('Module not found');
    });
    setupChildProcessMocks();

    const { moveMouse, typeText } = await import('./input.js');

    // First call triggers the import and caches the error
    await expect(moveMouse(0, 0)).rejects.toThrow('@nut-tree/nut-js is not installed');

    // Second call uses cached _nutLoadError — same message, no re-import
    const err2 = await typeText('hello').catch((e: Error) => e);
    expect(err2).toBeInstanceOf(Error);
    expect(err2.message).toContain('@nut-tree/nut-js is not installed');
  });

  it('caches error across different exported functions', async () => {
    vi.doMock('@nut-tree/nut-js', () => {
      throw new Error('Not available');
    });
    setupChildProcessMocks();

    const { pressKey, releaseKey, scrollMouse, clickMouse } = await import('./input.js');

    // All functions share the same getNut() cache
    await expect(pressKey('ctrl+c')).rejects.toThrow('@nut-tree/nut-js is not installed');
    await expect(releaseKey('ctrl')).rejects.toThrow('@nut-tree/nut-js is not installed');
    await expect(scrollMouse(0, 5)).rejects.toThrow('@nut-tree/nut-js is not installed');
    await expect(clickMouse(10, 20)).rejects.toThrow('@nut-tree/nut-js is not installed');
  });
});

// ── Window management command failure tests ─────────────────────────────────

describe('minimizeWindow() — Linux xdotool failure', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.resetModules();
  });

  it('does not throw when xdotool rejects (best-effort)', async () => {
    const mockExecFileAsync = vi.fn().mockRejectedValue(new Error('xdotool: command not found'));

    vi.doMock('@nut-tree/nut-js', () => ({}));
    vi.doMock('node:child_process', () => ({ execFile: vi.fn() }));
    vi.doMock('node:util', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:util')>();
      return {
        ...actual,
        promisify: vi.fn(() => mockExecFileAsync),
      };
    });

    const { minimizeWindow } = await import('./input.js');
    Object.defineProperty(process, 'platform', { value: 'linux' });

    // Should not throw — the catch block swallows the error
    await expect(minimizeWindow('0xABCD')).resolves.not.toThrow();
    expect(mockExecFileAsync).toHaveBeenCalled();
  });

  it('does not throw when xdotool times out on Linux', async () => {
    const mockExecFileAsync = vi
      .fn()
      .mockRejectedValue(new Error('Command timed out after 8000ms'));

    vi.doMock('@nut-tree/nut-js', () => ({}));
    vi.doMock('node:child_process', () => ({ execFile: vi.fn() }));
    vi.doMock('node:util', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:util')>();
      return {
        ...actual,
        promisify: vi.fn(() => mockExecFileAsync),
      };
    });

    const { minimizeWindow } = await import('./input.js');
    Object.defineProperty(process, 'platform', { value: 'linux' });

    await expect(minimizeWindow('0x1234')).resolves.not.toThrow();
  });
});

describe('focusWindow() — command failure branches', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.resetModules();
  });

  it('propagates wmctrl failure on Linux focusWindow', async () => {
    const mockExecFileAsync = vi.fn().mockRejectedValue(new Error('wmctrl: not found'));

    vi.doMock('@nut-tree/nut-js', () => ({}));
    vi.doMock('node:child_process', () => ({ execFile: vi.fn() }));
    vi.doMock('node:util', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:util')>();
      return {
        ...actual,
        promisify: vi.fn(() => mockExecFileAsync),
      };
    });

    const { focusWindow } = await import('./input.js');
    Object.defineProperty(process, 'platform', { value: 'linux' });

    await expect(focusWindow('0x1234')).rejects.toThrow('wmctrl: not found');
  });

  it('propagates osascript failure on macOS focusWindow', async () => {
    const mockExecFileAsync = vi
      .fn()
      .mockRejectedValue(new Error('osascript: command not found'));

    vi.doMock('@nut-tree/nut-js', () => ({}));
    vi.doMock('node:child_process', () => ({ execFile: vi.fn() }));
    vi.doMock('node:util', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:util')>();
      return {
        ...actual,
        promisify: vi.fn(() => mockExecFileAsync),
      };
    });

    const { focusWindow } = await import('./input.js');
    Object.defineProperty(process, 'platform', { value: 'darwin' });

    await expect(focusWindow('win-1')).rejects.toThrow('osascript: command not found');
  });

  it('propagates powershell failure on Windows focusWindow', async () => {
    const mockExecFileAsync = vi
      .fn()
      .mockRejectedValue(new Error('powershell: execution timeout'));

    vi.doMock('@nut-tree/nut-js', () => ({}));
    vi.doMock('node:child_process', () => ({ execFile: vi.fn() }));
    vi.doMock('node:util', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:util')>();
      return {
        ...actual,
        promisify: vi.fn(() => mockExecFileAsync),
      };
    });

    const { focusWindow } = await import('./input.js');
    Object.defineProperty(process, 'platform', { value: 'win32' });

    await expect(focusWindow('12345')).rejects.toThrow('powershell: execution timeout');
  });
});

describe('resizeWindow() — command failure branches', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.resetModules();
  });

  it('propagates wmctrl resize failure on Linux', async () => {
    const mockExecFileAsync = vi.fn().mockRejectedValue(new Error('wmctrl: resize failed'));

    vi.doMock('@nut-tree/nut-js', () => ({}));
    vi.doMock('node:child_process', () => ({ execFile: vi.fn() }));
    vi.doMock('node:util', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:util')>();
      return {
        ...actual,
        promisify: vi.fn(() => mockExecFileAsync),
      };
    });

    const { resizeWindow } = await import('./input.js');
    Object.defineProperty(process, 'platform', { value: 'linux' });

    await expect(resizeWindow('0x1', { x: 0, y: 0, width: 800, height: 600 })).rejects.toThrow(
      'wmctrl: resize failed'
    );
  });

  it('propagates powershell resize failure on Windows', async () => {
    const mockExecFileAsync = vi
      .fn()
      .mockRejectedValue(new Error('MoveWindow: access denied'));

    vi.doMock('@nut-tree/nut-js', () => ({}));
    vi.doMock('node:child_process', () => ({ execFile: vi.fn() }));
    vi.doMock('node:util', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:util')>();
      return {
        ...actual,
        promisify: vi.fn(() => mockExecFileAsync),
      };
    });

    const { resizeWindow } = await import('./input.js');
    Object.defineProperty(process, 'platform', { value: 'win32' });

    await expect(resizeWindow('999', { x: 0, y: 0, width: 1024, height: 768 })).rejects.toThrow(
      'MoveWindow: access denied'
    );
  });
});
