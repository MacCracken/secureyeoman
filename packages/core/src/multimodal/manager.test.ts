// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MultimodalManager } from './manager.js';
import type { MultimodalStorage } from './storage.js';
import type { MultimodalManagerDeps } from './manager.js';

function createMockStorage(): MultimodalStorage {
  return {
    ensureTables: vi.fn().mockResolvedValue(undefined),
    createJob: vi.fn().mockResolvedValue('job_123'),
    completeJob: vi.fn().mockResolvedValue(undefined),
    failJob: vi.fn().mockResolvedValue(undefined),
    getJob: vi.fn().mockResolvedValue(null),
    listJobs: vi.fn().mockResolvedValue({ jobs: [], total: 0 }),
    getJobStats: vi.fn().mockResolvedValue({}),
    close: vi.fn(),
  } as unknown as MultimodalStorage;
}

function createMockDeps(): MultimodalManagerDeps {
  return {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn().mockReturnThis(),
      level: 'info',
    } as unknown as MultimodalManagerDeps['logger'],
    aiClient: {
      chat: vi.fn().mockResolvedValue({ content: 'A beautiful sunset over the ocean.' }),
    },
    extensionManager: {
      emit: vi.fn().mockResolvedValue({ vetoed: false, errors: [] }),
    },
  };
}

const defaultConfig = {
  enabled: true,
  vision: { enabled: true, maxImageSizeMb: 10, maxImagesPerMessage: 4 },
  stt: { enabled: true, provider: 'openai' as const, maxDurationSeconds: 120, model: 'whisper-1' },
  tts: { enabled: true, provider: 'openai' as const, voice: 'alloy', model: 'tts-1' },
  imageGen: { enabled: true, provider: 'openai' as const, model: 'dall-e-3', maxPerDay: 50 },
};

