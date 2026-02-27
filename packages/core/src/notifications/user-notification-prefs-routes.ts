/**
 * User Notification Preferences Routes — Phase 55
 *
 * REST endpoints at /api/v1/users/me/notification-prefs.
 * Auth required (existing JWT middleware via authHook on all /api/v1 routes).
 *
 * GET    /api/v1/users/me/notification-prefs       → list prefs for auth user
 * POST   /api/v1/users/me/notification-prefs       → create/upsert a pref
 * PUT    /api/v1/users/me/notification-prefs/:id   → update a pref
 * DELETE /api/v1/users/me/notification-prefs/:id   → delete a pref
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { UserNotificationPrefsStorage } from './user-notification-prefs-storage.js';
import type { NotificationLevel } from './notification-storage.js';
import { sendError, toErrorMessage } from '../utils/errors.js';

const VALID_CHANNELS = ['slack', 'telegram', 'discord', 'email'] as const;
const VALID_LEVELS = ['info', 'warn', 'error', 'critical'] as const;

export interface UserNotificationPrefsRoutesOptions {
  userNotificationPrefsStorage: UserNotificationPrefsStorage;
}

export function registerUserNotificationPrefsRoutes(
  app: FastifyInstance,
  opts: UserNotificationPrefsRoutesOptions
): void {
  const { userNotificationPrefsStorage } = opts;

  // ── GET /api/v1/users/me/notification-prefs ─────────────────────────────
  app.get('/api/v1/users/me/notification-prefs', async (request, reply) => {
    const userId = request.authUser?.userId;
    if (!userId) return sendError(reply, 401, 'Authentication required');

    try {
      const prefs = await userNotificationPrefsStorage.list(userId);
      return reply.send({ prefs });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── POST /api/v1/users/me/notification-prefs ────────────────────────────
  app.post(
    '/api/v1/users/me/notification-prefs',
    async (
      request: FastifyRequest<{
        Body: {
          channel?: unknown;
          integrationId?: unknown;
          chatId?: unknown;
          enabled?: unknown;
          quietHoursStart?: unknown;
          quietHoursEnd?: unknown;
          minLevel?: unknown;
        };
      }>,
      reply
    ) => {
      const userId = request.authUser?.userId;
      if (!userId) return sendError(reply, 401, 'Authentication required');

      const { channel, chatId, integrationId, enabled, quietHoursStart, quietHoursEnd, minLevel } =
        request.body ?? {};

      if (!VALID_CHANNELS.includes(channel as (typeof VALID_CHANNELS)[number])) {
        return sendError(
          reply,
          400,
          `Invalid channel. Must be one of: ${VALID_CHANNELS.join(', ')}`
        );
      }
      if (typeof chatId !== 'string' || chatId.trim() === '') {
        return sendError(reply, 400, 'chatId is required');
      }
      if (
        minLevel !== undefined &&
        !VALID_LEVELS.includes(minLevel as (typeof VALID_LEVELS)[number])
      ) {
        return sendError(
          reply,
          400,
          `Invalid minLevel. Must be one of: ${VALID_LEVELS.join(', ')}`
        );
      }

      try {
        const pref = await userNotificationPrefsStorage.upsert(userId, {
          channel: channel as string,
          chatId: chatId.trim(),
          integrationId: typeof integrationId === 'string' ? integrationId : null,
          enabled: enabled !== undefined ? Boolean(enabled) : true,
          quietHoursStart:
            quietHoursStart != null && !isNaN(Number(quietHoursStart))
              ? Number(quietHoursStart)
              : null,
          quietHoursEnd:
            quietHoursEnd != null && !isNaN(Number(quietHoursEnd)) ? Number(quietHoursEnd) : null,
          minLevel: ((minLevel as string) ?? 'info') as NotificationLevel,
        });
        return reply.code(201).send({ pref });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── PUT /api/v1/users/me/notification-prefs/:id ─────────────────────────
  app.put(
    '/api/v1/users/me/notification-prefs/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          channel?: unknown;
          integrationId?: unknown;
          chatId?: unknown;
          enabled?: unknown;
          quietHoursStart?: unknown;
          quietHoursEnd?: unknown;
          minLevel?: unknown;
        };
      }>,
      reply
    ) => {
      const userId = request.authUser?.userId;
      if (!userId) return sendError(reply, 401, 'Authentication required');

      const { id } = request.params;
      const body = request.body ?? {};

      if (
        body.channel !== undefined &&
        !VALID_CHANNELS.includes(body.channel as (typeof VALID_CHANNELS)[number])
      ) {
        return sendError(
          reply,
          400,
          `Invalid channel. Must be one of: ${VALID_CHANNELS.join(', ')}`
        );
      }
      if (
        body.minLevel !== undefined &&
        !VALID_LEVELS.includes(body.minLevel as (typeof VALID_LEVELS)[number])
      ) {
        return sendError(
          reply,
          400,
          `Invalid minLevel. Must be one of: ${VALID_LEVELS.join(', ')}`
        );
      }

      try {
        const patch: Parameters<typeof userNotificationPrefsStorage.update>[2] = {};
        if (body.channel !== undefined) patch.channel = body.channel as string;
        if (body.chatId !== undefined) patch.chatId = (body.chatId as string).trim();
        if (body.integrationId !== undefined)
          patch.integrationId = typeof body.integrationId === 'string' ? body.integrationId : null;
        if (body.enabled !== undefined) patch.enabled = Boolean(body.enabled);
        if (body.quietHoursStart !== undefined)
          patch.quietHoursStart =
            body.quietHoursStart != null && !isNaN(Number(body.quietHoursStart))
              ? Number(body.quietHoursStart)
              : null;
        if (body.quietHoursEnd !== undefined)
          patch.quietHoursEnd =
            body.quietHoursEnd != null && !isNaN(Number(body.quietHoursEnd))
              ? Number(body.quietHoursEnd)
              : null;
        if (body.minLevel !== undefined) patch.minLevel = body.minLevel as any;

        const pref = await userNotificationPrefsStorage.update(userId, id, patch);
        if (!pref) return sendError(reply, 404, 'Notification preference not found');
        return reply.send({ pref });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── DELETE /api/v1/users/me/notification-prefs/:id ──────────────────────
  app.delete(
    '/api/v1/users/me/notification-prefs/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const userId = request.authUser?.userId;
      if (!userId) return sendError(reply, 401, 'Authentication required');

      const { id } = request.params;
      try {
        const ok = await userNotificationPrefsStorage.delete(userId, id);
        if (!ok) return sendError(reply, 404, 'Notification preference not found');
        return reply.send({ ok: true });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );
}
