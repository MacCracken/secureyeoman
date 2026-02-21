import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EnvironmentProvider } from './environment-provider.js';

describe('EnvironmentProvider', () => {
  let provider: EnvironmentProvider;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    provider = new EnvironmentProvider();
    savedEnv['TEST_KEY'] = process.env['TEST_KEY'];
    savedEnv['SERVICE_IGNORED'] = process.env['SERVICE_IGNORED'];
    delete process.env['TEST_KEY'];
    delete process.env['SERVICE_IGNORED'];
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  });

  describe('name', () => {
    it('is "environment"', () => {
      expect(provider.name).toBe('environment');
    });
  });

  describe('isAvailable', () => {
    it('always returns true', () => {
      expect(provider.isAvailable()).toBe(true);
    });
  });

  describe('get', () => {
    it('returns the env var value for the given key', () => {
      process.env['TEST_KEY'] = 'my-secret';
      expect(provider.get('any-service', 'TEST_KEY')).toBe('my-secret');
    });

    it('returns undefined when env var is not set', () => {
      expect(provider.get('any-service', 'TEST_KEY')).toBeUndefined();
    });

    it('ignores the service parameter', () => {
      process.env['TEST_KEY'] = 'val';
      expect(provider.get('service-a', 'TEST_KEY')).toBe('val');
      expect(provider.get('service-b', 'TEST_KEY')).toBe('val');
    });
  });

  describe('set', () => {
    it('sets the env var', () => {
      provider.set('any-service', 'TEST_KEY', 'new-value');
      expect(process.env['TEST_KEY']).toBe('new-value');
    });

    it('overwrites an existing env var', () => {
      process.env['TEST_KEY'] = 'old';
      provider.set('any-service', 'TEST_KEY', 'new');
      expect(process.env['TEST_KEY']).toBe('new');
    });
  });

  describe('delete', () => {
    it('removes the env var', () => {
      process.env['TEST_KEY'] = 'value';
      provider.delete('any-service', 'TEST_KEY');
      expect(process.env['TEST_KEY']).toBeUndefined();
    });

    it('does not throw when key does not exist', () => {
      expect(() => provider.delete('any-service', 'TEST_KEY')).not.toThrow();
    });
  });
});
