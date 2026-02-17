/**
 * Gmail Integration
 *
 * Polling-based Gmail adapter using the Gmail REST API with OAuth2 tokens.
 * Supports reading incoming emails and sending replies.
 * Works behind NAT (no Pub/Sub required).
 */

import type { IntegrationConfig, UnifiedMessage, Platform } from '@secureyeoman/shared';
import type { Integration, IntegrationDeps, PlatformRateLimit } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

// ─── Config & API types ─────────────────────────────────────

interface GmailIntegrationConfig {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt?: number;
  email: string;
  enableRead: boolean;
  enableSend: boolean;
  labelFilter: 'all' | 'label' | 'custom';
  labelName?: string;
  lastHistoryId?: string;
  pollIntervalMs?: number;
}

interface GmailProfile {
  emailAddress: string;
  historyId: string;
}

interface GmailHistoryResponse {
  history?: GmailHistoryEntry[];
  historyId: string;
  nextPageToken?: string;
}

interface GmailHistoryEntry {
  id: string;
  messagesAdded?: { message: GmailMessageRef }[];
}

interface GmailMessageRef {
  id: string;
  threadId: string;
  labelIds?: string[];
}

interface GmailMessageFull {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload: GmailPayload;
  internalDate: string;
}

interface GmailPayload {
  headers: { name: string; value: string }[];
  mimeType: string;
  body?: { data?: string; size: number };
  parts?: GmailPayload[];
}

interface GmailLabel {
  id: string;
  name: string;
}

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEFAULT_POLL_INTERVAL_MS = 30_000;

export class GmailIntegration implements Integration {
  readonly platform: Platform = 'gmail';
  readonly platformRateLimit: PlatformRateLimit = { maxPerSecond: 2 };

  private config: IntegrationConfig | null = null;
  private gmailConfig: GmailIntegrationConfig | null = null;
  private deps: IntegrationDeps | null = null;
  private logger: SecureLogger | null = null;
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastHistoryId: string | null = null;
  private accessToken = '';
  private refreshToken = '';
  private tokenExpiresAt = 0;
  private email = '';
  private customLabelId: string | null = null;

  async init(config: IntegrationConfig, deps: IntegrationDeps): Promise<void> {
    this.config = config;
    this.deps = deps;
    this.logger = deps.logger;

    const gc = config.config as unknown as GmailIntegrationConfig;
    this.gmailConfig = gc;
    this.accessToken = gc.accessToken;
    this.refreshToken = gc.refreshToken;
    this.tokenExpiresAt = gc.tokenExpiresAt ?? 0;
    this.email = gc.email;
    this.lastHistoryId = gc.lastHistoryId ?? null;

    if (!this.accessToken || !this.refreshToken) {
      throw new Error('Gmail integration requires accessToken and refreshToken');
    }

    // Verify the token works by fetching profile
    await this.ensureValidToken();
    const profile = await this.fetchProfile();
    this.email = profile.emailAddress;

    this.logger?.info('Gmail integration initialized', {
      displayName: config.displayName,
      email: this.email,
    });
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    const gc = this.gmailConfig!;

    if (gc.enableRead) {
      // Resolve custom label ID if needed
      if ((gc.labelFilter === 'label' || gc.labelFilter === 'custom') && gc.labelName) {
        this.customLabelId = await this.resolveLabelId(gc.labelName);
        if (!this.customLabelId && gc.labelFilter === 'custom') {
          // Create the custom label if it doesn't exist
          this.customLabelId = await this.createLabel(gc.labelName);
        }
      }

      // Get current historyId as baseline (don't process old mail)
      if (!this.lastHistoryId) {
        const profile = await this.fetchProfile();
        this.lastHistoryId = profile.historyId;
      }

      const interval = gc.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
      this.pollTimer = setInterval(() => {
        void this.poll();
      }, interval);

      this.logger?.info('Gmail polling started', {
        email: this.email,
        intervalMs: interval,
        labelFilter: gc.labelFilter,
      });
    }

    this.logger?.info('Gmail integration started', {
      enableRead: gc.enableRead,
      enableSend: gc.enableSend,
    });
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    this.logger?.info('Gmail integration stopped');
  }

  async sendMessage(
    chatId: string,
    text: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    if (!this.gmailConfig?.enableSend) {
      throw new Error('Gmail send is not enabled for this integration');
    }

    await this.ensureValidToken();

    const subject = (metadata?.subject as string) || 'Message from FRIDAY';
    const threadId = metadata?.threadId as string | undefined;
    const inReplyTo = metadata?.inReplyTo as string | undefined;
    const references = metadata?.references as string | undefined;

    const headers = [
      `From: ${this.email}`,
      `To: ${chatId}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
    ];

    if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`);
    if (references) headers.push(`References: ${references}`);

    const raw = headers.join('\r\n') + '\r\n\r\n' + text;
    const encoded = Buffer.from(raw)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const body: Record<string, string> = { raw: encoded };
    if (threadId) body.threadId = threadId;

    const response = await fetch(`${GMAIL_API}/messages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send Gmail message: ${error}`);
    }

