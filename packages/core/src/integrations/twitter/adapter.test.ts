/**
 * Unit tests for TwitterIntegration adapter.
 *
 * twitter-api-v2 is fully mocked — no network calls made.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { IntegrationConfig, UnifiedMessage } from '@secureyeoman/shared';
import type { IntegrationDeps } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

// ── Stable mock references ─────────────────────────────────────────────────────

const mockMe = vi.fn().mockResolvedValue({ data: { id: 'user-123', username: 'testbot' } });
const mockUserMentionTimeline = vi.fn().mockResolvedValue({ data: { data: [] } });
const mockTweet = vi.fn().mockResolvedValue({ data: { id: 'tweet-abc' } });

// ── Mock twitter-api-v2 ───────────────────────────────────────────────────────

vi.mock('twitter-api-v2', () => {
  const MockTwitterApi = vi.fn().mockImplementation(function (this: any) {
    this.v2 = {
      me: mockMe,
      userMentionTimeline: mockUserMentionTimeline,
      tweet: mockTweet,
    };
  });

  return { TwitterApi: MockTwitterApi };
});

// ── Import adapter after mocks ────────────────────────────────────────────────

import { TwitterIntegration } from './adapter.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLogger(): SecureLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as SecureLogger;
}

function makeConfig(overrides: Partial<IntegrationConfig> = {}): IntegrationConfig {
  return {
    id: 'tw-test-id',
    platform: 'twitter',
    displayName: 'Test Twitter Bot',
    enabled: true,
    status: 'disconnected',
    config: {
      bearerToken: 'AAAA-test-bearer-token',
      apiKey: 'api-key',
      apiKeySecret: 'api-key-secret',
      accessToken: 'access-token',
      accessTokenSecret: 'access-token-secret',
    },
    messageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeDeps(onMessage = vi.fn().mockResolvedValue(undefined)): IntegrationDeps {
  return { logger: makeLogger(), onMessage };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TwitterIntegration', () => {
  let integration: TwitterIntegration;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    integration = new TwitterIntegration();
  });

  afterEach(async () => {
    await integration.stop();
    vi.useRealTimers();
  });

  // ── Platform metadata ──────────────────────────────────────────────────────

  it('should expose platform as "twitter"', () => {
    expect(integration.platform).toBe('twitter');
  });

  it('should expose a conservative platformRateLimit', () => {
    expect(integration.platformRateLimit.maxPerSecond).toBeLessThanOrEqual(0.1);
  });

  it('should not be healthy before init', () => {
    expect(integration.isHealthy()).toBe(false);
  });

  // ── init() ─────────────────────────────────────────────────────────────────

  describe('init()', () => {
    it('should initialize successfully with full OAuth credentials', async () => {
      await expect(integration.init(makeConfig(), makeDeps())).resolves.not.toThrow();
    });

    it('should initialize in read-only mode with bearerToken alone', async () => {
      const readOnlyConfig = makeConfig({
        config: { bearerToken: 'AAAA-bearer' },
      });
      await expect(integration.init(readOnlyConfig, makeDeps())).resolves.not.toThrow();
    });

    it('should throw when bearerToken is missing', async () => {
      await expect(
        integration.init(makeConfig({ config: {} }), makeDeps())
      ).rejects.toThrow('bearerToken');
    });

    it('should not be healthy after init but before start', async () => {
      await integration.init(makeConfig(), makeDeps());
      expect(integration.isHealthy()).toBe(false);
    });
  });

  // ── start() ────────────────────────────────────────────────────────────────

  describe('start()', () => {
    it('should resolve the authenticated user on start', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      expect(mockMe).toHaveBeenCalledOnce();
    });

    it('should be healthy after start', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      expect(integration.isHealthy()).toBe(true);
    });

    it('should throw when called before init', async () => {
      await expect(integration.start()).rejects.toThrow('not initialized');
    });

    it('should be idempotent — second start does nothing', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      await integration.start();
      expect(mockMe).toHaveBeenCalledTimes(1);
    });

    it('should continue without polling if me() fails', async () => {
      mockMe.mockRejectedValueOnce(new Error('Unauthorized'));
      const deps = makeDeps();
      await integration.init(makeConfig(), deps);
      await expect(integration.start()).resolves.not.toThrow();
      expect((deps.logger.warn as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    });
  });

  // ── stop() ─────────────────────────────────────────────────────────────────

  describe('stop()', () => {
    it('should set isHealthy to false', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      await integration.stop();
      expect(integration.isHealthy()).toBe(false);
    });

    it('should be safe to call before start', async () => {
      await integration.init(makeConfig(), makeDeps());
      await expect(integration.stop()).resolves.not.toThrow();
    });

    it('should be safe to call before init', async () => {
      await expect(integration.stop()).resolves.not.toThrow();
    });

    it('should be safe to call twice', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      await integration.stop();
      await expect(integration.stop()).resolves.not.toThrow();
    });
  });

  // ── isHealthy() ────────────────────────────────────────────────────────────

  describe('isHealthy()', () => {
    it('returns false before init', () => {
      expect(integration.isHealthy()).toBe(false);
    });

    it('returns false after init but before start', async () => {
      await integration.init(makeConfig(), makeDeps());
      expect(integration.isHealthy()).toBe(false);
    });

    it('returns true after start', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      expect(integration.isHealthy()).toBe(true);
    });

    it('returns false after stop', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      await integration.stop();
      expect(integration.isHealthy()).toBe(false);
    });
  });

  // ── poll() via timer ───────────────────────────────────────────────────────

  describe('mention polling', () => {
    it('should call userMentionTimeline after the poll interval elapses', async () => {
      await integration.init(
        makeConfig({ config: { bearerToken: 'AAAA', pollIntervalMs: 1000 } }),
        makeDeps()
      );
      await integration.start();

      expect(mockUserMentionTimeline).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1001);
      expect(mockUserMentionTimeline).toHaveBeenCalledOnce();
    });

    it('should normalise inbound mentions to UnifiedMessage with tw_ prefix', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      mockUserMentionTimeline.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: '1234567890',
              text: '@testbot hello there',
              author_id: 'author-42',
              created_at: '2026-01-01T12:00:00.000Z',
            },
          ],
          includes: {
            users: [{ id: 'author-42', username: 'alice', name: 'Alice' }],
          },
        },
      });

      await integration.init(
        makeConfig({ config: { bearerToken: 'AAAA', pollIntervalMs: 500 } }),
        makeDeps(onMessage)
      );
      await integration.start();
      await vi.advanceTimersByTimeAsync(501);

      expect(onMessage).toHaveBeenCalledOnce();
      const unified: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(unified.id).toBe('tw_1234567890');
      expect(unified.platform).toBe('twitter');
      expect(unified.direction).toBe('inbound');
      expect(unified.senderId).toBe('author-42');
      expect(unified.senderName).toBe('@alice');
      expect(unified.chatId).toBe('1234567890');
      expect(unified.text).toBe('@testbot hello there');
      expect(unified.metadata?.tweetId).toBe('1234567890');
      expect(unified.timestamp).toBe(new Date('2026-01-01T12:00:00.000Z').getTime());
    });

    it('should track sinceId to avoid duplicate delivery', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);

      // First poll returns one tweet
      mockUserMentionTimeline
        .mockResolvedValueOnce({
          data: {
            data: [{ id: '1000', text: 'first', author_id: 'u1', created_at: new Date().toISOString() }],
          },
        })
        // Second poll returns same tweet (older ID should be filtered by sinceId param)
        .mockResolvedValueOnce({
          data: { data: [] },
        });

      await integration.init(
        makeConfig({ config: { bearerToken: 'AAAA', pollIntervalMs: 100 } }),
        makeDeps(onMessage)
      );
      await integration.start();

      await vi.advanceTimersByTimeAsync(101);
      expect(onMessage).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(101);
      // Second poll returns empty — sinceId was passed
      expect(mockUserMentionTimeline.mock.calls[1][1]).toMatchObject({ since_id: '1000' });
      expect(onMessage).toHaveBeenCalledTimes(1);
    });

    it('should not deliver messages when user ID is unknown', async () => {
      mockMe.mockRejectedValueOnce(new Error('Unauthorized'));
      const onMessage = vi.fn();

      await integration.init(
        makeConfig({ config: { bearerToken: 'AAAA', pollIntervalMs: 100 } }),
        makeDeps(onMessage)
      );
      await integration.start();
      await vi.advanceTimersByTimeAsync(101);

      // userMentionTimeline should not have been called without a userId
      expect(mockUserMentionTimeline).not.toHaveBeenCalled();
      expect(onMessage).not.toHaveBeenCalled();
    });

    it('should log a warning and continue when poll throws', async () => {
      mockUserMentionTimeline.mockRejectedValueOnce(new Error('Rate limit exceeded'));
      const deps = makeDeps();

      await integration.init(
        makeConfig({ config: { bearerToken: 'AAAA', pollIntervalMs: 100 } }),
        deps
      );
      await integration.start();
      await vi.advanceTimersByTimeAsync(101);

      expect((deps.logger.warn as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
      expect(integration.isHealthy()).toBe(true);
    });
  });

  // ── sendMessage() ──────────────────────────────────────────────────────────

  describe('sendMessage()', () => {
    it('should post a reply tweet and return the new tweet ID', async () => {
      await integration.init(makeConfig(), makeDeps());
      const id = await integration.sendMessage('original-tweet-id', 'Hello back!');
      expect(mockTweet).toHaveBeenCalledWith({
        text: 'Hello back!',
        reply: { in_reply_to_tweet_id: 'original-tweet-id' },
      });
      expect(id).toBe('tweet-abc');
    });

    it('should post without reply when chatId is empty', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.sendMessage('', 'Standalone tweet');
      expect(mockTweet).toHaveBeenCalledWith({ text: 'Standalone tweet' });
    });

    it('should throw when called before init', async () => {
      await expect(integration.sendMessage('123', 'test')).rejects.toThrow('not initialized');
    });

    it('should throw in read-only mode (no OAuth credentials)', async () => {
      await integration.init(
        makeConfig({ config: { bearerToken: 'AAAA-only' } }),
        makeDeps()
      );
      await expect(integration.sendMessage('123', 'test')).rejects.toThrow(/OAuth/);
    });
  });
});
