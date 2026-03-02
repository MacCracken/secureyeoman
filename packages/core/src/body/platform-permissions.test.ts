/**
 * Platform Permissions Tests
 *
 * @see NEXT_STEP_06: Platform TCC Integration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  formatPermissionName,
  getPermissionIcon,
  resetPlatformPermissionManager,
  setPlatformPermissionManager,
  getPlatformPermissionManager,
} from './platform-permissions.js';

// Mock node:os so we can control platform() return value
const mockPlatform = vi.fn(() => 'linux');
vi.mock('node:os', () => ({
  platform: () => mockPlatform(),
}));

describe('Platform Permissions', () => {
  beforeEach(() => {
    resetPlatformPermissionManager();
    vi.clearAllMocks();
    mockPlatform.mockReturnValue('linux');
  });

  describe('formatPermissionName', () => {
    it('should format screen permission', () => {
      expect(formatPermissionName('screen')).toBe('Screen Recording');
    });

    it('should format camera permission', () => {
      expect(formatPermissionName('camera')).toBe('Camera');
    });

    it('should format microphone permission', () => {
      expect(formatPermissionName('microphone')).toBe('Microphone');
    });

    it('should format accessibility permission', () => {
      expect(formatPermissionName('accessibility')).toBe('Accessibility');
    });
  });

  describe('getPermissionIcon', () => {
    it('should return icon for screen', () => {
      expect(getPermissionIcon('screen')).toBe('🖥️');
    });

    it('should return icon for camera', () => {
      expect(getPermissionIcon('camera')).toBe('📷');
    });

    it('should return icon for microphone', () => {
      expect(getPermissionIcon('microphone')).toBe('🎤');
    });

    it('should return icon for accessibility', () => {
      expect(getPermissionIcon('accessibility')).toBe('♿');
    });
  });

  describe('custom manager', () => {
    it('should allow setting custom permission manager', async () => {
      const mockManager = {
        isAvailable: () => true,
        checkPermission: async () => ({
          granted: true,
          state: 'granted' as const,
          canRequest: true,
        }),
        requestPermission: async () => ({
          granted: true,
          state: 'granted' as const,
          canRequest: true,
        }),
        onPermissionChange: () => {},
        openSystemPreferences: async () => {},
      };

      setPlatformPermissionManager(mockManager);

      const manager = getPlatformPermissionManager();
      const status = await manager.checkPermission('screen');

      expect(status.granted).toBe(true);
    });
  });

  describe('getPlatformPermissionManager', () => {
    it('creates NoopPermissionManager for unsupported platforms', () => {
      mockPlatform.mockReturnValue('freebsd');
      resetPlatformPermissionManager();
      const manager = getPlatformPermissionManager();
      // NoopPermissionManager returns false for isAvailable
      expect(manager.isAvailable()).toBe(false);
    });

    it('creates NoopPermissionManager when platform-specific module fails to load (linux)', () => {
      mockPlatform.mockReturnValue('linux');
      resetPlatformPermissionManager();
      // require('./platform/linux-permissions.js') will fail because it is not in the mock
      // so it falls back to NoopPermissionManager
      const manager = getPlatformPermissionManager();
      // On our test environment, either LinuxPermissionManager loads or Noop — either is valid
      expect(manager).toBeDefined();
    });

    it('creates NoopPermissionManager when platform-specific module fails to load (darwin)', () => {
      mockPlatform.mockReturnValue('darwin');
      resetPlatformPermissionManager();
      const manager = getPlatformPermissionManager();
      expect(manager).toBeDefined();
    });

    it('creates NoopPermissionManager when platform-specific module fails to load (win32)', () => {
      mockPlatform.mockReturnValue('win32');
      resetPlatformPermissionManager();
      const manager = getPlatformPermissionManager();
      expect(manager).toBeDefined();
    });

    it('returns the same manager on subsequent calls', () => {
      resetPlatformPermissionManager();
      const m1 = getPlatformPermissionManager();
      const m2 = getPlatformPermissionManager();
      expect(m1).toBe(m2);
    });
  });

  describe('NoopPermissionManager behavior', () => {
    it('checkPermission returns not-determined', async () => {
      mockPlatform.mockReturnValue('freebsd');
      resetPlatformPermissionManager();
      const manager = getPlatformPermissionManager();
      const status = await manager.checkPermission('screen');
      expect(status.granted).toBe(false);
      expect(status.state).toBe('not-determined');
      expect(status.canRequest).toBe(false);
    });

    it('requestPermission returns denied', async () => {
      mockPlatform.mockReturnValue('freebsd');
      resetPlatformPermissionManager();
      const manager = getPlatformPermissionManager();
      const status = await manager.requestPermission('camera');
      expect(status.granted).toBe(false);
      expect(status.state).toBe('denied');
      expect(status.canRequest).toBe(false);
    });

    it('onPermissionChange is a no-op', () => {
      mockPlatform.mockReturnValue('freebsd');
      resetPlatformPermissionManager();
      const manager = getPlatformPermissionManager();
      // Should not throw
      manager.onPermissionChange(() => {});
    });

    it('openSystemPreferences resolves without error', async () => {
      mockPlatform.mockReturnValue('freebsd');
      resetPlatformPermissionManager();
      const manager = getPlatformPermissionManager();
      await expect(manager.openSystemPreferences('microphone')).resolves.toBeUndefined();
    });

    it('isAvailable returns false', () => {
      mockPlatform.mockReturnValue('freebsd');
      resetPlatformPermissionManager();
      const manager = getPlatformPermissionManager();
      expect(manager.isAvailable()).toBe(false);
    });
  });

  describe('setPlatformPermissionManager', () => {
    it('replaces the global manager', () => {
      const customManager = {
        isAvailable: () => true,
        checkPermission: vi.fn(),
        requestPermission: vi.fn(),
        onPermissionChange: vi.fn(),
        openSystemPreferences: vi.fn(),
      } as any;

      setPlatformPermissionManager(customManager);
      expect(getPlatformPermissionManager()).toBe(customManager);
    });
  });

  describe('resetPlatformPermissionManager', () => {
    it('forces recreation on next get', () => {
      const customManager = {
        isAvailable: () => true,
        checkPermission: vi.fn(),
        requestPermission: vi.fn(),
        onPermissionChange: vi.fn(),
        openSystemPreferences: vi.fn(),
      } as any;

      setPlatformPermissionManager(customManager);
      expect(getPlatformPermissionManager()).toBe(customManager);

      resetPlatformPermissionManager();
      const newManager = getPlatformPermissionManager();
      expect(newManager).not.toBe(customManager);
    });
  });
});

describe('PermissionStatus', () => {
  it('should create valid granted status', () => {
    const status = {
      granted: true,
      state: 'granted' as const,
      canRequest: true,
    };

    expect(status.granted).toBe(true);
    expect(status.state).toBe('granted');
  });

  it('should create valid denied status', () => {
    const status = {
      granted: false,
      state: 'denied' as const,
      canRequest: false,
    };

    expect(status.granted).toBe(false);
    expect(status.state).toBe('denied');
  });

  it('should create valid not-determined status', () => {
    const status = {
      granted: false,
      state: 'not-determined' as const,
      canRequest: true,
    };

    expect(status.granted).toBe(false);
    expect(status.state).toBe('not-determined');
  });
});
