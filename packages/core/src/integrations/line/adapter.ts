/**
 * Line Integration
 *
 * Webhook-based adapter using the Line Messaging API.
 * Receives message, follow, and unfollow events via webhook.
 * Sends replies and push messages via the Line Messaging API.
 * Signature verification uses HMAC-SHA256 over the request body.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type { IntegrationConfig, UnifiedMessage, Platform } from '@secureyeoman/shared';
import type { WebhookIntegration, IntegrationDeps, PlatformRateLimit } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

interface LineConfig {
  channelSecret: string;
  channelAccessToken: string;
}

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string; groupId?: string; roomId?: string };
  timestamp: number;
  message?: {
    id: string;
    type: string;
    text?: string;
    packageId?: string;
    stickerId?: string;
    fileName?: string;
  };
}

interface LineWebhookBody {
  destination: string;
  events: LineEvent[];
}

const LINE_API = 'https://api.line.me/v2/bot';

export class LineIntegration implements WebhookIntegration {
  readonly platform: Platform = 'line';
  readonly platformRateLimit: PlatformRateLimit = { maxPerSecond: 30 };

  private config: IntegrationConfig | null = null;
  private lineConfig: LineConfig | null = null;
  private deps: IntegrationDeps | null = null;
  private logger: SecureLogger | null = null;
  private running = false;

  async init(config: IntegrationConfig, deps: IntegrationDeps): Promise<void> {
    this.config = config;
    this.deps = deps;
    this.logger = deps.logger;
    const lc = config.config as unknown as LineConfig;
    this.lineConfig = lc;
    if (!lc.channelSecret) throw new Error('Line integration requires channelSecret');
    if (!lc.channelAccessToken) throw new Error('Line integration requires channelAccessToken');
    this.logger?.info('Line integration initialized');
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.logger?.info('Line integration started — awaiting webhooks');
  }

  async stop(): Promise<void> {
    this.running = false;
    this.logger?.info('Line integration stopped');
  }

  async sendMessage(
    chatId: string,
    text: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const replyToken = metadata?.['replyToken'] as string | undefined;
    if (replyToken) {
      // Reply message (must be used within 30s of receiving event)
      const resp = await this.lineFetch('/message/reply', {
        method: 'POST',
        body: JSON.stringify({
          replyToken,
          messages: [{ type: 'text', text }],
        }),
      });
      if (!resp.ok) throw new Error(`Line reply failed: ${await resp.text()}`);
      return `line_reply_${Date.now()}`;
    }
    // Push message
    const resp = await this.lineFetch('/message/push', {
      method: 'POST',
      body: JSON.stringify({
        to: chatId,
        messages: [{ type: 'text', text }],
      }),
    });
    if (!resp.ok) throw new Error(`Line push failed: ${await resp.text()}`);
    return `line_push_${Date.now()}`;
  }

  isHealthy(): boolean {
    return this.running;
  }

  getWebhookPath(): string {
    return '/webhooks/line';
  }

  verifyWebhook(payload: string, signature: string): boolean {
    if (!this.lineConfig?.channelSecret) return false;
    try {
      const computed = createHmac('sha256', this.lineConfig.channelSecret)
        .update(payload)
        .digest('base64');
      return timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  async handleWebhook(payload: string, _signature: string): Promise<void> {
    if (!this.deps) return;
    try {
      const body = JSON.parse(payload) as LineWebhookBody;
      for (const event of body.events) {
        await this.processEvent(event, body.destination);
      }
    } catch (err) {
      this.logger?.warn('Line webhook parse error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async processEvent(event: LineEvent, destination: string): Promise<void> {
    if (!this.deps) return;
    const senderId = event.source?.userId ?? 'unknown';
    const chatId = event.source?.groupId ?? event.source?.roomId ?? senderId;

    let text: string;
    switch (event.type) {
      case 'message':
        if (event.message?.type === 'text') {
          text = event.message.text ?? '';
        } else if (event.message?.type === 'sticker') {
          text = `[Sticker: package=${event.message.packageId} id=${event.message.stickerId}]`;
        } else if (event.message?.type === 'image') {
          text = '[Image received]';
        } else {
          text = `[${event.message?.type ?? 'unknown'} message]`;
        }
        break;
      case 'follow':
        text = 'User followed the Line bot';
        break;
      case 'unfollow':
        text = 'User unfollowed the Line bot';
        break;
      case 'join':
        text = 'Bot joined a group/room';
        break;
      case 'leave':
        text = 'Bot left a group/room';
        break;
      default:
        text = `Line event: ${event.type}`;
    }

    const unified: UnifiedMessage = {
      id: `line_${event.message?.id ?? Date.now()}`,
      integrationId: this.config!.id,
      platform: 'line',
      direction: 'inbound',
      senderId,
      senderName: senderId,
      chatId,
      text,
      attachments: [],
      platformMessageId: event.message?.id ?? String(Date.now()),
      metadata: {
        eventType: event.type,
        replyToken: event.replyToken,
        sourceType: event.source?.type,
        destination,
        messageType: event.message?.type,
      },
      timestamp: event.timestamp,
    };
    await this.deps.onMessage(unified);
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const resp = await this.lineFetch('/info');
      if (!resp.ok) return { ok: false, message: `Line API error: ${resp.status}` };
      const info = (await resp.json()) as { userId: string; displayName: string };
      return { ok: true, message: `Connected as ${info.displayName} (${info.userId})` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  private async lineFetch(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${LINE_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.lineConfig?.channelAccessToken ?? ''}`,
        'Content-Type': 'application/json',
        ...((init?.headers ?? {}) as Record<string, string>),
      },
    });
  }
}
