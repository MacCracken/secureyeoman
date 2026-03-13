import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ParentAuthDelegate } from './parent-auth-delegate.js';

describe('ParentAuthDelegate', () => {
  let delegate: ParentAuthDelegate;
  const parentUrl = 'http://parent:18789';

  beforeEach(() => {
    delegate = new ParentAuthDelegate({ parentUrl, registrationToken: 'reg-tok' });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates instance with default config', () => {
    const d = new ParentAuthDelegate({ parentUrl });
    expect(d.cacheSize).toBe(0);
  });

  it('strips trailing slash from parentUrl', () => {
    const d = new ParentAuthDelegate({ parentUrl: 'http://parent:18789/' });
    expect(d.cacheSize).toBe(0);
  });

  describe('validateToken', () => {
    it('returns identity on valid response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          valid: true,
          userId: 'user-1',
          role: 'role_operator',
          tenantId: 'tenant-1',
          expiresAt: Date.now() + 60_000,
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const identity = await delegate.validateToken('test-token');

      expect(identity).not.toBeNull();
      expect(identity!.userId).toBe('user-1');
      expect(identity!.role).toBe('role_operator');
      expect(identity!.tenantId).toBe('tenant-1');

      expect(mockFetch).toHaveBeenCalledWith(
        `${parentUrl}/api/v1/auth/validate`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'X-Agent-Token': 'reg-tok',
          }),
        })
      );
    });

    it('returns null on non-ok response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

      const identity = await delegate.validateToken('bad-token');
      expect(identity).toBeNull();
    });

    it('returns null when valid is false', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({ valid: false }),
        })
      );

      const identity = await delegate.validateToken('expired-token');
      expect(identity).toBeNull();
    });

    it('returns null on fetch error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

      const identity = await delegate.validateToken('test-token');
      expect(identity).toBeNull();
    });

    it('defaults role to role_viewer when missing', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({ valid: true, userId: 'user-2' }),
        })
      );

      const identity = await delegate.validateToken('test-token');
      expect(identity!.role).toBe('role_viewer');
    });
  });

  describe('caching', () => {
    it('returns cached identity on second call', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ valid: true, userId: 'user-1', role: 'role_admin' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await delegate.validateToken('tok-1');
      await delegate.validateToken('tok-1');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(delegate.cacheSize).toBe(1);
    });

    it('re-validates after cache expiry', async () => {
      const shortTtl = new ParentAuthDelegate({
        parentUrl,
        cacheTtlMs: 1, // 1ms TTL
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ valid: true, userId: 'user-1' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await shortTtl.validateToken('tok-1');

      // Wait for cache to expire
      await new Promise((r) => setTimeout(r, 10));

      await shortTtl.validateToken('tok-1');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('evicts oldest entry at max capacity', async () => {
      const small = new ParentAuthDelegate({
        parentUrl,
        maxCacheSize: 2,
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ valid: true, userId: 'user-1' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await small.validateToken('tok-1');
      await small.validateToken('tok-2');
      await small.validateToken('tok-3'); // Should evict tok-1

      expect(small.cacheSize).toBe(2);
    });

    it('invalidate removes specific token', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ valid: true, userId: 'user-1' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await delegate.validateToken('tok-1');
      expect(delegate.cacheSize).toBe(1);

      delegate.invalidate('tok-1');
      expect(delegate.cacheSize).toBe(0);
    });

    it('clearCache removes all entries', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ valid: true, userId: 'user-1' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await delegate.validateToken('tok-1');
      await delegate.validateToken('tok-2');
      expect(delegate.cacheSize).toBe(2);

      delegate.clearCache();
      expect(delegate.cacheSize).toBe(0);
    });
  });
});
