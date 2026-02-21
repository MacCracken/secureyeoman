import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────

const { mockExecFileSync, mockSpawnSync } = vi.hoisted(() => ({
  mockExecFileSync: vi.fn(),
  mockSpawnSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync,
  spawnSync: mockSpawnSync,
}));

// ─── Tests ────────────────────────────────────────────────────

import { LinuxSecretServiceProvider } from './linux-secret-service.js';

describe('LinuxSecretServiceProvider', () => {
  let provider: LinuxSecretServiceProvider;

  beforeEach(() => {
    mockExecFileSync.mockClear();
    mockSpawnSync.mockClear();
    provider = new LinuxSecretServiceProvider();
    // Reset cached availability
    (provider as any).available = null;
  });

  describe('name', () => {
    it('is "linux-secret-service"', () => {
      expect(provider.name).toBe('linux-secret-service');
    });
  });

  describe('isAvailable', () => {
    it('returns false on non-linux platforms', () => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
      expect(provider.isAvailable()).toBe(false);
    });

    it('returns true on linux when secret-tool exists', () => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
      mockExecFileSync.mockReturnValueOnce(Buffer.from('/usr/bin/secret-tool'));
      expect(provider.isAvailable()).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledWith('which', ['secret-tool'], { stdio: 'pipe' });
    });

    it('returns false on linux when secret-tool not found', () => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
      mockExecFileSync.mockImplementationOnce(() => { throw new Error('not found'); });
      expect(provider.isAvailable()).toBe(false);
    });

    it('caches the result after first call', () => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
      mockExecFileSync.mockReturnValue(Buffer.from(''));
      provider.isAvailable();
      provider.isAvailable();
      expect(mockExecFileSync).toHaveBeenCalledTimes(1);
    });
  });

  describe('get', () => {
    it('returns the secret value', () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from('my-secret\n'));
      const result = provider.get('my-service', 'my-key');
      expect(result).toBe('my-secret');
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'secret-tool',
        ['lookup', 'service', 'my-service', 'name', 'my-key'],
        expect.objectContaining({ timeout: 5000 })
      );
    });

    it('returns undefined when exec fails', () => {
      mockExecFileSync.mockImplementationOnce(() => { throw new Error('not found'); });
      expect(provider.get('svc', 'key')).toBeUndefined();
    });

    it('returns undefined when output is empty', () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));
      expect(provider.get('svc', 'key')).toBeUndefined();
    });
  });

  describe('set', () => {
    it('calls spawnSync with the correct args', () => {
      mockSpawnSync.mockReturnValueOnce({ status: 0, stderr: null });
      provider.set('my-service', 'my-key', 'my-value');
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'secret-tool',
        ['store', '--label=my-service:my-key', 'service', 'my-service', 'name', 'my-key'],
        expect.objectContaining({ input: 'my-value' })
      );
    });

    it('throws when spawnSync returns non-zero status', () => {
      mockSpawnSync.mockReturnValueOnce({
        status: 1,
        stderr: Buffer.from('Access denied'),
      });
      expect(() => provider.set('svc', 'key', 'val')).toThrow('secret-tool store failed');
    });

    it('includes stderr in the error message', () => {
      mockSpawnSync.mockReturnValueOnce({
        status: 1,
        stderr: Buffer.from('no such file'),
      });
      expect(() => provider.set('svc', 'key', 'val')).toThrow('no such file');
    });
  });

  describe('delete', () => {
    it('calls execFileSync with clear args', () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));
      provider.delete('my-service', 'my-key');
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'secret-tool',
        ['clear', 'service', 'my-service', 'name', 'my-key'],
        expect.objectContaining({ timeout: 5000 })
      );
    });

    it('does not throw when exec fails (key may not exist)', () => {
      mockExecFileSync.mockImplementationOnce(() => { throw new Error('not found'); });
      expect(() => provider.delete('svc', 'key')).not.toThrow();
    });
  });
});
