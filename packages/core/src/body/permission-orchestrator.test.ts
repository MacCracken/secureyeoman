import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PermissionOrchestrator,
  getPermissionOrchestrator,
  setPermissionOrchestrator,
  resetPermissionOrchestrator,
} from './permission-orchestrator.js';
import type { CaptureContext } from './permission-orchestrator.js';

// ─── Helpers ────────────────────────────────────────────────────────

const granted: any = { granted: true, canRequest: false };
const denied: any = { granted: false, canRequest: false };
const deniedCanRequest: any = { granted: false, canRequest: true };

function makePlatformManager(overrides: any = {}) {
  return {
    checkPermission: vi.fn().mockResolvedValue(granted),
    requestPermission: vi.fn().mockResolvedValue(granted),
    openSystemPreferences: vi.fn().mockResolvedValue(undefined),
    onPermissionChange: vi.fn(),
    ...overrides,
  };
}

function makeConsentManager(overrides: any = {}) {
  return {
    requestConsent: vi.fn().mockResolvedValue({ id: 'consent-1', status: 'granted' }),
    ...overrides,
  };
}

const defaultContext: CaptureContext = {
  userId: 'user-1',
  roleId: 'admin',
  purpose: 'Testing',
};

describe('PermissionOrchestrator', () => {
  afterEach(() => {
    resetPermissionOrchestrator();
  });

  describe('constructor', () => {
    it('accepts custom platformManager', () => {
      const platform = makePlatformManager();
      const orc = new PermissionOrchestrator(platform);
      expect(orc).toBeInstanceOf(PermissionOrchestrator);
    });

    it('accepts consent manager', () => {
      const platform = makePlatformManager();
      const consent = makeConsentManager();
      const orc = new PermissionOrchestrator(platform, consent);
      expect(orc).toBeInstanceOf(PermissionOrchestrator);
    });
  });

  describe('setConsentManager', () => {
    it('sets the consent manager after construction', async () => {
      const platform = makePlatformManager();
      const orc = new PermissionOrchestrator(platform);
      const consent = makeConsentManager();
      orc.setConsentManager(consent);
      const result = await orc.ensurePermission('screen', defaultContext);
      expect(consent.requestConsent).toHaveBeenCalled();
      expect(result.granted).toBe(true);
    });
  });

  describe('ensurePermission', () => {
    it('grants when platform is already granted and no consent manager', async () => {
      const platform = makePlatformManager({ checkPermission: vi.fn().mockResolvedValue(granted) });
      const orc = new PermissionOrchestrator(platform);
      const result = await orc.ensurePermission('screen', defaultContext);
      expect(result.granted).toBe(true);
    });

    it('grants when platform granted and consent manager grants', async () => {
      const platform = makePlatformManager();
      const consent = makeConsentManager();
      const orc = new PermissionOrchestrator(platform, consent);
      const result = await orc.ensurePermission('screen', defaultContext);
      expect(result.granted).toBe(true);
      expect(result.consentId).toBe('consent-1');
    });

    it('returns USER_DENIED when consent manager denies', async () => {
      const platform = makePlatformManager();
      const consent = makeConsentManager({
        requestConsent: vi.fn().mockResolvedValue({ id: 'c-2', status: 'denied' }),
      });
      const orc = new PermissionOrchestrator(platform, consent);
      const result = await orc.ensurePermission('screen', defaultContext);
      expect(result.granted).toBe(false);
      expect(result.reason).toBe('USER_DENIED');
    });

    it('returns USER_DENIED when consent throws', async () => {
      const platform = makePlatformManager();
      const consent = makeConsentManager({
        requestConsent: vi.fn().mockRejectedValue(new Error('consent service unavailable')),
      });
      const orc = new PermissionOrchestrator(platform, consent);
      const result = await orc.ensurePermission('screen', defaultContext);
      expect(result.granted).toBe(false);
      expect(result.reason).toBe('USER_DENIED');
    });

    it('requests platform permission when canRequest is true', async () => {
      const platform = makePlatformManager({
        checkPermission: vi.fn().mockResolvedValue(deniedCanRequest),
        requestPermission: vi.fn().mockResolvedValue(granted),
      });
      const orc = new PermissionOrchestrator(platform);
      const result = await orc.ensurePermission('screen', defaultContext);
      expect(platform.requestPermission).toHaveBeenCalledWith('screen');
      expect(result.granted).toBe(true);
    });

    it('returns PLATFORM_DENIED when request permission denied', async () => {
      const platform = makePlatformManager({
        checkPermission: vi.fn().mockResolvedValue(deniedCanRequest),
        requestPermission: vi.fn().mockResolvedValue(denied),
      });
      const orc = new PermissionOrchestrator(platform);
      const result = await orc.ensurePermission('screen', defaultContext);
      expect(result.granted).toBe(false);
      expect(result.reason).toBe('PLATFORM_DENIED');
    });

    it('returns NOT_DETERMINED when platform denied and cannot request', async () => {
      const platform = makePlatformManager({
        checkPermission: vi.fn().mockResolvedValue(denied),
      });
      const orc = new PermissionOrchestrator(platform);
      const result = await orc.ensurePermission('screen', defaultContext);
      expect(result.granted).toBe(false);
      expect(result.reason).toBe('NOT_DETERMINED');
    });

    it('uses default scope when context.scope not provided', async () => {
      const platform = makePlatformManager();
      const consent = makeConsentManager();
      const orc = new PermissionOrchestrator(platform, consent);
      await orc.ensurePermission('screen', { userId: 'u1', roleId: 'member' });
      const [, consentRequest] = consent.requestConsent.mock.calls[0];
      expect(consentRequest.scope).toBeDefined();
      expect(consentRequest.scope.resource).toBe('capture.screen');
    });
  });

  describe('checkPlatformPermission', () => {
    it('delegates to platform manager', async () => {
      const platform = makePlatformManager();
      const orc = new PermissionOrchestrator(platform);
      const result = await orc.checkPlatformPermission('camera');
      expect(platform.checkPermission).toHaveBeenCalledWith('camera');
      expect(result.granted).toBe(true);
    });
  });

  describe('requestPlatformPermission', () => {
    it('delegates to platform manager', async () => {
      const platform = makePlatformManager();
      const orc = new PermissionOrchestrator(platform);
      await orc.requestPlatformPermission('microphone');
      expect(platform.requestPermission).toHaveBeenCalledWith('microphone');
    });
  });

  describe('openSystemPreferences', () => {
    it('delegates to platform manager', async () => {
      const platform = makePlatformManager();
      const orc = new PermissionOrchestrator(platform);
      await orc.openSystemPreferences('screen');
      expect(platform.openSystemPreferences).toHaveBeenCalledWith('screen');
    });
  });

  describe('onPlatformPermissionChange', () => {
    it('registers callback via platform manager', () => {
      const platform = makePlatformManager();
      const orc = new PermissionOrchestrator(platform);
      const cb = vi.fn();
      orc.onPlatformPermissionChange(cb);
      expect(platform.onPermissionChange).toHaveBeenCalledWith(cb);
    });
  });

  describe('singleton helpers', () => {
    it('getPermissionOrchestrator returns singleton', () => {
      const platform = makePlatformManager();
      const orc = new PermissionOrchestrator(platform);
      setPermissionOrchestrator(orc);
      const retrieved = getPermissionOrchestrator();
      expect(retrieved).toBe(orc);
    });

    it('resetPermissionOrchestrator clears singleton', () => {
      const platform = makePlatformManager();
      const orc = new PermissionOrchestrator(platform);
      setPermissionOrchestrator(orc);
      resetPermissionOrchestrator();
      // After reset, getPermissionOrchestrator creates a new one
      // We can't test the exact new one without mocking getPlatformPermissionManager
      // But we can verify the reset works
      expect(getPermissionOrchestrator()).not.toBe(orc);
    });
  });
});
