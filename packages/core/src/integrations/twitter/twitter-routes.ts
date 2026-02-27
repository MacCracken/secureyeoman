/**
 * Twitter Routes — Twitter/X API v2 proxy that enforces per-personality integration access modes.
 *
 * Credentials come from the stored Twitter integration config (not OAuthTokenService).
 * The active personality's integrationAccess mode is respected:
 *   auto   → full access (read + post + reply + like + retweet)
 *   draft  → read + returns dry-run preview for write operations (no actual posting)
 *   suggest → read-only (search, timeline, profile)
 *
 * Auth matrix:
 *   bearerToken only → read-only endpoints (search, single tweet)
 *   OAuth 1.0a      → all endpoints including write and home timeline
 */

import { TwitterApi } from 'twitter-api-v2';
import type { FastifyInstance } from 'fastify';
import type { IntegrationManager } from '../manager.js';
import type { SoulManager } from '../../soul/manager.js';
import { sendError } from '../../utils/errors.js';

export interface TwitterRoutesOptions {
  integrationManager: IntegrationManager;
  soulManager?: SoulManager;
}

interface TwitterCreds {
  readonlyClient: TwitterApi;
  /** Full user-context client — null when only bearerToken is configured. */
  userClient: TwitterApi | null;
  mode: string;
  integrationId: string;
  /** Stored username from the integration config (may be undefined). */
  configuredUsername?: string;
}

// ─── Helpers ──────────────────────────────────────────────────

async function resolveTwitterAccess(
  integrationManager: IntegrationManager,
  soulManager?: SoulManager
): Promise<TwitterCreds | null> {
  const twitterIntegrations = await integrationManager.listIntegrations({
    platform: 'twitter',
    enabled: true,
  });
  if (twitterIntegrations.length === 0 || !twitterIntegrations[0]) return null;

  let selected = twitterIntegrations[0];
  let mode = 'auto';

  if (soulManager) {
    try {
      const personality = await soulManager.getActivePersonality();
      const accessList = personality?.body?.integrationAccess ?? [];
      for (const access of accessList) {
        const match = twitterIntegrations.find((i) => i.id === access.id);
        if (match) {
          selected = match;
          mode = access.mode;
          break;
        }
      }
    } catch {
      // soulManager optional — default to 'auto'
    }
  }

  const cfg = selected.config as {
    bearerToken?: string;
    apiKey?: string;
    apiKeySecret?: string;
    accessToken?: string;
    accessTokenSecret?: string;
    username?: string;
  };

  if (!cfg.bearerToken && !(cfg.apiKey && cfg.apiKeySecret && cfg.accessToken && cfg.accessTokenSecret)) {
    return null;
  }

  const readonlyClient = cfg.bearerToken
    ? new TwitterApi(cfg.bearerToken)
    : new TwitterApi({
        appKey: cfg.apiKey!,
        appSecret: cfg.apiKeySecret!,
        accessToken: cfg.accessToken!,
        accessSecret: cfg.accessTokenSecret!,
      });

  const userClient =
    cfg.apiKey && cfg.apiKeySecret && cfg.accessToken && cfg.accessTokenSecret
      ? new TwitterApi({
          appKey: cfg.apiKey,
          appSecret: cfg.apiKeySecret,
          accessToken: cfg.accessToken,
          accessSecret: cfg.accessTokenSecret,
        })
      : null;

  return {
    readonlyClient,
    userClient,
    mode,
    integrationId: selected.id,
    configuredUsername: cfg.username,
  };
}

// ─── Route registration ────────────────────────────────────────