    const result = (await response.json()) as { id?: string };
    return result.id || '';
  }

  isHealthy(): boolean {
    return this.running;
  }

  // ─── Private helpers ────────────────────────────────────────

  private async poll(): Promise<void> {
    try {
      await this.ensureValidToken();

      const historyUrl = new URL(`${GMAIL_API}/history`);
      historyUrl.searchParams.set('startHistoryId', this.lastHistoryId!);
      historyUrl.searchParams.set('historyTypes', 'messageAdded');
      if (this.customLabelId) {
        historyUrl.searchParams.set('labelId', this.customLabelId);
      }

      const resp = await fetch(historyUrl.toString(), {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });

      if (resp.status === 404) {
        // History ID expired — reset to current
        const profile = await this.fetchProfile();
        this.lastHistoryId = profile.historyId;
        return;
      }

      if (!resp.ok) {
        const err = await resp.text();
        this.logger?.warn('Gmail history fetch failed', { error: err });
        return;
      }

      const data = (await resp.json()) as GmailHistoryResponse;
      this.lastHistoryId = data.historyId;

      if (!data.history) return;

      const messageIds = new Set<string>();
      for (const entry of data.history) {
        if (entry.messagesAdded) {
          for (const added of entry.messagesAdded) {
            // Skip sent messages (we only want inbound)
            if (!added.message.labelIds?.includes('SENT')) {
              messageIds.add(added.message.id);
            }
          }
        }
      }

      for (const msgId of messageIds) {
        await this.processMessage(msgId);
      }
    } catch (err) {
      this.logger?.warn('Gmail poll error', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  private async processMessage(messageId: string): Promise<void> {
    const resp = await fetch(`${GMAIL_API}/messages/${messageId}?format=full`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!resp.ok) return;

    const msg = (await resp.json()) as GmailMessageFull;

    // Apply label filter
    if (this.customLabelId && !msg.labelIds.includes(this.customLabelId)) {
      return;
    }

    const headers = msg.payload.headers;
    const getHeader = (name: string): string =>
      headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

    const from = getHeader('From');
    const subject = getHeader('Subject');
    const messageIdHeader = getHeader('Message-ID');
    const bodyText = this.extractTextBody(msg.payload);

    // Parse sender name and email from "Name <email@example.com>" format
    const fromMatch = /^(.+?)\s*<(.+?)>$/.exec(from);
    const senderName = fromMatch?.[1]?.replace(/^"|"$/g, '') ?? from;
    const senderEmail = fromMatch?.[2] ?? from;

    const unified: UnifiedMessage = {
      id: `gmail_${messageId}`,
      integrationId: this.config!.id,
      platform: 'gmail',
      direction: 'inbound',
      senderId: senderEmail,
      senderName: senderName,
      chatId: msg.threadId,
      text: bodyText,
      attachments: [],
      platformMessageId: messageId,
      metadata: {
        subject,
        messageIdHeader,
        threadId: msg.threadId,
        labelIds: msg.labelIds,
      },
      timestamp: parseInt(msg.internalDate, 10),
    };

    await this.deps!.onMessage(unified);
  }

  private extractTextBody(payload: GmailPayload): string {
    // Direct text/plain body
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    }

    // Multipart — recurse into parts
    if (payload.parts) {
      // Prefer text/plain over text/html
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return Buffer.from(part.body.data, 'base64url').toString('utf-8');
        }
      }
      // Fallback to first part with data
      for (const part of payload.parts) {
        const text = this.extractTextBody(part);
        if (text) return text;
      }
    }

    return '';
  }

  private async ensureValidToken(): Promise<void> {
    // Refresh if token expires within 5 minutes
    if (this.tokenExpiresAt && Date.now() < this.tokenExpiresAt - 5 * 60 * 1000) {
      return;
    }

    const clientId = process.env.GMAIL_OAUTH_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret =
      process.env.GMAIL_OAUTH_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      this.logger?.warn('Cannot refresh Gmail token: missing OAuth credentials');
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
      this.logger?.warn('Gmail token refresh failed', { error: err });
      return;
    }

    const data = (await resp.json()) as {
      access_token: string;
      expires_in: number;
    };

    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
  }

  private async fetchProfile(): Promise<GmailProfile> {
    const resp = await fetch(`${GMAIL_API}/profile`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Failed to fetch Gmail profile: ${err}`);
    }

    return (await resp.json()) as GmailProfile;
  }

  private async resolveLabelId(labelName: string): Promise<string | null> {
    const resp = await fetch(`${GMAIL_API}/labels`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!resp.ok) return null;

    const data = (await resp.json()) as { labels: GmailLabel[] };
    const label = data.labels.find((l) => l.name.toLowerCase() === labelName.toLowerCase());
    return label?.id ?? null;
  }

  private async createLabel(labelName: string): Promise<string | null> {
    const resp = await fetch(`${GMAIL_API}/labels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({
        name: labelName,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      }),
    });

    if (!resp.ok) {
      this.logger?.warn('Failed to create Gmail label', { labelName });
      return null;
    }

    const label = (await resp.json()) as GmailLabel;
    return label.id;
  }
}
