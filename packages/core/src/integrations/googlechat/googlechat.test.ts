import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoogleChatIntegration } from './adapter.js';
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
    id: 'gc_int_1',
    platform: 'googlechat',
    displayName: 'Test Google Chat Bot',
    enabled: true,
    status: 'disconnected',
    config: { botToken: 'ya29_test_token', spaceId: 'spaces/ABC123' },
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

describe('GoogleChatIntegration', () => {
  let adapter: GoogleChatIntegration;

  beforeEach(() => {
    adapter = new GoogleChatIntegration();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('should have googlechat platform', () => {
    expect(adapter.platform).toBe('googlechat');
  });

  it('should have rate limit config', () => {
    expect(adapter.platformRateLimit).toEqual({ maxPerSecond: 5 });
  });

  it('should not be healthy before init', () => {
    expect(adapter.isHealthy()).toBe(false);
  });

  describe('init()', () => {
    it('should initialize successfully with valid config', async () => {
      await expect(adapter.init(makeConfig(), makeDeps())).resolves.not.toThrow();
    });

    it('should throw if botToken is missing', async () => {
      const config = makeConfig({ config: {} });
      await expect(adapter.init(config, makeDeps())).rejects.toThrow('botToken');
    });

    it('should accept config without spaceId', async () => {
      const config = makeConfig({ config: { botToken: 'ya29_test' } });
      await expect(adapter.init(config, makeDeps())).resolves.not.toThrow();
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
    it('should POST to Google Chat API', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ name: 'spaces/ABC/messages/msg_42' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('ABC123', 'Hello space');

      expect(id).toBe('spaces/ABC/messages/msg_42');
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('spaces/ABC123/messages');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Content-Type']).toBe('application/json');
      expect(opts.headers['Authorization']).toContain('Bearer');

      const body = JSON.parse(opts.body);
      expect(body.text).toBe('Hello space');
    });

    it('should include card messages when metadata has card', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ name: 'spaces/ABC/messages/msg_43' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const card = { header: { title: 'Test Card' }, sections: [] };
      await adapter.init(makeConfig(), makeDeps());
      await adapter.sendMessage('ABC123', 'Hello', { card });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.cards).toHaveLength(1);
      expect(body.cards[0].header.title).toBe('Test Card');
    });

    it('should throw on non-OK response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        text: () => Promise.resolve('Forbidden'),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.sendMessage('ABC123', 'test')).rejects.toThrow(
        'Failed to send Google Chat message'
      );
    });

    it('should return empty string when response has no name', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('ABC123', 'test');
      expect(id).toBe('');
    });
  });

  describe('spaceId management', () => {
    it('should return configured spaceId', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.getSpaceId()).toBe('spaces/ABC123');
    });

    it('should allow updating spaceId', async () => {
      await adapter.init(makeConfig(), makeDeps());
      adapter.setSpaceId('spaces/NEW456');
      expect(adapter.getSpaceId()).toBe('spaces/NEW456');
    });

    it('should default to empty string when no spaceId', async () => {
      await adapter.init(makeConfig({ config: { botToken: 'token' } }), makeDeps());
      expect(adapter.getSpaceId()).toBe('');
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
