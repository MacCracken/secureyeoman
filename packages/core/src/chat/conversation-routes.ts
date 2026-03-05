/**
 * Conversation Routes — CRUD for persistent chat conversations.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ConversationStorage } from './conversation-storage.js';
import type { HistoryCompressor } from './compression/compressor.js';
import { sendError } from '../utils/errors.js';
import { parsePagination } from '../utils/pagination.js';

export interface ConversationRoutesOptions {
  conversationStorage: ConversationStorage;
  historyCompressor?: HistoryCompressor;
}

export function registerConversationRoutes(
  app: FastifyInstance,
  opts: ConversationRoutesOptions
): void {
  const { conversationStorage, historyCompressor } = opts;

  // ── Compression Routes ──────────────────────────────────────

  app.get(
    '/api/v1/conversations/:id/history',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { tier?: string };
      }>,
      reply: FastifyReply
    ) => {
      if (!historyCompressor) {
        return sendError(reply, 503, 'History compression not available');
      }
      const entries = await historyCompressor.getHistory(request.params.id);
      const tier = request.query.tier;
      const filtered = tier ? entries.filter((e) => e.tier === tier) : entries;
      return { entries: filtered, total: filtered.length };
    }
  );

  app.post(
    '/api/v1/conversations/:id/seal-topic',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!historyCompressor) {
        return sendError(reply, 503, 'History compression not available');
      }
      await historyCompressor.sealCurrentTopic(request.params.id);
      return { message: 'Topic sealed' };
    }
  );

  app.get(
    '/api/v1/conversations/:id/compressed-context',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { maxTokens?: string };
      }>,
      reply: FastifyReply
    ) => {
      if (!historyCompressor) {
        return sendError(reply, 503, 'History compression not available');
      }
      const maxTokens = request.query.maxTokens ? Number(request.query.maxTokens) : 4000;
      const context = await historyCompressor.getContext(request.params.id, maxTokens);
      return context;
    }
  );

  // List conversations (paginated, sorted by updated_at DESC)
  // Optionally filtered to a specific personality via ?personalityId=<id>
  app.get(
    '/api/v1/conversations',
    async (
      request: FastifyRequest<{
        Querystring: { limit?: string; offset?: string; personalityId?: string };
      }>
    ) => {
      const { limit, offset } = parsePagination(request.query, { maxLimit: 100, defaultLimit: 50 });
      const { personalityId } = request.query;
      return await conversationStorage.listConversations({ limit, offset, personalityId });
    }
  );

  // Create conversation
  app.post(
    '/api/v1/conversations',
    async (
      request: FastifyRequest<{
        Body: { title: string; personalityId?: string; strategyId?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { title, personalityId, strategyId } = request.body;
      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return sendError(reply, 400, 'Title is required');
      }
      const conversation = await conversationStorage.createConversation({
        title: title.trim(),
        personalityId,
        strategyId,
      });
      return reply.code(201).send(conversation);
    }
  );

  // Get conversation with messages
  app.get(
    '/api/v1/conversations/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { limit?: string; offset?: string };
      }>,
      reply: FastifyReply
    ) => {
      const conversation = await conversationStorage.getConversation(request.params.id);
      if (!conversation) {
        return sendError(reply, 404, 'Conversation not found');
      }
      const { limit, offset } = parsePagination(request.query, {
        maxLimit: 1000,
        defaultLimit: 1000,
      });
      const messages = await conversationStorage.getMessages(request.params.id, { limit, offset });
      return { ...conversation, messages };
    }
  );

  // Rename conversation
  app.put(
    '/api/v1/conversations/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { title: string };
      }>,
      reply: FastifyReply
    ) => {
      const { title } = request.body;
      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return sendError(reply, 400, 'Title is required');
      }
      try {
        const conversation = await conversationStorage.updateConversation(request.params.id, {
          title: title.trim(),
        });
        return conversation;
      } catch {
        return sendError(reply, 404, 'Conversation not found');
      }
    }
  );

  // Delete conversation (CASCADE deletes messages)
  app.delete(
    '/api/v1/conversations/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply
    ) => {
      const deleted = await conversationStorage.deleteConversation(request.params.id);
      if (!deleted) {
        return sendError(reply, 404, 'Conversation not found');
      }
      return reply.code(204).send();
    }
  );
}
