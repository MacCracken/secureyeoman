// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { registerMultimodalRoutes } from './multimodal-routes.js';
import type { MultimodalManager } from './manager.js';

function createMockManager(): MultimodalManager {
  return {
    analyzeImage: vi.fn().mockResolvedValue({ description: 'test', labels: [], durationMs: 10 }),
    transcribeAudio: vi.fn().mockResolvedValue({ text: 'hello', durationMs: 10 }),
    synthesizeSpeech: vi
      .fn()
      .mockResolvedValue({ audioBase64: 'dGVzdA==', format: 'mp3', durationMs: 10 }),
    synthesizeSpeechBinary: vi
      .fn()
      .mockResolvedValue({ buffer: Buffer.from('test'), format: 'mp3', durationMs: 10 }),
    generateImage: vi
      .fn()
      .mockResolvedValue({ imageUrl: 'https://example.openai.com/img.png', durationMs: 10 }),
    triggerHaptic: vi.fn().mockResolvedValue({ triggered: true, patternMs: 200, durationMs: 1 }),
    getStorage: vi.fn().mockReturnValue({
      listJobs: vi.fn().mockResolvedValue({ jobs: [], total: 0 }),
    }),
    getConfig: vi.fn().mockReturnValue({ enabled: true }),
    detectAvailableProviders: vi.fn().mockResolvedValue({
      vision: {
        available: ['claude', 'openai', 'gemini'],
        configured: ['claude', 'openai'],
        active: 'claude',
      },
      tts: { available: ['openai', 'voicebox'], configured: ['openai'], active: 'openai' },
      stt: {
        available: ['openai', 'voicebox'],
        configured: ['openai'],
        active: 'openai',
        model: 'whisper-1',
      },
    }),
    setProvider: vi.fn().mockResolvedValue(undefined),
    setModel: vi.fn().mockResolvedValue(undefined),
  } as unknown as MultimodalManager;
}