describe('MultimodalManager', () => {
  let storage: MultimodalStorage;
  let deps: MultimodalManagerDeps;
  let manager: MultimodalManager;

  beforeEach(async () => {
    vi.resetAllMocks();
    storage = createMockStorage();
    deps = createMockDeps();
    manager = new MultimodalManager(storage, deps, defaultConfig);
    await manager.initialize();
  });

  describe('initialize', () => {
    it('calls ensureTables on storage', async () => {
      expect(storage.ensureTables).toHaveBeenCalled();
    });

    it('is idempotent', async () => {
      await manager.initialize();
      // ensureTables only called once (from beforeEach)
      expect(storage.ensureTables).toHaveBeenCalledTimes(1);
    });
  });

  describe('analyzeImage', () => {
    it('calls AI client and returns result', async () => {
      const result = await manager.analyzeImage({
        imageBase64: 'dGVzdA==',
        mimeType: 'image/jpeg',
      });

      expect(result.description).toBe('A beautiful sunset over the ocean.');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(storage.createJob).toHaveBeenCalledWith('vision', expect.any(Object));
      expect(storage.completeJob).toHaveBeenCalled();
      expect(deps.extensionManager!.emit).toHaveBeenCalledWith(
        'multimodal:image-analyzed',
        expect.any(Object),
      );
    });

    it('logs job failure on error', async () => {
      (deps.aiClient.chat as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('API error'),
      );

      await expect(
        manager.analyzeImage({ imageBase64: 'dGVzdA==', mimeType: 'image/jpeg' }),
      ).rejects.toThrow('API error');

      expect(storage.failJob).toHaveBeenCalledWith('job_123', 'API error');
    });

    it('throws when vision is disabled', async () => {
      const disabledManager = new MultimodalManager(storage, deps, {
        ...defaultConfig,
        vision: { ...defaultConfig.vision, enabled: false },
      });
      await disabledManager.initialize();

      await expect(
        disabledManager.analyzeImage({ imageBase64: 'dGVzdA==', mimeType: 'image/jpeg' }),
      ).rejects.toThrow('Vision capability is disabled');
    });
  });

  describe('transcribeAudio', () => {
    it('throws when STT is disabled', async () => {
      const disabledManager = new MultimodalManager(storage, deps, {
        ...defaultConfig,
        stt: { ...defaultConfig.stt, enabled: false },
      });
      await disabledManager.initialize();

      await expect(
        disabledManager.transcribeAudio({ audioBase64: 'dGVzdA==', format: 'ogg' }),
      ).rejects.toThrow('Speech-to-text capability is disabled');
    });

    it('throws when OPENAI_API_KEY is not set', async () => {
      const origKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      await expect(
        manager.transcribeAudio({ audioBase64: 'dGVzdA==', format: 'ogg' }),
      ).rejects.toThrow('OPENAI_API_KEY');

      if (origKey) process.env.OPENAI_API_KEY = origKey;
    });
  });

  describe('synthesizeSpeech', () => {
    it('throws when TTS is disabled', async () => {
      const disabledManager = new MultimodalManager(storage, deps, {
        ...defaultConfig,
        tts: { ...defaultConfig.tts, enabled: false },
      });
      await disabledManager.initialize();

      await expect(
        disabledManager.synthesizeSpeech({ text: 'Hello', voice: 'alloy', model: 'tts-1', responseFormat: 'mp3' }),
      ).rejects.toThrow('Text-to-speech capability is disabled');
    });
  });

  describe('generateImage', () => {
    it('throws when image gen is disabled', async () => {
      const disabledManager = new MultimodalManager(storage, deps, {
        ...defaultConfig,
        imageGen: { ...defaultConfig.imageGen, enabled: false },
      });
      await disabledManager.initialize();

      await expect(
        disabledManager.generateImage({ prompt: 'A cat', size: '1024x1024', quality: 'standard', style: 'vivid' }),
      ).rejects.toThrow('Image generation capability is disabled');
    });
  });

  describe('input size limits', () => {
    it('rejects image base64 exceeding 20MB', async () => {
      const oversizedBase64 = 'A'.repeat(20_971_521);
      await expect(
        manager.analyzeImage({ imageBase64: oversizedBase64, mimeType: 'image/jpeg' }),
      ).rejects.toThrow('Image data exceeds maximum allowed size');
    });

    it('rejects audio base64 exceeding 20MB', async () => {
      const oversizedBase64 = 'A'.repeat(20_971_521);
      await expect(
        manager.transcribeAudio({ audioBase64: oversizedBase64, format: 'ogg' }),
      ).rejects.toThrow('Audio data exceeds maximum allowed size');
    });

    it('accepts image base64 within limit', async () => {
      const result = await manager.analyzeImage({
        imageBase64: 'dGVzdA==',
        mimeType: 'image/jpeg',
      });
      expect(result.description).toBeDefined();
    });
  });

  describe('error sanitization', () => {
    it('strips API keys from error messages', async () => {
      (deps.aiClient.chat as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Failed with key sk-abc123def456ghi789jkl012mno345pqr678'),
      );

      await expect(
        manager.analyzeImage({ imageBase64: 'dGVzdA==', mimeType: 'image/jpeg' }),
      ).rejects.toThrow('[REDACTED]');
    });

    it('strips Bearer tokens from error messages', async () => {
      (deps.aiClient.chat as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Auth failed with Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature'),
      );

      await expect(
        manager.analyzeImage({ imageBase64: 'dGVzdA==', mimeType: 'image/jpeg' }),
      ).rejects.toThrow('Bearer [REDACTED]');
    });
  });

  describe('DALL-E URL validation', () => {
    it('rejects URLs from non-OpenAI domains', async () => {
      const origKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'sk-test-key-for-unit-test-purposes-only';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ url: 'https://evil.example.com/malicious.png', revised_prompt: 'A cat' }],
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        manager.generateImage({ prompt: 'A cat', size: '1024x1024', quality: 'standard', style: 'vivid' }),
      ).rejects.toThrow('unexpected origin');

      vi.unstubAllGlobals();
      if (origKey) process.env.OPENAI_API_KEY = origKey;
      else delete process.env.OPENAI_API_KEY;
    });

    it('accepts URLs from openai.com', async () => {
      const origKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'sk-test-key-for-unit-test-purposes-only';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ url: 'https://images.openai.com/img123.png', revised_prompt: 'A cat' }],
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await manager.generateImage({
        prompt: 'A cat',
        size: '1024x1024',
        quality: 'standard',
        style: 'vivid',
      });
      expect(result.imageUrl).toBe('https://images.openai.com/img123.png');

      vi.unstubAllGlobals();
      if (origKey) process.env.OPENAI_API_KEY = origKey;
      else delete process.env.OPENAI_API_KEY;
    });

    it('accepts URLs from oaidalleapiprodscus.blob.core.windows.net', async () => {
      const origKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'sk-test-key-for-unit-test-purposes-only';

      const dalleUrl = 'https://oaidalleapiprodscus.blob.core.windows.net/img.png';
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ url: dalleUrl }],
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await manager.generateImage({
        prompt: 'A cat',
        size: '1024x1024',
        quality: 'standard',
        style: 'vivid',
      });
      expect(result.imageUrl).toBe(dalleUrl);

      vi.unstubAllGlobals();
      if (origKey) process.env.OPENAI_API_KEY = origKey;
      else delete process.env.OPENAI_API_KEY;
    });
  });

  describe('close', () => {
    it('closes storage', () => {
      manager.close();
      expect(storage.close).toHaveBeenCalled();
    });
  });
});
