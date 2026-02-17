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

  it('should have cli platform', () => {
    expect(adapter.platform).toBe('cli');
  });

  it('should have rate limit config', () => {
    expect(adapter.platformRateLimit).toEqual({ maxPerSecond: 100 });
  });

  it('should not be healthy before init', () => {
    expect(adapter.isHealthy()).toBe(false);
  });

  describe('init()', () => {
    it('should initialize successfully', async () => {
      await expect(adapter.init(makeConfig(), makeDeps())).resolves.not.toThrow();
    });

    it('should accept empty config', async () => {
      await expect(adapter.init(makeConfig({ config: {} }), makeDeps())).resolves.not.toThrow();
    });
  });

  describe('start() / stop()', () => {
    it('should start and become healthy', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should not start twice', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.start(); // no-op
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should stop and become unhealthy', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.stop();
      expect(adapter.isHealthy()).toBe(false);
    });

    it('should be safe to call stop without start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.stop()).resolves.not.toThrow();
    });
  });

  describe('sendMessage()', () => {
    it('should return empty string (no-op)', async () => {
      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('chat1', 'Hello');
      expect(id).toBe('');
    });

    it('should accept metadata without error', async () => {
      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('chat1', 'Hello', { foo: 'bar' });
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
