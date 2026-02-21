import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PermissionEdgeCaseHandler,
  getPermissionEdgeCaseHandler,
  resetPermissionEdgeCaseHandler,
} from './permission-edge-cases.js';
import {
  setPlatformPermissionManager,
  resetPlatformPermissionManager,
} from './platform-permissions.js';

function makePlatformManager(overrides: any = {}) {
  return {
    checkPermission: vi.fn().mockResolvedValue({ granted: true, canRequest: false }),
    requestPermission: vi.fn().mockResolvedValue({ granted: true, canRequest: false }),
    openSystemPreferences: vi.fn().mockResolvedValue(undefined),
    onPermissionChange: vi.fn(),
    ...overrides,
  };
}

describe('PermissionEdgeCaseHandler', () => {
  let manager: ReturnType<typeof makePlatformManager>;

  beforeEach(() => {
    manager = makePlatformManager();
    setPlatformPermissionManager(manager);
    resetPermissionEdgeCaseHandler();
    vi.useFakeTimers();
  });

  afterEach(() => {
    resetPermissionEdgeCaseHandler();
    resetPlatformPermissionManager();
    vi.useRealTimers();
  });

  describe('initialize', () => {
    it('checks all three permission types', async () => {
      const handler = new PermissionEdgeCaseHandler();
      await handler.initialize();
      expect(manager.checkPermission).toHaveBeenCalledTimes(3);
      expect(manager.checkPermission).toHaveBeenCalledWith('screen');
      expect(manager.checkPermission).toHaveBeenCalledWith('camera');
      expect(manager.checkPermission).toHaveBeenCalledWith('microphone');
      handler.stopMonitoring();
    });

    it('stores initial permission statuses', async () => {
      manager.checkPermission.mockImplementation((type: string) =>
        Promise.resolve({ granted: type === 'screen', canRequest: false })
      );
      const handler = new PermissionEdgeCaseHandler();
      await handler.initialize();
      expect(handler.getLastKnownStatus('screen')).toEqual({ granted: true, canRequest: false });
      expect(handler.getLastKnownStatus('camera')).toEqual({ granted: false, canRequest: false });
      handler.stopMonitoring();
    });

    it('does not start monitoring twice', async () => {
      const handler = new PermissionEdgeCaseHandler();
      await handler.initialize();
      // Call initialize again - should not throw or duplicate interval
      await handler.initialize();
      handler.stopMonitoring();
    });
  });

  describe('stopMonitoring', () => {
    it('clears the poll interval', async () => {
      const handler = new PermissionEdgeCaseHandler();
      await handler.initialize();
      handler.stopMonitoring();
      // Calling again is a no-op
      handler.stopMonitoring();
    });
  });

  describe('onPermissionEvent / offPermissionEvent', () => {
    it('registers and calls event handler on revoke', async () => {
      const handler = new PermissionEdgeCaseHandler();
      const cb = vi.fn();
      handler.onPermissionEvent(cb);
      await handler.handlePermissionRevoked('screen');
      expect(cb).toHaveBeenCalledOnce();
      expect(cb.mock.calls[0][0].type).toBe('revoked');
      expect(cb.mock.calls[0][0].permissionType).toBe('screen');
    });

    it('removes event handler with offPermissionEvent', async () => {
      const handler = new PermissionEdgeCaseHandler();
      const cb = vi.fn();
      handler.onPermissionEvent(cb);
      handler.offPermissionEvent(cb);
      await handler.handlePermissionRevoked('camera');
      expect(cb).not.toHaveBeenCalled();
    });

    it('handles errors in event handlers without throwing', async () => {
      const handler = new PermissionEdgeCaseHandler();
      const cb = vi.fn().mockImplementation(() => {
        throw new Error('handler error');
      });
      handler.onPermissionEvent(cb);
      await expect(handler.handlePermissionRevoked('screen')).resolves.toBeUndefined();
    });
  });

  describe('handlePermissionRevoked', () => {
    it('emits a revoked event with the correct type', async () => {
      const handler = new PermissionEdgeCaseHandler();
      const cb = vi.fn();
      handler.onPermissionEvent(cb);
      await handler.handlePermissionRevoked('camera');
      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'revoked',
          permissionType: 'camera',
        })
      );
    });

    it('includes a timestamp in the event', async () => {
      const handler = new PermissionEdgeCaseHandler();
      const cb = vi.fn();
      handler.onPermissionEvent(cb);
      await handler.handlePermissionRevoked('microphone');
      expect(cb.mock.calls[0][0].timestamp).toBeTypeOf('number');
    });
  });

  describe('handleOSUpgrade', () => {
    it('re-checks all permissions and returns the results', async () => {
      manager.checkPermission.mockResolvedValue({ granted: false, canRequest: true });
      const handler = new PermissionEdgeCaseHandler();
      const results = await handler.handleOSUpgrade();
      expect(results.screen).toEqual({ granted: false, canRequest: true });
      expect(results.camera).toEqual({ granted: false, canRequest: true });
      expect(results.microphone).toEqual({ granted: false, canRequest: true });
      expect(manager.checkPermission).toHaveBeenCalledTimes(3);
    });

    it('updates lastKnownStatus after OS upgrade', async () => {
      manager.checkPermission.mockResolvedValue({ granted: true, canRequest: false });
      const handler = new PermissionEdgeCaseHandler();
      await handler.handleOSUpgrade();
      expect(handler.getLastKnownStatus('screen')).toEqual({ granted: true, canRequest: false });
      expect(handler.getLastKnownStatus('microphone')).toEqual({ granted: true, canRequest: false });
    });
  });

  describe('checkEnterprisePolicy', () => {
    it('returns true by default', async () => {
      const handler = new PermissionEdgeCaseHandler();
      const result = await handler.checkEnterprisePolicy('screen');
      expect(result).toBe(true);
    });

    it('handles all permission types', async () => {
      const handler = new PermissionEdgeCaseHandler();
      expect(await handler.checkEnterprisePolicy('camera')).toBe(true);
      expect(await handler.checkEnterprisePolicy('microphone')).toBe(true);
    });
  });

  describe('getLastKnownStatus', () => {
    it('returns undefined when not yet initialized', () => {
      const handler = new PermissionEdgeCaseHandler();
      expect(handler.getLastKnownStatus('screen')).toBeUndefined();
    });

    it('returns the status after initialize', async () => {
      const handler = new PermissionEdgeCaseHandler();
      await handler.initialize();
      expect(handler.getLastKnownStatus('screen')).toBeDefined();
      expect(handler.getLastKnownStatus('screen')?.granted).toBe(true);
      handler.stopMonitoring();
    });
  });

  describe('getAllLastKnownStatuses', () => {
    it('returns empty object when not initialized', () => {
      const handler = new PermissionEdgeCaseHandler();
      const statuses = handler.getAllLastKnownStatuses();
      expect(Object.keys(statuses)).toHaveLength(0);
    });

    it('returns all statuses after initialize', async () => {
      const handler = new PermissionEdgeCaseHandler();
      await handler.initialize();
      const statuses = handler.getAllLastKnownStatuses();
      expect(statuses.screen).toBeDefined();
      expect(statuses.camera).toBeDefined();
      expect(statuses.microphone).toBeDefined();
      handler.stopMonitoring();
    });
  });

  describe('change detection via polling', () => {
    it('emits revoked event when permission status changes to denied', async () => {
      let callCount = 0;
      manager.checkPermission.mockImplementation(() => {
        callCount++;
        // First 3 calls (initialize): granted; next calls (poll): denied
        return Promise.resolve({ granted: callCount <= 3, canRequest: false });
      });

      const handler = new PermissionEdgeCaseHandler();
      await handler.initialize();

      const cb = vi.fn();
      handler.onPermissionEvent(cb);

      await vi.advanceTimersByTimeAsync(5000);
      await Promise.resolve();
      await Promise.resolve();

      expect(cb).toHaveBeenCalled();
      const event = cb.mock.calls[0][0];
      expect(event.type).toBe('revoked');

      handler.stopMonitoring();
    });

    it('emits granted event when permission status changes to granted', async () => {
      let callCount = 0;
      manager.checkPermission.mockImplementation(() => {
        callCount++;
        // First 3 calls (initialize): denied; next calls (poll): granted
        return Promise.resolve({ granted: callCount > 3, canRequest: false });
      });

      const handler = new PermissionEdgeCaseHandler();
      await handler.initialize();

      const cb = vi.fn();
      handler.onPermissionEvent(cb);

      await vi.advanceTimersByTimeAsync(5000);
      await Promise.resolve();
      await Promise.resolve();

      expect(cb).toHaveBeenCalled();
      const event = cb.mock.calls[0][0];
      expect(event.type).toBe('granted');

      handler.stopMonitoring();
    });

    it('does not emit events when permission status unchanged', async () => {
      manager.checkPermission.mockResolvedValue({ granted: true, canRequest: false });

      const handler = new PermissionEdgeCaseHandler();
      await handler.initialize();

      const cb = vi.fn();
      handler.onPermissionEvent(cb);

      await vi.advanceTimersByTimeAsync(5000);
      await Promise.resolve();

      expect(cb).not.toHaveBeenCalled();

      handler.stopMonitoring();
    });
  });

  describe('singleton helpers', () => {
    it('getPermissionEdgeCaseHandler returns the same instance', () => {
      const h1 = getPermissionEdgeCaseHandler();
      const h2 = getPermissionEdgeCaseHandler();
      expect(h1).toBe(h2);
    });

    it('resetPermissionEdgeCaseHandler clears the singleton', () => {
      const h1 = getPermissionEdgeCaseHandler();
      resetPermissionEdgeCaseHandler();
      const h2 = getPermissionEdgeCaseHandler();
      expect(h1).not.toBe(h2);
    });
  });
});
