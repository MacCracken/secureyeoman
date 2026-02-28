/**
 * Twitter Routes — unit tests
 *
 * Tests the Fastify route handlers for Twitter/X API v2 proxy:
 *   GET    /api/v1/twitter/profile
 *   GET    /api/v1/twitter/search
 *   GET    /api/v1/twitter/tweets/:tweetId
 *   GET    /api/v1/twitter/mentions
 *   GET    /api/v1/twitter/timeline
 *   GET    /api/v1/twitter/users/:username
 *   POST   /api/v1/twitter/tweets
 *   POST   /api/v1/twitter/tweets/:tweetId/like
 *   POST   /api/v1/twitter/tweets/:tweetId/retweet
 *   DELETE /api/v1/twitter/tweets/:tweetId/retweet
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerTwitterRoutes } from './twitter-routes.js';
import type { IntegrationManager } from '../manager.js';
import type { SoulManager } from '../../soul/manager.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

const TWITTER_INTEGRATION = {
  id: 'intg-twitter-1',
  platform: 'twitter',
  enabled: true,
  config: {
    bearerToken: 'bt-abc',
    apiKey: 'key-abc',
    apiKeySecret: 'keysecret-abc',
    accessToken: 'at-abc',
    accessTokenSecret: 'atsecret-abc',
    username: 'testuser',
  },
};

// Full mock of the twitter-api-v2 TwitterApi class
const mockV2 = {
  me: vi.fn().mockResolvedValue({ data: { id: 'uid-1', username: 'testuser', name: 'Test User' } }),
  search: vi.fn().mockResolvedValue({ data: { data: [], meta: {} } }),
  singleTweet: vi.fn().mockResolvedValue({ data: { id: 'tw-1', text: 'hello' } }),
  userMentionTimeline: vi.fn().mockResolvedValue({ data: { data: [] } }),
  homeTimeline: vi.fn().mockResolvedValue({ data: { data: [] } }),
  userByUsername: vi.fn().mockResolvedValue({ data: { id: 'uid-2', username: 'other' } }),
  tweet: vi.fn().mockResolvedValue({ data: { id: 'tw-new', text: 'posted' } }),
  like: vi.fn().mockResolvedValue({ data: { liked: true } }),
  retweet: vi.fn().mockResolvedValue({ data: { retweeted: true } }),
  unretweet: vi.fn().mockResolvedValue({ data: { retweeted: false } }),
};

const mockV1 = {
  uploadMedia: vi.fn().mockResolvedValue('media-id-123'),
};

vi.mock('twitter-api-v2', () => ({
  TwitterApi: function MockTwitterApi(this: { v2: typeof mockV2; v1: typeof mockV1 }) {
    this.v2 = mockV2;
    this.v1 = mockV1;
  },
}));

function mockIntegrationManager(opts?: { noIntegrations?: boolean; configOverride?: Partial<typeof TWITTER_INTEGRATION['config']> }): IntegrationManager {
  const integrations = opts?.noIntegrations
    ? []
    : [
        {
          ...TWITTER_INTEGRATION,
          config: { ...TWITTER_INTEGRATION.config, ...opts?.configOverride },
        },
      ];
  return {
    listIntegrations: vi.fn().mockResolvedValue(integrations),
  } as unknown as IntegrationManager;
}

function mockSoulManager(mode = 'auto'): SoulManager {
  return {
    getActivePersonality: vi.fn().mockResolvedValue({
      id: 'p-1',
      body: {
        integrationAccess: [{ id: 'intg-twitter-1', mode }],
      },
    }),
  } as unknown as SoulManager;
}

async function buildApp(
  integrationManager: IntegrationManager,
  soulManager?: SoulManager
) {
  const app = Fastify({ logger: false });
  registerTwitterRoutes(app, { integrationManager, soulManager });
  await app.ready();
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Twitter Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset all mock implementations to their defaults
    mockV2.me.mockResolvedValue({ data: { id: 'uid-1', username: 'testuser', name: 'Test User' } });
    mockV2.search.mockResolvedValue({ data: { data: [], meta: {} } });
    mockV2.singleTweet.mockResolvedValue({ data: { id: 'tw-1', text: 'hello' } });
    mockV2.tweet.mockResolvedValue({ data: { id: 'tw-new', text: 'posted' } });
    mockV2.like.mockResolvedValue({ data: { liked: true } });
    mockV2.retweet.mockResolvedValue({ data: { retweeted: true } });
    mockV2.unretweet.mockResolvedValue({ data: { retweeted: false } });
  });

  // ── No integration configured ──────────────────────────────────────────────

  it('returns 404 when no Twitter integration configured', async () => {
    const app = await buildApp(mockIntegrationManager({ noIntegrations: true }));
    const res = await app.inject({ method: 'GET', url: '/api/v1/twitter/profile' });
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toMatch(/no twitter integration/i);
  });

  it('returns 404 when credentials are insufficient (no bearer, no oauth)', async () => {
    const app = await buildApp(
      mockIntegrationManager({
        configOverride: {
          bearerToken: undefined,
          apiKey: undefined,
          apiKeySecret: undefined,
          accessToken: undefined,
          accessTokenSecret: undefined,
        },
      })
    );
    const res = await app.inject({ method: 'GET', url: '/api/v1/twitter/profile' });
    expect(res.statusCode).toBe(404);
  });

  // ── GET /api/v1/twitter/profile ───────────────────────────────────────────

  describe('GET /api/v1/twitter/profile', () => {
    it('returns profile in suggest mode (default when no personality override)', async () => {
      const app = await buildApp(mockIntegrationManager());
      const res = await app.inject({ method: 'GET', url: '/api/v1/twitter/profile' });
      expect(res.statusCode).toBe(200);
      expect(res.json().username).toBe('testuser');
      expect(res.json().mode).toBe('suggest');
    });

    it('returns 400 when only bearer token configured (no user-context)', async () => {
      const app = await buildApp(
        mockIntegrationManager({
          configOverride: {
            apiKey: undefined,
            apiKeySecret: undefined,
            accessToken: undefined,
            accessTokenSecret: undefined,
          },
        })
      );
      const res = await app.inject({ method: 'GET', url: '/api/v1/twitter/profile' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 500 on Twitter API error', async () => {
      mockV2.me.mockRejectedValue(new Error('Rate limited'));
      const app = await buildApp(mockIntegrationManager());
      const res = await app.inject({ method: 'GET', url: '/api/v1/twitter/profile' });
      expect(res.statusCode).toBe(500);
    });
  });

  // ── GET /api/v1/twitter/search ────────────────────────────────────────────

  describe('GET /api/v1/twitter/search', () => {
    it('returns search results', async () => {
      mockV2.search.mockResolvedValue({
        data: { data: [{ id: 'tw-1', text: 'hello world' }], meta: {} },
      });
      const app = await buildApp(mockIntegrationManager());
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/twitter/search?q=hello',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(1);
    });

    it('returns 400 when q param missing', async () => {
      const app = await buildApp(mockIntegrationManager());
      const res = await app.inject({ method: 'GET', url: '/api/v1/twitter/search' });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── GET /api/v1/twitter/tweets/:tweetId ──────────────────────────────────

  describe('GET /api/v1/twitter/tweets/:tweetId', () => {
    it('returns single tweet', async () => {
      const app = await buildApp(mockIntegrationManager());
      const res = await app.inject({ method: 'GET', url: '/api/v1/twitter/tweets/tw-1' });
      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe('tw-1');
    });
  });

  // ── POST /api/v1/twitter/tweets (posting) ────────────────────────────────

  describe('POST /api/v1/twitter/tweets', () => {
    it('posts a tweet in auto mode', async () => {
      const app = await buildApp(mockIntegrationManager(), mockSoulManager('auto'));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/twitter/tweets',
        payload: { text: 'Hello Twitter!' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().id).toBe('tw-new');
    });

    it('returns 403 in suggest mode', async () => {
      const app = await buildApp(mockIntegrationManager(), mockSoulManager('suggest'));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/twitter/tweets',
        payload: { text: 'Hello!' },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toMatch(/suggest/i);
    });

    it('returns draft preview in draft mode without posting', async () => {
      const app = await buildApp(mockIntegrationManager(), mockSoulManager('draft'));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/twitter/tweets',
        payload: { text: 'Draft tweet' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.draftMode).toBe(true);
      expect(body.preview.text).toBe('Draft tweet');
      // Should NOT have actually called the twitter API
      expect(mockV2.tweet).not.toHaveBeenCalled();
    });

    it('returns 400 when only bearer token configured (no user-context for posting)', async () => {
      const app = await buildApp(
        mockIntegrationManager({
          configOverride: {
            apiKey: undefined,
            apiKeySecret: undefined,
            accessToken: undefined,
            accessTokenSecret: undefined,
          },
        }),
        mockSoulManager('auto') // auto mode so credential check is reached
      );
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/twitter/tweets',
        payload: { text: 'hello' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── POST /api/v1/twitter/tweets/:tweetId/like ─────────────────────────────

  describe('POST /api/v1/twitter/tweets/:tweetId/like', () => {
    it('likes a tweet in auto mode', async () => {
      const app = await buildApp(mockIntegrationManager(), mockSoulManager('auto'));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/twitter/tweets/tw-1/like',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().liked).toBe(true);
    });

    it('returns 403 in non-auto mode', async () => {
      const app = await buildApp(mockIntegrationManager(), mockSoulManager('draft'));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/twitter/tweets/tw-1/like',
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ── POST /api/v1/twitter/tweets/:tweetId/retweet ─────────────────────────

  describe('POST /api/v1/twitter/tweets/:tweetId/retweet', () => {
    it('retweets in auto mode', async () => {
      const app = await buildApp(mockIntegrationManager(), mockSoulManager('auto'));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/twitter/tweets/tw-1/retweet',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().retweeted).toBe(true);
    });

    it('returns 403 in suggest mode', async () => {
      const app = await buildApp(mockIntegrationManager(), mockSoulManager('suggest'));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/twitter/tweets/tw-1/retweet',
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ── DELETE /api/v1/twitter/tweets/:tweetId/retweet ───────────────────────

  describe('DELETE /api/v1/twitter/tweets/:tweetId/retweet', () => {
    it('un-retweets in auto mode', async () => {
      const app = await buildApp(mockIntegrationManager(), mockSoulManager('auto'));
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/twitter/tweets/tw-1/retweet',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().retweeted).toBe(false);
    });

    it('returns 403 in non-auto mode', async () => {
      const app = await buildApp(mockIntegrationManager(), mockSoulManager('draft'));
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/twitter/tweets/tw-1/retweet',
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ── POST /api/v1/twitter/media/upload ────────────────────────────────────

  describe('POST /api/v1/twitter/media/upload', () => {
    it('returns 404 when no integration configured', async () => {
      const app = await buildApp(mockIntegrationManager({ noIntegrations: true }), mockSoulManager('auto'));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/twitter/media/upload',
        payload: { mimeType: 'image/jpeg', data: Buffer.from('fake').toString('base64') },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 when mode is not auto', async () => {
      const app = await buildApp(mockIntegrationManager(), mockSoulManager('suggest'));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/twitter/media/upload',
        payload: { mimeType: 'image/jpeg', data: Buffer.from('fake').toString('base64') },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toMatch(/auto/i);
    });

    it('returns 400 when only OAuth 2.0 token (no OAuth 1.0a)', async () => {
      const app = await buildApp(
        mockIntegrationManager({
          configOverride: {
            bearerToken: undefined,
            apiKey: undefined,
            apiKeySecret: undefined,
            accessToken: undefined,
            accessTokenSecret: undefined,
            oauth2AccessToken: 'oauth2-token-xyz',
          } as typeof TWITTER_INTEGRATION['config'] & { oauth2AccessToken?: string },
        }),
        mockSoulManager('auto')
      );
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/twitter/media/upload',
        payload: { mimeType: 'image/jpeg', data: Buffer.from('fake').toString('base64') },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toMatch(/oauth 1\.0a/i);
    });

    it('returns 400 when neither url nor data provided', async () => {
      const app = await buildApp(mockIntegrationManager(), mockSoulManager('auto'));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/twitter/media/upload',
        payload: { mimeType: 'image/jpeg' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toMatch(/url.*data|data.*url/i);
    });

    it('uploads via base64 data and returns mediaId', async () => {
      const app = await buildApp(mockIntegrationManager(), mockSoulManager('auto'));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/twitter/media/upload',
        payload: {
          mimeType: 'image/jpeg',
          data: Buffer.from('fake-image-bytes').toString('base64'),
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().mediaId).toBe('media-id-123');
      expect(mockV1.uploadMedia).toHaveBeenCalled();
    });
  });

  // ── OAuth 2.0 credential resolution ──────────────────────────────────────

  describe('OAuth 2.0 credential resolution', () => {
    const oauth2Config = {
      bearerToken: undefined,
      apiKey: undefined,
      apiKeySecret: undefined,
      accessToken: undefined,
      accessTokenSecret: undefined,
      oauth2AccessToken: 'oauth2-token-xyz',
    } as typeof TWITTER_INTEGRATION['config'] & { oauth2AccessToken?: string };

    it('creates userClient when oauth2AccessToken present (profile works)', async () => {
      const app = await buildApp(
        mockIntegrationManager({ configOverride: oauth2Config }),
        mockSoulManager('auto')
      );
      const res = await app.inject({ method: 'GET', url: '/api/v1/twitter/profile' });
      // profile requires userClient — OAuth 2.0 provides one
      expect(res.statusCode).toBe(200);
    });

    it('hasV1Auth false when oauth2AccessToken only — media upload returns 400', async () => {
      const app = await buildApp(
        mockIntegrationManager({ configOverride: oauth2Config }),
        mockSoulManager('auto')
      );
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/twitter/media/upload',
        payload: { mimeType: 'image/jpeg', data: Buffer.from('x').toString('base64') },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toMatch(/oauth 1\.0a/i);
    });
  });
});
