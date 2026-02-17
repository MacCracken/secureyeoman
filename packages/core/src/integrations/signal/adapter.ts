/**
 * SignalIntegration — Signal messenger adapter.
 *
 * Supports two modes:
 * 1. Webhook mode: Receive messages via HTTP webhook from signal-cli or bot gateway
 * 2. REST mode: Send messages via signal-cli REST API
 *
 * Normalizes inbound messages to UnifiedMessage and routes them
 * through the IntegrationManager's onMessage callback.
 */

import type { IntegrationConfig, UnifiedMessage, Platform } from '@friday/shared';
import type { Integration, IntegrationDeps } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

export class SignalIntegration implements Integration {
  readonly platform: Platform = 'signal';

  private config: IntegrationConfig | null = null;
  private deps: IntegrationDeps | null = null;
  private logger: SecureLogger | null = null;
  private running = false;

  async init(config: IntegrationConfig, deps: IntegrationDeps): Promise<void> {
    this.config = config;
    this.deps = deps;
    this.logger = deps.logger;

    const webhookSecret = config.config.webhookSecret as string | undefined;
    if (!webhookSecret) {
      this.logger?.warn(
        'Signal integration initialized without webhook secret - inbound messages will not be verified'
      );
    }

    this.logger?.info('Signal integration initialized');
  }

  async start(): Promise<void> {
    if (this.running) return;

    this.running = true;
    this.logger?.info('Signal integration started');
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.logger?.info('Signal integration stopped');
  }

  async sendMessage(
    chatId: string,
    text: string,
    _metadata?: Record<string, unknown>
  ): Promise<string> {
    const signalCliUrl = this.config?.config.signalCliUrl as string | undefined;
    const signalCliToken = this.config?.config.signalCliToken as string | undefined;

    if (!signalCliUrl) {
      throw new Error('Signal CLI URL not configured');
    }

    const response = await fetch(`${signalCliUrl}/v2/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(signalCliToken ? { Authorization: `Bearer ${signalCliToken}` } : {}),
      },
      body: JSON.stringify({
        recipient: chatId,
        message: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send Signal message: ${error}`);
    }

    const result = (await response.json()) as { timestamp?: number };
    return `signal_${result.timestamp || Date.now()}`;
  }

  isHealthy(): boolean {
    return this.running;
  }

  handleWebhook(payload: Record<string, unknown>): void {
    if (!this.config) return;

    const envelope = payload.envelope as
      | {
          source?: string;
          sourceNumber?: string;
          sourceUuid?: string;
          message?: { body?: string; timestamp?: number };
        }
      | undefined;
    if (!envelope?.message?.body) return;

    const senderId = envelope.sourceNumber || envelope.sourceUuid || envelope.source || 'unknown';
    const unified: UnifiedMessage = {
      id: `signal_${envelope.message.timestamp || Date.now()}`,
      integrationId: this.config.id,
      platform: 'signal',
      direction: 'inbound',
      senderId,
      senderName: senderId,
      chatId: senderId,
      text: envelope.message.body,
      attachments: [],
      platformMessageId: String(envelope.message.timestamp),
      metadata: {},
      timestamp: envelope.message.timestamp || Date.now(),
    };

    this.deps?.onMessage(unified);
  }
}
