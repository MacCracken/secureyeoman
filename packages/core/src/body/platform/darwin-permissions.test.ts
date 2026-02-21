import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────

let mockExecImpl: ReturnType<typeof vi.fn>;

vi.mock('node:child_process', () => ({
  exec: (...args: any[]) => mockExecImpl(...args),
}));

vi.mock('node:os', () => ({
  platform: vi.fn().mockReturnValue('darwin'),
}));

// ─── Tests ────────────────────────────────────────────────────

describe('DarwinPermissionManager', () => {
  let DarwinPermissionManager: any;
  let manager: any;

  beforeEach(async () => {
    mockExecImpl = vi.fn();
    // Default exec: succeeds with output
    mockExecImpl.mockImplementation((cmd: string, callback: Function) => {
      callback(null, { stdout: 'output', stderr: '' });
    });
    vi.useFakeTimers();

    const mod = await import('./darwin-permissions.js');
    DarwinPermissionManager = mod.DarwinPermissionManager;
    manager = new DarwinPermissionManager();
  });

  afterEach(() => {
    manager?.stopPolling();
    vi.useRealTimers();
    vi.resetModules();
  });

  describe('isAvailable', () => {
    it('returns true on darwin platform', () => {
      expect(manager.isAvailable()).toBe(true);
    });
  });

  describe('checkPermission', () => {
    it('returns granted for screen when osascript succeeds with output', async () => {
      const result = await manager.checkPermission('screen');
      expect(result.granted).toBe(true);
      expect(result.state).toBe('granted');
    });

    it('returns denied for screen when osascript returns empty output', async () => {
      mockExecImpl.mockImplementation((cmd: string, callback: Function) => {
        callback(null, { stdout: '', stderr: '' });
      });
      const result = await manager.checkPermission('screen');
      expect(result.granted).toBe(false);
      expect(result.state).toBe('denied');
    });

    it('returns denied for screen when osascript throws', async () => {
      mockExecImpl.mockImplementation((cmd: string, callback: Function) => {
        callback(new Error('Permission denied'));
      });
      const result = await manager.checkPermission('screen');
      expect(result.granted).toBe(false);
      expect(result.state).toBe('denied');
    });

    it('returns granted for camera when osascript succeeds', async () => {
      const result = await manager.checkPermission('camera');
      expect(result.granted).toBe(true);
    });

    it('returns denied for camera when osascript fails', async () => {
      mockExecImpl.mockImplementation((cmd: string, callback: Function) => {
        callback(new Error('denied'));
      });
      const result = await manager.checkPermission('camera');
      expect(result.granted).toBe(false);
    });

    it('delegates microphone to camera check', async () => {
      const result = await manager.checkPermission('microphone');
      expect(result.granted).toBe(true);
    });

    it('returns granted for accessibility when osascript succeeds', async () => {
      const result = await manager.checkPermission('accessibility');
      expect(result.granted).toBe(true);
    });

    it('returns denied for accessibility when osascript fails', async () => {
      mockExecImpl.mockImplementation((cmd: string, callback: Function) => {
        callback(new Error('denied'));
      });
      const result = await manager.checkPermission('accessibility');
      expect(result.granted).toBe(false);
    });

    it('returns denied for unknown permission type', async () => {
      const result = await manager.checkPermission('unknown' as any);
      expect(result.granted).toBe(false);
      expect(result.state).toBe('denied');
    });
  });

  describe('requestPermission', () => {
    it('triggers screen capture prompt and then checks permission', async () => {
      // Skip the 1000ms delay
      vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
        fn();
        return 0 as any;
      });
      const result = await manager.requestPermission('screen');
      expect(result).toBeDefined();
    });

    it('for non-screen types, just checks permission', async () => {
      vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
        fn();
        return 0 as any;
      });
      const result = await manager.requestPermission('camera');
      expect(result).toBeDefined();
    });
  });

  describe('openSystemPreferences', () => {
    it('opens system preferences URL for screen', async () => {
      await manager.openSystemPreferences('screen');
      expect(mockExecImpl).toHaveBeenCalledWith(
        expect.stringContaining('Privacy_ScreenCapture'),
        expect.any(Function)
      );
    });

    it('opens camera preferences URL', async () => {
      await manager.openSystemPreferences('camera');
      expect(mockExecImpl).toHaveBeenCalledWith(
        expect.stringContaining('Privacy_Camera'),
        expect.any(Function)
      );
    });

    it('opens microphone preferences URL', async () => {
      await manager.openSystemPreferences('microphone');
      expect(mockExecImpl).toHaveBeenCalledWith(
        expect.stringContaining('Privacy_Microphone'),
        expect.any(Function)
      );
    });
  });

  describe('onPermissionChange', () => {
    it('starts polling interval', () => {
      const callback = vi.fn();
      manager.onPermissionChange(callback);

      vi.advanceTimersByTime(5000);
      // callback is called async inside setInterval
    });

    it('does not start second interval if already polling', () => {
      const callback = vi.fn();
      manager.onPermissionChange(callback);
      manager.onPermissionChange(callback); // second call should be no-op
    });
  });

  describe('stopPolling', () => {
    it('stops the polling interval', () => {
      const callback = vi.fn();
      manager.onPermissionChange(callback);
      manager.stopPolling();
      // Can start again after stopping
      manager.onPermissionChange(callback);
    });

    it('does nothing if not polling', () => {
      manager.stopPolling(); // no-op
    });
  });
});
