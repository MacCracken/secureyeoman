import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { YouTubeIntegration } from './adapter.js';
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
    id: 'youtube_int_1',
    platform: 'youtube',
    displayName: 'Test YouTube',
    enabled: true,
    status: 'disconnected',
    config: {
      apiKey: 'AIzaTestKey',
      channelId: 'UCTestChannel123',
      maxResults: 10,
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

function makeSearchItem(
  videoId: string,
  title: string,
  channelId = 'UCTestChannel123',
  publishedAt = '2024-06-01T12:00:00Z',
  description?: string
) {
  return {
    id: { videoId },
    snippet: {
      title,
      description: description ?? '',
      publishedAt,
      channelId,
      channelTitle: 'Test Channel',
    },
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('YouTubeIntegration', () => {
  let adapter: YouTubeIntegration;

  beforeEach(() => {
    adapter = new YouTubeIntegration();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should have platform "youtube"', () => {
    expect(adapter.platform).toBe('youtube');
  });

  it('should have rate limit of 5 per second', () => {
    expect(adapter.platformRateLimit).toEqual({ maxPerSecond: 5 });
  });

  it('should not be healthy before init', () => {
    expect(adapter.isHealthy()).toBe(false);
  });

  // ── init() ────────────────────────────────────────────────────────

  describe('init()', () => {
    it('should initialize successfully with valid config', async () => {
      await expect(adapter.init(makeConfig(), makeDeps())).resolves.not.toThrow();
    });

    it('should throw when apiKey is missing', async () => {
      const cfg = makeConfig({ config: { channelId: 'UCTestChannel123' } });
      await expect(adapter.init(cfg, makeDeps())).rejects.toThrow(
        'YouTube integration requires an apiKey'
      );
    });

    it('should initialize without channelId (polling will be skipped)', async () => {
      const cfg = makeConfig({ config: { apiKey: 'AIzaTestKey' } });
      await expect(adapter.init(cfg, makeDeps())).resolves.not.toThrow();
    });
  });

  // ── start() / stop() ──────────────────────────────────────────────

  describe('start() / stop()', () => {
    it('should become healthy after start', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should be idempotent — calling start twice is safe', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await expect(adapter.start()).resolves.not.toThrow();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should throw if start is called before init', async () => {
      await expect(adapter.start()).rejects.toThrow('not initialized');
    });

    it('should become unhealthy after stop', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.stop();
      expect(adapter.isHealthy()).toBe(false);
    });

    it('should be safe to call stop without start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.stop()).resolves.not.toThrow();
    });

    it('should not poll when no channelId is configured', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      const cfg = makeConfig({ config: { apiKey: 'AIzaTestKey' } });
      await adapter.init(cfg, makeDeps());
      await adapter.start();

      expect(adapter.isHealthy()).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should seed seen video IDs on start to avoid re-dispatching existing videos', async () => {
      const existingItem = makeSearchItem('vid_existing', 'Old Video');
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [existingItem] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));
      await adapter.start();

      expect(onMessage).not.toHaveBeenCalled();
    });

    it('should clear the poll timer and stop dispatching messages after stop()', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const cfg = makeConfig({
        config: { apiKey: 'AIzaTestKey', channelId: 'UCTestChannel123', pollIntervalMs: 1000 },
      });
      await adapter.init(cfg, makeDeps());
      await adapter.start();
      await adapter.stop();

      const callsBeforeStop = mockFetch.mock.calls.length;
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockFetch.mock.calls.length).toBe(callsBeforeStop);
    });
  });

  // ── sendMessage() ─────────────────────────────────────────────────

  describe('sendMessage()', () => {
    it('should return the text unchanged (read-only no-op)', async () => {
      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.sendMessage('UCTestChannel123', 'Hello YouTube');
      expect(result).toBe('Hello YouTube');
    });

    it('should warn that sendMessage is read-only', async () => {
      const warnFn = vi.fn();
      const logger = { ...noopLogger(), warn: warnFn };

      await adapter.init(makeConfig(), { logger, onMessage: vi.fn().mockResolvedValue(undefined) });
      await adapter.sendMessage('_', 'Test');

      expect(warnFn).toHaveBeenCalledWith(
        'YouTube sendMessage is read-only; no action taken',
        expect.objectContaining({ text: 'Test' })
      );
    });

    it('should not make any network requests', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await adapter.sendMessage('_', 'No fetch');

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ── poll() via timer ──────────────────────────────────────────────

  describe('poll() (internal, triggered via setInterval)', () => {
    it('should dispatch new videos as UnifiedMessages', async () => {
      const newItem = makeSearchItem('vid_new1', 'New Video Title', 'UCTestChannel123');

      const mockFetch = vi
        .fn()
        // seedSeenVideos: empty
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [] }) })
        // poll: returns one new video
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [newItem] }) });
      vi.stubGlobal('fetch', mockFetch);

      const onMessage = vi.fn().mockResolvedValue(undefined);
      const cfg = makeConfig({
        config: { apiKey: 'AIzaTestKey', channelId: 'UCTestChannel123', pollIntervalMs: 1000 },
      });
      await adapter.init(cfg, makeDeps(onMessage));
      await adapter.start();

      await vi.advanceTimersByTimeAsync(1000);
      expect(onMessage).toHaveBeenCalledTimes(1);

      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.platform).toBe('youtube');
      expect(msg.direction).toBe('inbound');
      expect(msg.platformMessageId).toBe('vid_new1');
      expect(msg.text).toContain('New video: New Video Title');
      expect(msg.integrationId).toBe('youtube_int_1');
      expect(msg.chatId).toBe('UCTestChannel123');
      expect(msg.senderId).toBe('UCTestChannel123');
      expect(msg.senderName).toBe('Test Channel');
      expect(msg.metadata?.['videoId']).toBe('vid_new1');
      expect(msg.metadata?.['videoUrl']).toBe('https://www.youtube.com/watch?v=vid_new1');
      expect(msg.timestamp).toBe(new Date('2024-06-01T12:00:00Z').getTime());

      await adapter.stop();
    });

    it('should not re-dispatch videos seen during seed', async () => {
      const existingItem = makeSearchItem('vid_existing', 'Old Video');

      const mockFetch = vi
        .fn()
        // seedSeenVideos: returns existing
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [existingItem] }) })
        // poll: same video
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: [existingItem] }),
        });
      vi.stubGlobal('fetch', mockFetch);

      const onMessage = vi.fn().mockResolvedValue(undefined);
      const cfg = makeConfig({
        config: { apiKey: 'AIzaTestKey', channelId: 'UCTestChannel123', pollIntervalMs: 1000 },
      });
      await adapter.init(cfg, makeDeps(onMessage));
      await adapter.start();

      await vi.advanceTimersByTimeAsync(1000);
      expect(onMessage).not.toHaveBeenCalled();

      await adapter.stop();
    });

    it('should not re-dispatch a new video on the second poll', async () => {
      const newItem = makeSearchItem('vid_once', 'One-Time Video');

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [] }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [newItem] }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [newItem] }) });
      vi.stubGlobal('fetch', mockFetch);

      const onMessage = vi.fn().mockResolvedValue(undefined);
      const cfg = makeConfig({
        config: { apiKey: 'AIzaTestKey', channelId: 'UCTestChannel123', pollIntervalMs: 1000 },
      });
      await adapter.init(cfg, makeDeps(onMessage));
      await adapter.start();

      await vi.advanceTimersByTimeAsync(1000);
      expect(onMessage).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1000);
      expect(onMessage).toHaveBeenCalledTimes(1);

      await adapter.stop();
    });

    it('should skip items without a videoId', async () => {
      const itemWithoutVideoId = {
        id: {}, // no videoId
        snippet: {
          title: 'No ID Video',
          channelId: 'UCTestChannel123',
          channelTitle: 'Test Channel',
        },
      };

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [] }) })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: [itemWithoutVideoId] }),
        });
      vi.stubGlobal('fetch', mockFetch);

      const onMessage = vi.fn().mockResolvedValue(undefined);
      const cfg = makeConfig({
        config: { apiKey: 'AIzaTestKey', channelId: 'UCTestChannel123', pollIntervalMs: 1000 },
      });
      await adapter.init(cfg, makeDeps(onMessage));
      await adapter.start();

      await vi.advanceTimersByTimeAsync(1000);
      expect(onMessage).not.toHaveBeenCalled();

      await adapter.stop();
    });

    it('should include description snippet (up to 200 chars) in message text', async () => {
      const longDesc = 'A'.repeat(300);
      const newItem = makeSearchItem(
        'vid_desc',
        'Described Video',
        'UCTestChannel123',
        '2024-06-01T12:00:00Z',
        longDesc
      );

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [] }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [newItem] }) });
      vi.stubGlobal('fetch', mockFetch);

      const onMessage = vi.fn().mockResolvedValue(undefined);
      const cfg = makeConfig({
        config: { apiKey: 'AIzaTestKey', channelId: 'UCTestChannel123', pollIntervalMs: 1000 },
      });
      await adapter.init(cfg, makeDeps(onMessage));
      await adapter.start();

      await vi.advanceTimersByTimeAsync(1000);
      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.text).toContain('Described Video');
      expect(msg.text).toContain('A'.repeat(200));
      expect(msg.text).not.toContain('A'.repeat(201));

      await adapter.stop();
    });

    it('should warn on poll failure and not throw', async () => {
      const warnFn = vi.fn();
      const logger = { ...noopLogger(), warn: warnFn };

      const mockFetch = vi
        .fn()
        // seedSeenVideos: empty
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [] }) })
        // search request fails
        .mockResolvedValueOnce({ ok: false, status: 403 });
      vi.stubGlobal('fetch', mockFetch);

      const cfg = makeConfig({
        config: { apiKey: 'AIzaTestKey', channelId: 'UCTestChannel123', pollIntervalMs: 1000 },
      });
      await adapter.init(cfg, { logger, onMessage: vi.fn().mockResolvedValue(undefined) });
      await adapter.start();

      await vi.advanceTimersByTimeAsync(1000);
      // The failed search returns [] but the poll completes without throwing
      // The warn here is within fetchLatestVideos which warns on non-OK
      expect(warnFn).toHaveBeenCalledWith(
        'YouTube search failed',
        expect.objectContaining({ status: 403 })
      );

      await adapter.stop();
    });

    it('should use Date.now() for timestamp when publishedAt is absent', async () => {
      const itemNoDate = {
        id: { videoId: 'vid_nodate' },
        snippet: {
          title: 'No Date Video',
          channelId: 'UCTestChannel123',
          channelTitle: 'Test Channel',
          // no publishedAt
        },
      };

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [] }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [itemNoDate] }) });
      vi.stubGlobal('fetch', mockFetch);

      const before = Date.now();
      const onMessage = vi.fn().mockResolvedValue(undefined);
      const cfg = makeConfig({
        config: { apiKey: 'AIzaTestKey', channelId: 'UCTestChannel123', pollIntervalMs: 1000 },
      });
      await adapter.init(cfg, makeDeps(onMessage));
      await adapter.start();

      await vi.advanceTimersByTimeAsync(1000);
      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      const after = Date.now();
      expect(msg.timestamp).toBeGreaterThanOrEqual(before);
      expect(msg.timestamp).toBeLessThanOrEqual(after);

      await adapter.stop();
    });
  });

  // ── isHealthy() ───────────────────────────────────────────────────

  describe('isHealthy()', () => {
    it('should return false before start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.isHealthy()).toBe(false);
    });

    it('should return true after start', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should return false after stop', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.stop();
      expect(adapter.isHealthy()).toBe(false);
    });
  });

  // ── testConnection() ─────────────────────────────────────────────

  describe('testConnection()', () => {
    it('should return ok=true with the channel title', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [{ snippet: { title: 'My Awesome Channel' } }] }),
        statusText: 'OK',
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();

      expect(result.ok).toBe(true);
      expect(result.message).toContain('My Awesome Channel');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('https://www.googleapis.com/youtube/v3/channels');
      expect(url).toContain('UCTestChannel123');
      expect(url).toContain('AIzaTestKey');
    });

    it('should return "unknown channel" when items array is empty', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
        statusText: 'OK',
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();

      expect(result.ok).toBe(true);
      expect(result.message).toContain('unknown channel');
    });

    it('should return ok=false when not initialized', async () => {
      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
      expect(result.message).toBe('Not initialized');
    });

    it('should return ok=false when API returns a non-OK response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Forbidden',
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();

      expect(result.ok).toBe(false);
      expect(result.message).toContain('Forbidden');
    });

    it('should return ok=false when fetch throws a network error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();

      expect(result.ok).toBe(false);
      expect(result.message).toContain('Network error');
    });

    it('should use default fallback channelId when none is configured', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
        statusText: 'OK',
      });
      vi.stubGlobal('fetch', mockFetch);

      const cfg = makeConfig({ config: { apiKey: 'AIzaTestKey' } });
      await adapter.init(cfg, makeDeps());
      const result = await adapter.testConnection();

      expect(result.ok).toBe(true);
      const [url] = mockFetch.mock.calls[0];
      // Should use the fallback placeholder channel ID
      expect(url).toContain('UCxxxxxxxxxxxxxx');
    });
  });
});
