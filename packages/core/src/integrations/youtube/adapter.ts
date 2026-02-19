/**
 * YouTube Integration
 *
 * REST polling adapter using the YouTube Data API v3.
 * Polls a configured channel for new uploads and surfaces them as inbound messages.
 * Read-only — sendMessage() is a no-op (YouTube does not support posting videos via API).
 */

import type { IntegrationConfig, UnifiedMessage, Platform } from '@secureyeoman/shared';
import type { Integration, IntegrationDeps, PlatformRateLimit } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

interface YouTubeConfig {
  apiKey: string;
  channelId?: string;
  maxResults?: number;
  pollIntervalMs?: number;
}

interface YouTubeVideoSnippet {
  title: string;
  description?: string;
  publishedAt?: string;
  channelId?: string;
  channelTitle?: string;
  resourceId?: { videoId?: string };
}

interface YouTubeSearchItem {
  id: { videoId?: string };
  snippet: YouTubeVideoSnippet;
}

interface YouTubeSearchResponse {
  items: YouTubeSearchItem[];
}

interface YouTubeChannelSnippet {
  title?: string;
}

interface YouTubeChannelItem {
  snippet?: YouTubeChannelSnippet;
}

interface YouTubeChannelResponse {
  items: YouTubeChannelItem[];
}

const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';
const DEFAULT_POLL_INTERVAL_MS = 300_000; // 5 minutes — quota-conscious

export class YouTubeIntegration implements Integration {
  readonly platform: Platform = 'youtube';
  readonly platformRateLimit: PlatformRateLimit = { maxPerSecond: 5 };

  private config: IntegrationConfig | null = null;
  private youtubeConfig: YouTubeConfig | null = null;
  private deps: IntegrationDeps | null = null;
  private logger: SecureLogger | null = null;
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private seenVideoIds = new Set<string>();

  async init(config: IntegrationConfig, deps: IntegrationDeps): Promise<void> {
    this.config = config;
    this.deps = deps;
    this.logger = deps.logger;

    const yc = config.config as unknown as YouTubeConfig;
    this.youtubeConfig = yc;

    if (!yc.apiKey) throw new Error('YouTube integration requires an apiKey');
    this.logger?.info('YouTube integration initialized');
  }

  async start(): Promise<void> {
    if (!this.youtubeConfig) throw new Error('Integration not initialized');
    if (this.running) return;
    this.running = true;

    if (this.youtubeConfig.channelId) {
      await this.seedSeenVideos();
      const interval = this.youtubeConfig.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
      this.pollTimer = setInterval(() => void this.poll(), interval);
    }

    this.logger?.info('YouTube integration started');
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.logger?.info('YouTube integration stopped');
  }

  /**
   * YouTube is read-only via the Data API.
   * Returns the videoId/channelId passed in as text; no actual post is made.
   */
  async sendMessage(_chatId: string, text: string): Promise<string> {
    this.logger?.warn('YouTube sendMessage is read-only; no action taken', { text });
    return text;
  }

  isHealthy(): boolean {
    return this.running;
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    if (!this.youtubeConfig) return { ok: false, message: 'Not initialized' };
    try {
      const channelId = this.youtubeConfig.channelId ?? 'UCxxxxxxxxxxxxxx';
      const url = `${YOUTUBE_API}/channels?part=snippet&id=${channelId}&key=${this.youtubeConfig.apiKey}`;
      const resp = await fetch(url);
      if (!resp.ok) return { ok: false, message: `YouTube API error: ${resp.statusText}` };
      const data = (await resp.json()) as YouTubeChannelResponse;
      const title = data.items?.[0]?.snippet?.title ?? 'unknown channel';
      return { ok: true, message: `Connected — channel: ${title}` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  private async seedSeenVideos(): Promise<void> {
    if (!this.youtubeConfig?.channelId) return;
    try {
      const items = await this.fetchLatestVideos(50);
      for (const item of items) {
        const videoId = item.id.videoId;
        if (videoId) this.seenVideoIds.add(videoId);
      }
    } catch {
      // best-effort
    }
  }

  private async poll(): Promise<void> {
    if (!this.running || !this.deps || !this.youtubeConfig?.channelId) return;

    try {
      const items = await this.fetchLatestVideos(this.youtubeConfig.maxResults ?? 10);

      for (const item of items) {
        const videoId = item.id.videoId;
        if (!videoId || this.seenVideoIds.has(videoId)) continue;
        this.seenVideoIds.add(videoId);

        const snippet = item.snippet;
        const unified: UnifiedMessage = {
          id: `youtube_${videoId}_${Date.now()}`,
          integrationId: this.config!.id,
          platform: 'youtube',
          direction: 'inbound',
          senderId: snippet.channelId ?? '',
          senderName: snippet.channelTitle ?? 'YouTube',
          chatId: this.youtubeConfig.channelId,
          text: `New video: ${snippet.title}${snippet.description ? `\n${snippet.description.slice(0, 200)}` : ''}`,
          attachments: [],
          platformMessageId: videoId,
          metadata: {
            videoId,
            videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
            channelId: snippet.channelId,
          },
          timestamp: snippet.publishedAt ? new Date(snippet.publishedAt).getTime() : Date.now(),
        };
        await this.deps.onMessage(unified);
      }
    } catch (err) {
      this.logger?.warn('YouTube poll error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async fetchLatestVideos(maxResults: number): Promise<YouTubeSearchItem[]> {
    if (!this.youtubeConfig?.channelId) return [];
    const url =
      `${YOUTUBE_API}/search?part=snippet&channelId=${this.youtubeConfig.channelId}` +
      `&type=video&order=date&maxResults=${maxResults}&key=${this.youtubeConfig.apiKey}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      this.logger?.warn('YouTube search failed', { status: resp.status });
      return [];
    }
    const data = (await resp.json()) as YouTubeSearchResponse;
    return data.items ?? [];
  }
}
