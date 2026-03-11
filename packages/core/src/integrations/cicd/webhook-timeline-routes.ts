/**
 * Webhook Timeline Routes — REST endpoints for querying the webhook event timeline.
 *
 * GET  /api/v1/webhooks/timeline      — list events (filterable)
 * GET  /api/v1/webhooks/timeline/:id  — get single event
 * DELETE /api/v1/webhooks/timeline    — clear all events
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sendError } from '../../utils/errors.js';
import type { WebhookEventStore } from './webhook-event-store.js';

export interface WebhookTimelineRoutesOptions {
  webhookEventStore: WebhookEventStore;
}

export function registerWebhookTimelineRoutes(
  app: FastifyInstance,
  opts: WebhookTimelineRoutesOptions
): void {
  const { webhookEventStore } = opts;

  // GET /api/v1/webhooks/timeline — list events with filters
  app.get(
    '/api/v1/webhooks/timeline',
    { config: { skipAuth: true } } as Record<string, unknown>,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as Record<string, string | undefined>;
      const provider = query.provider || undefined;
      const repo = query.repo || undefined;
      const event = query.event || undefined;
      const limit = query.limit ? parseInt(query.limit, 10) : 50;
      const offset = query.offset ? parseInt(query.offset, 10) : 0;

      const result = webhookEventStore.list({ provider, repo, event, limit, offset });
      return reply.send(result);
    }
  );

  // GET /api/v1/webhooks/timeline/:id — get single event
  app.get(
    '/api/v1/webhooks/timeline/:id',
    { config: { skipAuth: true } } as Record<string, unknown>,
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      const event = webhookEventStore.get(id);
      if (!event) {
        return sendError(reply, 404, `Webhook event not found: ${id}`);
      }
      return reply.send({ event });
    }
  );

  // DELETE /api/v1/webhooks/timeline — clear all events
  app.delete(
    '/api/v1/webhooks/timeline',
    { config: { skipAuth: true } } as Record<string, unknown>,
    async (_request: FastifyRequest, reply: FastifyReply) => {
      webhookEventStore.clear();
      return reply.status(204).send();
    }
  );
}
