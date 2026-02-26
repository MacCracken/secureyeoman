/**
 * Input Actuator Tests
 *
 * Tests keyboard/mouse/window operations by mocking @nut-tree/nut-js
 * and child_process.execFile.
 * No native dependencies required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock @nut-tree/nut-js ────────────────────────────────────────────────────

const nutMock = {
  mouse: {
    move: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    doubleClick: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
  },
  keyboard: {
    type: vi.fn().mockResolvedValue(undefined),
    pressKey: vi.fn().mockResolvedValue(undefined),
    releaseKey: vi.fn().mockResolvedValue(undefined),
  },
  screen: {
    width: vi.fn().mockResolvedValue(1920),
    height: vi.fn().mockResolvedValue(1080),
  },
  Key: {
    // Common keys
    LeftControl: 'LeftControl',
    LeftAlt: 'LeftAlt',
    LeftShift: 'LeftShift',
    LeftSuper: 'LeftSuper',
    Return: 'Return',
    Escape: 'Escape',
    Tab: 'Tab',
    Space: 'Space',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Up: 'Up',
    Down: 'Down',
    Left: 'Left',
    Right: 'Right',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    A: 'A',
    c: 'c',
    C: 'C',
  },
  Button: { LEFT: 0, RIGHT: 1, MIDDLE: 2 },
  straightTo: vi.fn().mockImplementation(async (pos: { x: number; y: number }) => pos),
};

vi.mock('@nut-tree/nut-js', () => nutMock);

// ─── Mock child_process ───────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('node:util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:util')>();
  return {
    ...actual,
    promisify: vi.fn((fn) => {
      // Return a mock promisified version that resolves immediately
      const mockAsync = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
      mockAsync._original = fn;
      return mockAsync;
    }),
  };
});

// Import after mocks
const {
  moveMouse,
  clickMouse,
  scrollMouse,
  typeText,
  pressKey,
  releaseKey,
  focusWindow,
  resizeWindow,
  minimizeWindow,
} = await import('./input.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Reset nut mock functions
  nutMock.mouse.move.mockResolvedValue(undefined);
  nutMock.mouse.click.mockResolvedValue(undefined);
  nutMock.mouse.doubleClick.mockResolvedValue(undefined);
  nutMock.mouse.scroll.mockResolvedValue(undefined);
  nutMock.keyboard.type.mockResolvedValue(undefined);
  nutMock.keyboard.pressKey.mockResolvedValue(undefined);
  nutMock.keyboard.releaseKey.mockResolvedValue(undefined);
  nutMock.straightTo.mockImplementation(async (pos: { x: number; y: number }) => pos);
});

// ─── moveMouse ────────────────────────────────────────────────────────────────

describe('moveMouse()', () => {
  it('calls mouse.move with straightTo result', async () => {
    await moveMouse(100, 200);
    expect(nutMock.straightTo).toHaveBeenCalledWith({ x: 100, y: 200 });
    expect(nutMock.mouse.move).toHaveBeenCalledWith({ x: 100, y: 200 });
  });
});

// ─── clickMouse ───────────────────────────────────────────────────────────────

describe('clickMouse()', () => {
  it('clicks at current position when no x/y given', async () => {
    await clickMouse(undefined, undefined);
    expect(nutMock.mouse.click).toHaveBeenCalledWith(nutMock.Button.LEFT);
    expect(nutMock.mouse.move).not.toHaveBeenCalled();
  });

  it('moves then clicks when x/y given', async () => {
    await clickMouse(50, 60);
    expect(nutMock.mouse.move).toHaveBeenCalled();
    expect(nutMock.mouse.click).toHaveBeenCalledWith(nutMock.Button.LEFT);
  });

  it('uses right button', async () => {
    await clickMouse(0, 0, 'right');
    expect(nutMock.mouse.click).toHaveBeenCalledWith(nutMock.Button.RIGHT);
  });

  it('uses middle button', async () => {
    await clickMouse(0, 0, 'middle');
    expect(nutMock.mouse.click).toHaveBeenCalledWith(nutMock.Button.MIDDLE);
  });

  it('double-clicks when doubleClick=true', async () => {
    await clickMouse(0, 0, 'left', true);
    expect(nutMock.mouse.doubleClick).toHaveBeenCalledWith(nutMock.Button.LEFT);
    expect(nutMock.mouse.click).not.toHaveBeenCalled();
  });
});

// ─── scrollMouse ──────────────────────────────────────────────────────────────

describe('scrollMouse()', () => {
  it('scrolls down', async () => {
    await scrollMouse(0, 10);
    expect(nutMock.mouse.scroll).toHaveBeenCalledWith(1, 10);
  });

  it('scrolls up (negative dy)', async () => {
    await scrollMouse(0, -5);
    expect(nutMock.mouse.scroll).toHaveBeenCalledWith(-1, 5);
  });

  it('scrolls right (positive dx)', async () => {
    await scrollMouse(3, 0);
    expect(nutMock.mouse.scroll).toHaveBeenCalledWith(2, 3);
  });

  it('scrolls left (negative dx)', async () => {
    await scrollMouse(-2, 0);
    expect(nutMock.mouse.scroll).toHaveBeenCalledWith(-2, 2);
  });

  it('does not scroll when dx=0 dy=0', async () => {
    await scrollMouse(0, 0);
    expect(nutMock.mouse.scroll).not.toHaveBeenCalled();
  });
});

// ─── typeText ─────────────────────────────────────────────────────────────────

describe('typeText()', () => {
  it('calls keyboard.type with the text', async () => {
    await typeText('hello world');
    expect(nutMock.keyboard.type).toHaveBeenCalledWith('hello world');
  });
});

// ─── pressKey ─────────────────────────────────────────────────────────────────

describe('pressKey()', () => {
  it('presses a single key', async () => {
    await pressKey('A');
    expect(nutMock.keyboard.pressKey).toHaveBeenCalled();
  });

  it('presses ctrl+c combo', async () => {
    await pressKey('ctrl+c');
    expect(nutMock.keyboard.pressKey).toHaveBeenCalledWith('LeftControl', 'c');
  });

  it('maps shift → LeftShift', async () => {
    await pressKey('shift+A');
    const call = nutMock.keyboard.pressKey.mock.calls[0];
    expect(call[0]).toBe('LeftShift');
  });

  it('maps alt → LeftAlt', async () => {
    await pressKey('alt+tab');
    const call = nutMock.keyboard.pressKey.mock.calls[0];
    expect(call[0]).toBe('LeftAlt');
    expect(call[1]).toBe('Tab');
  });

  it('maps enter → Return', async () => {
    await pressKey('enter');
    expect(nutMock.keyboard.pressKey).toHaveBeenCalledWith('Return');
  });

  it('maps esc → Escape', async () => {
    await pressKey('esc');
    expect(nutMock.keyboard.pressKey).toHaveBeenCalledWith('Escape');
  });

  it('maps meta → LeftSuper', async () => {
    await pressKey('meta+c');
    const call = nutMock.keyboard.pressKey.mock.calls[0];
    expect(call[0]).toBe('LeftSuper');
  });
});

// ─── releaseKey ───────────────────────────────────────────────────────────────

describe('releaseKey()', () => {
  it('releases a key', async () => {
    await releaseKey('ctrl');
    expect(nutMock.keyboard.releaseKey).toHaveBeenCalledWith('LeftControl');
  });
});

// ─── focusWindow ──────────────────────────────────────────────────────────────

describe('focusWindow()', () => {
  it('does not throw on Linux (default platform)', async () => {
    // We can't easily control process.platform, but the execFileAsync is mocked
    await expect(focusWindow('win-123')).resolves.not.toThrow();
  });
});

// ─── resizeWindow ─────────────────────────────────────────────────────────────

describe('resizeWindow()', () => {
  it('does not throw', async () => {
    await expect(resizeWindow('win-123', { x: 0, y: 0, width: 800, height: 600 })).resolves.not.toThrow();
  });
});

// ─── minimizeWindow ───────────────────────────────────────────────────────────

describe('minimizeWindow()', () => {
  it('does not throw', async () => {
    await expect(minimizeWindow('win-123')).resolves.not.toThrow();
  });
});
