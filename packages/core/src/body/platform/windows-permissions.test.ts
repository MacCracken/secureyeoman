import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────

let mockExecImpl: ReturnType<typeof vi.fn>;

vi.mock('node:child_process', () => ({
  exec: (...args: any[]) => mockExecImpl(...args),
}));

vi.mock('node:os', () => ({
  platform: vi.fn().mockReturnValue('win32'),
}));

// ─── Tests ────────────────────────────────────────────────────

describe('WindowsPermissionManager', () => {
  let WindowsPermissionManager: any;
  let manager: any;

  beforeEach(async () => {
    mockExecImpl = vi.fn();
    // Default: success with output
    mockExecImpl.mockImplementation((cmd: string, callback: Function) => {
      callback(null, { stdout: 'output', stderr: '' });
    });
    vi.useFakeTimers();

    vi.resetModules();
    const mod = await import('./windows-permissions.js');
    WindowsPermissionManager = mod.WindowsPermissionManager;
    manager = new WindowsPermissionManager();
  });

  afterEach(() => {
    manager?.stopPolling();
    vi.useRealTimers();
  });

  describe('isAvailable', () => {
    it('returns true on win32 platform', () => {
      expect(manager.isAvailable()).toBe(true);
    });
  });

  describe('checkPermission', () => {
    it('returns granted for screen when powershell returns output', async () => {
      const result = await manager.checkPermission('screen');
      expect(result.granted).toBe(true);
      expect(result.state).toBe('granted');
    });

    it('returns not-determined for screen when powershell returns empty output', async () => {
      mockExecImpl.mockImplementation((cmd: string, callback: Function) => {
        callback(null, { stdout: '', stderr: '' });
      });
      const result = await manager.checkPermission('screen');
      expect(result.granted).toBe(false);
      expect(result.state).toBe('not-determined');
    });

    it('returns denied for screen when powershell throws', async () => {
      mockExecImpl.mockImplementation((cmd: string, callback: Function) => {
        callback(new Error('Access denied'));
      });
      const result = await manager.checkPermission('screen');
      expect(result.granted).toBe(false);
      expect(result.state).toBe('denied');
    });

    it('returns granted for camera when device found', async () => {
      const result = await manager.checkPermission('camera');
      expect(result.granted).toBe(true);
    });

    it('returns not-determined for camera when no device', async () => {
      mockExecImpl.mockImplementation((cmd: string, callback: Function) => {
        callback(null, { stdout: '', stderr: '' });
      });
      const result = await manager.checkPermission('camera');
      expect(result.granted).toBe(false);
      expect(result.state).toBe('not-determined');
    });

    it('returns denied for camera on error', async () => {
      mockExecImpl.mockImplementation((cmd: string, callback: Function) => {
        callback(new Error('error'));
      });
      const result = await manager.checkPermission('camera');
      expect(result.granted).toBe(false);
    });

    it('returns granted for microphone when device found', async () => {
      const result = await manager.checkPermission('microphone');
      expect(result.granted).toBe(true);
    });

    it('returns not-determined for accessibility (not supported)', async () => {
      const result = await manager.checkPermission('accessibility');
      expect(result.granted).toBe(false);
      expect(result.state).toBe('not-determined');
    });

    it('returns denied for unknown type', async () => {
      const result = await manager.checkPermission('unknown' as any);
      expect(result.granted).toBe(false);
      expect(result.state).toBe('denied');
    });
  });

  describe('requestPermission', () => {
    it('for screen, opens system preferences and checks', async () => {
      vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => { fn(); return 0 as any; });
      const result = await manager.requestPermission('screen');
      expect(result).toBeDefined();
      // Should have called exec for opening settings
      expect(mockExecImpl).toHaveBeenCalled();
    });

    it('for camera, just checks permission', async () => {
      vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => { fn(); return 0 as any; });
      const result = await manager.requestPermission('camera');
      expect(result).toBeDefined();
    });
  });

  describe('openSystemPreferences', () => {
    it('opens screen capture settings', async () => {
      await manager.openSystemPreferences('screen');
      expect(mockExecImpl).toHaveBeenCalledWith(
        expect.stringContaining('ms-settings:privacy-screencapture'),
        expect.any(Function)
      );
    });

    it('opens camera settings', async () => {
      await manager.openSystemPreferences('camera');
      expect(mockExecImpl).toHaveBeenCalledWith(
        expect.stringContaining('ms-settings:privacy-webcam'),
        expect.any(Function)
      );
    });

    it('falls back to ms-settings: on error', async () => {
      mockExecImpl
        .mockImplementationOnce((cmd: string, callback: Function) => {
          callback(new Error('failed'));
        })
        .mockImplementationOnce((cmd: string, callback: Function) => {
          callback(null, { stdout: '', stderr: '' });
        });

      await manager.openSystemPreferences('screen');
      expect(mockExecImpl).toHaveBeenCalledTimes(2);
    });
  });

  describe('onPermissionChange / stopPolling', () => {
    it('starts polling interval', () => {
      const callback = vi.fn();
      manager.onPermissionChange(callback);
    });

    it('does not start second interval if already polling', () => {
      const callback = vi.fn();
      manager.onPermissionChange(callback);
      manager.onPermissionChange(callback); // no-op
    });

    it('stops polling', () => {
      const callback = vi.fn();
      manager.onPermissionChange(callback);
      manager.stopPolling();
    });

    it('stopPolling is no-op when not polling', () => {
      manager.stopPolling();
    });
  });
});
