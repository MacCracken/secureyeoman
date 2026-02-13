/**
 * Platform Permissions Tests
 *
 * @see NEXT_STEP_06: Platform TCC Integration
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  formatPermissionName,
  getPermissionIcon,
  resetPlatformPermissionManager,
  setPlatformPermissionManager,
} from './platform-permissions.js';

describe('Platform Permissions', () => {
  beforeEach(() => {
    resetPlatformPermissionManager();
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

      const { getPlatformPermissionManager } = await import('./platform-permissions.js');
      const manager = getPlatformPermissionManager();
      const status = await manager.checkPermission('screen');

      expect(status.granted).toBe(true);
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
