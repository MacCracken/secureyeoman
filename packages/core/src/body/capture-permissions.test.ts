import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkCapturePermission,
  requireCapturePermission,
  requireCapturePermissionMiddleware,
  clearCapturePermissionCache,
  getCaptureCacheStats,
} from './capture-permissions.js';

// ─── Mock RBAC ─────────────────────────────────────────────────

const mockCheckPermission = vi.fn();
const mockGetRole = vi.fn();

vi.mock('../security/rbac.js', () => {
  class PermissionDeniedError extends Error {
    resource: string;
    action: string;
    constructor(resource: string, action: string, reason: string) {
      super(reason);
      this.resource = resource;
      this.action = action;
      this.name = 'PermissionDeniedError';
    }
  }

  return {
    getRBAC: () => ({
      checkPermission: (...args: any[]) => mockCheckPermission(...args),
      getRole: (...args: any[]) => mockGetRole(...args),
    }),
    PermissionDeniedError,
  };
});

// ─── Helpers ───────────────────────────────────────────────────

const userCtx = { userId: 'user-1', roleId: 'admin' };

describe('checkCapturePermission', () => {
  beforeEach(() => {
    clearCapturePermissionCache();
    vi.clearAllMocks();
  });

  it('returns granted when RBAC grants permission', async () => {
    mockCheckPermission.mockReturnValue({ granted: true, reason: undefined, matchedPermission: undefined });
    mockGetRole.mockReturnValue(null);

    const result = await checkCapturePermission('capture.screen', 'capture', {}, userCtx);
    expect(result.granted).toBe(true);
    expect(mockCheckPermission).toHaveBeenCalledWith(
      'admin',
      expect.objectContaining({ resource: 'capture.screen', action: 'capture' }),
      'user-1'
    );
  });

  it('returns denied when RBAC denies permission', async () => {
    mockCheckPermission.mockReturnValue({ granted: false, reason: 'PERMISSION_DENIED', matchedPermission: undefined });

    const result = await checkCapturePermission('capture.screen', 'capture', {}, userCtx);
    expect(result.granted).toBe(false);
    expect(result.reason).toBe('PERMISSION_DENIED');
  });

  it('returns cached result on second call with same params', async () => {
    mockCheckPermission.mockReturnValue({ granted: true, reason: undefined, matchedPermission: undefined });
    mockGetRole.mockReturnValue(null);

    await checkCapturePermission('capture.screen', 'capture', {}, userCtx);
    await checkCapturePermission('capture.screen', 'capture', {}, userCtx);

    // Should only call RBAC once due to caching
    expect(mockCheckPermission).toHaveBeenCalledTimes(1);
  });

  it('returns maxDuration from matched permission conditions', async () => {
    mockCheckPermission.mockReturnValue({
      granted: true,
      reason: undefined,
      matchedPermission: {
        conditions: [
          { field: 'duration', operator: 'lte', value: 300 },
        ],
      },
    });
    mockGetRole.mockReturnValue(null);

    const result = await checkCapturePermission('capture.screen', 'capture', {}, userCtx);
    expect(result.maxDuration).toBe(300);
  });

  it('returns allowedActions when granted and role has matching permissions', async () => {
    mockCheckPermission.mockReturnValue({ granted: true, reason: undefined, matchedPermission: undefined });
    mockGetRole.mockReturnValue({
      permissions: [
        { resource: 'capture.screen', actions: ['capture', 'view'] },
      ],
    });

    const result = await checkCapturePermission('capture.screen', 'capture', {}, userCtx);
    expect(result.allowedActions).toEqual(['capture', 'view']);
  });

  it('returns undefined allowedActions when denied', async () => {
    mockCheckPermission.mockReturnValue({ granted: false, reason: 'denied', matchedPermission: undefined });

    const result = await checkCapturePermission('capture.screen', 'capture', {}, userCtx);
    expect(result.allowedActions).toBeUndefined();
  });

  it('uses different cache keys for different resources', async () => {
    mockCheckPermission.mockReturnValue({ granted: true, reason: undefined, matchedPermission: undefined });
    mockGetRole.mockReturnValue(null);

    await checkCapturePermission('capture.screen', 'capture', {}, userCtx);
    await checkCapturePermission('capture.camera', 'capture', {}, userCtx);

    expect(mockCheckPermission).toHaveBeenCalledTimes(2);
  });
});

