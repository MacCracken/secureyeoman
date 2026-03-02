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
    await expect(
      resizeWindow('win-123', { x: 0, y: 0, width: 800, height: 600 })
    ).resolves.not.toThrow();
  });
});

// ─── minimizeWindow ───────────────────────────────────────────────────────────

describe('minimizeWindow()', () => {
  it('does not throw', async () => {
    await expect(minimizeWindow('win-123')).resolves.not.toThrow();
  });
});

// ─── Error recovery ──────────────────────────────────────────────────────────

describe('input actuator error recovery', () => {
  it('moveMouse propagates error when nut-js mouse.move fails', async () => {
    nutMock.mouse.move.mockRejectedValueOnce(new Error('Display server unavailable'));
    await expect(moveMouse(100, 200)).rejects.toThrow('Display server unavailable');
  });

  it('clickMouse propagates error when nut-js mouse.click fails', async () => {
    nutMock.mouse.click.mockRejectedValueOnce(new Error('Click failed'));
    await expect(clickMouse(undefined, undefined)).rejects.toThrow('Click failed');
  });

  it('typeText propagates error when keyboard.type fails', async () => {
    nutMock.keyboard.type.mockRejectedValueOnce(new Error('Keyboard not accessible'));
    await expect(typeText('hello')).rejects.toThrow('Keyboard not accessible');
  });

  it('pressKey propagates error when keyboard.pressKey fails', async () => {
    nutMock.keyboard.pressKey.mockRejectedValueOnce(new Error('Key press failed'));
    await expect(pressKey('ctrl+c')).rejects.toThrow('Key press failed');
  });

  it('scrollMouse propagates error when mouse.scroll fails', async () => {
    nutMock.mouse.scroll.mockRejectedValueOnce(new Error('Scroll not supported'));
    await expect(scrollMouse(0, 5)).rejects.toThrow('Scroll not supported');
  });
});

// ─── parseKeyCombo — additional key mappings ──────────────────────────────────

describe('pressKey() — additional key mappings', () => {
  it('maps "control" → LeftControl', async () => {
    await pressKey('control+c');
    const call = nutMock.keyboard.pressKey.mock.calls[0];
    expect(call[0]).toBe('LeftControl');
  });

  it('maps "cmd" → LeftSuper', async () => {
    await pressKey('cmd+c');
    const call = nutMock.keyboard.pressKey.mock.calls[0];
    expect(call[0]).toBe('LeftSuper');
  });

  it('maps "win" → LeftSuper', async () => {
    await pressKey('win+c');
    const call = nutMock.keyboard.pressKey.mock.calls[0];
    expect(call[0]).toBe('LeftSuper');
  });

  it('maps "return" → Return', async () => {
    await pressKey('return');
    expect(nutMock.keyboard.pressKey).toHaveBeenCalledWith('Return');
  });

  it('maps "escape" → Escape', async () => {
    await pressKey('escape');
    expect(nutMock.keyboard.pressKey).toHaveBeenCalledWith('Escape');
  });

  it('maps "space" → Space', async () => {
    await pressKey('space');
    expect(nutMock.keyboard.pressKey).toHaveBeenCalledWith('Space');
  });

  it('maps "backspace" → Backspace', async () => {
    await pressKey('backspace');
    expect(nutMock.keyboard.pressKey).toHaveBeenCalledWith('Backspace');
  });

  it('maps "delete" → Delete', async () => {
    await pressKey('delete');
    expect(nutMock.keyboard.pressKey).toHaveBeenCalledWith('Delete');
  });

  it('maps "up" → Up', async () => {
    await pressKey('up');
    expect(nutMock.keyboard.pressKey).toHaveBeenCalledWith('Up');
  });

  it('maps "down" → Down', async () => {
    await pressKey('down');
    expect(nutMock.keyboard.pressKey).toHaveBeenCalledWith('Down');
  });

  it('maps "left" → Left', async () => {
    await pressKey('left');
    expect(nutMock.keyboard.pressKey).toHaveBeenCalledWith('Left');
  });

  it('maps "right" → Right', async () => {
    await pressKey('right');
    expect(nutMock.keyboard.pressKey).toHaveBeenCalledWith('Right');
  });

  it('maps "home" → Home', async () => {
    await pressKey('home');
    expect(nutMock.keyboard.pressKey).toHaveBeenCalledWith('Home');
  });

  it('maps "end" → End', async () => {
    await pressKey('end');
    expect(nutMock.keyboard.pressKey).toHaveBeenCalledWith('End');
  });

  it('maps "pageup" → PageUp', async () => {
    await pressKey('pageup');
    expect(nutMock.keyboard.pressKey).toHaveBeenCalledWith('PageUp');
  });

  it('maps "pagedown" → PageDown', async () => {
    await pressKey('pagedown');
    expect(nutMock.keyboard.pressKey).toHaveBeenCalledWith('PageDown');
  });

  it('passes through unmapped key names directly', async () => {
    await pressKey('F12');
    // F12 is not in keyMap, falls through to Key[mapped] ?? Key[lower] ?? mapped
    expect(nutMock.keyboard.pressKey).toHaveBeenCalled();
  });

  it('handles multi-key combos like shift+alt+tab', async () => {
    await pressKey('shift+alt+tab');
    const call = nutMock.keyboard.pressKey.mock.calls[0];
    expect(call[0]).toBe('LeftShift');
    expect(call[1]).toBe('LeftAlt');
    expect(call[2]).toBe('Tab');
  });

  it('handles tab key alone', async () => {
    await pressKey('tab');
    expect(nutMock.keyboard.pressKey).toHaveBeenCalledWith('Tab');
  });
});

