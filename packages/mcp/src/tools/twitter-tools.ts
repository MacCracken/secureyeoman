/**
 * Twitter Tools — MCP tools for reading and posting on Twitter/X.
 *
 * All tools proxy through the core API's /api/v1/twitter/* endpoints,
 * which enforce per-personality integration access modes:
 *   auto    → full access (read + post + reply + like + retweet)
 *   draft   → read + write operations return a dry-run preview for user confirmation
 *   suggest → read-only (search, timeline, profile, single tweet)
 *
 * Requires a Twitter integration configured via Settings > Connections > Twitter.
 * Write operations additionally require OAuth 1.0a credentials in the integration config.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';

export function registerTwitterTools(
  server: McpServer,
  client: CoreApiClient,
  middleware: ToolMiddleware
): void {
  // ── twitter_profile ──────────────────────────────────────────
  server.registerTool(
    'twitter_profile',
    {
      description:
        'Get the authenticated Twitter/X account profile — username, bio, follower counts, and current integration access mode. Requires OAuth 1.0a credentials.',
      inputSchema: {},
    },
    wrapToolHandler('twitter_profile', middleware, async () => {
      const result = await client.get('/api/v1/twitter/profile');
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── twitter_search ───────────────────────────────────────────
  server.registerTool(
    'twitter_search',
    {
      description:
        'Search recent tweets (last 7 days on free tier). Supports Twitter search operators: "from:username", "to:username", "#hashtag", "lang:en", "-word" (exclude), etc.',
      inputSchema: {
        q: z.string().describe('Twitter search query (e.g. "OpenAI from:sama", "#AI lang:en")'),
        maxResults: z
          .number()
          .int()
          .min(10)
          .max(100)
          .optional()
          .describe('Number of results (10–100, default 10)'),
        nextToken: z.string().optional().describe('Pagination token from a previous response'),
      },
    },
    wrapToolHandler('twitter_search', middleware, async (args) => {
      const query: Record<string, string> = { q: String(args.q) };
      if (args.maxResults) query.maxResults = String(args.maxResults);
      if (args.nextToken) query.nextToken = String(args.nextToken);
      const result = await client.get('/api/v1/twitter/search', query);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── twitter_get_tweet ────────────────────────────────────────
  server.registerTool(
    'twitter_get_tweet',
    {
      description: 'Fetch a single tweet by its ID, including author info, metrics (likes, retweets, replies), and referenced tweets.',
      inputSchema: {
        tweetId: z.string().describe('Tweet ID (the numeric string in the tweet URL)'),
      },
    },
    wrapToolHandler('twitter_get_tweet', middleware, async (args) => {
      const result = await client.get(`/api/v1/twitter/tweets/${args.tweetId}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── twitter_get_mentions ─────────────────────────────────────
  server.registerTool(
    'twitter_get_mentions',
    {
      description:
        'Get recent tweets that mention the authenticated account. Returns tweets with author info and metrics. Requires OAuth 1.0a credentials.',
      inputSchema: {
        maxResults: z
          .number()
          .int()
          .min(5)
          .max(100)
          .optional()
          .describe('Number of mentions to return (5–100, default 10)'),
        sinceId: z.string().optional().describe('Only return tweets newer than this tweet ID'),
      },
    },
    wrapToolHandler('twitter_get_mentions', middleware, async (args) => {
      const query: Record<string, string> = {};
      if (args.maxResults) query.maxResults = String(args.maxResults);
      if (args.sinceId) query.sinceId = String(args.sinceId);
      const result = await client.get('/api/v1/twitter/mentions', query);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── twitter_get_timeline ─────────────────────────────────────
  server.registerTool(
    'twitter_get_timeline',
    {
      description:
        'Get the authenticated account\'s home timeline (tweets from followed accounts). Requires OAuth 1.0a credentials.',
      inputSchema: {
        maxResults: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Number of tweets to return (1–100, default 20)'),
      },
    },
    wrapToolHandler('twitter_get_timeline', middleware, async (args) => {
      const query: Record<string, string> = {};
      if (args.maxResults) query.maxResults = String(args.maxResults);
      const result = await client.get('/api/v1/twitter/timeline', query);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── twitter_get_user ─────────────────────────────────────────
  server.registerTool(
    'twitter_get_user',
    {
      description: 'Look up a Twitter/X user by their @username. Returns bio, follower counts, and profile info.',
      inputSchema: {
        username: z.string().describe('Twitter username without the @ symbol (e.g. "sama", "OpenAI")'),
      },
    },
    wrapToolHandler('twitter_get_user', middleware, async (args) => {
      const result = await client.get(`/api/v1/twitter/users/${args.username}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── twitter_post_tweet ───────────────────────────────────────
  server.registerTool(
    'twitter_post_tweet',
    {
      description:
        'Post a new tweet. In "auto" mode: posts immediately and returns the tweet ID. In "draft" mode: returns a preview for user review — do NOT post until the user confirms. In "suggest" mode: not permitted. Twitter limit: ~17 tweets/day on free tier. Requires OAuth 1.0a or OAuth 2.0 credentials.',
      inputSchema: {
        text: z.string().max(280).describe('Tweet text (max 280 characters)'),
        replyToTweetId: z.string().optional().describe('Tweet ID to reply to (makes this a reply)'),
        quoteTweetId: z.string().optional().describe('Tweet ID to quote-tweet'),
        mediaIds: z
          .string()
          .array()
          .max(4)
          .optional()
          .describe('Up to 4 media IDs from twitter_upload_media to attach to the tweet'),
      },
    },
    wrapToolHandler('twitter_post_tweet', middleware, async (args) => {
      const result = await client.post('/api/v1/twitter/tweets', {
        text: args.text,
        replyToTweetId: args.replyToTweetId,
        quoteTweetId: args.quoteTweetId,
        mediaIds: args.mediaIds,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── twitter_upload_media ─────────────────────────────────────
  server.registerTool(
    'twitter_upload_media',
    {
      description:
        'Upload an image or video to Twitter for attaching to a tweet. Returns a mediaId. Use twitter_post_tweet with mediaIds to attach. Requires OAuth 1.0a credentials and auto mode.',
      inputSchema: {
        mimeType: z
          .string()
          .describe('MIME type of the media (e.g. "image/jpeg", "image/png", "image/gif", "video/mp4")'),
        url: z
          .string()
          .optional()
          .describe('URL to fetch and upload (mutually exclusive with data)'),
        data: z
          .string()
          .optional()
          .describe('Base64-encoded file bytes (mutually exclusive with url)'),
      },
    },
    wrapToolHandler('twitter_upload_media', middleware, async (args) => {
      const result = await client.post('/api/v1/twitter/media/upload', {
        mimeType: args.mimeType,
        url: args.url,
        data: args.data,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── twitter_like_tweet ───────────────────────────────────────
  server.registerTool(
    'twitter_like_tweet',
    {
      description:
        'Like a tweet. Only available in "auto" mode. Requires OAuth 1.0a credentials.',
      inputSchema: {
        tweetId: z.string().describe('ID of the tweet to like'),
      },
    },
    wrapToolHandler('twitter_like_tweet', middleware, async (args) => {
      const result = await client.post(`/api/v1/twitter/tweets/${args.tweetId}/like`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── twitter_retweet ──────────────────────────────────────────
  server.registerTool(
    'twitter_retweet',
    {
      description:
        'Retweet a tweet. Only available in "auto" mode. Requires OAuth 1.0a credentials.',
      inputSchema: {
        tweetId: z.string().describe('ID of the tweet to retweet'),
      },
    },
    wrapToolHandler('twitter_retweet', middleware, async (args) => {
      const result = await client.post(`/api/v1/twitter/tweets/${args.tweetId}/retweet`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── twitter_unretweet ────────────────────────────────────────
  server.registerTool(
    'twitter_unretweet',
    {
      description:
        'Undo a retweet. Only available in "auto" mode. Requires OAuth 1.0a credentials.',
      inputSchema: {
        tweetId: z.string().describe('ID of the tweet to un-retweet'),
      },
    },
    wrapToolHandler('twitter_unretweet', middleware, async (args) => {
      const result = await client.delete(`/api/v1/twitter/tweets/${args.tweetId}/retweet`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );
}