export function registerTwitterRoutes(app: FastifyInstance, opts: TwitterRoutesOptions): void {
  const { integrationManager, soulManager } = opts;

  // GET /api/v1/twitter/profile  — requires user-context OAuth
  app.get('/api/v1/twitter/profile', async (_req, reply) => {
    const creds = await resolveTwitterAccess(integrationManager, soulManager);
    if (!creds) {
      return sendError(reply, 404, 'No Twitter integration configured. Add a Twitter integration via Settings > Connections.');
    }
    if (!creds.userClient) {
      return sendError(reply, 400, 'Twitter profile lookup requires OAuth 1.0a credentials (apiKey, apiKeySecret, accessToken, accessTokenSecret).');
    }
    try {
      const result = await creds.userClient.v2.me({
        'user.fields': ['description', 'public_metrics', 'profile_image_url', 'created_at', 'verified'],
      });
      return reply.send({ ...result.data, mode: creds.mode, integrationId: creds.integrationId });
    } catch (err) {
      return sendError(reply, 500, `Twitter API error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  // GET /api/v1/twitter/search?q=&maxResults=&nextToken=
  app.get<{ Querystring: { q?: string; maxResults?: string; nextToken?: string } }>(
    '/api/v1/twitter/search',
    async (req, reply) => {
      const creds = await resolveTwitterAccess(integrationManager, soulManager);
      if (!creds) return sendError(reply, 404, 'No Twitter integration configured.');

      const q = req.query.q;
      if (!q) return sendError(reply, 400, 'Query parameter "q" is required.');

      try {
        const result = await creds.readonlyClient.v2.search(q, {
          'tweet.fields': ['author_id', 'created_at', 'public_metrics', 'text', 'lang'],
          expansions: ['author_id'],
          'user.fields': ['name', 'username', 'profile_image_url'],
          max_results: Math.min(Number(req.query.maxResults ?? 10), 100),
          ...(req.query.nextToken ? { next_token: req.query.nextToken } : {}),
        });
        return reply.send(result.data);
      } catch (err) {
        return sendError(reply, 500, `Twitter API error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // GET /api/v1/twitter/tweets/:tweetId
  app.get<{ Params: { tweetId: string } }>(
    '/api/v1/twitter/tweets/:tweetId',
    async (req, reply) => {
      const creds = await resolveTwitterAccess(integrationManager, soulManager);
      if (!creds) return sendError(reply, 404, 'No Twitter integration configured.');

      try {
        const result = await creds.readonlyClient.v2.singleTweet(req.params.tweetId, {
          'tweet.fields': ['author_id', 'created_at', 'public_metrics', 'text', 'entities', 'referenced_tweets'],
          expansions: ['author_id', 'referenced_tweets.id'],
          'user.fields': ['name', 'username', 'profile_image_url'],
        });
        return reply.send(result.data);
      } catch (err) {
        return sendError(reply, 500, `Twitter API error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // GET /api/v1/twitter/mentions?maxResults=&sinceId=
  app.get<{ Querystring: { maxResults?: string; sinceId?: string } }>(
    '/api/v1/twitter/mentions',
    async (req, reply) => {
      const creds = await resolveTwitterAccess(integrationManager, soulManager);
      if (!creds) return sendError(reply, 404, 'No Twitter integration configured.');
      if (!creds.userClient) {
        return sendError(reply, 400, 'Mentions timeline requires OAuth 1.0a credentials.');
      }

      try {
        const me = await creds.userClient.v2.me();
        const result = await creds.userClient.v2.userMentionTimeline(me.data.id, {
          'tweet.fields': ['author_id', 'created_at', 'public_metrics', 'text'],
          expansions: ['author_id'],
          'user.fields': ['name', 'username', 'profile_image_url'],
          max_results: Math.min(Number(req.query.maxResults ?? 10), 100),
          ...(req.query.sinceId ? { since_id: req.query.sinceId } : {}),
        });
        return reply.send(result.data);
      } catch (err) {
        return sendError(reply, 500, `Twitter API error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // GET /api/v1/twitter/timeline?maxResults=
  app.get<{ Querystring: { maxResults?: string } }>(
    '/api/v1/twitter/timeline',
    async (req, reply) => {
      const creds = await resolveTwitterAccess(integrationManager, soulManager);
      if (!creds) return sendError(reply, 404, 'No Twitter integration configured.');
      if (!creds.userClient) {
        return sendError(reply, 400, 'Home timeline requires OAuth 1.0a credentials.');
      }

      try {
        const me = await creds.userClient.v2.me();
        const result = await creds.userClient.v2.homeTimeline({
          'tweet.fields': ['author_id', 'created_at', 'public_metrics', 'text'],
          expansions: ['author_id'],
          'user.fields': ['name', 'username', 'profile_image_url'],
          max_results: Math.min(Number(req.query.maxResults ?? 20), 100),
        });
        return reply.send({ ...result.data, selfId: me.data.id });
      } catch (err) {
        return sendError(reply, 500, `Twitter API error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // GET /api/v1/twitter/users/:username
  app.get<{ Params: { username: string } }>(
    '/api/v1/twitter/users/:username',
    async (req, reply) => {
      const creds = await resolveTwitterAccess(integrationManager, soulManager);
      if (!creds) return sendError(reply, 404, 'No Twitter integration configured.');

      try {
        const result = await creds.readonlyClient.v2.userByUsername(req.params.username, {
          'user.fields': ['description', 'public_metrics', 'profile_image_url', 'created_at', 'verified'],
        });
        return reply.send(result.data);
      } catch (err) {
        return sendError(reply, 500, `Twitter API error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // POST /api/v1/twitter/tweets  (mode: auto → post; draft → preview; suggest → 403)
  app.post<{ Body: { text: string; replyToTweetId?: string; quoteTweetId?: string } }>(
    '/api/v1/twitter/tweets',
    async (req, reply) => {
      const creds = await resolveTwitterAccess(integrationManager, soulManager);
      if (!creds) return sendError(reply, 404, 'No Twitter integration configured.');
      if (creds.mode === 'suggest') {
        return sendError(reply, 403, `Twitter mode is '${creds.mode}' — posting tweets is not permitted. The personality may only read.`);
      }

      const { text, replyToTweetId, quoteTweetId } = req.body;

      // Draft mode — return a preview without actually posting
      if (creds.mode === 'draft') {
        return reply.code(200).send({
          draftMode: true,
          preview: { text, replyToTweetId, quoteTweetId },
          message: 'Draft mode active — tweet NOT posted. Show this preview to the user and ask for confirmation before posting.',
        });
      }

      if (!creds.userClient) {
        return sendError(reply, 400, 'Posting tweets requires OAuth 1.0a credentials.');
      }

      try {
        const payload: Record<string, unknown> = { text };
        if (replyToTweetId) payload.reply = { in_reply_to_tweet_id: replyToTweetId };
        if (quoteTweetId) payload.quote_tweet_id = quoteTweetId;
        const result = await creds.userClient.v2.tweet(payload as Parameters<typeof creds.userClient.v2.tweet>[0]);
        return reply.code(201).send(result.data);
      } catch (err) {
        return sendError(reply, 500, `Twitter API error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // POST /api/v1/twitter/tweets/:tweetId/like
  app.post<{ Params: { tweetId: string } }>(
    '/api/v1/twitter/tweets/:tweetId/like',
    async (req, reply) => {
      const creds = await resolveTwitterAccess(integrationManager, soulManager);
      if (!creds) return sendError(reply, 404, 'No Twitter integration configured.');
      if (creds.mode !== 'auto') {
        return sendError(reply, 403, `Twitter mode is '${creds.mode}' — liking tweets requires 'auto' mode.`);
      }
      if (!creds.userClient) {
        return sendError(reply, 400, 'Liking tweets requires OAuth 1.0a credentials.');
      }

      try {
        const me = await creds.userClient.v2.me();
        const result = await creds.userClient.v2.like(me.data.id, req.params.tweetId);
        return reply.send(result.data);
      } catch (err) {
        return sendError(reply, 500, `Twitter API error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // POST /api/v1/twitter/tweets/:tweetId/retweet
  app.post<{ Params: { tweetId: string } }>(
    '/api/v1/twitter/tweets/:tweetId/retweet',
    async (req, reply) => {
      const creds = await resolveTwitterAccess(integrationManager, soulManager);
      if (!creds) return sendError(reply, 404, 'No Twitter integration configured.');
      if (creds.mode !== 'auto') {
        return sendError(reply, 403, `Twitter mode is '${creds.mode}' — retweeting requires 'auto' mode.`);
      }
      if (!creds.userClient) {
        return sendError(reply, 400, 'Retweeting requires OAuth 1.0a credentials.');
      }

      try {
        const me = await creds.userClient.v2.me();
        const result = await creds.userClient.v2.retweet(me.data.id, req.params.tweetId);
        return reply.send(result.data);
      } catch (err) {
        return sendError(reply, 500, `Twitter API error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // DELETE /api/v1/twitter/tweets/:tweetId/retweet  (undo retweet)
  app.delete<{ Params: { tweetId: string } }>(
    '/api/v1/twitter/tweets/:tweetId/retweet',
    async (req, reply) => {
      const creds = await resolveTwitterAccess(integrationManager, soulManager);
      if (!creds) return sendError(reply, 404, 'No Twitter integration configured.');
      if (creds.mode !== 'auto') {
        return sendError(reply, 403, `Twitter mode is '${creds.mode}' — unretweet requires 'auto' mode.`);
      }
      if (!creds.userClient) {
        return sendError(reply, 400, 'Unretweeting requires OAuth 1.0a credentials.');
      }

      try {
        const me = await creds.userClient.v2.me();
        const result = await creds.userClient.v2.unretweet(me.data.id, req.params.tweetId);
        return reply.send(result.data);
      } catch (err) {
        return sendError(reply, 500, `Twitter API error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );
}
