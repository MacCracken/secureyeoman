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
    id: 'googlechat_int_1',
    platform: 'googlechat',
    displayName: 'Test Google Chat',
    enabled: true,
    status: 'disconnected',
    config: {
      botToken: 'my-bot-token',
      spaceId: 'spaces/AAAA1234',
    },
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

  it('should have platform "googlechat"', () => {
    expect(adapter.platform).toBe('googlechat');
  });

  it('should have rate limit of 5 per second', () => {
    expect(adapter.platformRateLimit).toEqual({ maxPerSecond: 5 });
  });

  it('should not be healthy before init', () => {
    expect(adapter.isHealthy()).toBe(false);
  });

  describe('init()', () => {
    it('should initialize successfully with valid config', async () => {
      await expect(adapter.init(makeConfig(), makeDeps())).resolves.not.toThrow();
    });

    it('should throw when botToken is missing', async () => {
      const cfg = makeConfig({ config: { spaceId: 'spaces/ABC' } });
      await expect(adapter.init(cfg, makeDeps())).rejects.toThrow(
        'Google Chat integration requires a botToken'
      );
    });

    it('should initialize without spaceId (optional field)', async () => {
      const cfg = makeConfig({ config: { botToken: 'my-token' } });
      await expect(adapter.init(cfg, makeDeps())).resolves.not.toThrow();
    });

    it('should expose the configured spaceId after init', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.getSpaceId()).toBe('spaces/AAAA1234');
    });
  });

  describe('start() / stop()', () => {
    it('should become healthy after start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should be idempotent — calling start twice is safe', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await expect(adapter.start()).resolves.not.toThrow();
      expect(adapter.isHealthy()).toBe(true);
    });

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
  });

  describe('sendMessage()', () => {
    it('should POST to the Google Chat API and return the message name', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ name: 'spaces/AAAA1234/messages/msg_1' }),
        text: () => Promise.resolve(''),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('AAAA1234', 'Hello Google Chat');

      expect(id).toBe('spaces/AAAA1234/messages/msg_1');
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('https://chat.googleapis.com/v1/spaces/AAAA1234/messages');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Content-Type']).toBe('application/json');
      expect(opts.headers['Authorization']).toBe('Bearer my-bot-token');
      const body = JSON.parse(opts.body);
      expect(body.text).toBe('Hello Google Chat');
    });

    it('should include card in body when metadata.card is present', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ name: 'spaces/X/messages/1' }),
        text: () => Promise.resolve(''),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const card = { header: { title: 'Test Card' } };
      await adapter.sendMessage('AAAA1234', 'With card', { card });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.cards).toEqual([card]);
    });

    it('should throw when the API returns a non-OK response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        text: () => Promise.resolve('Unauthorized'),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.sendMessage('AAAA1234', 'Hello')).rejects.toThrow(
        'Failed to send Google Chat message'
      );
    });

    it('should return empty string when response has no name field', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(''),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('AAAA1234', 'Hello');
      expect(id).toBe('');
    });
  });

  describe('getSpaceId() / setSpaceId()', () => {
    it('should return the spaceId set during init', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.getSpaceId()).toBe('spaces/AAAA1234');
    });

    it('should update spaceId via setSpaceId()', async () => {
      await adapter.init(makeConfig(), makeDeps());
      adapter.setSpaceId('spaces/NEW_ID');
      expect(adapter.getSpaceId()).toBe('spaces/NEW_ID');
    });

    it('should return empty string when spaceId not configured', async () => {
      await adapter.init(makeConfig({ config: { botToken: 'tok' } }), makeDeps());
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
