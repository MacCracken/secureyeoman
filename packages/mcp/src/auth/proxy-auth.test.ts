import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProxyAuth } from './proxy-auth.js';
import type { CoreApiClient } from '../core-client.js';

function mockClient(response: unknown, shouldThrow = false): CoreApiClient {
  return {
    post: vi.fn().mockImplementation(() => {
      if (shouldThrow) throw new Error('Network error');
      return Promise.resolve(response);
    }),
  } as unknown as CoreApiClient;
}

describe('ProxyAuth', () => {
  let auth: ProxyAuth;

  describe('verify', () => {
    it('should return valid result for valid token', async () => {
      const client = mockClient({
        valid: true,
        userId: 'admin',
        role: 'admin',
        permissions: ['*'],
      });
      auth = new ProxyAuth(client);

      const result = await auth.verify('valid-token');
      expect(result.valid).toBe(true);
      expect(result.userId).toBe('admin');
      expect(result.role).toBe('admin');
    });

    it('should return invalid for invalid token', async () => {
      const client = mockClient({ valid: false });
      auth = new ProxyAuth(client);

      const result = await auth.verify('bad-token');
      expect(result.valid).toBe(false);
    });

    it('should return invalid for empty token', async () => {
      const client = mockClient({ valid: true });
      auth = new ProxyAuth(client);

      const result = await auth.verify('');
      expect(result.valid).toBe(false);
    });

    it('should return invalid on network error', async () => {
      const client = mockClient(null, true);
      auth = new ProxyAuth(client);

      const result = await auth.verify('some-token');
      expect(result.valid).toBe(false);
    });

    it('should cache successful verifications', async () => {
      const client = mockClient({ valid: true, userId: 'admin', role: 'admin', permissions: [] });
      auth = new ProxyAuth(client, 60_000);

      await auth.verify('cached-token');
      await auth.verify('cached-token');

      expect(client.post).toHaveBeenCalledTimes(1);
    });

    it('should not cache failed verifications', async () => {
      const client = mockClient({ valid: false });
      auth = new ProxyAuth(client);

      await auth.verify('bad-token');
      await auth.verify('bad-token');

      expect(client.post).toHaveBeenCalledTimes(2);
    });

    it('should call core verify endpoint with correct payload', async () => {
      const client = mockClient({ valid: true, userId: 'test', role: 'viewer', permissions: [] });
      auth = new ProxyAuth(client);

      await auth.verify('my-jwt-token');
      expect(client.post).toHaveBeenCalledWith('/api/v1/auth/verify', { token: 'my-jwt-token' });
    });
  });

  describe('extractToken', () => {
    beforeEach(() => {
      auth = new ProxyAuth(mockClient({}));
    });

    it('should extract Bearer token', () => {
      expect(auth.extractToken('Bearer my-token')).toBe('my-token');
    });

    it('should return undefined for non-Bearer header', () => {
      expect(auth.extractToken('Basic abc123')).toBeUndefined();
    });

    it('should return undefined for undefined', () => {
      expect(auth.extractToken(undefined)).toBeUndefined();
    });
  });

  describe('clearCache', () => {
    it('should clear the cache', async () => {
      const client = mockClient({ valid: true, userId: 'admin', role: 'admin', permissions: [] });
      auth = new ProxyAuth(client, 60_000);

      await auth.verify('cached-token');
      auth.clearCache();
      await auth.verify('cached-token');

      expect(client.post).toHaveBeenCalledTimes(2);
    });
  });
});
