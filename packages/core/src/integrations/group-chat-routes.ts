/**
 * Group Chat Routes — REST API for the unified Group Chat View.
 *
 * GET  /api/v1/group-chat/channels
 * GET  /api/v1/group-chat/channels/:integrationId/:chatId/messages
 * POST /api/v1/group-chat/channels/:integrationId/:chatId/messages
 *
 * ADR 086
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { GroupChatStorage } from './group-chat-storage.js';
import type { IntegrationManager } from './manager.js';
import { sendError } from '../utils/errors.js';

export interface GroupChatRoutesOptions {
  groupChatStorage: GroupChatStorage;
  integrationManager: IntegrationManager;
}

export function registerGroupChatRoutes(
  app: FastifyInstance,
  opts: GroupChatRoutesOptions
): void {
  const { groupChatStorage, integrationManager } = opts;

  // ── Channel listing ──────────────────────────────────────────────────────

  app.get(
    '/api/v1/group-chat/channels',
    async (
      request: FastifyRequest<{
        Querystring: {
          platform?: string;
          integrationId?: string;
          limit?: string;
          offset?: string;
        };
      }>
    ) => {
      const { platform, integrationId, limit, offset } = request.query;
      return groupChatStorage.listChannels({
        platform,
        integrationId,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      });
    }
  );

  // ── Messages in a channel ────────────────────────────────────────────────

  app.get(
    '/api/v1/group-chat/channels/:integrationId/:chatId/messages',
    async (
      request: FastifyRequest<{
        Params: { integrationId: string; chatId: string };
        Querystring: { limit?: string; offset?: string; before?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { integrationId, chatId } = request.params;
      const { limit, offset, before } = request.query;

      // Validate integration exists
      const integration = await integrationManager.getIntegration(integrationId);
      if (!integration) {
        return sendError(reply, 404, `Integration not found: ${integrationId}`);
      }

      return groupChatStorage.listMessages(integrationId, chatId, {
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
        before: before ? Number(before) : undefined,
      });
    }
  );

  // ── Send a message to a channel ──────────────────────────────────────────

  app.post(
    '/api/v1/group-chat/channels/:integrationId/:chatId/messages',
    async (
      request: FastifyRequest<{
        Params: { integrationId: string; chatId: string };
        Body: { text: string };
      }>,
      reply: FastifyReply
    ) => {
      const { integrationId, chatId } = request.params;
      const { text } = request.body;

      if (!text || typeof text !== 'string' || !text.trim()) {
        return sendError(reply, 400, 'text is required');
      }

      const integration = await integrationManager.getIntegration(integrationId);
      if (!integration) {
        return sendError(reply, 404, `Integration not found: ${integrationId}`);
      }

      try {
        await integrationManager.sendMessage(integrationId, chatId, text.trim(), {
          source: 'group_chat_dashboard',
        });
        return reply.code(201).send({ success: true, integrationId, chatId, text: text.trim() });
      } catch (err) {
        return sendError(
          reply,
          500,
          err instanceof Error ? err.message : 'Failed to send message'
        );
      }
    }
  );
}
