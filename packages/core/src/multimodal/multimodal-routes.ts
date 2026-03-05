/**
 * Multimodal Routes — REST API for multimodal I/O system.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { MultimodalManager } from './manager.js';
import type { MultimodalJobType, MultimodalJobStatus } from '@secureyeoman/shared';
import { sendError, toErrorMessage } from '../utils/errors.js';
import { parsePagination } from '../utils/pagination.js';
import {
  VisionRequestSchema,
  STTRequestSchema,
  TTSRequestSchema,
  ImageGenRequestSchema,
  HapticRequestSchema,
} from '@secureyeoman/shared';
import {
  createCustomVocabulary,
  listCustomVocabularies,
  deleteCustomVocabulary,
} from './stt/transcribe.js';
import { describeVoices, listLexicons, putLexicon } from './tts/polly.js';

function sanitizeError(error: unknown): string {
  return toErrorMessage(error)
    .replace(/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED]')
    .replace(/Bearer [a-zA-Z0-9._-]+/g, 'Bearer [REDACTED]');
}

/**
 * Validate an audio buffer before sending to STT. Returns an error string or null if valid.
 * Checks minimum size for all formats, and duration/RMS/peak for WAV.
 */
function validateAudioBuffer(buf: Buffer, format: string): string | null {
  // All formats: sanity size check
  if (buf.length < 1000) {
    return 'audio_too_short: audio data too small to be valid';
  }

  // WAV-specific structural and quality validation
  if (format === 'wav') {
    // Standard WAV RIFF PCM layout:
    //   bytes 22-23: channels (uint16 LE)
    //   bytes 24-27: sample rate (uint32 LE)
    //   bytes 34-35: bits per sample (uint16 LE)
    //   bytes 40-43: data chunk size (uint32 LE)
    if (buf.length < 44) {
      return 'audio_too_short: audio data too small to be valid';
    }

    const channels = buf.readUInt16LE(22);
    const sampleRate = buf.readUInt32LE(24);
    const bitsPerSample = buf.readUInt16LE(34);
    const dataChunkSize = buf.readUInt32LE(40);

    if (channels === 0 || sampleRate === 0 || bitsPerSample === 0) {
      return 'audio_too_short: audio data too small to be valid';
    }

    const bytesPerSample = bitsPerSample / 8;
    const durationSeconds = dataChunkSize / (sampleRate * channels * bytesPerSample);

    if (durationSeconds < 2) {
      return 'audio_too_short: minimum 2 seconds required';
    }
    if (durationSeconds > 30) {
      return 'audio_too_long: maximum 30 seconds allowed';
    }

    // RMS + peak analysis on first 10s of 16-bit PCM samples
    const dataOffset = 44;
    const samplesIn10s = Math.floor(sampleRate * channels * 10);
    const availableSamples = Math.floor((buf.length - dataOffset) / 2);
    const maxSamples = Math.min(samplesIn10s, availableSamples);

    let sumSquares = 0;
    let peak = 0;
    for (let i = 0; i < maxSamples; i++) {
      const byteOffset = dataOffset + i * 2;
      if (byteOffset + 1 >= buf.length) break;
      const sample = buf.readInt16LE(byteOffset) / 32768;
      sumSquares += sample * sample;
      const abs = Math.abs(sample);
      if (abs > peak) peak = abs;
    }

    const rms = maxSamples > 0 ? Math.sqrt(sumSquares / maxSamples) : 0;
    if (rms < 0.01) {
      return 'audio_too_quiet: audio level too low (RMS < 0.01)';
    }
    if (peak >= 0.99) {
      return 'audio_clipped: audio is clipped (peak >= 0.99)';
    }
  }

  return null;
}

const AUDIO_CONTENT_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  opus: 'audio/ogg; codecs=opus',
  flac: 'audio/flac',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  pcm: 'audio/pcm',
};

