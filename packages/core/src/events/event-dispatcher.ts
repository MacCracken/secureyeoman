/**
 * EventDispatcher — Core event bus with webhook delivery and retry logic.
 *
 * When an event is emitted, the dispatcher:
 * 1. Finds all enabled subscriptions matching the event type
 * 2. Creates a delivery record for each subscription
 * 3. Attempts HTTP POST to the webhook URL with HMAC signing
 * 4. Retries failed deliveries with exponential backoff
 *
 * A background timer processes pending retries at a configurable interval.
 */

import { createHmac } from 'node:crypto';
import type { EventSubscriptionStore } from './event-subscription-store.js';
import type { EventPayload, EventSubscription, EventDelivery } from './types.js';
import type { SecureLogger } from '../logging/logger.js';

export interface EventDispatcherDeps {
  store: EventSubscriptionStore;
  logger: SecureLogger;
}

export class EventDispatcher {
  private readonly store: EventSubscriptionStore;
  private readonly logger: SecureLogger;
  private retryTimer: ReturnType<typeof setInterval> | null = null;

  constructor(deps: EventDispatcherDeps) {
    this.store = deps.store;
    this.logger = deps.logger;
  }

  /**
   * Emit an event to all matching subscriptions.
   * Creates delivery records and attempts immediate delivery.
   */
  async emit(event: EventPayload): Promise<void> {
    let subscriptions: EventSubscription[];
    try {
      subscriptions = await this.store.getSubscriptionsForEvent(event.type, event.tenantId);
    } catch (err) {
      this.logger.error({ err }, 'EventDispatcher: failed to fetch subscriptions');
      return;
    }

    if (subscriptions.length === 0) return;

    for (const sub of subscriptions) {
      try {
        const maxAttempts = 1 + (sub.retryPolicy.maxRetries ?? 3);
        const deliveryId = await this.store.createDelivery({
          subscriptionId: sub.id,
          eventType: event.type,
          payload: event,
          maxAttempts,
          tenantId: event.tenantId,
        });

        await this.attemptDelivery(deliveryId, sub, event);
      } catch (err) {
        this.logger.error({ err, subscriptionId: sub.id }, 'EventDispatcher: delivery creation failed');
      }
    }
  }

  /**
   * Process pending retries — finds deliveries with status='retrying'
   * and next_retry_at <= now, then re-attempts delivery.
   * Returns the count of processed retries.
   */
  async processRetries(): Promise<number> {
    const now = Date.now();
    let deliveries: EventDelivery[];
    try {
      deliveries = await this.store.getPendingRetries(now);
    } catch (err) {
      this.logger.error({ err }, 'EventDispatcher: failed to fetch pending retries');
      return 0;
    }

    let count = 0;
    for (const delivery of deliveries) {
      try {
        const sub = await this.store.getSubscription(delivery.subscriptionId);
        if (!sub || !sub.enabled) {
          await this.store.updateDelivery(delivery.id, { status: 'failed', error: 'Subscription disabled or deleted' });
          count++;
          continue;
        }

        await this.attemptDelivery(delivery.id, sub, delivery.payload);
        count++;
      } catch (err) {
        this.logger.error({ err, deliveryId: delivery.id }, 'EventDispatcher: retry processing failed');
      }
    }

    return count;
  }

  /** Start the retry processing timer. */
  start(intervalMs = 30_000): void {
    if (this.retryTimer) return;
    this.retryTimer = setInterval(() => {
      void this.processRetries();
    }, intervalMs);
    this.logger.info({ intervalMs }, 'EventDispatcher: retry processor started');
  }

  /** Stop the retry processing timer. */
  stop(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
      this.logger.info('EventDispatcher: retry processor stopped');
    }
  }

  // ── Internal ──────────────────────────────────────────────

  private async attemptDelivery(
    deliveryId: string,
    sub: EventSubscription,
    event: EventPayload
  ): Promise<void> {
    const body = JSON.stringify(event);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Event-Type': event.type,
      'X-Delivery-Id': deliveryId,
      ...sub.headers,
    };

    if (sub.secret) {
      headers['X-Signature'] = createHmac('sha256', sub.secret).update(body).digest('hex');
    }

    const now = Date.now();

    try {
      const response = await fetch(sub.webhookUrl, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10_000),
      });

      const responseBody = await response.text().catch(() => '');
      const truncatedBody = responseBody.slice(0, 1000);

      if (response.ok) {
        await this.store.updateDelivery(deliveryId, {
          status: 'delivered',
          attempts: (await this.getAttempts(deliveryId)) + 1,
          lastAttemptAt: now,
          responseStatus: response.status,
          responseBody: truncatedBody,
        });
        this.logger.debug({ deliveryId, status: response.status }, 'EventDispatcher: delivery succeeded');
        return;
      }

      await this.handleFailure(deliveryId, sub, now, response.status, truncatedBody, null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.handleFailure(deliveryId, sub, now, null, null, errorMessage);
    }
  }

  private async handleFailure(
    deliveryId: string,
    sub: EventSubscription,
    now: number,
    responseStatus: number | null,
    responseBody: string | null,
    error: string | null
  ): Promise<void> {
    const currentAttempts = (await this.getAttempts(deliveryId)) + 1;
    const maxAttempts = 1 + (sub.retryPolicy.maxRetries ?? 3);

    if (currentAttempts >= maxAttempts) {
      await this.store.updateDelivery(deliveryId, {
        status: 'failed',
        attempts: currentAttempts,
        lastAttemptAt: now,
        responseStatus,
        responseBody,
        error,
      });
      this.logger.warn({ deliveryId, attempts: currentAttempts }, 'EventDispatcher: max retries exhausted');
      return;
    }

    const backoffMs = (sub.retryPolicy.backoffMs ?? 1000) * 2 ** (currentAttempts - 1);
    const nextRetryAt = now + backoffMs;

    await this.store.updateDelivery(deliveryId, {
      status: 'retrying',
      attempts: currentAttempts,
      lastAttemptAt: now,
      nextRetryAt,
      responseStatus,
      responseBody,
      error,
    });
    this.logger.debug({ deliveryId, nextRetryAt, attempts: currentAttempts }, 'EventDispatcher: scheduled retry');
  }

  private async getAttempts(deliveryId: string): Promise<number> {
    const delivery = await this.store.getDelivery(deliveryId);
    return delivery?.attempts ?? 0;
  }
}
