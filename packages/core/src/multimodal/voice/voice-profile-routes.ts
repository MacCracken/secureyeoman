/**
 * Voice Profile Routes — REST API for managing voice profiles and TTS preview.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { VoiceProfileStore } from './voice-profile-store.js';
import type { MultimodalManager } from '../manager.js';
import { sendError, toErrorMessage } from '../../utils/errors.js';
import { parsePagination } from '../../utils/pagination.js';
import { permit } from '../../gateway/route-permissions.js';

const FETCH_TIMEOUT_MS = 30_000;

export interface VoiceProfileRoutesOptions {
  voiceProfileStore: VoiceProfileStore;
  multimodalManager?: MultimodalManager | null;
}

export function registerVoiceProfileRoutes(
  app: FastifyInstance,
  opts: VoiceProfileRoutesOptions
): void {
  const { voiceProfileStore, multimodalManager } = opts;

  // ── Register non-standard route permissions ───────────────────
  permit('/api/v1/voice/profiles/:id/preview', 'POST', 'multimodal', 'execute');
  permit('/api/v1/voice/profiles/clone', 'POST', 'multimodal', 'execute');

  // ── POST /api/v1/voice/profiles — create profile ─────────────
  app.post(
    '/api/v1/voice/profiles',
    async (
      request: FastifyRequest<{
        Body: {
          name: string;
          provider: string;
          voiceId: string;
          settings?: Record<string, unknown>;
          sampleAudioBase64?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { name, provider, voiceId, settings, sampleAudioBase64 } = request.body ?? {};
        if (!name || !provider || !voiceId) {
          return sendError(reply, 400, 'name, provider, and voiceId are required');
        }

        const profile = await voiceProfileStore.create({
          name,
          provider,
          voiceId,
          settings,
          sampleAudioBase64,
          createdBy: (request as unknown as { userId?: string }).userId ?? 'admin',
        });
        return reply.status(201).send(profile);
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── GET /api/v1/voice/profiles — list profiles ────────────────
  app.get(
    '/api/v1/voice/profiles',
    async (
      request: FastifyRequest<{
        Querystring: { provider?: string; limit?: string; offset?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { limit, offset } = parsePagination(request.query);
        const result = await voiceProfileStore.list({
          provider: request.query.provider,
          limit,
          offset,
        });
        return reply.send(result);
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── GET /api/v1/voice/profiles/:id — get profile ─────────────
  app.get(
    '/api/v1/voice/profiles/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const profile = await voiceProfileStore.getById(request.params.id);
        if (!profile) {
          return sendError(reply, 404, 'Voice profile not found');
        }
        return reply.send(profile);
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── PUT /api/v1/voice/profiles/:id — update profile ──────────
  app.put(
    '/api/v1/voice/profiles/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          name?: string;
          provider?: string;
          voiceId?: string;
          settings?: Record<string, unknown>;
          sampleAudioBase64?: string | null;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const updated = await voiceProfileStore.update(request.params.id, request.body ?? {});
        if (!updated) {
          return sendError(reply, 404, 'Voice profile not found');
        }
        return reply.send(updated);
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── DELETE /api/v1/voice/profiles/:id — delete profile ────────
  app.delete(
    '/api/v1/voice/profiles/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const deleted = await voiceProfileStore.delete(request.params.id);
        if (!deleted) {
          return sendError(reply, 404, 'Voice profile not found');
        }
        return reply.status(204).send();
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── POST /api/v1/voice/profiles/:id/preview — synthesize test phrase ──
  app.post(
    '/api/v1/voice/profiles/:id/preview',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { text?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        if (!multimodalManager) {
          return sendError(reply, 503, 'Multimodal manager is not available');
        }

        const profile = await voiceProfileStore.getById(request.params.id);
        if (!profile) {
          return sendError(reply, 404, 'Voice profile not found');
        }

        const text = request.body?.text ?? 'Hello, this is a preview of my voice.';
        const result = await multimodalManager.speakWithProfile(profile.id, text);
        return reply.send(result);
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── POST /api/v1/voice/profiles/clone — clone voice via ElevenLabs ──
  app.post(
    '/api/v1/voice/profiles/clone',
    async (
      request: FastifyRequest<{
        Body: {
          name: string;
          audioBase64: string;
          description?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { name, audioBase64, description } = request.body ?? {};
        if (!name || !audioBase64) {
          return sendError(reply, 400, 'name and audioBase64 are required');
        }

        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
          return sendError(reply, 503, 'ELEVENLABS_API_KEY is not configured');
        }

        // Call ElevenLabs voice clone API
        const audioBuffer = Buffer.from(audioBase64, 'base64');
        const boundary = `----VoiceClone${Date.now()}`;
        const parts: Buffer[] = [];

        // name field
        parts.push(
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\n${name}\r\n`
          )
        );

        // description field
        if (description) {
          parts.push(
            Buffer.from(
              `--${boundary}\r\nContent-Disposition: form-data; name="description"\r\n\r\n${description}\r\n`
            )
          );
        }

        // audio file
        parts.push(
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="sample.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`
          )
        );
        parts.push(audioBuffer);
        parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

        const body = Buffer.concat(parts);

        const res = await fetch('https://api.elevenlabs.io/v1/voices/add', {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
          },
          body,
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });

        if (!res.ok) {
          const errText = await res.text();
          return sendError(reply, 502, `ElevenLabs clone error (${res.status}): ${errText}`);
        }

        const data = (await res.json()) as { voice_id: string };

        // Store the cloned voice as a profile
        const profile = await voiceProfileStore.create({
          name,
          provider: 'elevenlabs',
          voiceId: data.voice_id,
          settings: { cloned: true, description: description ?? '' },
          sampleAudioBase64: audioBase64,
          createdBy: (request as unknown as { userId?: string }).userId ?? 'admin',
        });

        return reply.status(201).send(profile);
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );
}
