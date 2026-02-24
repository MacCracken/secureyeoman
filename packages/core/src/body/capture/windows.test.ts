/**
 * Tests for window/display enumeration (windows.ts) — Phase 40.
 */

import { describe, it, expect, vi } from 'vitest';

// Hoist the mock so it's available when vi.mock factory runs
const mockExecFile = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({ execFile: mockExecFile }));

import { listWindows, listDisplays } from './windows.js';

function setupMockExec(stdout: string) {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, cb: (err: null, result: { stdout: string; stderr: string }) => void) => {
      cb(null, { stdout, stderr: '' });
    }
  );
}

function setupMockExecError() {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, cb: (err: Error) => void) => {
      cb(new Error('command not found'));
    }
  );
}

describe('windows.ts', () => {
  describe('listWindows', () => {
    it('returns empty array when command fails', async () => {
      setupMockExecError();
      const windows = await listWindows();
      expect(Array.isArray(windows)).toBe(true);
      expect(windows).toHaveLength(0);
    });

    it('returns windows from wmctrl output on Linux', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      // wmctrl -lG output: id desktop x y w h hostname title
      setupMockExec('0x00600001  0 0   0   1920 1080 host Firefox\n');

      const windows = await listWindows();
      expect(windows.length).toBeGreaterThan(0);
      expect(windows[0]).toMatchObject({
        id: '0x00600001',
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        isVisible: true,
        isSystemWindow: false,
      });
      expect(typeof windows[0]?.appName).toBe('string');

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('returns empty array for empty wmctrl output', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      setupMockExec('');
      const windows = await listWindows();
      expect(windows).toHaveLength(0);

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });

  describe('listDisplays', () => {
    it('returns empty array when command fails', async () => {
      setupMockExecError();
      const displays = await listDisplays();
      expect(Array.isArray(displays)).toBe(true);
      expect(displays).toHaveLength(0);
    });

    it('returns displays from xrandr output on Linux', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      setupMockExec([
        'Screen 0: minimum 8 x 8, current 1920 x 1080, maximum 32767 x 32767',
        'eDP-1 connected primary 1920x1080+0+0 (normal left inverted right x axis y axis) 309mm x 174mm',
        '   1920x1080     60.00*+  40.00',
        'HDMI-1 disconnected (normal left inverted right x axis y axis)',
      ].join('\n'));

      const displays = await listDisplays();
      expect(displays.length).toBeGreaterThan(0);
      expect(displays[0]).toMatchObject({
        id: '0',
        name: 'eDP-1',
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        isPrimary: true,
        scaleFactor: 1,
      });

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('parses display with non-zero offset', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      setupMockExec('HDMI-1 connected 2560x1440+1920+0 (normal left inverted right x axis y axis)\n');

      const displays = await listDisplays();
      expect(displays.length).toBeGreaterThan(0);
      expect(displays[0]?.bounds.x).toBe(1920);
      expect(displays[0]?.bounds.y).toBe(0);
      expect(displays[0]?.bounds.width).toBe(2560);
      expect(displays[0]?.bounds.height).toBe(1440);

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });

  describe('WindowInfo shape', () => {
    it('all required fields are present', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      setupMockExec('0x00600001  0 10  20  800  600  host Terminal\n');
      const windows = await listWindows();

      if (windows.length > 0) {
        const w = windows[0]!;
        expect(typeof w.id).toBe('string');
        expect(typeof w.title).toBe('string');
        expect(typeof w.appName).toBe('string');
        expect(typeof w.bounds.x).toBe('number');
        expect(typeof w.bounds.y).toBe('number');
        expect(typeof w.bounds.width).toBe('number');
        expect(typeof w.bounds.height).toBe('number');
        expect(typeof w.isVisible).toBe('boolean');
        expect(typeof w.isSystemWindow).toBe('boolean');
      }

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });

  describe('DisplayInfo shape', () => {
    it('all required fields are present', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      setupMockExec('eDP-1 connected primary 1920x1080+0+0\n');
      const displays = await listDisplays();

      if (displays.length > 0) {
        const d = displays[0]!;
        expect(typeof d.id).toBe('string');
        expect(typeof d.name).toBe('string');
        expect(typeof d.bounds.width).toBe('number');
        expect(typeof d.bounds.height).toBe('number');
        expect(typeof d.isPrimary).toBe('boolean');
        expect(typeof d.scaleFactor).toBe('number');
      }

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });
});
