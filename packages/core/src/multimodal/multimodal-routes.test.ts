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
    generateImage: vi
      .fn()
      .mockResolvedValue({ imageUrl: 'https://example.openai.com/img.png', durationMs: 10 }),
    triggerHaptic: vi
      .fn()
      .mockResolvedValue({ triggered: true, patternMs: 200, durationMs: 1 }),
    getStorage: vi.fn().mockReturnValue({
      listJobs: vi.fn().mockResolvedValue({ jobs: [], total: 0 }),
    }),
    getConfig: vi.fn().mockReturnValue({ enabled: true }),
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
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/multimodal/audio/transcribe',
        payload: { audioBase64: 'dGVzdA==' },
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
});
