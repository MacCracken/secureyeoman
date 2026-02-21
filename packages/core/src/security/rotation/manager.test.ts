import { describe, it, expect, vi, afterEach } from 'vitest';
import { SecretRotationManager } from './manager.js';

function makeStorage(overrides: any = {}) {
  return {
    upsert: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    getAll: vi.fn().mockResolvedValue([]),
    updateRotation: vi.fn().mockResolvedValue(undefined),
    storePreviousValue: vi.fn().mockResolvedValue(undefined),
    getPreviousValue: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

const META_INTERNAL = {
  name: 'JWT_SECRET',
  category: 'jwt',
  autoRotate: true,
  rotationIntervalDays: 30,
  expiresAt: null,
  createdAt: Date.now() - 40 * 86_400_000, // 40 days ago
  rotatedAt: Date.now() - 31 * 86_400_000, // 31 days ago
};

const META_EXTERNAL = {
  name: 'API_KEY',
  category: 'api_key',
  autoRotate: false,
  rotationIntervalDays: null,
  expiresAt: Date.now() + 5 * 86_400_000, // expires in 5 days
  createdAt: Date.now() - 25 * 86_400_000,
  rotatedAt: null,
};

const META_EXPIRED = {
  name: 'OLD_KEY',
  category: 'api_key',
  autoRotate: false,
  rotationIntervalDays: null,
  expiresAt: Date.now() - 1 * 86_400_000, // expired yesterday
  createdAt: Date.now() - 100 * 86_400_000,
  rotatedAt: null,
};

function makeManager(storageOverrides: any = {}) {
  const storage = makeStorage(storageOverrides);
  const manager = new SecretRotationManager(storage as any, {
    checkIntervalMs: 60000,
    warningDaysBeforeExpiry: 7,
  });
  return { manager, storage };
}

describe('SecretRotationManager', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('trackSecret', () => {
    it('upserts secret metadata', async () => {
      const { manager, storage } = makeManager();
      await manager.trackSecret(META_INTERNAL as any);
      expect(storage.upsert).toHaveBeenCalledWith(META_INTERNAL);
    });
  });

  describe('getStatus', () => {
    it('returns empty when no secrets tracked', async () => {
      const { manager } = makeManager();
      expect(await manager.getStatus()).toEqual([]);
    });

    it('returns ok status for non-expiring secret', async () => {
      const meta = {
        ...META_INTERNAL,
        autoRotate: false,
        expiresAt: null,
        rotationIntervalDays: null,
      };
      const { manager } = makeManager({ getAll: vi.fn().mockResolvedValue([meta]) });
      const statuses = await manager.getStatus();
      expect(statuses[0].status).toBe('ok');
    });

    it('returns rotation_due for auto-rotate secret past interval', async () => {
      const { manager } = makeManager({ getAll: vi.fn().mockResolvedValue([META_INTERNAL]) });
      const statuses = await manager.getStatus();
      expect(statuses[0].status).toBe('rotation_due');
    });

    it('returns expiring_soon for external secret within warning window', async () => {
      const { manager } = makeManager({ getAll: vi.fn().mockResolvedValue([META_EXTERNAL]) });
      const statuses = await manager.getStatus();
      expect(statuses[0].status).toBe('expiring_soon');
      expect(statuses[0].daysUntilExpiry).toBeGreaterThan(0);
    });

    it('returns expired for past-expiry secret', async () => {
      const { manager } = makeManager({ getAll: vi.fn().mockResolvedValue([META_EXPIRED]) });
      const statuses = await manager.getStatus();
      expect(statuses[0].status).toBe('expired');
      expect(statuses[0].daysUntilExpiry).toBeLessThanOrEqual(0);
    });
  });

  describe('checkAndRotate', () => {
    it('rotates secrets that are rotation_due', async () => {
      const { manager, storage } = makeManager({
        getAll: vi.fn().mockResolvedValue([META_INTERNAL]),
        get: vi.fn().mockResolvedValue(META_INTERNAL),
      });
      await manager.checkAndRotate();
      expect(storage.updateRotation).toHaveBeenCalled();
    });

    it('calls onWarning for expiring_soon secrets', async () => {
      const { manager } = makeManager({ getAll: vi.fn().mockResolvedValue([META_EXTERNAL]) });
      const onWarning = vi.fn();
      manager.setCallbacks({ onWarning });
      await manager.checkAndRotate();
      expect(onWarning).toHaveBeenCalledWith('API_KEY', expect.any(Number));
    });
  });

  describe('rotateSecret', () => {
    it('throws when secret not tracked', async () => {
      const { manager } = makeManager({ get: vi.fn().mockResolvedValue(null) });
      await expect(manager.rotateSecret('UNKNOWN_SECRET')).rejects.toThrow('Secret not tracked');
    });

    it('generates new value and updates metadata', async () => {
      const { manager, storage } = makeManager({ get: vi.fn().mockResolvedValue(META_INTERNAL) });
      const newValue = await manager.rotateSecret('JWT_SECRET');
      expect(typeof newValue).toBe('string');
      expect(newValue.length).toBeGreaterThan(0);
      expect(storage.updateRotation).toHaveBeenCalledWith(
        'JWT_SECRET',
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('stores previous value when env var exists', async () => {
      process.env.JWT_SECRET = 'old-value';
      const { manager, storage } = makeManager({ get: vi.fn().mockResolvedValue(META_INTERNAL) });
      await manager.rotateSecret('JWT_SECRET');
      expect(storage.storePreviousValue).toHaveBeenCalledWith(
        'JWT_SECRET',
        'old-value',
        expect.any(Number)
      );
      delete process.env.JWT_SECRET;
    });

    it('uses longer grace period for jwt category', async () => {
      process.env.JWT_SECRET = 'old-jwt';
      const { manager, storage } = makeManager({ get: vi.fn().mockResolvedValue(META_INTERNAL) });
      await manager.rotateSecret('JWT_SECRET');
      const [, , graceMs] = storage.storePreviousValue.mock.calls[0];
      expect(graceMs).toBe(3600_000); // 1 hour for JWT
      delete process.env.JWT_SECRET;
    });

    it('calls onRotate callback', async () => {
      const { manager } = makeManager({ get: vi.fn().mockResolvedValue(META_INTERNAL) });
      const onRotate = vi.fn();
      manager.setCallbacks({ onRotate });
      const newValue = await manager.rotateSecret('JWT_SECRET');
      expect(onRotate).toHaveBeenCalledWith('JWT_SECRET', newValue);
    });
  });

  describe('getPreviousValue', () => {
    it('delegates to storage', async () => {
      const { manager } = makeManager({ getPreviousValue: vi.fn().mockResolvedValue('old-value') });
      expect(await manager.getPreviousValue('JWT_SECRET')).toBe('old-value');
    });
  });

  describe('start / stop', () => {
    it('start/stop does not throw', () => {
      vi.useFakeTimers();
      const { manager } = makeManager();
      expect(() => manager.start()).not.toThrow();
      expect(() => manager.stop()).not.toThrow();
    });

    it('start is idempotent', () => {
      vi.useFakeTimers();
      const { manager } = makeManager();
      manager.start();
      manager.start(); // second call is no-op
      manager.stop();
    });
  });
});
