/**
 * Stripe Integration
 *
 * Webhook-based adapter receiving Stripe payment events.
 * Normalizes payment_intent, customer, and invoice events to UnifiedMessage.
 * sendMessage() is a no-op (Stripe is event-source only).
 */

import { createHmac } from 'crypto';
import type { IntegrationConfig, UnifiedMessage, Platform } from '@secureyeoman/shared';
import type { WebhookIntegration, IntegrationDeps, PlatformRateLimit } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
}

interface StripeEvent {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
  livemode: boolean;
}

const STRIPE_API = 'https://api.stripe.com/v1';

export class StripeIntegration implements WebhookIntegration {
  readonly platform: Platform = 'stripe';
  readonly platformRateLimit: PlatformRateLimit = { maxPerSecond: 25 };

  private config: IntegrationConfig | null = null;
  private stripeConfig: StripeConfig | null = null;
  private deps: IntegrationDeps | null = null;
  private logger: SecureLogger | null = null;
  private running = false;

  async init(config: IntegrationConfig, deps: IntegrationDeps): Promise<void> {
    this.config = config;
    this.deps = deps;
    this.logger = deps.logger;
    const sc = config.config as unknown as StripeConfig;
    this.stripeConfig = sc;
    if (!sc.secretKey) throw new Error('Stripe integration requires a secretKey');
    if (!sc.webhookSecret) throw new Error('Stripe integration requires a webhookSecret');
    this.logger?.info('Stripe integration initialized');
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.logger?.info('Stripe integration started — awaiting webhooks');
  }

  async stop(): Promise<void> {
    this.running = false;
    this.logger?.info('Stripe integration stopped');
  }

  async sendMessage(
    _chatId: string,
    _text: string,
    _metadata?: Record<string, unknown>
  ): Promise<string> {
    // Stripe is inbound-only; outbound is not applicable
    return `stripe_noop_${Date.now()}`;
  }

  isHealthy(): boolean {
    return this.running;
  }

  getWebhookPath(): string {
    return '/webhooks/stripe';
  }

  verifyWebhook(payload: string, signature: string): boolean {
    if (!this.stripeConfig?.webhookSecret) return false;
    try {
      // Stripe-Signature header: t=<timestamp>,v1=<sig>
      const parts = Object.fromEntries(signature.split(',').map((p) => p.split('=')));
      const timestamp = parts['t'];
      const expectedSig = parts['v1'];
      if (!timestamp || !expectedSig) return false;
      const signed = `${timestamp}.${payload}`;
      const computed = createHmac('sha256', this.stripeConfig.webhookSecret)
        .update(signed)
        .digest('hex');
      return computed === expectedSig;
    } catch {
      return false;
    }
  }

  async handleWebhook(payload: string, _signature: string): Promise<void> {
    if (!this.deps) return;
    try {
      const event = JSON.parse(payload) as StripeEvent;
      const obj = event.data.object;
      const id = (obj['id'] as string | undefined) ?? event.id;
      const amount = obj['amount'] as number | undefined;
      const currency = obj['currency'] as string | undefined;
      const customer = (obj['customer'] as string | undefined) ?? '';

      let text: string;
      switch (event.type) {
        case 'payment_intent.succeeded':
          text = `Payment succeeded: ${amount != null ? `${amount / 100} ${(currency ?? '').toUpperCase()}` : 'unknown amount'} (customer: ${customer || 'anonymous'})`;
          break;
        case 'payment_intent.payment_failed':
          text = `Payment failed: ${(obj['last_payment_error'] as Record<string, string> | undefined)?.message ?? 'unknown error'} (customer: ${customer || 'anonymous'})`;
          break;
        case 'customer.created':
          text = `New Stripe customer: ${(obj['email'] as string | undefined) ?? id}`;
          break;
        case 'customer.deleted':
          text = `Stripe customer deleted: ${(obj['email'] as string | undefined) ?? id}`;
          break;
        case 'invoice.paid':
          text = `Invoice paid: ${amount != null ? `${amount / 100} ${(currency ?? '').toUpperCase()}` : 'unknown'} (customer: ${customer || 'anonymous'})`;
          break;
        case 'invoice.payment_failed':
          text = `Invoice payment failed (customer: ${customer || 'anonymous'})`;
          break;
        default:
          text = `Stripe event: ${event.type}`;
      }

      const unified: UnifiedMessage = {
        id: `stripe_${event.id}`,
        integrationId: this.config!.id,
        platform: 'stripe',
        direction: 'inbound',
        senderId: customer || 'stripe',
        senderName: 'Stripe',
        chatId: customer || 'stripe',
        text,
        attachments: [],
        platformMessageId: event.id,
        metadata: {
          eventType: event.type,
          eventId: event.id,
          livemode: event.livemode,
          objectId: id,
          amount,
          currency,
          customer,
        },
        timestamp: event.created * 1000,
      };
      await this.deps.onMessage(unified);
    } catch (err) {
      this.logger?.warn('Stripe webhook parse error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const resp = await fetch(`${STRIPE_API}/account`, {
        headers: { Authorization: `Bearer ${this.stripeConfig?.secretKey ?? ''}` },
      });
      if (!resp.ok) return { ok: false, message: `Stripe API error: ${resp.status}` };
      const account = (await resp.json()) as { id: string; business_profile?: { name?: string } };
      return {
        ok: true,
        message: `Connected to Stripe account ${account.business_profile?.name ?? account.id}`,
      };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }
}
