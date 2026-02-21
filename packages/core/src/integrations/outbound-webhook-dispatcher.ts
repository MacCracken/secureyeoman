/**
 * OutboundWebhookDispatcher — fires HTTP POST events to configured webhook URLs.
 *
 * Dispatch is fire-and-forget: `dispatch()` returns immediately and delivery
 * runs in the background.  Failed deliveries are retried with exponential
 * backoff up to `maxRetries`.  Each delivery attempt records the HTTP status
 * code and updates the consecutive-failure counter in the database.
 *
 * If a `secret` is set on the webhook, a `X-Webhook-Signature` header is
 * included with an HMAC-SHA256 digest of the serialised payload body.
 */

import { createHmac } from 'node:crypto';
import type {
  OutboundWebhookStorage,
  OutboundWebhookEvent,
  OutboundWebhook,
} from './outbound-webhook-storage.js';
import type { SecureLogger } from '../logging/logger.js';
import { isPrivateUrl } from '../utils/ssrf-guard.js';

// ─── Payload shape ────────────────────────────────────────────

export interface OutboundWebhookPayload {
  event: OutboundWebhookEvent;
  timestamp: number;
  data: Record<string, unknown>;
}

// ─── Config ───────────────────────────────────────────────────

export interface OutboundWebhookDispatcherConfig {
  maxRetries?: number;
  baseDelayMs?: number;
}

// ─── Dispatcher ───────────────────────────────────────────────

export class OutboundWebhookDispatcher {
  private readonly storage: OutboundWebhookStorage;
  private readonly logger: SecureLogger;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;

  constructor(
    storage: OutboundWebhookStorage,
    logger: SecureLogger,
    config?: OutboundWebhookDispatcherConfig
  ) {
    this.storage = storage;
    this.logger = logger;
    this.maxRetries = config?.maxRetries ?? 3;
    this.baseDelayMs = config?.baseDelayMs ?? 1000;
  }

  /**
   * Fire all enabled webhooks that subscribe to `event`.
   * Returns immediately; delivery happens asynchronously in the background.
   */
  dispatch(event: OutboundWebhookEvent, data: Record<string, unknown>): void {
    const payload: OutboundWebhookPayload = { event, timestamp: Date.now(), data };

    // Non-blocking — we intentionally don't await this
    void this.deliverAll(event, payload);
  }

  /** Internal — fetches matching webhooks and delivers to each. */
  private async deliverAll(
    event: OutboundWebhookEvent,
    payload: OutboundWebhookPayload
  ): Promise<void> {
    let webhooks: OutboundWebhook[];
    try {
      webhooks = await this.storage.listForEvent(event);
    } catch (err) {
      this.logger.error(`OutboundWebhookDispatcher: failed to list webhooks for event ${event}`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    for (const wh of webhooks) {
      void this.deliverWithRetry(wh, payload);
    }
  }

  /** Deliver to a single webhook with retries. */
  private async deliverWithRetry(
    wh: OutboundWebhook,
    payload: OutboundWebhookPayload
  ): Promise<void> {
    // SSRF guard: block delivery to private/internal network addresses
    if (isPrivateUrl(wh.url)) {
      this.logger.warn('OutboundWebhookDispatcher: blocked SSRF attempt', {
        webhookId: wh.id,
        url: wh.url,
      });
      return;
    }

    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-SecureYeoman-Event': payload.event,
    };

    if (wh.secret) {
      headers['X-Webhook-Signature'] = this.sign(body, wh.secret);
    }

    let attempt = 0;
    let lastStatus: number | null = null;

    while (attempt <= this.maxRetries) {
      if (attempt > 0) {
        await this.sleep(this.baseDelayMs * 2 ** (attempt - 1));
      }

      try {
        const response = await fetch(wh.url, { method: 'POST', headers, body });
        lastStatus = response.status;

        if (response.ok) {
          await this.storage.recordSuccess(wh.id, lastStatus).catch(() => {});
          this.logger.debug(
            `OutboundWebhookDispatcher: delivered ${payload.event} to ${wh.url} (${lastStatus})`
          );
          return;
        }

        this.logger.warn(
          `OutboundWebhookDispatcher: HTTP ${lastStatus} from ${wh.url} (attempt ${attempt + 1})`
        );
      } catch (err) {
        this.logger.warn(
          `OutboundWebhookDispatcher: network error posting to ${wh.url} (attempt ${attempt + 1})`,
          { error: err instanceof Error ? err.message : String(err) }
        );
      }

      attempt++;
    }

    // All retries exhausted
    await this.storage.recordFailure(wh.id, lastStatus).catch(() => {});
    this.logger.error(
      `OutboundWebhookDispatcher: all retries exhausted for ${wh.url} (event ${payload.event})`
    );
  }

  private sign(payload: string, secret: string): string {
    return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
