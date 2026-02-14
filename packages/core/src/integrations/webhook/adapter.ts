/**
 * Webhook Integration — Generic HTTP webhook adapter.
 *
 * Outbound: POSTs messages to a configured webhook URL.
 * Inbound: Accepts POSTs via a dedicated route, verifies an optional
 * HMAC-SHA256 signature, and normalizes the payload to UnifiedMessage.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IntegrationConfig, UnifiedMessage, Platform } from '@friday/shared';
import type { WebhookIntegration, IntegrationDeps, PlatformRateLimit } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

interface WebhookConfig {
  webhookUrl?: string;
  secret?: string;
}

export class GenericWebhookIntegration implements WebhookIntegration {
  readonly platform: Platform = 'webhook';
  readonly platformRateLimit: PlatformRateLimit = { maxPerSecond: 30 };

  private config: IntegrationConfig | null = null;
  private deps: IntegrationDeps | null = null;
  private logger: SecureLogger | null = null;
  private running = false;
  private webhookUrl = '';
  private secret = '';

  async init(config: IntegrationConfig, deps: IntegrationDeps): Promise<void> {
    this.config = config;
    this.deps = deps;
    this.logger = deps.logger;

    const wh = config.config as unknown as WebhookConfig;
    this.webhookUrl = wh.webhookUrl ?? '';
    this.secret = wh.secret ?? '';

    this.logger?.info('Webhook integration initialized', {
      displayName: config.displayName,
      hasUrl: !!this.webhookUrl,
      hasSigned: !!this.secret,
    });
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.logger?.info('Webhook integration started');
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.logger?.info('Webhook integration stopped');
  }

  /**
   * Send a message by POSTing to the configured webhook URL.
   */
  async sendMessage(
    chatId: string,
    text: string,
    metadata?: Record<string, unknown>,
  ): Promise<string> {
    if (!this.webhookUrl) {
      throw new Error('No webhook URL configured');
    }

    const payload = JSON.stringify({ chatId, text, metadata, timestamp: Date.now() });
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (this.secret) {
      headers['X-Webhook-Signature'] = this.sign(payload);
    }

    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers,
      body: payload,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Webhook delivery failed (${response.status}): ${error}`);
    }

    return `wh_${Date.now()}`;
  }

  isHealthy(): boolean {
    return this.running;
  }

  // ── WebhookIntegration methods ─────────────────────────

  getWebhookPath(): string {
    return `/api/v1/webhooks/custom/${this.config?.id ?? 'unknown'}`;
  }

  verifyWebhook(payload: string, signature: string): boolean {
    if (!this.secret) return true; // no secret = skip verification
    const expected = this.sign(payload);
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  /**
   * Handle an inbound webhook payload. Normalizes to UnifiedMessage
   * and forwards to the integration manager's onMessage callback.
   */
  async handleInbound(body: Record<string, unknown>): Promise<void> {
    if (!this.deps) throw new Error('Integration not initialized');

    const unified: UnifiedMessage = {
      id: `wh_in_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      integrationId: this.config!.id,
      platform: 'webhook',
      direction: 'inbound',
      senderId: String(body.senderId ?? 'external'),
      senderName: String(body.senderName ?? 'Webhook'),
      chatId: String(body.chatId ?? 'default'),
      text: String(body.text ?? ''),
      attachments: [],
      platformMessageId: String(body.id ?? ''),
      metadata: body.metadata as Record<string, unknown> ?? {},
      timestamp: typeof body.timestamp === 'number' ? body.timestamp : Date.now(),
    };

    await this.deps.onMessage(unified);
  }

  private sign(payload: string): string {
    return `sha256=${createHmac('sha256', this.secret).update(payload).digest('hex')}`;
  }
}
