/**
 * Multimodal Routes — REST API for multimodal I/O system.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { MultimodalManager } from './manager.js';
import type { MultimodalJobType, MultimodalJobStatus } from '@secureyeoman/shared';
import {
  VisionRequestSchema,
  STTRequestSchema,
  TTSRequestSchema,
  ImageGenRequestSchema,
  HapticRequestSchema,
} from '@secureyeoman/shared';

function sanitizeError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  return msg
    .replace(/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED]')
    .replace(/Bearer [a-zA-Z0-9._-]+/g, 'Bearer [REDACTED]');
}

export function registerMultimodalRoutes(
  app: FastifyInstance,
  deps: { multimodalManager: MultimodalManager }
): void {
  const { multimodalManager } = deps;

  // ── Vision ────────────────────────────────────────────────────────

  app.post(
    '/api/v1/multimodal/vision/analyze',
    { bodyLimit: 20_971_520 },
    async (
      request: FastifyRequest<{
        Body: { imageBase64: string; mimeType: string; prompt?: string };
      }>,
      reply: FastifyReply
    ) => {
      const parsed = VisionRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid request body' });
      }

      try {
        const result = await multimodalManager.analyzeImage(parsed.data);
        return result;
      } catch (err) {
        return reply.code(500).send({
          error: sanitizeError(err),
        });
      }
    }
  );

  // ── STT (Speech-to-Text) ──────────────────────────────────────────

  app.post(
    '/api/v1/multimodal/audio/transcribe',
    { bodyLimit: 20_971_520 },
    async (
      request: FastifyRequest<{
        Body: { audioBase64: string; format?: string; language?: string };
      }>,
      reply: FastifyReply
    ) => {
      const parsed = STTRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid request body' });
      }

      try {
        const result = await multimodalManager.transcribeAudio(parsed.data);
        return result;
      } catch (err) {
        return reply.code(500).send({
          error: sanitizeError(err),
        });
      }
    }
  );

  // ── TTS (Text-to-Speech) ──────────────────────────────────────────

  app.post(
    '/api/v1/multimodal/audio/speak',
    async (
      request: FastifyRequest<{
        Body: { text: string; voice?: string; model?: string; responseFormat?: string };
      }>,
      reply: FastifyReply
    ) => {
      const parsed = TTSRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid request body' });
      }

      try {
        const result = await multimodalManager.synthesizeSpeech(parsed.data);
        return result;
      } catch (err) {
        return reply.code(500).send({
          error: sanitizeError(err),
        });
      }
    }
  );

  // ── Image Generation ──────────────────────────────────────────────

  app.post(
    '/api/v1/multimodal/image/generate',
    async (
      request: FastifyRequest<{
        Body: { prompt: string; size?: string; quality?: string; style?: string };
      }>,
      reply: FastifyReply
    ) => {
      const parsed = ImageGenRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid request body' });
      }

      try {
        const result = await multimodalManager.generateImage(parsed.data);
        return result;
      } catch (err) {
        return reply.code(500).send({
          error: sanitizeError(err),
        });
      }
    }
  );

  // ── Haptic ────────────────────────────────────────────────────────

  app.post(
    '/api/v1/multimodal/haptic/trigger',
    async (
      request: FastifyRequest<{
        Body: { pattern?: number | number[]; description?: string };
      }>,
      reply: FastifyReply
    ) => {
      const parsed = HapticRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid request body' });
      }

      try {
        const result = await multimodalManager.triggerHaptic(parsed.data);
        return result;
      } catch (err) {
        return reply.code(500).send({
          error: sanitizeError(err),
        });
      }
    }
  );

  // ── Jobs ──────────────────────────────────────────────────────────

  app.get(
    '/api/v1/multimodal/jobs',
    async (
      request: FastifyRequest<{
        Querystring: { type?: string; status?: string; limit?: string; offset?: string };
      }>
    ) => {
      return multimodalManager.getStorage().listJobs({
        type: request.query.type as MultimodalJobType | undefined,
        status: request.query.status as MultimodalJobStatus | undefined,
        limit: request.query.limit ? parseInt(request.query.limit, 10) : undefined,
        offset: request.query.offset ? parseInt(request.query.offset, 10) : undefined,
      });
    }
  );

  // ── Config ────────────────────────────────────────────────────────

  app.get('/api/v1/multimodal/config', async () => {
    return multimodalManager.getConfig();
  });
}
