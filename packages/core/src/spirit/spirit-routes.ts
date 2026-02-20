/**
 * Spirit Routes — API endpoints for passion, inspiration, and pain management.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SpiritManager } from './manager.js';
import type {
  PassionCreate,
  PassionUpdate,
  InspirationCreate,
  InspirationUpdate,
  PainCreate,
  PainUpdate,
} from './types.js';
import { toErrorMessage, sendError } from '../utils/errors.js';

export interface SpiritRoutesOptions {
  spiritManager: SpiritManager;
}

export function registerSpiritRoutes(app: FastifyInstance, opts: SpiritRoutesOptions): void {
  const { spiritManager } = opts;

  // ── Passions ──────────────────────────────────────────────────

  app.get(
    '/api/v1/spirit/passions',
    async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>) => {
      const limit = request.query.limit ? Number(request.query.limit) : undefined;
      const offset = request.query.offset ? Number(request.query.offset) : undefined;
      return spiritManager.listPassions({ limit, offset });
    }
  );

  app.post(
    '/api/v1/spirit/passions',
    async (request: FastifyRequest<{ Body: PassionCreate }>, reply: FastifyReply) => {
      try {
        const passion = await spiritManager.createPassion(request.body);
        return reply.code(201).send({ passion });
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  app.get(
    '/api/v1/spirit/passions/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const passion = await spiritManager.getPassion(request.params.id);
      if (!passion) {
        return sendError(reply, 404, 'Passion not found');
      }
      return { passion };
    }
  );

  app.put(
    '/api/v1/spirit/passions/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: PassionUpdate }>,
      reply: FastifyReply
    ) => {
      try {
        const passion = await spiritManager.updatePassion(request.params.id, request.body);
        return { passion };
      } catch (err) {
        return sendError(reply, 404, toErrorMessage(err));
      }
    }
  );

  app.delete(
    '/api/v1/spirit/passions/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const deleted = await spiritManager.deletePassion(request.params.id);
      if (!deleted) {
        return sendError(reply, 404, 'Passion not found');
      }
      return reply.code(204).send();
    }
  );

  // ── Inspirations ──────────────────────────────────────────────

  app.get(
    '/api/v1/spirit/inspirations',
    async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>) => {
      const limit = request.query.limit ? Number(request.query.limit) : undefined;
      const offset = request.query.offset ? Number(request.query.offset) : undefined;
      return spiritManager.listInspirations({ limit, offset });
    }
  );

  app.post(
    '/api/v1/spirit/inspirations',
    async (request: FastifyRequest<{ Body: InspirationCreate }>, reply: FastifyReply) => {
      try {
        const inspiration = await spiritManager.createInspiration(request.body);
        return reply.code(201).send({ inspiration });
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  app.get(
    '/api/v1/spirit/inspirations/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const inspiration = await spiritManager.getInspiration(request.params.id);
      if (!inspiration) {
        return sendError(reply, 404, 'Inspiration not found');
      }
      return { inspiration };
    }
  );

  app.put(
    '/api/v1/spirit/inspirations/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: InspirationUpdate }>,
      reply: FastifyReply
    ) => {
      try {
        const inspiration = await spiritManager.updateInspiration(request.params.id, request.body);
        return { inspiration };
      } catch (err) {
        return sendError(reply, 404, toErrorMessage(err));
      }
    }
  );

  app.delete(
    '/api/v1/spirit/inspirations/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const deleted = await spiritManager.deleteInspiration(request.params.id);
      if (!deleted) {
        return sendError(reply, 404, 'Inspiration not found');
      }
      return reply.code(204).send();
    }
  );

  // ── Pains ─────────────────────────────────────────────────────

  app.get(
    '/api/v1/spirit/pains',
    async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>) => {
      const limit = request.query.limit ? Number(request.query.limit) : undefined;
      const offset = request.query.offset ? Number(request.query.offset) : undefined;
      return spiritManager.listPains({ limit, offset });
    }
  );

  app.post(
    '/api/v1/spirit/pains',
    async (request: FastifyRequest<{ Body: PainCreate }>, reply: FastifyReply) => {
      try {
        const pain = await spiritManager.createPain(request.body);
        return reply.code(201).send({ pain });
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  app.get(
    '/api/v1/spirit/pains/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const pain = await spiritManager.getPain(request.params.id);
      if (!pain) {
        return sendError(reply, 404, 'Pain not found');
      }
      return { pain };
    }
  );

  app.put(
    '/api/v1/spirit/pains/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: PainUpdate }>,
      reply: FastifyReply
    ) => {
      try {
        const pain = await spiritManager.updatePain(request.params.id, request.body);
        return { pain };
      } catch (err) {
        return sendError(reply, 404, toErrorMessage(err));
      }
    }
  );

  app.delete(
    '/api/v1/spirit/pains/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const deleted = await spiritManager.deletePain(request.params.id);
      if (!deleted) {
        return sendError(reply, 404, 'Pain not found');
      }
      return reply.code(204).send();
    }
  );

  // ── Config ────────────────────────────────────────────────────

  app.get('/api/v1/spirit/config', async () => {
    const config = spiritManager.getConfig();
    return { config };
  });

  // ── Stats ─────────────────────────────────────────────────────

  app.get('/api/v1/spirit/stats', async () => {
    const stats = await spiritManager.getStats();
    return { stats };
  });

  // ── Prompt Preview ────────────────────────────────────────────

  app.get('/api/v1/spirit/prompt/preview', async () => {
    const prompt = await spiritManager.composeSpiritPrompt();
    return { prompt, charCount: prompt.length, estimatedTokens: Math.ceil(prompt.length / 4) };
  });
}
