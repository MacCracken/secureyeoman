/**
 * TwitterIntegration — Twitter/X API v2 adapter.
 *
 * Polls for mentions at a configurable interval and normalises them to
 * UnifiedMessage with a `tw_` prefix.  Replies are posted as quote-tweets
 * or in-reply-to tweets depending on the metadata supplied to sendMessage().
 *
 * Authentication:
 *   - bearerToken (required) — App-only Bearer Token; used for mention polling.
 *   - apiKey + apiKeySecret + accessToken + accessTokenSecret (optional) —
 *     OAuth 1.0a user context; required for posting tweets / DMs.
 *
 * Rate-limit notes (Twitter API v2 free tier):
 *   - 1 mention-lookup / 15 min window → default poll interval is 300 s.
 *   - 17 posts / 24 h on the free tier; raise the tier for heavier workloads.
 *   - The platformRateLimit throttle applies to outbound sendMessage() calls.
 */

import { TwitterApi, type UserV2 } from 'twitter-api-v2';
import type { IntegrationConfig, UnifiedMessage, Platform } from '@secureyeoman/shared';
import type { Integration, IntegrationDeps, PlatformRateLimit } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

export class TwitterIntegration implements Integration {
  readonly platform: Platform = 'twitter';
  /**
   * ~2 posts / minute to stay well within free-tier limits.
   * Operators on higher tiers should increase this via a sub-class or config.
   */
  readonly platformRateLimit: PlatformRateLimit = { maxPerSecond: 0.033 };

  private client: TwitterApi | null = null;
  private readonlyClient: TwitterApi | null = null;
  private config: IntegrationConfig | null = null;
  private deps: IntegrationDeps | null = null;
  private logger: SecureLogger | null = null;
  private running = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private sinceId: string | undefined = undefined;
  private me: UserV2 | null = null;

  async init(config: IntegrationConfig, deps: IntegrationDeps): Promise<void> {
    this.config = config;
    this.deps = deps;
    this.logger = deps.logger;

    const { bearerToken, apiKey, apiKeySecret, accessToken, accessTokenSecret } = config.config as {
      bearerToken?: string;
      apiKey?: string;
      apiKeySecret?: string;
      accessToken?: string;
      accessTokenSecret?: string;
    };

    if (!bearerToken) {
      throw new Error('Twitter integration requires a bearerToken in config');
    }

    // App-only client — used for reading mentions (no user context needed)
    this.readonlyClient = new TwitterApi(bearerToken);

    // If full OAuth 1.0a credentials are provided, create a user-context client
    // that can post tweets and send DMs on behalf of the authenticated account.
    if (apiKey && apiKeySecret && accessToken && accessTokenSecret) {
      this.client = new TwitterApi({
        appKey: apiKey,
        appSecret: apiKeySecret,
        accessToken,
        accessSecret: accessTokenSecret,
      });
    } else {
      // Fall back to bearer-only — sendMessage() will throw if called without OAuth creds
      this.client = this.readonlyClient;
    }

    this.logger?.info('Twitter integration initialized');
  }

  async start(): Promise<void> {
    if (!this.readonlyClient || !this.config) throw new Error('Integration not initialized');
    if (this.running) return;
    this.running = true;

    // Resolve the authenticated user so we can poll their mention timeline
    try {
      const meResult = await this.readonlyClient.v2.me();
      this.me = meResult.data;
      this.logger?.info(`Twitter connected as @${this.me.username} (${this.me.id})`);
    } catch (err) {
      this.logger?.warn(
        'Twitter: could not resolve authenticated user — mention polling disabled',
        {
          error: err instanceof Error ? err.message : String(err),
        }
      );
    }

    this.schedulePoll();
    this.logger?.info('Twitter integration started');
  }

  private schedulePoll(): void {
    if (!this.running) return;
    const interval = (this.config?.config.pollIntervalMs as number | undefined) ?? 300_000;
    this.pollTimer = setTimeout(() => {
      void this.poll().finally(() => {
        this.schedulePoll();
      });
    }, interval);
  }

  private async poll(): Promise<void> {
    if (!this.readonlyClient || !this.me) return;

    try {
      const result = await this.readonlyClient.v2.userMentionTimeline(this.me.id, {
        'tweet.fields': ['author_id', 'created_at', 'in_reply_to_user_id', 'text'],
        expansions: ['author_id'],
        'user.fields': ['name', 'username'],
        ...(this.sinceId ? { since_id: this.sinceId } : {}),
        max_results: 10,
      });

      const tweets = result.data.data ?? [];
      const users: Record<string, UserV2> = {};
      for (const u of result.data.includes?.users ?? []) {
        users[u.id] = u;
      }

      for (const tweet of tweets) {
        // Track the highest seen tweet ID so we never re-deliver
        if (!this.sinceId || BigInt(tweet.id) > BigInt(this.sinceId)) {
          this.sinceId = tweet.id;
        }

        const author = users[tweet.author_id ?? ''];
        const unified: UnifiedMessage = {
          id: `tw_${tweet.id}`,
          integrationId: this.config!.id,
          platform: 'twitter',
          direction: 'inbound',
          senderId: tweet.author_id ?? 'unknown',
          senderName: author ? `@${author.username}` : (tweet.author_id ?? 'unknown'),
          chatId: tweet.id,
          text: tweet.text,
          attachments: [],
          platformMessageId: tweet.id,
          metadata: {
            tweetId: tweet.id,
            authorUsername: author?.username,
            inReplyToUserId: tweet.in_reply_to_user_id,
          },
          timestamp: tweet.created_at ? new Date(tweet.created_at).getTime() : Date.now(),
        };

        void this.deps!.onMessage(unified);
      }

      if (tweets.length > 0) {
        this.logger?.debug(`Twitter: delivered ${tweets.length} mention(s)`);
      }
    } catch (err) {
      this.logger?.warn('Twitter: mention poll failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.logger?.info('Twitter integration stopped');
  }

  /**
   * Post a tweet in reply to `chatId` (a tweet ID).
   * Requires OAuth 1.0a credentials — throws if only a Bearer Token was provided.
   */
  async sendMessage(chatId: string, text: string): Promise<string> {
    if (!this.client) throw new Error('Integration not initialized');

    const hasOAuth = Boolean(this.config?.config.apiKey);
    if (!hasOAuth) {
      throw new Error(
        'Twitter sendMessage requires OAuth 1.0a credentials (apiKey, apiKeySecret, accessToken, accessTokenSecret)'
      );
    }

    const payload = chatId ? { text, reply: { in_reply_to_tweet_id: chatId } } : { text };

    const result = await this.client.v2.tweet(payload);
    return result.data.id;
  }

  isHealthy(): boolean {
    return this.running;
  }
}
