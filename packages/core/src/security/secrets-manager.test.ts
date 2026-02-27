/**
 * SecretsManager unit tests
 *
 * Uses vi.fn() stubs for KeyringManager and VaultBackend so no real I/O is needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SecretsManager } from './secrets-manager.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeKeyringManager(store: Record<string, string> = {}) {
  return {
    getProvider: vi.fn(() => ({ name: 'mock' })),
    getSecret: vi.fn((k: string) => store[k]),
    storeSecret: vi.fn((k: string, v: string) => {
      store[k] = v;
    }),
    deleteSecret: vi.fn((k: string) => {
      delete store[k];
    }),
  };
}

// ---------------------------------------------------------------------------
// env backend
// ---------------------------------------------------------------------------

describe('SecretsManager — env backend', () => {
  beforeEach(() => {
    delete process.env['TEST_SECRET'];
  });

  it('get() reads from process.env', async () => {
    process.env['TEST_SECRET'] = 'env-value';
    const sm = new SecretsManager({ backend: 'env' });
    await sm.initialize();
    expect(await sm.get('TEST_SECRET')).toBe('env-value');
  });

  it('set() writes to process.env', async () => {
    const sm = new SecretsManager({ backend: 'env' });
    await sm.initialize();
    await sm.set('TEST_SECRET', 'written');
    expect(process.env['TEST_SECRET']).toBe('written');
  });

  it('delete() removes from process.env', async () => {
    process.env['TEST_SECRET'] = 'to-delete';
    const sm = new SecretsManager({ backend: 'env' });
    await sm.initialize();
    const deleted = await sm.delete('TEST_SECRET');
    expect(deleted).toBe(true);
    expect(process.env['TEST_SECRET']).toBeUndefined();
  });

  it('has() returns false when key absent', async () => {
    const sm = new SecretsManager({ backend: 'env' });
    await sm.initialize();
    expect(await sm.has('TEST_SECRET')).toBe(false);
  });

  it('has() returns true when key present', async () => {
    process.env['TEST_SECRET'] = 'x';
    const sm = new SecretsManager({ backend: 'env' });
    await sm.initialize();
    expect(await sm.has('TEST_SECRET')).toBe(true);
  });

  it('keys() returns empty array (env is not enumerable)', async () => {
    const sm = new SecretsManager({ backend: 'env' });
    await sm.initialize();
    expect(await sm.keys()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// keyring backend
// ---------------------------------------------------------------------------

describe('SecretsManager — keyring backend', () => {
  it('get() delegates to keyringManager.getSecret()', async () => {
    const km = makeKeyringManager({ MY_KEY: 'from-keyring' });
    const sm = new SecretsManager({ backend: 'keyring', keyringManager: km as never });
    await sm.initialize();
    expect(await sm.get('MY_KEY')).toBe('from-keyring');
    expect(km.getSecret).toHaveBeenCalledWith('MY_KEY');
  });

  it('set() calls keyringManager.storeSecret()', async () => {
    const km = makeKeyringManager();
    const sm = new SecretsManager({ backend: 'keyring', keyringManager: km as never });
    await sm.initialize();
    await sm.set('K', 'V');
    expect(km.storeSecret).toHaveBeenCalledWith('K', 'V');
  });

  it('delete() calls keyringManager.deleteSecret()', async () => {
    const km = makeKeyringManager({ K: 'v' });
    const sm = new SecretsManager({ backend: 'keyring', keyringManager: km as never });
    await sm.initialize();
    expect(await sm.delete('K')).toBe(true);
    expect(km.deleteSecret).toHaveBeenCalledWith('K');
  });
});

// ---------------------------------------------------------------------------
// vault backend
// ---------------------------------------------------------------------------

describe('SecretsManager — vault backend', () => {
  function makeVaultBackend(store: Record<string, string> = {}) {
    return {
      get: vi.fn(async (k: string) => store[k]),
      set: vi.fn(async (k: string, v: string) => {
        store[k] = v;
      }),
      delete: vi.fn(async (k: string) => {
        const had = k in store;
        delete store[k];
        return had;
      }),
      has: vi.fn(async (k: string) => k in store),
      keys: vi.fn(async () => Object.keys(store)),
    };
  }

  it('get() delegates to VaultBackend', async () => {
    const vb = makeVaultBackend({ K: 'vault-val' });
    const sm = new SecretsManager({ backend: 'vault', _vaultBackend: vb as never });
    await sm.initialize();
    expect(await sm.get('K')).toBe('vault-val');
    expect(vb.get).toHaveBeenCalledWith('K');
  });

  it('set() delegates to VaultBackend and mirrors to process.env', async () => {
    const vb = makeVaultBackend();
    const sm = new SecretsManager({ backend: 'vault', _vaultBackend: vb as never });
    await sm.initialize();
    await sm.set('K', 'V');
    expect(vb.set).toHaveBeenCalledWith('K', 'V');
    expect(process.env['K']).toBe('V');
    delete process.env['K'];
  });

  it('delete() delegates to VaultBackend', async () => {
    const vb = makeVaultBackend({ K: 'v' });
    const sm = new SecretsManager({ backend: 'vault', _vaultBackend: vb as never });
    await sm.initialize();
    expect(await sm.delete('K')).toBe(true);
    expect(vb.delete).toHaveBeenCalledWith('K');
  });

  it('keys() delegates to VaultBackend', async () => {
    const vb = makeVaultBackend({ A: '1', B: '2' });
    const sm = new SecretsManager({ backend: 'vault', _vaultBackend: vb as never });
    await sm.initialize();
    expect(await sm.keys()).toEqual(['A', 'B']);
  });

  it('falls back to env on vault error when vaultFallback=true', async () => {
    const vb = {
      get: vi.fn(async () => {
        throw new Error('vault unreachable');
      }),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(),
      keys: vi.fn(async () => []),
    };
    process.env['FALLBACK_KEY'] = 'env-fallback';
    const sm = new SecretsManager({
      backend: 'vault',
      _vaultBackend: vb as never,
      vaultFallback: true,
    });
    await sm.initialize();
    expect(await sm.get('FALLBACK_KEY')).toBe('env-fallback');
    delete process.env['FALLBACK_KEY'];
  });

  it('throws on vault error when vaultFallback=false', async () => {
    const vb = {
      get: vi.fn(async () => {
        throw new Error('vault unreachable');
      }),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(),
      keys: vi.fn(async () => []),
    };
    const sm = new SecretsManager({
      backend: 'vault',
      _vaultBackend: vb as never,
      vaultFallback: false,
    });
    await sm.initialize();
    await expect(sm.get('K')).rejects.toThrow('vault unreachable');
  });

  it('throws when no vault config and no _vaultBackend', async () => {
    const sm = new SecretsManager({ backend: 'vault' });
    await expect(sm.initialize()).rejects.toThrow('vault config required');
  });
});

// ---------------------------------------------------------------------------
// auto backend
// ---------------------------------------------------------------------------

describe('SecretsManager — auto backend', () => {
  it('uses keyring when keyringManager is provided', async () => {
    const km = makeKeyringManager({ AUTO_KEY: 'auto-keyring' });
    const sm = new SecretsManager({ backend: 'auto', keyringManager: km as never });
    await sm.initialize();
    expect(await sm.get('AUTO_KEY')).toBe('auto-keyring');
    expect(km.getSecret).toHaveBeenCalled();
  });

  it('falls through to env when no keyringManager and no storePath', async () => {
    process.env['AUTO_ENV'] = 'env-auto';
    const sm = new SecretsManager({ backend: 'auto' });
    await sm.initialize();
    expect(await sm.get('AUTO_ENV')).toBe('env-auto');
    delete process.env['AUTO_ENV'];
  });
});
