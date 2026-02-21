/**
 * Google Calendar Integration
 *
 * Polling-based Google Calendar adapter using the Calendar REST API v3
 * with OAuth2 tokens. Reuses Gmail's token refresh pattern.
 */

import type { IntegrationConfig, UnifiedMessage, Platform } from '@secureyeoman/shared';
import type { Integration, IntegrationDeps, PlatformRateLimit } from '../types.js';
import type { OAuthTokenService } from '../../gateway/oauth-token-service.js';
import type { SecureLogger } from '../../logging/logger.js';

// ─── Config & API types ─────────────────────────────────────

interface GoogleCalendarConfig {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt?: number;
  calendarId?: string;
  pollIntervalMs?: number;
  /** Email used to look up OAuth tokens from OAuthTokenService (unified token flow). */
  email?: string;
}

interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  creator?: { email?: string; displayName?: string };
  updated?: string;
  htmlLink?: string;
  status?: string;
}

interface EventListResponse {
  items?: CalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEFAULT_POLL_INTERVAL_MS = 60_000;

export class GoogleCalendarIntegration implements Integration {
  readonly platform: Platform = 'googlecalendar';
  readonly platformRateLimit: PlatformRateLimit = { maxPerSecond: 10 };

  private config: IntegrationConfig | null = null;
  private calendarConfig: GoogleCalendarConfig | null = null;
  private deps: IntegrationDeps | null = null;
  private logger: SecureLogger | null = null;
  private oauthTokenService: OAuthTokenService | null = null;
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastPollTime: string | null = null;
  private accessToken = '';
  private refreshToken = '';
  private tokenExpiresAt = 0;
  private calendarId = 'primary';
  /** Email used as lookup key with OAuthTokenService. */
  private tokenEmail = '';

  async init(config: IntegrationConfig, deps: IntegrationDeps): Promise<void> {
    this.config = config;
    this.deps = deps;
    this.logger = deps.logger;
    this.oauthTokenService = deps.oauthTokenService ?? null;

    const gc = config.config as unknown as GoogleCalendarConfig;
    this.calendarConfig = gc;
    this.calendarId = gc.calendarId ?? 'primary';

    if (this.oauthTokenService && gc.email) {
      // Prefer unified token service when available
      this.tokenEmail = gc.email;
      const token = await this.oauthTokenService.getValidToken('googlecalendar', gc.email);
      if (!token) {
        throw new Error(
          `No OAuth token found for Google Calendar (${gc.email}). ` +
            'Authenticate via /api/v1/auth/oauth/googlecalendar first.'
        );
      }
      this.accessToken = token;
    } else {
      // Fallback: tokens stored directly in integration config
      this.accessToken = gc.accessToken;
      this.refreshToken = gc.refreshToken;
      this.tokenExpiresAt = gc.tokenExpiresAt ?? 0;

      if (!this.accessToken || !this.refreshToken) {
        throw new Error('Google Calendar integration requires accessToken and refreshToken');
      }
    }

    // Verify token works
    await this.ensureValidToken();
    this.logger?.info('Google Calendar integration initialized');
  }

  async start(): Promise<void> {
    if (!this.calendarConfig) throw new Error('Integration not initialized');
    if (this.running) return;
    this.running = true;

    this.lastPollTime = new Date().toISOString();

    const interval = this.calendarConfig.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.pollTimer = setInterval(() => void this.poll(), interval);

    this.logger?.info('Google Calendar integration started');
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.logger?.info('Google Calendar integration stopped');
  }

  /**
   * Create a calendar event from message text.
   * Uses the quick-add endpoint for natural language event creation.
   */
  async sendMessage(
    chatId: string,
    text: string,
    _metadata?: Record<string, unknown>
  ): Promise<string> {
    await this.ensureValidToken();

    const calId = chatId || this.calendarId;
    const resp = await fetch(
      `${CALENDAR_API}/calendars/${encodeURIComponent(calId)}/events/quickAdd`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ text }),
      }
    );

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Failed to create calendar event: ${err}`);
    }

    const event = (await resp.json()) as CalendarEvent;
    return event.id;
  }

  isHealthy(): boolean {
    return this.running;
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      await this.ensureValidToken();
      const resp = await fetch(`${CALENDAR_API}/users/me/calendarList?maxResults=1`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });

      if (!resp.ok) {
        const err = await resp.text();
        return { ok: false, message: `Calendar API error: ${err}` };
      }

      return { ok: true, message: 'Google Calendar connection successful' };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  // ─── Polling ─────────────────────────────────────────────

  private async poll(): Promise<void> {
    if (!this.running || !this.deps) return;

    try {
      await this.ensureValidToken();

      const params = new URLSearchParams({
        calendarId: this.calendarId,
        maxResults: '50',
        singleEvents: 'true',
        orderBy: 'updated',
      });

      if (this.lastPollTime) {
        params.set('updatedMin', this.lastPollTime);
      }

      const resp = await fetch(
        `${CALENDAR_API}/calendars/${encodeURIComponent(this.calendarId)}/events?${params}`,
        { headers: { Authorization: `Bearer ${this.accessToken}` } }
      );

      if (!resp.ok) {
        this.logger?.warn('Google Calendar poll failed', { status: resp.status });
        return;
      }

      const data = (await resp.json()) as EventListResponse;
      this.lastPollTime = new Date().toISOString();

      for (const event of data.items ?? []) {
        const unified: UnifiedMessage = {
          id: `gcal_${event.id}_${Date.now()}`,
          integrationId: this.config!.id,
          platform: 'googlecalendar',
          direction: 'inbound',
          senderId: event.creator?.email ?? '',
          senderName: event.creator?.displayName ?? event.creator?.email ?? 'unknown',
          chatId: this.calendarId,
          text: this.formatEventText(event),
          attachments: [],
          platformMessageId: event.id,
          metadata: {
            eventId: event.id,
            summary: event.summary,
            start: event.start?.dateTime ?? event.start?.date,
            end: event.end?.dateTime ?? event.end?.date,
            htmlLink: event.htmlLink,
            status: event.status,
          },
          timestamp: event.updated ? new Date(event.updated).getTime() : Date.now(),
        };
        await this.deps.onMessage(unified);
      }
    } catch (err) {
      this.logger?.warn('Google Calendar poll error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private formatEventText(event: CalendarEvent): string {
    const start = event.start?.dateTime ?? event.start?.date ?? 'unknown time';
    const summary = event.summary ?? 'Untitled event';
    return `Calendar event: ${summary} at ${start}`;
  }

  // ─── Token refresh ──────────────────────────────────────

  private async ensureValidToken(): Promise<void> {
    // Use the unified token service if available (preferred path)
    if (this.oauthTokenService && this.tokenEmail) {
      const token = await this.oauthTokenService.getValidToken('googlecalendar', this.tokenEmail);
      if (token) {
        this.accessToken = token;
      }
      return;
    }

    // Fallback: inline token refresh (legacy / no-service path)
    if (this.tokenExpiresAt && Date.now() < this.tokenExpiresAt - 5 * 60 * 1000) {
      return;
    }

    const clientId =
      process.env.GOOGLE_CALENDAR_OAUTH_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret =
      process.env.GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      this.logger?.warn('Cannot refresh Google Calendar token: missing OAuth credentials');
      return;
    }

    const resp = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      this.logger?.warn('Google Calendar token refresh failed', { error: err });
      return;
    }

    const data = (await resp.json()) as {
      access_token: string;
      expires_in: number;
    };

    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
  }
}
