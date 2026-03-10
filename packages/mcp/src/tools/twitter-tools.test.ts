/**
 * Twitter MCP Tools — unit tests
 *
 * Verifies that all 11 twitter_* tools register and proxy correctly
 * through to the core API client via globalToolRegistry.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTwitterTools } from './twitter-tools.js';
import { globalToolRegistry } from './tool-utils.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

function mockClient(): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ id: 'tw-1', text: 'posted' }),
    delete: vi.fn().mockResolvedValue({ retweeted: false }),
    put: vi.fn().mockResolvedValue({}),
    healthCheck: vi.fn().mockResolvedValue(true),
  } as unknown as CoreApiClient;
}

function noopMiddleware(): ToolMiddleware {
  return {
    rateLimiter: { check: () => ({ allowed: true }), reset: vi.fn(), wrap: vi.fn() },
    inputValidator: { validate: () => ({ valid: true, blocked: false, warnings: [] }) },
    auditLogger: { log: vi.fn(), wrap: (_t: string, _a: unknown, fn: () => unknown) => fn() },
    secretRedactor: { redact: (v: unknown) => v },
  } as unknown as ToolMiddleware;
}

describe('twitter-tools', () => {
  let client: CoreApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = mockClient();
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerTwitterTools(server, client, noopMiddleware());
  });

  it('registers all 11 twitter_* tools in globalToolRegistry', () => {
    const tools = [
      'twitter_profile',
      'twitter_search',
      'twitter_get_tweet',
      'twitter_get_mentions',
      'twitter_get_timeline',
      'twitter_get_user',
      'twitter_post_tweet',
      'twitter_upload_media',
      'twitter_like_tweet',
      'twitter_retweet',
      'twitter_unretweet',
    ];
    for (const t of tools) {
      expect(globalToolRegistry.has(t)).toBe(true);
    }
  });

  // ── twitter_profile ──────────────────────────────────────────

  it('twitter_profile calls GET /api/v1/twitter/profile', async () => {
    const handler = globalToolRegistry.get('twitter_profile')!;
    const result = await handler({});
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith('/api/v1/twitter/profile');
  });

  // ── twitter_search ───────────────────────────────────────────

  it('twitter_search calls GET with query params', async () => {
    const handler = globalToolRegistry.get('twitter_search')!;
    const result = await handler({ q: 'OpenAI', maxResults: 20, nextToken: 'abc' });
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith('/api/v1/twitter/search', {
      q: 'OpenAI',
      maxResults: '20',
      nextToken: 'abc',
    });
  });

  it('twitter_search with only q param', async () => {
    const handler = globalToolRegistry.get('twitter_search')!;
    await handler({ q: 'AI' });
    expect(client.get).toHaveBeenCalledWith('/api/v1/twitter/search', { q: 'AI' });
  });

  // ── twitter_get_tweet ────────────────────────────────────────

  it('twitter_get_tweet calls GET with tweetId in path', async () => {
    const handler = globalToolRegistry.get('twitter_get_tweet')!;
    const result = await handler({ tweetId: '12345' });
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith('/api/v1/twitter/tweets/12345');
  });

  // ── twitter_get_mentions ─────────────────────────────────────

  it('twitter_get_mentions calls GET with query params', async () => {
    const handler = globalToolRegistry.get('twitter_get_mentions')!;
    const result = await handler({ maxResults: 50, sinceId: '99999' });
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith('/api/v1/twitter/mentions', {
      maxResults: '50',
      sinceId: '99999',
    });
  });

  it('twitter_get_mentions with no args', async () => {
    const handler = globalToolRegistry.get('twitter_get_mentions')!;
    await handler({});
    expect(client.get).toHaveBeenCalledWith('/api/v1/twitter/mentions', {});
  });

  // ── twitter_get_timeline ─────────────────────────────────────

  it('twitter_get_timeline calls GET with optional maxResults', async () => {
    const handler = globalToolRegistry.get('twitter_get_timeline')!;
    const result = await handler({ maxResults: 30 });
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith('/api/v1/twitter/timeline', { maxResults: '30' });
  });

  it('twitter_get_timeline with no args', async () => {
    const handler = globalToolRegistry.get('twitter_get_timeline')!;
    await handler({});
    expect(client.get).toHaveBeenCalledWith('/api/v1/twitter/timeline', {});
  });

  // ── twitter_get_user ─────────────────────────────────────────

  it('twitter_get_user calls GET with username in path', async () => {
    const handler = globalToolRegistry.get('twitter_get_user')!;
    const result = await handler({ username: 'sama' });
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith('/api/v1/twitter/users/sama');
  });

  // ── twitter_post_tweet ───────────────────────────────────────

  it('twitter_post_tweet calls POST with body', async () => {
    const handler = globalToolRegistry.get('twitter_post_tweet')!;
    const result = await handler({
      text: 'Hello world!',
      replyToTweetId: '111',
      quoteTweetId: '222',
      mediaIds: ['m1', 'm2'],
    });
    expect(result.isError).toBeFalsy();
    expect(client.post).toHaveBeenCalledWith('/api/v1/twitter/tweets', {
      text: 'Hello world!',
      replyToTweetId: '111',
      quoteTweetId: '222',
      mediaIds: ['m1', 'm2'],
    });
  });

  it('twitter_post_tweet with text only', async () => {
    const handler = globalToolRegistry.get('twitter_post_tweet')!;
    await handler({ text: 'Simple tweet' });
    expect(client.post).toHaveBeenCalledWith('/api/v1/twitter/tweets', {
      text: 'Simple tweet',
      replyToTweetId: undefined,
      quoteTweetId: undefined,
      mediaIds: undefined,
    });
  });

  // ── twitter_upload_media ─────────────────────────────────────

  it('twitter_upload_media calls POST with url', async () => {
    const handler = globalToolRegistry.get('twitter_upload_media')!;
    const result = await handler({
      mimeType: 'image/jpeg',
      url: 'https://example.com/photo.jpg',
    });
    expect(result.isError).toBeFalsy();
    expect(client.post).toHaveBeenCalledWith('/api/v1/twitter/media/upload', {
      mimeType: 'image/jpeg',
      url: 'https://example.com/photo.jpg',
      data: undefined,
    });
  });

  it('twitter_upload_media calls POST with base64 data', async () => {
    const handler = globalToolRegistry.get('twitter_upload_media')!;
    await handler({ mimeType: 'image/png', data: 'base64data==' });
    expect(client.post).toHaveBeenCalledWith('/api/v1/twitter/media/upload', {
      mimeType: 'image/png',
      url: undefined,
      data: 'base64data==',
    });
  });

  // ── twitter_like_tweet ───────────────────────────────────────

  it('twitter_like_tweet calls POST with tweetId in path', async () => {
    const handler = globalToolRegistry.get('twitter_like_tweet')!;
    const result = await handler({ tweetId: '12345' });
    expect(result.isError).toBeFalsy();
    expect(client.post).toHaveBeenCalledWith('/api/v1/twitter/tweets/12345/like');
  });

  // ── twitter_retweet ──────────────────────────────────────────

  it('twitter_retweet calls POST with tweetId in path', async () => {
    const handler = globalToolRegistry.get('twitter_retweet')!;
    const result = await handler({ tweetId: '12345' });
    expect(result.isError).toBeFalsy();
    expect(client.post).toHaveBeenCalledWith('/api/v1/twitter/tweets/12345/retweet');
  });

  // ── twitter_unretweet ────────────────────────────────────────

  it('twitter_unretweet calls DELETE with tweetId in path', async () => {
    const handler = globalToolRegistry.get('twitter_unretweet')!;
    const result = await handler({ tweetId: '12345' });
    expect(result.isError).toBeFalsy();
    expect(client.delete).toHaveBeenCalledWith('/api/v1/twitter/tweets/12345/retweet');
  });

  // ── Error handling ──────────────────────────────────────────────

  it('returns isError when API throws', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network timeout'));
    const handler = globalToolRegistry.get('twitter_profile')!;
    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Network timeout');
  });

  it('returns JSON response on success', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      username: 'test_user',
      followers: 100,
    });
    const handler = globalToolRegistry.get('twitter_profile')!;
    const result = await handler({});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.username).toBe('test_user');
    expect(parsed.followers).toBe(100);
  });
});
