import { describe, it, expect, vi } from 'vitest';
import { KeyringManager } from './manager.js';

// Mock the platform-specific providers
vi.mock('./linux-secret-service.js', () => ({
  LinuxSecretServiceProvider: class {
    isAvailable() {
      return false;
    }
    get() {
      return undefined;
    }
    set() {}
    delete() {}
    list() {
      return [];
    }
  },
}));

vi.mock('./macos-keychain.js', () => ({
  MacOSKeychainProvider: class {
    isAvailable() {
      return false;
    }
    get() {
      return undefined;
    }
    set() {}
    delete() {}
    list() {
      return [];
    }
  },
}));

vi.mock('./environment-provider.js', () => ({
  EnvironmentProvider: class {
    isAvailable() {
      return true;
    }
    get(_service: string, key: string) {
      return process.env[key];
    }
    set(_service: string, key: string, value: string) {
      process.env[key] = value;
    }
    delete(_service: string, key: string) {
      delete process.env[key];
    }
    list() {
      return [];
    }
  },
}));

describe('KeyringManager', () => {
  describe('initialize', () => {
    it('initializes with env backend', () => {
      const manager = new KeyringManager();
      expect(() => manager.initialize('env', [])).not.toThrow();
    });

    it('throws when keyring backend requested but none available', () => {
      const manager = new KeyringManager();
      expect(() => manager.initialize('keyring', [])).toThrow('no system keyring is available');
    });

    it('falls back to env when auto backend and no keyring available', () => {
      const manager = new KeyringManager();
      manager.initialize('auto', []);
      // Should not throw — falls back to env provider
      expect(manager.getProvider()).toBeDefined();
    });
  });

  describe('storeSecret / getSecret / deleteSecret', () => {
    it('stores and retrieves a secret via provider', () => {
      const manager = new KeyringManager();
      manager.initialize('env', []);
      process.env.MY_KEY = 'my-secret';
      const value = manager.getSecret('MY_KEY');
      expect(value).toBe('my-secret');
      delete process.env.MY_KEY;
    });

    it('storeSecret sets in provider and mirrors to process.env', () => {
      const manager = new KeyringManager();
      manager.initialize('env', []);
      manager.storeSecret('TEST_KEY', 'test-value');
      expect(process.env.TEST_KEY).toBe('test-value');
      delete process.env.TEST_KEY;
    });

    it('deleteSecret removes from provider and process.env', () => {
      process.env.TEST_DEL_KEY = 'to-delete';
      const manager = new KeyringManager();
      manager.initialize('env', []);
      manager.deleteSecret('TEST_DEL_KEY');
      expect(process.env.TEST_DEL_KEY).toBeUndefined();
    });
  });

  describe('getProvider', () => {
    it('returns the active provider', () => {
      const manager = new KeyringManager();
      const provider = manager.getProvider();
      expect(provider).toBeDefined();
    });
  });
});
