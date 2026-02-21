import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CliIntegration } from './adapter.js';
import type { IntegrationConfig } from '@secureyeoman/shared';
import type { IntegrationDeps } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

// ── Helpers ────────────────────────────────────────────────────────

function noopLogger(): SecureLogger {
  const noop = () => {};
  return {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => noopLogger(),
    level: 'silent',
  } as SecureLogger;
}

function makeConfig(overrides: Partial<IntegrationConfig> = {}): IntegrationConfig {
  return {
    id: 'cli_int_1',
    platform: 'cli',
    displayName: 'CLI Interface',
    enabled: true,
    status: 'disconnected',
    config: {},
    messageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeDeps(onMessage = vi.fn().mockResolvedValue(undefined)): IntegrationDeps {
  return { logger: noopLogger(), onMessage };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('CliIntegration', () => {
  let adapter: CliIntegration;

  beforeEach(() => {
    adapter = new CliIntegration();
    vi.clearAllMocks();
  });

  it('should have platform "cli"', () => {
    expect(adapter.platform).toBe('cli');
  });

  it('should have rate limit of 100 per second', () => {
    expect(adapter.platformRateLimit).toEqual({ maxPerSecond: 100 });
  });

  it('should not be healthy before init', () => {
    expect(adapter.isHealthy()).toBe(false);
  });

  describe('init()', () => {
    it('should initialize successfully', async () => {
      await expect(adapter.init(makeConfig(), makeDeps())).resolves.not.toThrow();
    });

    it('should accept empty config object without throwing', async () => {
      await expect(adapter.init(makeConfig({ config: {} }), makeDeps())).resolves.not.toThrow();
    });

    it('should not be healthy after init alone', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.isHealthy()).toBe(false);
    });
  });

  describe('start()', () => {
    it('should become healthy after start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should be idempotent — calling start twice does not throw', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await expect(adapter.start()).resolves.not.toThrow();
      expect(adapter.isHealthy()).toBe(true);
    });
  });

  describe('stop()', () => {
    it('should become unhealthy after stop', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.stop();
      expect(adapter.isHealthy()).toBe(false);
    });

    it('should be safe to call stop before start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.stop()).resolves.not.toThrow();
    });

    it('should be idempotent — calling stop twice does not throw', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.stop();
      await expect(adapter.stop()).resolves.not.toThrow();
    });
  });

  describe('sendMessage()', () => {
    it('should return an empty string (no-op)', async () => {
      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('chat1', 'Hello');
      expect(id).toBe('');
    });

    it('should accept metadata without error and still return empty string', async () => {
      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('chat1', 'Hello', { source: 'test' });
      expect(id).toBe('');
    });

    it('should work without init (gracefully returns empty string)', async () => {
      const id = await adapter.sendMessage('chat1', 'Hello');
      expect(id).toBe('');
    });
  });

  describe('isHealthy()', () => {
    it('should return false before start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.isHealthy()).toBe(false);
    });

    it('should return true after start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should return false after stop', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.stop();
      expect(adapter.isHealthy()).toBe(false);
    });
  });
});
