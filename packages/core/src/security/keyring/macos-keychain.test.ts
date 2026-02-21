import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────

const { mockExecFileSync } = vi.hoisted(() => ({
  mockExecFileSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync,
}));

// ─── Tests ────────────────────────────────────────────────────

import { MacOSKeychainProvider } from './macos-keychain.js';

describe('MacOSKeychainProvider', () => {
  let provider: MacOSKeychainProvider;

  beforeEach(() => {
    mockExecFileSync.mockClear();
    provider = new MacOSKeychainProvider();
    // Reset cached availability
    (provider as any).available = null;
  });

  describe('name', () => {
    it('is "macos-keychain"', () => {
      expect(provider.name).toBe('macos-keychain');
    });
  });

  describe('isAvailable', () => {
    it('returns false on non-darwin platforms', () => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
      expect(provider.isAvailable()).toBe(false);
    });

    it('returns true on darwin when security CLI exists', () => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
      mockExecFileSync.mockReturnValueOnce(Buffer.from('/usr/bin/security'));
      expect(provider.isAvailable()).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledWith('which', ['security'], { stdio: 'pipe' });
    });

    it('returns false on darwin when security CLI is missing', () => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('not found');
      });
      expect(provider.isAvailable()).toBe(false);
    });

    it('caches the result after first call', () => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
      mockExecFileSync.mockReturnValue(Buffer.from(''));
      provider.isAvailable();
      provider.isAvailable();
      expect(mockExecFileSync).toHaveBeenCalledTimes(1);
    });
  });

  describe('get', () => {
    it('returns the secret value trimmed', () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from('my-password\n'));
      const result = provider.get('my-service', 'my-account');
      expect(result).toBe('my-password');
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'security',
        ['find-generic-password', '-s', 'my-service', '-a', 'my-account', '-w'],
        expect.objectContaining({ timeout: 5000 })
      );
    });

    it('returns undefined when exec throws', () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('item not found');
      });
      expect(provider.get('svc', 'key')).toBeUndefined();
    });

    it('returns undefined when output is empty', () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));
      expect(provider.get('svc', 'key')).toBeUndefined();
    });
  });

  describe('set', () => {
    it('calls security add-generic-password with -U flag', () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));
      provider.set('my-service', 'my-account', 'my-password');
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'security',
        ['add-generic-password', '-U', '-s', 'my-service', '-a', 'my-account', '-w', 'my-password'],
        expect.objectContaining({ timeout: 5000 })
      );
    });

    it('throws when security CLI fails', () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('errSecAuthFailed');
      });
      expect(() => provider.set('svc', 'key', 'val')).toThrow(
        'security add-generic-password failed'
      );
    });
  });

  describe('delete', () => {
    it('calls security delete-generic-password', () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));
      provider.delete('my-service', 'my-account');
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'security',
        ['delete-generic-password', '-s', 'my-service', '-a', 'my-account'],
        expect.objectContaining({ timeout: 5000 })
      );
    });

    it('does not throw when item does not exist', () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('item not found');
      });
      expect(() => provider.delete('svc', 'key')).not.toThrow();
    });
  });
});