// ─── releaseKey — additional combos ──────────────────────────────────────────

describe('releaseKey() — additional combos', () => {
  it('releases a multi-key combo', async () => {
    await releaseKey('ctrl+shift');
    const call = nutMock.keyboard.releaseKey.mock.calls[0];
    expect(call[0]).toBe('LeftControl');
    expect(call[1]).toBe('LeftShift');
  });
});

// ─── scrollMouse — simultaneous dx and dy ─────────────────────────────────────

describe('scrollMouse() — both dx and dy', () => {
  it('scrolls both vertically and horizontally when both are non-zero', async () => {
    await scrollMouse(3, 5);
    // First call: vertical (dy > 0 → direction 1)
    expect(nutMock.mouse.scroll).toHaveBeenCalledWith(1, 5);
    // Second call: horizontal (dx > 0 → direction 2)
    expect(nutMock.mouse.scroll).toHaveBeenCalledWith(2, 3);
    expect(nutMock.mouse.scroll).toHaveBeenCalledTimes(2);
  });

  it('scrolls up-left when both are negative', async () => {
    await scrollMouse(-4, -7);
    expect(nutMock.mouse.scroll).toHaveBeenCalledWith(-1, 7);
    expect(nutMock.mouse.scroll).toHaveBeenCalledWith(-2, 4);
    expect(nutMock.mouse.scroll).toHaveBeenCalledTimes(2);
  });
});

// ─── clickMouse — button fallback for unknown button value ────────────────────

describe('clickMouse() — edge cases', () => {
  it('defaults to LEFT button when button string is not recognized', async () => {
    // force an unknown string through type assertion
    await clickMouse(10, 20, 'unknown' as any);
    // btnMap[button] is undefined → falls back to Button.LEFT
    expect(nutMock.mouse.click).toHaveBeenCalledWith(nutMock.Button.LEFT);
  });

  it('moves to position before double-clicking', async () => {
    await clickMouse(50, 60, 'right', true);
    expect(nutMock.mouse.move).toHaveBeenCalled();
    expect(nutMock.mouse.doubleClick).toHaveBeenCalledWith(nutMock.Button.RIGHT);
  });

  it('does not move when only x is undefined', async () => {
    await clickMouse(undefined, 50, 'left');
    // x !== undefined check fails because x is undefined
    expect(nutMock.mouse.move).not.toHaveBeenCalled();
    expect(nutMock.mouse.click).toHaveBeenCalledWith(nutMock.Button.LEFT);
  });

  it('does not move when only y is undefined', async () => {
    await clickMouse(50, undefined, 'left');
    // Both must be defined to trigger move
    expect(nutMock.mouse.move).not.toHaveBeenCalled();
    expect(nutMock.mouse.click).toHaveBeenCalledWith(nutMock.Button.LEFT);
  });
});
