/**
 * Notification Routes — Phase 51: Real-Time Infrastructure
 *
 * REST endpoints at /api/v1/notifications.
 *
 * GET  /              — list notifications (with optional unreadOnly, limit, offset)
 * GET  /count         — lightweight unread count for badge polling
 * POST /:id/read      — mark single notification read
 * POST /read-all      — mark all notifications read
 * DELETE /:id         — delete a notification
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { NotificationManager } from './notification-manager.js';
import { sendError, toErrorMessage } from '../utils/errors.js';
import { parsePagination } from '../utils/pagination.js';

export interface NotificationRoutesOptions {
  notificationManager: NotificationManager;
}

export function registerNotificationRoutes(
  app: FastifyInstance,
  opts: NotificationRoutesOptions
): void {
  const { notificationManager } = opts;

  // ── GET /api/v1/notifications ──────────────────────────────────────────────
  app.get(
    '/api/v1/notifications',
    async (
      req: FastifyRequest<{
        Querystring: {
          unreadOnly?: string;
          limit?: string;
          offset?: string;
        };
      }>,
      reply
    ) => {
      try {
        const unreadOnly = req.query.unreadOnly === 'true' || req.query.unreadOnly === '1';
        const { limit, offset } = parsePagination(req.query, { maxLimit: 100, defaultLimit: 50 });

        const [result, unreadCount] = await Promise.all([
          notificationManager.list({ unreadOnly, limit, offset }),
          notificationManager.unreadCount(),
        ]);

        return reply.send({
          notifications: result.notifications,
          total: result.total,
          unreadCount,
        });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── GET /api/v1/notifications/count ───────────────────────────────────────
  app.get('/api/v1/notifications/count', async (_req, reply) => {
    try {
      const unreadCount = await notificationManager.unreadCount();
      return reply.send({ unreadCount });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── POST /api/v1/notifications/:id/read ───────────────────────────────────
  app.post(
    '/api/v1/notifications/:id/read',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const { id } = req.params;
      try {
        const ok = await notificationManager.markRead(id);
        if (!ok) {
          return sendError(reply, 404, 'Notification not found or already read');
        }
        return reply.send({ ok: true });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── POST /api/v1/notifications/read-all ───────────────────────────────────
  app.post('/api/v1/notifications/read-all', async (_req, reply) => {
    try {
      const updated = await notificationManager.markAllRead();
      return reply.send({ updated });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── DELETE /api/v1/notifications/:id ──────────────────────────────────────
  app.delete(
    '/api/v1/notifications/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const { id } = req.params;
      try {
        const ok = await notificationManager.delete(id);
        if (!ok) {
          return sendError(reply, 404, 'Notification not found');
        }
        return reply.send({ ok: true });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );
}
