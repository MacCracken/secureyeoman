// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { registerVoiceProfileRoutes } from './voice-profile-routes.js';
import type { VoiceProfileStore } from './voice-profile-store.js';
import type { MultimodalManager } from '../manager.js';

vi.mock('../../gateway/route-permissions.js', () => ({
  permit: vi.fn(),
}));

const mockProfile = {
  id: 'vp-001',
  name: 'Test Voice',
  provider: 'openai',
  voiceId: 'alloy',
  settings: {},
  createdBy: 'admin',
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

function createMockStore(): VoiceProfileStore {
  return {
    create: vi.fn().mockResolvedValue(mockProfile),
    getById: vi.fn().mockResolvedValue(mockProfile),
    list: vi.fn().mockResolvedValue({ profiles: [mockProfile], total: 1 }),
    update: vi.fn().mockResolvedValue({ ...mockProfile, name: 'Updated' }),
    delete: vi.fn().mockResolvedValue(true),
  } as unknown as VoiceProfileStore;
}

function createMockManager(): MultimodalManager {
  return {
    speakWithProfile: vi
      .fn()
      .mockResolvedValue({ audioBase64: 'dGVzdA==', format: 'mp3', durationMs: 50 }),
  } as unknown as MultimodalManager;
}

describe('Voice Profile Routes', () => {
  let app: FastifyInstance;
  let store: VoiceProfileStore;
  let manager: MultimodalManager;

  beforeEach(async () => {
    app = Fastify();
    store = createMockStore();
    manager = createMockManager();
    registerVoiceProfileRoutes(app, {
      voiceProfileStore: store,
      multimodalManager: manager,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/v1/voice/profiles', () => {
    it('creates a voice profile', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/voice/profiles',
        payload: { name: 'Test', provider: 'openai', voiceId: 'alloy' },
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.payload).id).toBe('vp-001');
    });

    it('rejects missing fields with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/voice/profiles',
        payload: { name: 'Test' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/voice/profiles', () => {
    it('returns a list of profiles', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/voice/profiles',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.profiles).toHaveLength(1);
      expect(body.total).toBe(1);
    });
  });

  describe('GET /api/v1/voice/profiles/:id', () => {
    it('returns a profile by id', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/voice/profiles/vp-001',
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).id).toBe('vp-001');
    });

    it('returns 404 when not found', async () => {
      (store.getById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/voice/profiles/nonexistent',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /api/v1/voice/profiles/:id', () => {
    it('updates a profile', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/voice/profiles/vp-001',
        payload: { name: 'Updated' },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).name).toBe('Updated');
    });

    it('returns 404 when not found', async () => {
      (store.update as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/voice/profiles/nonexistent',
        payload: { name: 'X' },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v1/voice/profiles/:id', () => {
    it('deletes a profile', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/voice/profiles/vp-001',
      });
      expect(res.statusCode).toBe(204);
    });

    it('returns 404 when not found', async () => {
      (store.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/voice/profiles/nonexistent',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/voice/profiles/:id/preview', () => {
    it('synthesizes a preview', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/voice/profiles/vp-001/preview',
        payload: { text: 'Hello world' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.audioBase64).toBe('dGVzdA==');
    });

    it('returns 404 when profile not found', async () => {
      (store.getById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/voice/profiles/nonexistent/preview',
        payload: { text: 'Hello' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 503 when manager is not available', async () => {
      await app.close();
      app = Fastify();
      registerVoiceProfileRoutes(app, {
        voiceProfileStore: store,
        multimodalManager: null,
      });
      await app.ready();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/voice/profiles/vp-001/preview',
        payload: { text: 'Hello' },
      });
      expect(res.statusCode).toBe(503);
    });
  });

  describe('POST /api/v1/voice/profiles/clone', () => {
    it('rejects missing fields with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/voice/profiles/clone',
        payload: { name: 'Cloned' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 503 when ELEVENLABS_API_KEY is not set', async () => {
      const original = process.env.ELEVENLABS_API_KEY;
      delete process.env.ELEVENLABS_API_KEY;
      try {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/voice/profiles/clone',
          payload: { name: 'Cloned', audioBase64: 'dGVzdA==' },
        });
        expect(res.statusCode).toBe(503);
      } finally {
        if (original !== undefined) process.env.ELEVENLABS_API_KEY = original;
      }
    });
  });
});