export function registerMultimodalRoutes(
  app: FastifyInstance,
  opts: { multimodalManager: MultimodalManager }
): void {
  const { multimodalManager } = opts;

  // ── Provider update ───────────────────────────────────────────────

  app.patch(
    '/api/v1/multimodal/provider',
    async (
      request: FastifyRequest<{
        Body: { type: 'vision' | 'tts' | 'stt'; provider: string };
      }>,
      reply: FastifyReply
    ) => {
      const { type, provider } = request.body ?? {};
      if (!type || !provider || !['vision', 'tts', 'stt'].includes(type)) {
        return sendError(reply, 400, "Body must include 'type' (vision|tts|stt) and 'provider'");
      }

      // Validate against configured providers
      const available = await multimodalManager.detectAvailableProviders();
      const configured =
        type === 'vision'
          ? available.vision.configured
          : type === 'tts'
            ? available.tts.configured
            : available.stt.configured;

      if (!configured.includes(provider)) {
        return sendError(
          reply,
          400,
          `Provider '${provider}' is not configured for ${type}. Configured providers: ${configured.join(', ') || 'none'}`
        );
      }

      try {
        await multimodalManager.setProvider(type, provider);
        return { ok: true, type, provider };
      } catch (err) {
        return sendError(reply, 500, sanitizeError(err));
      }
    }
  );

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
        return sendError(reply, 400, 'Invalid request body');
      }

      try {
        const result = await multimodalManager.analyzeImage(parsed.data);
        return result;
      } catch (err) {
        return sendError(reply, 500, sanitizeError(err));
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
        return sendError(reply, 400, 'Invalid request body');
      }

      const audioBuffer = Buffer.from(parsed.data.audioBase64, 'base64');
      const validationError = validateAudioBuffer(audioBuffer, parsed.data.format ?? 'ogg');
      if (validationError) return sendError(reply, 422, validationError);

      try {
        const result = await multimodalManager.transcribeAudio(parsed.data);
        return result;
      } catch (err) {
        return sendError(reply, 500, sanitizeError(err));
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
        return sendError(reply, 400, 'Invalid request body');
      }

      try {
        const result = await multimodalManager.synthesizeSpeech(parsed.data);
        return result;
      } catch (err) {
        return sendError(reply, 500, sanitizeError(err));
      }
    }
  );

  // ── TTS (Streaming Binary) ────────────────────────────────────────

  app.post(
    '/api/v1/multimodal/audio/speak/stream',
    async (
      request: FastifyRequest<{
        Body: { text: string; voice?: string; model?: string; responseFormat?: string };
      }>,
      reply: FastifyReply
    ) => {
      const parsed = TTSRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, 'Invalid request body');
      }

      try {
        const { buffer, format, durationMs } = await multimodalManager.synthesizeSpeechBinary(
          parsed.data
        );
        const contentType = AUDIO_CONTENT_TYPES[format] ?? 'audio/mpeg';
        void reply.header('Content-Type', contentType);
        void reply.header('Content-Length', buffer.length);
        void reply.header('X-Duration-Ms', durationMs);
        return reply.send(buffer);
      } catch (err) {
        return sendError(reply, 500, sanitizeError(err));
      }
    }
  );

  // ── Model Update ──────────────────────────────────────────────────

  app.patch(
    '/api/v1/multimodal/model',
    async (
      request: FastifyRequest<{ Body: { type?: string; model?: string } }>,
      reply: FastifyReply
    ) => {
      const { type, model } = request.body ?? {};
      if (!type || !['stt', 'tts'].includes(type)) {
        return sendError(reply, 400, "Body must include 'type' (stt|tts)");
      }
      if (!model || typeof model !== 'string' || model.trim() === '') {
        return sendError(reply, 400, "Body must include 'model' as a non-empty string");
      }

      try {
        await multimodalManager.setModel(type as 'stt' | 'tts', model);
        return { ok: true, type, model };
      } catch (err) {
        return sendError(reply, 500, sanitizeError(err));
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
        return sendError(reply, 400, 'Invalid request body');
      }

      try {
        const result = await multimodalManager.generateImage(parsed.data);
        return result;
      } catch (err) {
        return sendError(reply, 500, sanitizeError(err));
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
        return sendError(reply, 400, 'Invalid request body');
      }

      try {
        const result = await multimodalManager.triggerHaptic(parsed.data);
        return result;
      } catch (err) {
        return sendError(reply, 500, sanitizeError(err));
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
      const { limit, offset } = parsePagination(request.query);
      return multimodalManager.getStorage().listJobs({
        type: request.query.type as MultimodalJobType | undefined,
        status: request.query.status as MultimodalJobStatus | undefined,
        limit,
        offset,
      });
    }
  );

  // ── Config ────────────────────────────────────────────────────────

  app.get('/api/v1/multimodal/config', async () => {
    const config = multimodalManager.getConfig();
    const providers = await multimodalManager.detectAvailableProviders();
    return {
      ...config,
      providers,
    };
  });

  // ── AWS Transcribe Custom Vocabulary ───────────────────────────────

  app.post(
    '/api/v1/multimodal/transcribe/vocabulary',
    async (
      request: FastifyRequest<{
        Body: {
          vocabularyName: string;
          languageCode: string;
          entries: { phrase: string; soundsLike?: string[]; ipa?: string; displayAs?: string }[];
        };
      }>,
      reply: FastifyReply
    ) => {
      const { vocabularyName, languageCode, entries } = request.body ?? {};
      if (!vocabularyName || !languageCode || !entries?.length) {
        return sendError(
          reply,
          400,
          "Body must include 'vocabularyName', 'languageCode', and 'entries' (non-empty array)"
        );
      }
      if (vocabularyName.length > 200 || !/^[a-zA-Z0-9._-]+$/.test(vocabularyName)) {
        return sendError(
          reply,
          400,
          'vocabularyName must be alphanumeric with ._- (max 200 chars)'
        );
      }

      try {
        const result = await createCustomVocabulary({ vocabularyName, languageCode, entries });
        return result;
      } catch (err) {
        return sendError(reply, 500, sanitizeError(err));
      }
    }
  );

  app.get(
    '/api/v1/multimodal/transcribe/vocabulary',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const vocabularies = await listCustomVocabularies();
        return { vocabularies };
      } catch (err) {
        return sendError(reply, 500, sanitizeError(err));
      }
    }
  );

  app.delete(
    '/api/v1/multimodal/transcribe/vocabulary/:name',
    async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
      const { name } = request.params;
      if (!name) return sendError(reply, 400, 'Vocabulary name is required');

      try {
        await deleteCustomVocabulary(name);
        return { ok: true, deleted: name };
      } catch (err) {
        return sendError(reply, 500, sanitizeError(err));
      }
    }
  );

  // ── AWS Polly Voice & Lexicon Management ───────────────────────────

  app.get(
    '/api/v1/multimodal/polly/voices',
    async (
      request: FastifyRequest<{ Querystring: { languageCode?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const voices = await describeVoices(request.query.languageCode);
        return { voices };
      } catch (err) {
        return sendError(reply, 500, sanitizeError(err));
      }
    }
  );

  app.get(
    '/api/v1/multimodal/polly/lexicons',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const lexicons = await listLexicons();
        return { lexicons };
      } catch (err) {
        return sendError(reply, 500, sanitizeError(err));
      }
    }
  );

  app.post(
    '/api/v1/multimodal/polly/lexicons',
    async (
      request: FastifyRequest<{ Body: { name: string; content: string } }>,
      reply: FastifyReply
    ) => {
      const { name, content } = request.body ?? {};
      if (!name || !content) {
        return sendError(reply, 400, "Body must include 'name' and 'content' (PLS XML)");
      }
      if (name.length > 100 || !/^[a-zA-Z0-9._-]+$/.test(name)) {
        return sendError(reply, 400, 'name must be alphanumeric with ._- (max 100 chars)');
      }

      try {
        await putLexicon(name, content);
        return { ok: true, name };
      } catch (err) {
        return sendError(reply, 500, sanitizeError(err));
      }
    }
  );
}
