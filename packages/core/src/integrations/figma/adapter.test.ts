import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FigmaIntegration } from './adapter.js';
import type { IntegrationConfig, UnifiedMessage } from '@secureyeoman/shared';
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
    id: 'figma_int_1',
    platform: 'figma',
    displayName: 'Test Figma',
    enabled: true,
    status: 'disconnected',
    config: {
      accessToken: 'figma-access-token',
      fileKey: 'abc123filekey',
      pollIntervalMs: 999999, // effectively never fires during tests
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

describe('FigmaIntegration', () => {
  let adapter: FigmaIntegration;

  beforeEach(() => {
    adapter = new FigmaIntegration();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should have platform "figma"', () => {
    expect(adapter.platform).toBe('figma');
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

    it('should throw when accessToken is missing', async () => {
      const cfg = makeConfig({ config: { fileKey: 'abc123' } });
      await expect(adapter.init(cfg, makeDeps())).rejects.toThrow(
        'Figma integration requires an accessToken'
      );
    });

    it('should initialize without fileKey (polling will simply skip)', async () => {
      const cfg = makeConfig({ config: { accessToken: 'tok' } });
      await expect(adapter.init(cfg, makeDeps())).resolves.not.toThrow();
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

    it('should throw if start is called before init', async () => {
      await expect(adapter.start()).rejects.toThrow('not initialized');
    });

    it('should become unhealthy after stop', async () => {
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
    it('should POST a comment to the Figma file and return its ID', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'comment_abc' }),
        text: () => Promise.resolve(''),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('abc123filekey', 'Nice design!');

      expect(id).toBe('comment_abc');
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.figma.com/v1/files/abc123filekey/comments');
      expect(opts.method).toBe('POST');
      expect(opts.headers['X-Figma-Token']).toBe('figma-access-token');
      const body = JSON.parse(opts.body);
      expect(body.message).toBe('Nice design!');
    });

    it('should use the configured fileKey when chatId is empty', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'comment_xyz' }),
        text: () => Promise.resolve(''),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await adapter.sendMessage('', 'Using default file key');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/files/abc123filekey/comments');
    });

    it('should throw when no file key is available', async () => {
      const cfg = makeConfig({ config: { accessToken: 'tok' } });
      await adapter.init(cfg, makeDeps());
      await expect(adapter.sendMessage('', 'Hello')).rejects.toThrow('No Figma file key');
    });

    it('should throw when the API returns a non-OK response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        text: () => Promise.resolve('Forbidden'),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.sendMessage('abc123filekey', 'Hello')).rejects.toThrow(
        'Failed to post Figma comment'
      );
    });
  });

  describe('testConnection()', () => {
    it('should return ok=true with the connected user handle', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'user_1', handle: 'alice', email: 'alice@example.com' }),
        text: () => Promise.resolve(''),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();

      expect(result.ok).toBe(true);
      expect(result.message).toContain('alice');
      expect(result.message).toContain('alice@example.com');
    });

    it('should return ok=false when API returns a non-OK response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        text: () => Promise.resolve('Unauthorized'),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();

      expect(result.ok).toBe(false);
      expect(result.message).toContain('Figma API error');
    });

    it('should return ok=false when fetch throws a network error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();

      expect(result.ok).toBe(false);
      expect(result.message).toContain('Network error');
    });

    it('should use user.id when email is absent', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'user_42', handle: 'bob' }),
        text: () => Promise.resolve(''),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();

      expect(result.ok).toBe(true);
      expect(result.message).toContain('user_42');
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