describe('requireCapturePermission', () => {
  beforeEach(() => {
    clearCapturePermissionCache();
    vi.clearAllMocks();
  });

  it('returns result when permission is granted', async () => {
    mockCheckPermission.mockReturnValue({ granted: true, reason: undefined, matchedPermission: undefined });
    mockGetRole.mockReturnValue(null);

    const result = await requireCapturePermission('capture.screen', 'capture', {}, userCtx);
    expect(result.granted).toBe(true);
  });

  it('throws PermissionDeniedError when permission is denied', async () => {
    mockCheckPermission.mockReturnValue({ granted: false, reason: 'ROLE_NOT_FOUND', matchedPermission: undefined });

    await expect(
      requireCapturePermission('capture.screen', 'capture', {}, userCtx)
    ).rejects.toThrow('ROLE_NOT_FOUND');
  });

  it('throws with default reason when none provided', async () => {
    mockCheckPermission.mockReturnValue({ granted: false, reason: undefined, matchedPermission: undefined });

    await expect(
      requireCapturePermission('capture.camera', 'view', {}, userCtx)
    ).rejects.toThrow('Permission denied');
  });
});

describe('requireCapturePermissionMiddleware', () => {
  beforeEach(() => {
    clearCapturePermissionCache();
    vi.clearAllMocks();
  });

  it('calls next with error when user is not authenticated', async () => {
    const middleware = requireCapturePermissionMiddleware('capture.screen', 'capture');
    const req = {} as any; // no user
    const res = {} as any;
    const next = vi.fn();

    await middleware(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('calls next without error when permission is granted', async () => {
    mockCheckPermission.mockReturnValue({ granted: true, reason: undefined, matchedPermission: undefined });
    mockGetRole.mockReturnValue(null);

    const middleware = requireCapturePermissionMiddleware('capture.screen', 'capture');
    const req = { user: { id: 'user-1', role: 'admin' }, body: {}, get: vi.fn().mockReturnValue(undefined), ip: '127.0.0.1' } as any;
    const res = {} as any;
    const next = vi.fn();

    await middleware(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('calls next with error when permission is denied', async () => {
    mockCheckPermission.mockReturnValue({ granted: false, reason: 'ACCESS_DENIED', matchedPermission: undefined });

    const middleware = requireCapturePermissionMiddleware('capture.screen', 'capture');
    const req = { user: { id: 'user-1', role: 'viewer' }, body: {}, get: vi.fn().mockReturnValue(undefined) } as any;
    const res = {} as any;
    const next = vi.fn();

    await middleware(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('clearCapturePermissionCache', () => {
  beforeEach(() => {
    clearCapturePermissionCache();
    vi.clearAllMocks();
  });

  it('clears the permission cache', async () => {
    mockCheckPermission.mockReturnValue({ granted: true, reason: undefined, matchedPermission: undefined });
    mockGetRole.mockReturnValue(null);

    // Populate cache
    await checkCapturePermission('capture.screen', 'capture', {}, userCtx);
    expect(mockCheckPermission).toHaveBeenCalledTimes(1);

    // Clear cache
    clearCapturePermissionCache();

    // Second call should hit RBAC again
    await checkCapturePermission('capture.screen', 'capture', {}, userCtx);
    expect(mockCheckPermission).toHaveBeenCalledTimes(2);
  });
});

describe('getCaptureCacheStats', () => {
  beforeEach(() => {
    clearCapturePermissionCache();
  });

  it('returns cache stats', () => {
    const stats = getCaptureCacheStats();
    expect(stats.size).toBe(0);
    expect(stats.maxSize).toBeGreaterThan(0);
    expect(stats.ttlMs).toBeGreaterThan(0);
  });

  it('reflects current cache size', async () => {
    vi.clearAllMocks();
    mockCheckPermission.mockReturnValue({ granted: true, reason: undefined, matchedPermission: undefined });
    mockGetRole.mockReturnValue(null);

    await checkCapturePermission('capture.screen', 'capture', {}, userCtx);

    const stats = getCaptureCacheStats();
    expect(stats.size).toBe(1);
  });
});
