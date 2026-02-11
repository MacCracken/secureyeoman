/**
 * Spirit Routes — API endpoints for passion, inspiration, and pain management.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SpiritManager } from './manager.js';
import type { PassionCreate, PassionUpdate, InspirationCreate, InspirationUpdate, PainCreate, PainUpdate } from './types.js';

export interface SpiritRoutesOptions {
  spiritManager: SpiritManager;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

export function registerSpiritRoutes(
  app: FastifyInstance,
  opts: SpiritRoutesOptions,
): void {
  const { spiritManager } = opts;

  // ── Passions ──────────────────────────────────────────────────

  app.get('/api/v1/spirit/passions', async () => {
    const passions = spiritManager.listPassions();
    return { passions };
  });

  app.post('/api/v1/spirit/passions', async (
    request: FastifyRequest<{ Body: PassionCreate }>,
    reply: FastifyReply,
  ) => {
    try {
      const passion = spiritManager.createPassion(request.body);
      return reply.code(201).send({ passion });
    } catch (err) {
      return reply.code(400).send({ error: errorMessage(err) });
    }
  });

  app.get('/api/v1/spirit/passions/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    const passion = spiritManager.getPassion(request.params.id);
    if (!passion) {
      return reply.code(404).send({ error: 'Passion not found' });
    }
    return { passion };
  });

  app.put('/api/v1/spirit/passions/:id', async (
    request: FastifyRequest<{ Params: { id: string }; Body: PassionUpdate }>,
    reply: FastifyReply,
  ) => {
    try {
      const passion = spiritManager.updatePassion(request.params.id, request.body);
      return { passion };
    } catch (err) {
      return reply.code(404).send({ error: errorMessage(err) });
    }
  });

  app.delete('/api/v1/spirit/passions/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    const deleted = spiritManager.deletePassion(request.params.id);
    if (!deleted) {
      return reply.code(404).send({ error: 'Passion not found' });
    }
    return { message: 'Passion deleted' };
  });

  // ── Inspirations ──────────────────────────────────────────────

  app.get('/api/v1/spirit/inspirations', async () => {
    const inspirations = spiritManager.listInspirations();
    return { inspirations };
  });

  app.post('/api/v1/spirit/inspirations', async (
    request: FastifyRequest<{ Body: InspirationCreate }>,
    reply: FastifyReply,
  ) => {
    try {
      const inspiration = spiritManager.createInspiration(request.body);
      return reply.code(201).send({ inspiration });
    } catch (err) {
      return reply.code(400).send({ error: errorMessage(err) });
    }
  });

  app.get('/api/v1/spirit/inspirations/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    const inspiration = spiritManager.getInspiration(request.params.id);
    if (!inspiration) {
      return reply.code(404).send({ error: 'Inspiration not found' });
    }
    return { inspiration };
  });

  app.put('/api/v1/spirit/inspirations/:id', async (
    request: FastifyRequest<{ Params: { id: string }; Body: InspirationUpdate }>,
    reply: FastifyReply,
  ) => {
    try {
      const inspiration = spiritManager.updateInspiration(request.params.id, request.body);
      return { inspiration };
    } catch (err) {
      return reply.code(404).send({ error: errorMessage(err) });
    }
  });

  app.delete('/api/v1/spirit/inspirations/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    const deleted = spiritManager.deleteInspiration(request.params.id);
    if (!deleted) {
      return reply.code(404).send({ error: 'Inspiration not found' });
    }
    return { message: 'Inspiration deleted' };
  });

  // ── Pains ─────────────────────────────────────────────────────

  app.get('/api/v1/spirit/pains', async () => {
    const pains = spiritManager.listPains();
    return { pains };
  });

  app.post('/api/v1/spirit/pains', async (
    request: FastifyRequest<{ Body: PainCreate }>,
    reply: FastifyReply,
  ) => {
    try {
      const pain = spiritManager.createPain(request.body);
      return reply.code(201).send({ pain });
    } catch (err) {
      return reply.code(400).send({ error: errorMessage(err) });
    }
  });

  app.get('/api/v1/spirit/pains/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    const pain = spiritManager.getPain(request.params.id);
    if (!pain) {
      return reply.code(404).send({ error: 'Pain not found' });
    }
    return { pain };
  });

  app.put('/api/v1/spirit/pains/:id', async (
    request: FastifyRequest<{ Params: { id: string }; Body: PainUpdate }>,
    reply: FastifyReply,
  ) => {
    try {
      const pain = spiritManager.updatePain(request.params.id, request.body);
      return { pain };
    } catch (err) {
      return reply.code(404).send({ error: errorMessage(err) });
    }
  });

  app.delete('/api/v1/spirit/pains/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    const deleted = spiritManager.deletePain(request.params.id);
    if (!deleted) {
      return reply.code(404).send({ error: 'Pain not found' });
    }
    return { message: 'Pain deleted' };
  });

  // ── Config ────────────────────────────────────────────────────

  app.get('/api/v1/spirit/config', async () => {
    const config = spiritManager.getConfig();
    return { config };
  });

  // ── Stats ─────────────────────────────────────────────────────

  app.get('/api/v1/spirit/stats', async () => {
    const stats = spiritManager.getStats();
    return { stats };
  });

  // ── Prompt Preview ────────────────────────────────────────────

  app.get('/api/v1/spirit/prompt/preview', async () => {
    const prompt = spiritManager.composeSpiritPrompt();
    return { prompt, charCount: prompt.length, estimatedTokens: Math.ceil(prompt.length / 4) };
  });
}