describe('Multimodal Routes — validation', () => {
  let app: FastifyInstance;
  let manager: MultimodalManager;

  beforeEach(async () => {
    app = Fastify();
    manager = createMockManager();
    registerMultimodalRoutes(app, { multimodalManager: manager });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/v1/multimodal/vision/analyze', () => {
    it('rejects empty body with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/vision/analyze',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).message).toBe('Invalid request body');
    });

    it('rejects missing imageBase64', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/vision/analyze',
        payload: { mimeType: 'image/jpeg' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects invalid mimeType', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/vision/analyze',
        payload: { imageBase64: 'dGVzdA==', mimeType: 'text/plain' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('accepts valid request', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/vision/analyze',
        payload: { imageBase64: 'dGVzdA==', mimeType: 'image/jpeg' },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('POST /api/v1/multimodal/audio/transcribe', () => {
    it('rejects empty body with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/audio/transcribe',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects invalid format', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/audio/transcribe',
        payload: { audioBase64: 'dGVzdA==', format: 'exe' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('accepts valid request', async () => {
      // Must pass size validation: >= 1000 bytes; use 'mp3' so WAV checks are skipped
      const validAudio = Buffer.alloc(1200, 0x55).toString('base64');
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/audio/transcribe',
        payload: { audioBase64: validAudio, format: 'mp3' },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('POST /api/v1/multimodal/audio/speak', () => {
    it('rejects missing text', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/audio/speak',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects empty text', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/audio/speak',
        payload: { text: '' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('accepts valid request', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/audio/speak',
        payload: { text: 'Hello world' },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('POST /api/v1/multimodal/image/generate', () => {
    it('rejects missing prompt', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/image/generate',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects invalid size', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/image/generate',
        payload: { prompt: 'A cat', size: '999x999' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('accepts valid request', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/image/generate',
        payload: { prompt: 'A cat in a hat' },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('POST /api/v1/multimodal/haptic/trigger', () => {
    it('accepts empty body and uses default pattern', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/haptic/trigger',
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.triggered).toBe(true);
    });

    it('accepts a single number pattern', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/haptic/trigger',
        payload: { pattern: 500 },
      });
      expect(res.statusCode).toBe(200);
      expect(manager.triggerHaptic).toHaveBeenCalledWith(expect.objectContaining({ pattern: 500 }));
    });

    it('accepts an array pattern', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/haptic/trigger',
        payload: { pattern: [200, 100, 200] },
      });
      expect(res.statusCode).toBe(200);
    });

    it('accepts optional description', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/haptic/trigger',
        payload: { pattern: 300, description: 'notification' },
      });
      expect(res.statusCode).toBe(200);
      expect(manager.triggerHaptic).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'notification' })
      );
    });

    it('rejects pattern step exceeding 10 000 ms', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/haptic/trigger',
        payload: { pattern: 10_001 },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects array pattern longer than 20 steps', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/haptic/trigger',
        payload: { pattern: Array(21).fill(100) },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 500 and sanitized error when triggerHaptic throws', async () => {
      (manager.triggerHaptic as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Haptic pattern duration 6000ms exceeds maximum 5000ms')
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/haptic/trigger',
        payload: { pattern: [3000, 3000] },
      });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.payload).error).toContain('exceeds maximum');
    });
  });

  describe('PATCH /api/v1/multimodal/provider', () => {
    it('rejects missing type', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/multimodal/provider',
        payload: { provider: 'openai' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects invalid type value', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/multimodal/provider',
        payload: { type: 'audio', provider: 'openai' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects missing provider', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/multimodal/provider',
        payload: { type: 'vision' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects provider not in configured list', async () => {
      // gemini is in available but not configured in our mock
      (manager.detectAvailableProviders as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        vision: {
          available: ['claude', 'openai', 'gemini'],
          configured: ['claude'],
          active: 'claude',
        },
        tts: { available: ['openai'], configured: ['openai'], active: 'openai' },
        stt: { available: ['openai'], configured: ['openai'], active: 'openai' },
      });

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/multimodal/provider',
        payload: { type: 'vision', provider: 'gemini' },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.message).toContain('not configured');
    });

    it('accepts valid configured provider and calls setProvider', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/multimodal/provider',
        payload: { type: 'vision', provider: 'openai' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.ok).toBe(true);
      expect(body.type).toBe('vision');
      expect(body.provider).toBe('openai');
      expect(manager.setProvider).toHaveBeenCalledWith('vision', 'openai');
    });

    it('accepts tts provider switch', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/multimodal/provider',
        payload: { type: 'tts', provider: 'openai' },
      });
      expect(res.statusCode).toBe(200);
      expect(manager.setProvider).toHaveBeenCalledWith('tts', 'openai');
    });

    it('accepts stt provider switch', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/multimodal/provider',
        payload: { type: 'stt', provider: 'openai' },
      });
      expect(res.statusCode).toBe(200);
      expect(manager.setProvider).toHaveBeenCalledWith('stt', 'openai');
    });
  });

  describe('error sanitization', () => {
    it('strips API keys from error messages', async () => {
      (manager.analyzeImage as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Failed with key sk-abc123def456ghi789jkl012mno345')
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/vision/analyze',
        payload: { imageBase64: 'dGVzdA==', mimeType: 'image/jpeg' },
      });
      expect(res.statusCode).toBe(500);
      const body = JSON.parse(res.payload);
      expect(body.error).not.toContain('sk-');
      expect(body.error).toContain('[REDACTED]');
    });

    it('strips Bearer tokens from error messages', async () => {
      (manager.generateImage as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Auth failed with Bearer eyJhbGciOiJIUzI1NiJ9.test')
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/image/generate',
        payload: { prompt: 'A cat' },
      });
      expect(res.statusCode).toBe(500);
      const body = JSON.parse(res.payload);
      expect(body.error).not.toContain('eyJ');
      expect(body.error).toContain('[REDACTED]');
    });
  });

  // ── Phase 58: Audio validation ─────────────────────────────────────

  /** Build a minimal PCM WAV buffer. sampleFill: value written to every 16-bit sample. */
  function buildWavBuf(opts: {
    durationSec: number;
    sampleRate?: number;
    channels?: number;
    bitsPerSample?: number;
    sampleFill?: number;
  }): Buffer {
    const {
      durationSec,
      sampleRate = 8000,
      channels = 1,
      bitsPerSample = 16,
      sampleFill = 0,
    } = opts;
    const numSamples = sampleRate * durationSec;
    const dataSize = numSamples * channels * (bitsPerSample / 8);
    const buf = Buffer.alloc(44 + dataSize, 0);
    buf.write('RIFF', 0);
    buf.writeUInt32LE(36 + dataSize, 4);
    buf.write('WAVE', 8);
    buf.write('fmt ', 12);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(channels, 22);
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE((sampleRate * channels * bitsPerSample) / 8, 28);
    buf.writeUInt16LE((channels * bitsPerSample) / 8, 32);
    buf.writeUInt16LE(bitsPerSample, 34);
    buf.write('data', 36);
    buf.writeUInt32LE(dataSize, 40);
    if (sampleFill !== 0) {
      for (let i = 44; i + 1 < buf.length; i += 2) {
        buf.writeInt16LE(sampleFill, i);
      }
    }
    return buf;
  }

  async function injectTranscribe(audioBase64: string, format = 'wav') {
    return app.inject({
      method: 'POST',
      url: '/api/v1/multimodal/audio/transcribe',
      payload: { audioBase64, format },
    });
  }

  describe('POST /api/v1/multimodal/audio/transcribe — audio validation', () => {
    it('rejects buffer smaller than 1000 bytes with 422', async () => {
      const tinyBase64 = Buffer.alloc(10).toString('base64');
      const res = await injectTranscribe(tinyBase64, 'mp3');
      expect(res.statusCode).toBe(422);
      expect(JSON.parse(res.payload).message).toContain('audio_too_short');
    });

    it('rejects WAV buffer that is less than 44 bytes with 422', async () => {
      const smallWav = Buffer.alloc(40);
      const res = await injectTranscribe(smallWav.toString('base64'));
      expect(res.statusCode).toBe(422);
      expect(JSON.parse(res.payload).message).toContain('audio_too_short');
    });

    it('accepts audio of sufficient size for non-WAV format (passes to manager)', async () => {
      const validOgg = Buffer.alloc(1200, 0x55).toString('base64');
      const res = await injectTranscribe(validOgg, 'ogg');
      expect(res.statusCode).toBe(200);
      expect(manager.transcribeAudio).toHaveBeenCalled();
    });

    it('rejects silent WAV (zero PCM) with 422 audio_too_quiet', async () => {
      const buf = buildWavBuf({ durationSec: 3, sampleFill: 0 });
      const res = await injectTranscribe(buf.toString('base64'));
      expect(res.statusCode).toBe(422);
      expect(JSON.parse(res.payload).message).toContain('audio_too_quiet');
    });

    it('rejects clipped WAV (peak >= 0.99) with 422 audio_clipped', async () => {
      // 32767 / 32768 ≈ 0.9999 — above the 0.99 threshold
      const buf = buildWavBuf({ durationSec: 3, sampleFill: 32767 });
      const res = await injectTranscribe(buf.toString('base64'));
      expect(res.statusCode).toBe(422);
      expect(JSON.parse(res.payload).message).toContain('audio_clipped');
    });

    it('rejects WAV shorter than 2 seconds with 422 audio_too_short', async () => {
      // 1 second of non-silent audio
      const buf = buildWavBuf({ durationSec: 1, sampleFill: 16000 });
      const res = await injectTranscribe(buf.toString('base64'));
      expect(res.statusCode).toBe(422);
      expect(JSON.parse(res.payload).message).toContain('audio_too_short');
    });

    it('rejects WAV longer than 30 seconds with 422 audio_too_long', async () => {
      // 35 seconds of non-silent, non-clipped audio (sample value 8000 → ~0.24 RMS)
      const buf = buildWavBuf({ durationSec: 35, sampleFill: 8000 });
      const res = await injectTranscribe(buf.toString('base64'));
      expect(res.statusCode).toBe(422);
      expect(JSON.parse(res.payload).message).toContain('audio_too_long');
    });

    it('rejects WAV with zero channels in header with 422', async () => {
      const buf = buildWavBuf({ durationSec: 3, sampleFill: 8000 });
      buf.writeUInt16LE(0, 22); // corrupt: zero channels
      const res = await injectTranscribe(buf.toString('base64'));
      expect(res.statusCode).toBe(422);
      expect(JSON.parse(res.payload).message).toContain('audio_too_short');
    });

    it('rejects WAV with zero sample rate in header with 422', async () => {
      const buf = buildWavBuf({ durationSec: 3, sampleFill: 8000 });
      buf.writeUInt32LE(0, 24); // corrupt: zero sample rate
      const res = await injectTranscribe(buf.toString('base64'));
      expect(res.statusCode).toBe(422);
      expect(JSON.parse(res.payload).message).toContain('audio_too_short');
    });

    it('accepts valid 3-second WAV with normal amplitude (passes to manager)', async () => {
      // Sample value 8000 → amplitude ~0.24 — above RMS threshold, below clip threshold
      const buf = buildWavBuf({ durationSec: 3, sampleFill: 8000 });
      const res = await injectTranscribe(buf.toString('base64'));
      expect(res.statusCode).toBe(200);
      expect(manager.transcribeAudio).toHaveBeenCalled();
    });
  });

  // ── Phase 58: Model route ──────────────────────────────────────────

  describe('PATCH /api/v1/multimodal/model', () => {
    it('rejects missing type with 400', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/multimodal/model',
        payload: { model: 'large-v3' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects invalid type value with 400', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/multimodal/model',
        payload: { type: 'vision', model: 'gpt-4o' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects missing model with 400', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/multimodal/model',
        payload: { type: 'stt' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects empty model string with 400', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/multimodal/model',
        payload: { type: 'stt', model: '   ' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('accepts valid stt + model and calls setModel', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/multimodal/model',
        payload: { type: 'stt', model: 'large-v3' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.ok).toBe(true);
      expect(body.type).toBe('stt');
      expect(body.model).toBe('large-v3');
      expect(manager.setModel).toHaveBeenCalledWith('stt', 'large-v3');
    });

    it('accepts valid tts + model and calls setModel', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/multimodal/model',
        payload: { type: 'tts', model: 'tts-1-hd' },
      });
      expect(res.statusCode).toBe(200);
      expect(manager.setModel).toHaveBeenCalledWith('tts', 'tts-1-hd');
    });
  });

  // ── Phase 58: Streaming TTS route ─────────────────────────────────

  describe('POST /api/v1/multimodal/audio/speak/stream', () => {
    it('rejects missing text with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/audio/speak/stream',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects empty text with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/audio/speak/stream',
        payload: { text: '' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns binary audio with Content-Type audio/mpeg for mp3 format', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/audio/speak/stream',
        payload: { text: 'Hello world' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('audio/mpeg');
      expect(manager.synthesizeSpeechBinary).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Hello world' })
      );
    });

    it('sets Content-Length header matching buffer size', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/audio/speak/stream',
        payload: { text: 'Hello world' },
      });
      expect(res.statusCode).toBe(200);
      // Mock returns Buffer.from('test') = 4 bytes
      expect(Number(res.headers['content-length'])).toBe(4);
    });

    it('returns correct Content-Type for flac format', async () => {
      (manager.synthesizeSpeechBinary as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        buffer: Buffer.from('flac-data'),
        format: 'flac',
        durationMs: 15,
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/audio/speak/stream',
        payload: { text: 'Hello', responseFormat: 'flac' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('audio/flac');
    });

    it('returns correct Content-Type for opus format', async () => {
      (manager.synthesizeSpeechBinary as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        buffer: Buffer.from('opus-data'),
        format: 'opus',
        durationMs: 20,
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/audio/speak/stream',
        payload: { text: 'Hello', responseFormat: 'opus' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('audio/ogg');
    });

    it('returns 500 when synthesizeSpeechBinary throws', async () => {
      (manager.synthesizeSpeechBinary as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('TTS provider unavailable')
      );
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/audio/speak/stream',
        payload: { text: 'Hello' },
      });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.payload).error).toContain('unavailable');
    });
  });
});
