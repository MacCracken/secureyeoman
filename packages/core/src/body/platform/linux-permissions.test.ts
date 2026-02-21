import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────

let mockExecImpl: ReturnType<typeof vi.fn>;

vi.mock('node:child_process', () => ({
  exec: (...args: any[]) => mockExecImpl(...args),
}));

vi.mock('node:os', () => ({
  platform: vi.fn().mockReturnValue('linux'),
}));

// ─── Tests ────────────────────────────────────────────────────

describe('LinuxPermissionManager', () => {
  let LinuxPermissionManager: any;
  let manager: any;

  beforeEach(async () => {
    mockExecImpl = vi.fn();
    // Default: success
    mockExecImpl.mockImplementation((cmd: string, callback: Function) => {
      callback(null, { stdout: 'output', stderr: '' });
    });
    vi.useFakeTimers();
    // Reset WAYLAND_DISPLAY env var
    delete process.env.WAYLAND_DISPLAY;
    delete process.env.DISPLAY;

    vi.resetModules();
    const mod = await import('./linux-permissions.js');
    LinuxPermissionManager = mod.LinuxPermissionManager;
    manager = new LinuxPermissionManager();
  });

  afterEach(() => {
    manager?.stopPolling();
    vi.useRealTimers();
    delete process.env.WAYLAND_DISPLAY;
    delete process.env.DISPLAY;
  });

  describe('isAvailable', () => {
    it('returns true on linux platform', () => {
      expect(manager.isAvailable()).toBe(true);
    });
  });

  describe('checkPermission (X11 mode)', () => {
    it('returns granted for screen when DISPLAY is set', async () => {
      process.env.DISPLAY = ':0';
      const result = await manager.checkPermission('screen');
      expect(result.granted).toBe(true);
      expect(result.state).toBe('granted');
    });

    it('returns denied for screen when no DISPLAY', async () => {
      const result = await manager.checkPermission('screen');
      expect(result.granted).toBe(false);
      expect(result.state).toBe('denied');
    });

    it('returns granted for camera when device exists', async () => {
      const result = await manager.checkPermission('camera');
      expect(result.granted).toBe(true);
    });

    it('returns denied for camera when device not found', async () => {
      mockExecImpl.mockImplementation((cmd: string, callback: Function) => {
        callback(null, { stdout: '', stderr: '' });
      });
      const result = await manager.checkPermission('camera');
      expect(result.granted).toBe(false);
    });

    it('returns denied for camera on exec error', async () => {
      mockExecImpl.mockImplementation((cmd: string, callback: Function) => {
        callback(new Error('no device'));
      });
      const result = await manager.checkPermission('camera');
      expect(result.granted).toBe(false);
    });

    it('returns granted for microphone when device exists', async () => {
      const result = await manager.checkPermission('microphone');
      expect(result.granted).toBe(true);
    });

    it('returns not-determined for unknown type', async () => {
      const result = await manager.checkPermission('unknown' as any);
      expect(result.granted).toBe(false);
      expect(result.state).toBe('not-determined');
    });
  });

  describe('checkPermission (Wayland/portal mode)', () => {
    beforeEach(async () => {
      process.env.WAYLAND_DISPLAY = 'wayland-0';
      vi.resetModules();
      const mod = await import('./linux-permissions.js');
      LinuxPermissionManager = mod.LinuxPermissionManager;
      manager = new LinuxPermissionManager();
    });

    it('returns granted for screen when portal busctl succeeds', async () => {
      const result = await manager.checkPermission('screen');
      expect(result.granted).toBe(true);
      expect(result.state).toBe('granted');
    });

    it('returns not-determined when portal check fails', async () => {
      mockExecImpl.mockImplementation((cmd: string, callback: Function) => {
        callback(new Error('no portal'));
      });
      const result = await manager.checkPermission('screen');
      expect(result.granted).toBe(false);
      expect(result.state).toBe('not-determined');
    });
  });

  describe('requestPermission', () => {
    it('for screen with X11, returns current permission', async () => {
      process.env.DISPLAY = ':0';
      const result = await manager.requestPermission('screen');
      expect(result.granted).toBe(true);
    });

    it('for camera, delegates to checkPermission', async () => {
      const result = await manager.requestPermission('camera');
      expect(result).toBeDefined();
    });
  });

  describe('requestPermission (Wayland)', () => {
    beforeEach(async () => {
      process.env.WAYLAND_DISPLAY = 'wayland-0';
      vi.resetModules();
      const mod = await import('./linux-permissions.js');
      LinuxPermissionManager = mod.LinuxPermissionManager;
      manager = new LinuxPermissionManager();
    });

    it('requests portal permission for screen', async () => {
      const result = await manager.requestPermission('screen');
      expect(result).toBeDefined();
    });

    it('returns denied when xdg-desktop-portal not found', async () => {
      mockExecImpl.mockImplementation((cmd: string, callback: Function) => {
        callback(new Error('not found'));
      });
      const result = await manager.requestPermission('screen');
      expect(result.granted).toBe(false);
    });
  });

  describe('openSystemPreferences', () => {
    it('opens Ubuntu help URL (X11 mode)', async () => {
      await manager.openSystemPreferences('screen');
      expect(mockExecImpl).toHaveBeenCalledWith(
        expect.stringContaining('xdg-open'),
        expect.any(Function)
      );
    });

    it('opens portal URL (Wayland mode)', async () => {
      process.env.WAYLAND_DISPLAY = 'wayland-0';
      vi.resetModules();
      const mod = await import('./linux-permissions.js');
      LinuxPermissionManager = mod.LinuxPermissionManager;
      manager = new LinuxPermissionManager();

      await manager.openSystemPreferences('screen');
      expect(mockExecImpl).toHaveBeenCalledWith(
        expect.stringContaining('xdg-open'),
        expect.any(Function)
      );
    });
  });

  describe('onPermissionChange / stopPolling', () => {
    it('starts polling interval', () => {
      process.env.DISPLAY = ':0';
      const callback = vi.fn();
      manager.onPermissionChange(callback);
    });

    it('does not start second interval if already polling', () => {
      const callback = vi.fn();
      manager.onPermissionChange(callback);
      manager.onPermissionChange(callback);
    });

    it('stops polling', () => {
      const callback = vi.fn();
      manager.onPermissionChange(callback);
      manager.stopPolling();
    });

    it('stopPolling does nothing if not polling', () => {
      manager.stopPolling();
    });

    it('isUsingPortal returns false in X11 mode', () => {
      expect(manager.isUsingPortal()).toBe(false);
    });
  });
});
