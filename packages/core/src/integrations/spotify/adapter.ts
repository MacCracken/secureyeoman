/**
 * Spotify Integration
 *
 * OAuth2 polling adapter using the Spotify Web API.
 * Polls for the currently-playing track and recent history.
 * sendMessage() adds a track URI to the playback queue.
 */

import type { IntegrationConfig, UnifiedMessage, Platform } from '@secureyeoman/shared';
import type { Integration, IntegrationDeps, PlatformRateLimit } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

interface SpotifyConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  pollIntervalMs?: number;
}

interface SpotifyToken {
  access_token: string;
  expires_in: number;
}

interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  uri: string;
  duration_ms?: number;
}

interface SpotifyCurrentlyPlaying {
  is_playing: boolean;
  item?: SpotifyTrack;
  progress_ms?: number;
}

interface SpotifyRecentItem {
  track: SpotifyTrack;
  played_at: string;
}

interface SpotifyRecentResponse {
  items: SpotifyRecentItem[];
}

interface SpotifyProfileResponse {
  id: string;
  display_name?: string;
}

const SPOTIFY_API = 'https://api.spotify.com/v1';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const DEFAULT_POLL_INTERVAL_MS = 30_000;

export class SpotifyIntegration implements Integration {
  readonly platform: Platform = 'spotify';
  readonly platformRateLimit: PlatformRateLimit = { maxPerSecond: 10 };

  private config: IntegrationConfig | null = null;
  private spotifyConfig: SpotifyConfig | null = null;
  private deps: IntegrationDeps | null = null;
  private logger: SecureLogger | null = null;
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private accessToken = '';
  private tokenExpiresAt = 0;
  private seenTrackKeys = new Set<string>();

  async init(config: IntegrationConfig, deps: IntegrationDeps): Promise<void> {
    this.config = config;
    this.deps = deps;
    this.logger = deps.logger;

    const sc = config.config as unknown as SpotifyConfig;
    this.spotifyConfig = sc;

    if (!sc.clientId || !sc.clientSecret || !sc.refreshToken) {
      throw new Error('Spotify integration requires clientId, clientSecret, and refreshToken');
    }
    this.logger?.info('Spotify integration initialized');
  }

  async start(): Promise<void> {
    if (!this.spotifyConfig) throw new Error('Integration not initialized');
    if (this.running) return;
    this.running = true;

    await this.refreshAccessToken();
    await this.seedSeenTracks();

    const interval = this.spotifyConfig.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.pollTimer = setInterval(() => void this.poll(), interval);

    this.logger?.info('Spotify integration started');
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.logger?.info('Spotify integration stopped');
  }

  /**
   * Add a track URI to the Spotify playback queue.
   * chatId is ignored; text should be a Spotify track URI (spotify:track:...).
   */
  async sendMessage(_chatId: string, text: string): Promise<string> {
    await this.ensureToken();
    const uri = encodeURIComponent(text.trim());
    const resp = await this.spotifyFetch(`/me/player/queue?uri=${uri}`, { method: 'POST' });
    if (!resp.ok) throw new Error(`Spotify queue track failed: ${await resp.text()}`);
    return text;
  }

  isHealthy(): boolean {
    return this.running;
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      await this.refreshAccessToken();
      const resp = await this.spotifyFetch('/me');
      if (!resp.ok) return { ok: false, message: `Spotify API error: ${resp.statusText}` };
      const profile = (await resp.json()) as SpotifyProfileResponse;
      return { ok: true, message: `Connected as ${profile.display_name ?? profile.id}` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  private async seedSeenTracks(): Promise<void> {
    try {
      await this.ensureToken();
      const resp = await this.spotifyFetch('/me/player/recently-played?limit=50');
      if (!resp.ok) return;
      const data = (await resp.json()) as SpotifyRecentResponse;
      for (const item of data.items) {
        this.seenTrackKeys.add(`${item.track.id}_${item.played_at}`);
      }
    } catch {
      // best-effort
    }
  }

  private async poll(): Promise<void> {
    if (!this.running || !this.deps) return;

    try {
      await this.ensureToken();
      const resp = await this.spotifyFetch('/me/player/recently-played?limit=10');
      if (!resp.ok) {
        this.logger?.warn('Spotify poll failed', { status: resp.status });
        return;
      }

      const data = (await resp.json()) as SpotifyRecentResponse;
      for (const item of data.items) {
        const key = `${item.track.id}_${item.played_at}`;
        if (this.seenTrackKeys.has(key)) continue;
        this.seenTrackKeys.add(key);

        const artists = item.track.artists.map((a) => a.name).join(', ');
        const unified: UnifiedMessage = {
          id: `spotify_${item.track.id}_${new Date(item.played_at).getTime()}`,
          integrationId: this.config!.id,
          platform: 'spotify',
          direction: 'inbound',
          senderId: '',
          senderName: 'Spotify',
          chatId: 'recently-played',
          text: `Now played: ${item.track.name} by ${artists}`,
          attachments: [],
          platformMessageId: item.track.id,
          metadata: { trackId: item.track.id, trackUri: item.track.uri, artists },
          timestamp: new Date(item.played_at).getTime(),
        };
        await this.deps.onMessage(unified);
      }
    } catch (err) {
      this.logger?.warn('Spotify poll error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.spotifyConfig) return;
    const { clientId, clientSecret, refreshToken } = this.spotifyConfig;
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const resp = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!resp.ok) throw new Error(`Spotify token refresh failed: ${await resp.text()}`);
    const token = (await resp.json()) as SpotifyToken;
    this.accessToken = token.access_token;
    this.tokenExpiresAt = Date.now() + token.expires_in * 1000 - 60_000; // 1 min buffer
  }

  private async ensureToken(): Promise<void> {
    if (!this.accessToken || Date.now() >= this.tokenExpiresAt) {
      await this.refreshAccessToken();
    }
  }

  private spotifyFetch(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${SPOTIFY_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...((init?.headers ?? {}) as Record<string, string>),
      },
    });
  }
}
