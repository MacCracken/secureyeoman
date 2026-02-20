/**
 * Conversation Routes — CRUD for persistent chat conversations.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ConversationStorage } from './conversation-storage.js';
import type { HistoryCompressor } from './compression/compressor.js';

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
        return reply.code(503).send({ error: 'History compression not available' });
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
        return reply.code(503).send({ error: 'History compression not available' });
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
        return reply.code(503).send({ error: 'History compression not available' });
      }
      const maxTokens = request.query.maxTokens ? Number(request.query.maxTokens) : 4000;
      const context = await historyCompressor.getContext(request.params.id, maxTokens);
      return context;
    }
  );

  // List conversations (paginated, sorted by updated_at DESC)
  app.get(
    '/api/v1/conversations',
    async (
      request: FastifyRequest<{
        Querystring: { limit?: string; offset?: string };
      }>
    ) => {
      const limit = request.query.limit ? Number(request.query.limit) : 50;
      const offset = request.query.offset ? Number(request.query.offset) : 0;
      return await conversationStorage.listConversations({ limit, offset });
    }
  );

  // Create conversation
  app.post(
    '/api/v1/conversations',
    async (
      request: FastifyRequest<{
        Body: { title: string; personalityId?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { title, personalityId } = request.body;
      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return reply.code(400).send({ error: 'Title is required' });
      }
      const conversation = await conversationStorage.createConversation({
        title: title.trim(),
        personalityId,
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
        return reply.code(404).send({ error: 'Conversation not found' });
      }
      const limit = request.query.limit ? Number(request.query.limit) : 1000;
      const offset = request.query.offset ? Number(request.query.offset) : 0;
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
        return reply.code(400).send({ error: 'Title is required' });
      }
      try {
        const conversation = await conversationStorage.updateConversation(request.params.id, {
          title: title.trim(),
        });
        return conversation;
      } catch {
        return reply.code(404).send({ error: 'Conversation not found' });
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
        return reply.code(404).send({ error: 'Conversation not found' });
      }
      return reply.code(204).send();
    }
  );
}
