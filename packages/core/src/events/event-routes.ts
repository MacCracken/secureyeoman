/**
 * Event Subscription Routes — REST endpoints for managing event subscriptions
 * and viewing webhook delivery history.
 */

import type { FastifyInstance } from 'fastify';
import type { EventDispatcher } from './event-dispatcher.js';
import type { EventSubscriptionStore } from './event-subscription-store.js';
import { ALL_EVENT_TYPES, type EventType } from './types.js';
import { sendError, toErrorMessage } from '../utils/errors.js';
import { parsePagination } from '../utils/pagination.js';
import { uuidv7 } from '../utils/crypto.js';

export interface EventRoutesOptions {
  dispatcher: EventDispatcher;
  store: EventSubscriptionStore;
}

export function registerEventRoutes(app: FastifyInstance, opts: EventRoutesOptions): void {
  const { dispatcher, store } = opts;

  // POST /api/v1/events/subscriptions — create subscription
  app.post('/api/v1/events/subscriptions', async (req, reply) => {
    try {
      const body = req.body as {
        name?: string;
        eventTypes?: string[];
        webhookUrl?: string;
        secret?: string | null;
        enabled?: boolean;
        headers?: Record<string, string>;
        retryPolicy?: { maxRetries: number; backoffMs: number };
        tenantId?: string;
      };

      if (!body.name || typeof body.name !== 'string') {
        return sendError(reply, 400, 'name is required');
      }
      if (!body.webhookUrl || typeof body.webhookUrl !== 'string') {
        return sendError(reply, 400, 'webhookUrl is required');
      }
      if (!Array.isArray(body.eventTypes) || body.eventTypes.length === 0) {
        return sendError(reply, 400, 'eventTypes must be a non-empty array');
      }

      // Validate event types
      for (const et of body.eventTypes) {
        if (!ALL_EVENT_TYPES.includes(et as EventType)) {
          return sendError(reply, 400, `Invalid event type: ${et}`);
        }
      }

      const id = await store.createSubscription({
        name: body.name,
        eventTypes: body.eventTypes as EventType[],
        webhookUrl: body.webhookUrl,
        secret: body.secret,
        enabled: body.enabled,
        headers: body.headers,
        retryPolicy: body.retryPolicy,
        tenantId: body.tenantId,
      });

      const subscription = await store.getSubscription(id);
      return reply.code(201).send({ subscription });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // GET /api/v1/events/subscriptions — list subscriptions
  app.get('/api/v1/events/subscriptions', async (req, reply) => {
    try {
      const query = req.query as { tenantId?: string; limit?: string; offset?: string };
      const { limit, offset } = parsePagination(query);
      const result = await store.listSubscriptions({
        tenantId: query.tenantId,
        limit,
        offset,
      });
      return reply.send(result);
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // GET /api/v1/events/subscriptions/:id — get subscription
  app.get<{ Params: { id: string } }>('/api/v1/events/subscriptions/:id', async (req, reply) => {
    try {
      const subscription = await store.getSubscription(req.params.id);
      if (!subscription) return sendError(reply, 404, 'Subscription not found');
      return reply.send({ subscription });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // PUT /api/v1/events/subscriptions/:id — update subscription
  app.put<{ Params: { id: string } }>('/api/v1/events/subscriptions/:id', async (req, reply) => {
    try {
      const existing = await store.getSubscription(req.params.id);
      if (!existing) return sendError(reply, 404, 'Subscription not found');

      const body = req.body as {
        name?: string;
        eventTypes?: string[];
        webhookUrl?: string;
        secret?: string | null;
        enabled?: boolean;
        headers?: Record<string, string>;
        retryPolicy?: { maxRetries: number; backoffMs: number };
      };

      if (body.eventTypes) {
        for (const et of body.eventTypes) {
          if (!ALL_EVENT_TYPES.includes(et as EventType)) {
            return sendError(reply, 400, `Invalid event type: ${et}`);
          }
        }
      }

      await store.updateSubscription(req.params.id, {
        name: body.name,
        eventTypes: body.eventTypes as EventType[] | undefined,
        webhookUrl: body.webhookUrl,
        secret: body.secret,
        enabled: body.enabled,
        headers: body.headers,
        retryPolicy: body.retryPolicy,
      });

      const updated = await store.getSubscription(req.params.id);
      return reply.send({ subscription: updated });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // DELETE /api/v1/events/subscriptions/:id — delete subscription
  app.delete<{ Params: { id: string } }>('/api/v1/events/subscriptions/:id', async (req, reply) => {
    try {
      const count = await store.deleteSubscription(req.params.id);
      if (count === 0) return sendError(reply, 404, 'Subscription not found');
      return reply.send({ deleted: true });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // GET /api/v1/events/subscriptions/:id/deliveries — list deliveries
  app.get<{ Params: { id: string } }>(
    '/api/v1/events/subscriptions/:id/deliveries',
    async (req, reply) => {
      try {
        const subscription = await store.getSubscription(req.params.id);
        if (!subscription) return sendError(reply, 404, 'Subscription not found');

        const query = req.query as { limit?: string; offset?: string };
        const { limit, offset } = parsePagination(query);
        const result = await store.listDeliveries(req.params.id, { limit, offset });
        return reply.send(result);
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // POST /api/v1/events/subscriptions/:id/test — send test event
  app.post<{ Params: { id: string } }>(
    '/api/v1/events/subscriptions/:id/test',
    async (req, reply) => {
      try {
        const subscription = await store.getSubscription(req.params.id);
        if (!subscription) return sendError(reply, 404, 'Subscription not found');

        const testEvent = {
          id: uuidv7(),
          type: subscription.eventTypes[0] ?? ('conversation.started' as const),
          timestamp: Date.now(),
          tenantId: subscription.tenantId,
          data: { test: true, message: 'This is a test event from SecureYeoman' },
        };

        await dispatcher.emit(testEvent);
        return reply.send({ sent: true, event: testEvent });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );
}
