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
  haptic: { enabled: true, maxPatternDurationMs: 5_000 },
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
        expect.any(Object)
      );
    });

    it('logs job failure on error', async () => {
      (deps.aiClient.chat as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API error'));

      await expect(
        manager.analyzeImage({ imageBase64: 'dGVzdA==', mimeType: 'image/jpeg' })
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
        disabledManager.analyzeImage({ imageBase64: 'dGVzdA==', mimeType: 'image/jpeg' })
      ).rejects.toThrow('Vision capability is disabled');
    });
  });

  // ── Voicebox STT provider ──────────────────────────────────────────────────

  describe('transcribeAudio — voicebox provider', () => {
    it('routes to voicebox /transcribe when STT_PROVIDER=voicebox', async () => {
      process.env.STT_PROVIDER = 'voicebox';
      process.env.VOICEBOX_URL = 'http://localhost:17493';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'Hello from voicebox', language: 'en' }),
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await manager.transcribeAudio({ audioBase64: 'dGVzdA==', format: 'wav' });

      expect(result.text).toBe('Hello from voicebox');
      expect(result.language).toBe('en');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:17493/transcribe',
        expect.objectContaining({ method: 'POST' })
      );

      vi.unstubAllGlobals();
      delete process.env.STT_PROVIDER;
      delete process.env.VOICEBOX_URL;
    });

    it('strips trailing slash from VOICEBOX_URL', async () => {
      process.env.STT_PROVIDER = 'voicebox';
      process.env.VOICEBOX_URL = 'http://localhost:17493/';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'ok' }),
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      await manager.transcribeAudio({ audioBase64: 'dGVzdA==', format: 'wav' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:17493/transcribe',
        expect.any(Object)
      );

      vi.unstubAllGlobals();
      delete process.env.STT_PROVIDER;
      delete process.env.VOICEBOX_URL;
    });

    it('throws when voicebox STT returns non-ok status', async () => {
      process.env.STT_PROVIDER = 'voicebox';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        manager.transcribeAudio({ audioBase64: 'dGVzdA==', format: 'wav' })
      ).rejects.toThrow('Voicebox STT error (503)');

      vi.unstubAllGlobals();
      delete process.env.STT_PROVIDER;
    });
  });

  // ── Voicebox TTS provider ──────────────────────────────────────────────────

  describe('synthesizeSpeech — voicebox provider', () => {
    it('throws when TTS_PROVIDER=voicebox and VOICEBOX_PROFILE_ID is not set', async () => {
      process.env.TTS_PROVIDER = 'voicebox';
      delete process.env.VOICEBOX_PROFILE_ID;

      await expect(
        manager.synthesizeSpeech({
          text: 'Hello',
          voice: 'alloy',
          model: 'tts-1',
          responseFormat: 'mp3',
        })
      ).rejects.toThrow('VOICEBOX_PROFILE_ID');

      delete process.env.TTS_PROVIDER;
    });

    it('routes to voicebox /generate + /audio when TTS_PROVIDER=voicebox', async () => {
      process.env.TTS_PROVIDER = 'voicebox';
      process.env.VOICEBOX_PROFILE_ID = 'profile-abc';
      process.env.VOICEBOX_URL = 'http://localhost:17493';

      const audioBytes = Buffer.from('fake-audio-data');
      const audioArrayBuffer = audioBytes.buffer.slice(
        audioBytes.byteOffset,
        audioBytes.byteOffset + audioBytes.byteLength
      );
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'gen-123' }),
          text: async () => '',
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => audioArrayBuffer,
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await manager.synthesizeSpeech({
        text: 'Hello world',
        voice: 'alloy',
        model: 'tts-1',
        responseFormat: 'mp3',
      });

      expect(result.audioBase64).toBe(audioBytes.toString('base64'));
      expect(result.format).toBe('wav');
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'http://localhost:17493/generate',
        expect.objectContaining({ method: 'POST' })
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'http://localhost:17493/audio/gen-123',
        expect.any(Object)
      );

      vi.unstubAllGlobals();
      delete process.env.TTS_PROVIDER;
      delete process.env.VOICEBOX_PROFILE_ID;
      delete process.env.VOICEBOX_URL;
    });

    it('throws when voicebox generate returns non-ok status', async () => {
      process.env.TTS_PROVIDER = 'voicebox';
      process.env.VOICEBOX_PROFILE_ID = 'profile-abc';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        manager.synthesizeSpeech({
          text: 'Hello',
          voice: 'alloy',
          model: 'tts-1',
          responseFormat: 'mp3',
        })
      ).rejects.toThrow('Voicebox TTS error (500)');

      vi.unstubAllGlobals();
      delete process.env.TTS_PROVIDER;
      delete process.env.VOICEBOX_PROFILE_ID;
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
        disabledManager.transcribeAudio({ audioBase64: 'dGVzdA==', format: 'ogg' })
      ).rejects.toThrow('Speech-to-text capability is disabled');
    });

    it('throws when OPENAI_API_KEY is not set', async () => {
      const origKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      await expect(
        manager.transcribeAudio({ audioBase64: 'dGVzdA==', format: 'ogg' })
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
        disabledManager.synthesizeSpeech({
          text: 'Hello',
          voice: 'alloy',
          model: 'tts-1',
          responseFormat: 'mp3',
        })
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
        disabledManager.generateImage({
          prompt: 'A cat',
          size: '1024x1024',
          quality: 'standard',
          style: 'vivid',
        })
      ).rejects.toThrow('Image generation capability is disabled');
    });
  });

  describe('input size limits', () => {
    it('rejects image base64 exceeding 20MB', async () => {
      const oversizedBase64 = 'A'.repeat(20_971_521);
      await expect(
        manager.analyzeImage({ imageBase64: oversizedBase64, mimeType: 'image/jpeg' })
      ).rejects.toThrow('Image data exceeds maximum allowed size');
    });

    it('rejects audio base64 exceeding 20MB', async () => {
      const oversizedBase64 = 'A'.repeat(20_971_521);
      await expect(
        manager.transcribeAudio({ audioBase64: oversizedBase64, format: 'ogg' })
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
        new Error('Failed with key sk-abc123def456ghi789jkl012mno345pqr678')
      );

      await expect(
        manager.analyzeImage({ imageBase64: 'dGVzdA==', mimeType: 'image/jpeg' })
      ).rejects.toThrow('[REDACTED]');
    });

    it('strips Bearer tokens from error messages', async () => {
      (deps.aiClient.chat as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Auth failed with Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature')
      );

      await expect(
        manager.analyzeImage({ imageBase64: 'dGVzdA==', mimeType: 'image/jpeg' })
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
        manager.generateImage({
          prompt: 'A cat',
          size: '1024x1024',
          quality: 'standard',
          style: 'vivid',
        })
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

  describe('triggerHaptic', () => {
    it('returns triggered result with correct patternMs for single duration', async () => {
      const result = await manager.triggerHaptic({ pattern: 300 });

      expect(result.triggered).toBe(true);
      expect(result.patternMs).toBe(300);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(storage.createJob).toHaveBeenCalledWith('haptic', expect.any(Object));
      expect(storage.completeJob).toHaveBeenCalled();
      expect(deps.extensionManager!.emit).toHaveBeenCalledWith(
        'multimodal:haptic-triggered',
        expect.any(Object)
      );
    });

    it('sums pattern array into correct patternMs', async () => {
      const result = await manager.triggerHaptic({ pattern: [200, 100, 200] });

      expect(result.triggered).toBe(true);
      expect(result.patternMs).toBe(500);
    });

    it('emits hook with pattern array and description', async () => {
      await manager.triggerHaptic({ pattern: [100, 50, 100], description: 'alert' });

      expect(deps.extensionManager!.emit).toHaveBeenCalledWith(
        'multimodal:haptic-triggered',
        expect.objectContaining({
          data: expect.objectContaining({
            pattern: [100, 50, 100],
            patternMs: 250,
            description: 'alert',
          }),
        })
      );
    });

    it('throws when haptic is disabled', async () => {
      const disabledManager = new MultimodalManager(storage, deps, {
        ...defaultConfig,
        haptic: { enabled: false, maxPatternDurationMs: 5_000 },
      });
      await disabledManager.initialize();

      await expect(disabledManager.triggerHaptic({ pattern: 200 })).rejects.toThrow(
        'Haptic capability is disabled'
      );
    });

    it('throws when pattern total exceeds maxPatternDurationMs', async () => {
      await expect(manager.triggerHaptic({ pattern: [3000, 3000] })).rejects.toThrow(
        'exceeds maximum'
      );
      // Validation fires before createJob, so no job is created or failed
      expect(storage.createJob).not.toHaveBeenCalled();
    });

    it('accepts pattern exactly at the limit', async () => {
      const result = await manager.triggerHaptic({ pattern: 5_000 });
      expect(result.triggered).toBe(true);
      expect(result.patternMs).toBe(5_000);
    });

    it('logs job failure on error', async () => {
      (storage.completeJob as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('DB write failed')
      );

      await expect(manager.triggerHaptic({ pattern: 200 })).rejects.toThrow('DB write failed');
      expect(storage.failJob).toHaveBeenCalledWith('job_123', 'DB write failed');
    });
  });

  describe('close', () => {
    it('closes storage', () => {
      manager.close();
      expect(storage.close).toHaveBeenCalled();
    });
  });
});

// ── New provider routing tests ─────────────────────────────────────────────────

describe('MultimodalManager — new TTS providers', () => {
  let storage: MultimodalStorage;
  let deps: ReturnType<typeof createMockDeps>;
  let manager: MultimodalManager;

  beforeEach(async () => {
    vi.resetAllMocks();
    storage = createMockStorage();
    deps = createMockDeps();
    manager = new MultimodalManager(storage, deps, {
      ...defaultConfig,
      tts: { enabled: true, provider: 'openai' as const, voice: 'alloy', model: 'tts-1' },
    });
    await manager.initialize();
  });

  it('routes to ElevenLabs TTS when TTS_PROVIDER=elevenlabs', async () => {
    process.env.TTS_PROVIDER = 'elevenlabs';
    process.env.ELEVENLABS_API_KEY = 'sk_test_elevenlabs_key';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Buffer.from('fake-audio').buffer,
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await manager.synthesizeSpeech({
      text: 'Hello ElevenLabs',
      voice: 'alloy',
      model: 'eleven_monolingual_v1',
      responseFormat: 'mp3',
    });

    expect(result.audioBase64).toBeDefined();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('api.elevenlabs.io'),
      expect.objectContaining({ method: 'POST' })
    );

    vi.unstubAllGlobals();
    delete process.env.TTS_PROVIDER;
    delete process.env.ELEVENLABS_API_KEY;
  });

  it('throws when TTS_PROVIDER=elevenlabs without ELEVENLABS_API_KEY', async () => {
    process.env.TTS_PROVIDER = 'elevenlabs';
    delete process.env.ELEVENLABS_API_KEY;

    await expect(
      manager.synthesizeSpeech({
        text: 'Hi',
        voice: 'alloy',
        model: 'tts-1',
        responseFormat: 'mp3',
      })
    ).rejects.toThrow('ELEVENLABS_API_KEY');

    delete process.env.TTS_PROVIDER;
  });

  it('routes to Deepgram TTS when TTS_PROVIDER=deepgram', async () => {
    process.env.TTS_PROVIDER = 'deepgram';
    process.env.DEEPGRAM_API_KEY = 'dg_test_key';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Buffer.from('dg-audio').buffer,
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await manager.synthesizeSpeech({
      text: 'Hello Deepgram',
      voice: 'alloy',
      model: 'tts-1',
      responseFormat: 'mp3',
    });

    expect(result.audioBase64).toBeDefined();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('deepgram.com'),
      expect.objectContaining({ method: 'POST' })
    );

    vi.unstubAllGlobals();
    delete process.env.TTS_PROVIDER;
    delete process.env.DEEPGRAM_API_KEY;
  });

  it('throws when TTS_PROVIDER=deepgram without DEEPGRAM_API_KEY', async () => {
    process.env.TTS_PROVIDER = 'deepgram';
    delete process.env.DEEPGRAM_API_KEY;

    await expect(
      manager.synthesizeSpeech({
        text: 'Hi',
        voice: 'alloy',
        model: 'tts-1',
        responseFormat: 'mp3',
      })
    ).rejects.toThrow('DEEPGRAM_API_KEY');

    delete process.env.TTS_PROVIDER;
  });

  it('routes to Cartesia TTS when TTS_PROVIDER=cartesia', async () => {
    process.env.TTS_PROVIDER = 'cartesia';
    process.env.CARTESIA_API_KEY = 'cartesia_test_key';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Buffer.from('cartesia-audio').buffer,
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await manager.synthesizeSpeech({
      text: 'Hello Cartesia',
      voice: 'alloy',
      model: 'tts-1',
      responseFormat: 'mp3',
    });

    expect(result.audioBase64).toBeDefined();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('cartesia.ai'),
      expect.objectContaining({ method: 'POST' })
    );

    vi.unstubAllGlobals();
    delete process.env.TTS_PROVIDER;
    delete process.env.CARTESIA_API_KEY;
  });
});

describe('MultimodalManager — new STT providers', () => {
  let storage: MultimodalStorage;
  let deps: ReturnType<typeof createMockDeps>;
  let manager: MultimodalManager;

  beforeEach(async () => {
    vi.resetAllMocks();
    storage = createMockStorage();
    deps = createMockDeps();
    manager = new MultimodalManager(storage, deps, defaultConfig);
    await manager.initialize();
  });

  it('routes to Deepgram STT when STT_PROVIDER=deepgram', async () => {
    process.env.STT_PROVIDER = 'deepgram';
    process.env.DEEPGRAM_API_KEY = 'dg_test_key';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: {
          channels: [{ alternatives: [{ transcript: 'hello deepgram', confidence: 0.99 }] }],
        },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await manager.transcribeAudio({ audioBase64: 'dGVzdA==', format: 'wav' });

    expect(result.text).toBe('hello deepgram');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('deepgram.com'),
      expect.objectContaining({ method: 'POST' })
    );

    vi.unstubAllGlobals();
    delete process.env.STT_PROVIDER;
    delete process.env.DEEPGRAM_API_KEY;
  });

  it('throws when STT_PROVIDER=deepgram without DEEPGRAM_API_KEY', async () => {
    process.env.STT_PROVIDER = 'deepgram';
    delete process.env.DEEPGRAM_API_KEY;

    await expect(
      manager.transcribeAudio({ audioBase64: 'dGVzdA==', format: 'wav' })
    ).rejects.toThrow('DEEPGRAM_API_KEY');

    delete process.env.STT_PROVIDER;
  });

  it('routes to ElevenLabs STT when STT_PROVIDER=elevenlabs', async () => {
    process.env.STT_PROVIDER = 'elevenlabs';
    process.env.ELEVENLABS_API_KEY = 'sk_test_key';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'hello elevenlabs', language_code: 'en' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await manager.transcribeAudio({ audioBase64: 'dGVzdA==', format: 'wav' });

    expect(result.text).toBe('hello elevenlabs');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('api.elevenlabs.io'),
      expect.any(Object)
    );

    vi.unstubAllGlobals();
    delete process.env.STT_PROVIDER;
    delete process.env.ELEVENLABS_API_KEY;
  });
});

describe('MultimodalManager — detectAvailableProviders', () => {
  let storage: MultimodalStorage;
  let deps: ReturnType<typeof createMockDeps>;
  let manager: MultimodalManager;

  beforeEach(async () => {
    vi.resetAllMocks();
    storage = createMockStorage();
    deps = createMockDeps();
    manager = new MultimodalManager(storage, deps, defaultConfig);
    await manager.initialize();
  });

  it('includes elevenlabs in tts and stt when ELEVENLABS_API_KEY is set', async () => {
    process.env.ELEVENLABS_API_KEY = 'sk_test_key';
    const providers = await manager.detectAvailableProviders();
    expect(providers.tts.configured).toContain('elevenlabs');
    expect(providers.stt.configured).toContain('elevenlabs');
    delete process.env.ELEVENLABS_API_KEY;
  });

  it('includes deepgram in tts and stt when DEEPGRAM_API_KEY is set', async () => {
    process.env.DEEPGRAM_API_KEY = 'dg_test';
    const providers = await manager.detectAvailableProviders();
    expect(providers.tts.configured).toContain('deepgram');
    expect(providers.stt.configured).toContain('deepgram');
    delete process.env.DEEPGRAM_API_KEY;
  });

  it('includes cartesia in tts when CARTESIA_API_KEY is set', async () => {
    process.env.CARTESIA_API_KEY = 'ct_test';
    const providers = await manager.detectAvailableProviders();
    expect(providers.tts.configured).toContain('cartesia');
    delete process.env.CARTESIA_API_KEY;
  });

  it('includes assemblyai in stt when ASSEMBLYAI_API_KEY is set', async () => {
    process.env.ASSEMBLYAI_API_KEY = 'aa_test';
    const providers = await manager.detectAvailableProviders();
    expect(providers.stt.configured).toContain('assemblyai');
    delete process.env.ASSEMBLYAI_API_KEY;
  });

  it('includes openai in tts and stt when OPENAI_API_KEY is set', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-openai';
    const providers = await manager.detectAvailableProviders();
    expect(providers.tts.configured).toContain('openai');
    expect(providers.stt.configured).toContain('openai');
    delete process.env.OPENAI_API_KEY;
  });

  it('returns tts.metadata with label and category for each configured provider', async () => {
    process.env.ELEVENLABS_API_KEY = 'sk_test';
    const providers = await manager.detectAvailableProviders();
    expect(providers.tts.metadata).toBeDefined();
    expect(providers.tts.metadata['elevenlabs']).toMatchObject({
      label: expect.any(String),
      category: 'cloud',
    });
    delete process.env.ELEVENLABS_API_KEY;
  });

  it('returns available[] list with all possible providers regardless of keys', async () => {
    const providers = await manager.detectAvailableProviders();
    expect(providers.tts.available).toContain('elevenlabs');
    expect(providers.tts.available).toContain('deepgram');
    expect(providers.stt.available).toContain('assemblyai');
  });

  it('includes voicebox in tts and stt when health check succeeds', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    const providers = await manager.detectAvailableProviders();
    expect(providers.tts.configured).toContain('voicebox');
    expect(providers.stt.configured).toContain('voicebox');

    vi.unstubAllGlobals();
  });

  it('returns voiceboxUrl in tts and stt results', async () => {
    process.env.VOICEBOX_URL = 'http://localhost:9999';
    const providers = await manager.detectAvailableProviders();
    expect(providers.tts.voiceboxUrl).toBe('http://localhost:9999');
    expect(providers.stt.voiceboxUrl).toBe('http://localhost:9999');
    delete process.env.VOICEBOX_URL;
  });

  it('does not include providers in configured[] without API keys', async () => {
    // Clean slate — remove any provider env vars that might be set
    const savedKeys: Record<string, string | undefined> = {};
    for (const k of [
      'ELEVENLABS_API_KEY',
      'DEEPGRAM_API_KEY',
      'CARTESIA_API_KEY',
      'ASSEMBLYAI_API_KEY',
      'GOOGLE_API_KEY',
      'AZURE_SPEECH_KEY',
      'PLAYHT_API_KEY',
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'SPEECH_KEY',
      'SPEECH_REGION',
      'PLAYHT_USER_ID',
    ]) {
      savedKeys[k] = process.env[k];
      delete process.env[k];
    }

    const providers = await manager.detectAvailableProviders();
    expect(providers.tts.configured).not.toContain('elevenlabs');
    expect(providers.tts.configured).not.toContain('deepgram');
    expect(providers.stt.configured).not.toContain('assemblyai');

    // Restore
    for (const [k, v] of Object.entries(savedKeys)) {
      if (v !== undefined) process.env[k] = v;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Provider resolution via prefsStorage + setProvider
// ─────────────────────────────────────────────────────────────────────────────

describe('MultimodalManager — provider resolution via prefsStorage', () => {
  let storage: MultimodalStorage;
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(async () => {
    vi.resetAllMocks();
    storage = createMockStorage();
    deps = createMockDeps();
  });

  afterEach(() => {
    delete process.env.VISION_PROVIDER;
    delete process.env.TTS_PROVIDER;
    delete process.env.STT_PROVIDER;
    vi.unstubAllGlobals();
  });

  it('resolveVisionProvider returns pref from storage when no env var set', async () => {
    const prefsStorage = { get: vi.fn().mockResolvedValue('gemini'), set: vi.fn() };
    const mgr = new MultimodalManager(storage, { ...deps, prefsStorage }, defaultConfig);
    await mgr.initialize();

    process.env.GEMINI_API_KEY = 'key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'gemini desc' }] } }] }),
      })
    );

    // Trigger resolveVisionProvider indirectly by calling detectAvailableProviders
    // to check resolveVisionProvider is wired to prefsStorage
    const providers = await mgr.detectAvailableProviders();
    expect(providers.vision.active).toBe('gemini');
    expect(prefsStorage.get).toHaveBeenCalledWith('multimodal.vision.provider');
    delete process.env.GEMINI_API_KEY;
  });

  it('resolveTTSProvider returns pref from storage when no env var set', async () => {
    const prefsStorage = { get: vi.fn().mockResolvedValue('deepgram'), set: vi.fn() };
    const mgr = new MultimodalManager(storage, { ...deps, prefsStorage }, defaultConfig);
    await mgr.initialize();

    const providers = await mgr.detectAvailableProviders();
    expect(providers.tts.active).toBe('deepgram');
    expect(prefsStorage.get).toHaveBeenCalledWith('multimodal.tts.provider');
  });

  it('resolveSTTProvider returns pref from storage when no env var set', async () => {
    const prefsStorage = { get: vi.fn().mockResolvedValue('assemblyai'), set: vi.fn() };
    const mgr = new MultimodalManager(storage, { ...deps, prefsStorage }, defaultConfig);
    await mgr.initialize();

    const providers = await mgr.detectAvailableProviders();
    expect(providers.stt.active).toBe('assemblyai');
    expect(prefsStorage.get).toHaveBeenCalledWith('multimodal.stt.provider');
  });

  it('setProvider calls prefsStorage.set with the correct key', async () => {
    const prefsStorage = { get: vi.fn().mockResolvedValue(null), set: vi.fn() };
    const mgr = new MultimodalManager(storage, { ...deps, prefsStorage }, defaultConfig);
    await mgr.initialize();

    await mgr.setProvider('tts', 'elevenlabs');
    expect(prefsStorage.set).toHaveBeenCalledWith('multimodal.tts.provider', 'elevenlabs');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Additional TTS providers — Google, Azure, PlayHT, OpenedAI
// ─────────────────────────────────────────────────────────────────────────────

describe('MultimodalManager — additional TTS providers', () => {
  let storage: MultimodalStorage;
  let deps: ReturnType<typeof createMockDeps>;
  let manager: MultimodalManager;

  beforeEach(async () => {
    vi.resetAllMocks();
    storage = createMockStorage();
    deps = createMockDeps();
    manager = new MultimodalManager(storage, deps, defaultConfig);
    await manager.initialize();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of [
      'TTS_PROVIDER',
      'GOOGLE_API_KEY',
      'SPEECH_KEY',
      'SPEECH_REGION',
      'PLAYHT_API_KEY',
      'PLAYHT_USER_ID',
      'OPENEDAI_SPEECH_URL',
    ]) {
      delete process.env[k];
    }
  });

  it('routes to Google TTS when TTS_PROVIDER=google', async () => {
    process.env.TTS_PROVIDER = 'google';
    process.env.GOOGLE_API_KEY = 'gapi-key';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ audioContent: Buffer.from('google-audio').toString('base64') }),
      })
    );

    const result = await manager.synthesizeSpeech({
      text: 'Hello Google',
      voice: 'alloy',
      model: 'tts-1',
      responseFormat: 'mp3',
    });
    expect(result.audioBase64).toBeDefined();
    expect(result.format).toBe('mp3');
  });

  it('throws when TTS_PROVIDER=google without GOOGLE_API_KEY', async () => {
    process.env.TTS_PROVIDER = 'google';
    delete process.env.GOOGLE_API_KEY;

    await expect(
      manager.synthesizeSpeech({
        text: 'Hi',
        voice: 'alloy',
        model: 'tts-1',
        responseFormat: 'mp3',
      })
    ).rejects.toThrow('GOOGLE_API_KEY');
  });

  it('routes to Azure TTS when TTS_PROVIDER=azure', async () => {
    process.env.TTS_PROVIDER = 'azure';
    process.env.SPEECH_KEY = 'speech-key';
    process.env.SPEECH_REGION = 'eastus';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => Buffer.from('azure-audio').buffer,
      })
    );

    const result = await manager.synthesizeSpeech({
      text: 'Hello Azure',
      voice: 'alloy',
      model: 'tts-1',
      responseFormat: 'mp3',
    });
    expect(result.audioBase64).toBeDefined();
  });

  it('throws when TTS_PROVIDER=azure without SPEECH_KEY or SPEECH_REGION', async () => {
    process.env.TTS_PROVIDER = 'azure';
    delete process.env.SPEECH_KEY;
    delete process.env.SPEECH_REGION;

    await expect(
      manager.synthesizeSpeech({
        text: 'Hi',
        voice: 'alloy',
        model: 'tts-1',
        responseFormat: 'mp3',
      })
    ).rejects.toThrow('SPEECH_KEY and SPEECH_REGION');
  });

  it('routes to PlayHT TTS when TTS_PROVIDER=playht', async () => {
    process.env.TTS_PROVIDER = 'playht';
    process.env.PLAYHT_API_KEY = 'ph-key';
    process.env.PLAYHT_USER_ID = 'ph-user';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => Buffer.from('playht-audio').buffer,
      })
    );

    const result = await manager.synthesizeSpeech({
      text: 'Hello PlayHT',
      voice: 'alloy',
      model: 'tts-1',
      responseFormat: 'mp3',
    });
    expect(result.audioBase64).toBeDefined();
  });

  it('throws when TTS_PROVIDER=playht without PLAYHT credentials', async () => {
    process.env.TTS_PROVIDER = 'playht';
    delete process.env.PLAYHT_API_KEY;
    delete process.env.PLAYHT_USER_ID;

    await expect(
      manager.synthesizeSpeech({
        text: 'Hi',
        voice: 'alloy',
        model: 'tts-1',
        responseFormat: 'mp3',
      })
    ).rejects.toThrow('PLAYHT_API_KEY and PLAYHT_USER_ID');
  });

  it('routes to OpenedAI TTS when TTS_PROVIDER=openedai', async () => {
    process.env.TTS_PROVIDER = 'openedai';
    process.env.OPENEDAI_SPEECH_URL = 'http://localhost:8000';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => Buffer.from('openedai-audio').buffer,
      })
    );

    const result = await manager.synthesizeSpeech({
      text: 'Hello OpenedAI',
      voice: 'alloy',
      model: 'tts-1',
      responseFormat: 'mp3',
    });
    expect(result.audioBase64).toBeDefined();
  });

  it('throws when TTS_PROVIDER=openedai without OPENEDAI_SPEECH_URL', async () => {
    process.env.TTS_PROVIDER = 'openedai';
    delete process.env.OPENEDAI_SPEECH_URL;

    await expect(
      manager.synthesizeSpeech({
        text: 'Hi',
        voice: 'alloy',
        model: 'tts-1',
        responseFormat: 'mp3',
      })
    ).rejects.toThrow('OPENEDAI_SPEECH_URL');
  });

  it('throws Voicebox audio fetch error when second Voicebox request fails', async () => {
    process.env.TTS_PROVIDER = 'voicebox';
    process.env.VOICEBOX_PROFILE_ID = 'profile-x';
    process.env.VOICEBOX_URL = 'http://localhost:17493';

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'gen-abc' }),
          text: async () => '',
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        })
    );

    await expect(
      manager.synthesizeSpeech({
        text: 'Hi',
        voice: 'alloy',
        model: 'tts-1',
        responseFormat: 'mp3',
      })
    ).rejects.toThrow('Voicebox audio fetch error (404)');

    delete process.env.TTS_PROVIDER;
    delete process.env.VOICEBOX_PROFILE_ID;
    delete process.env.VOICEBOX_URL;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Additional STT providers — Google, Azure, AssemblyAI
// ─────────────────────────────────────────────────────────────────────────────

describe('MultimodalManager — additional STT providers', () => {
  let storage: MultimodalStorage;
  let deps: ReturnType<typeof createMockDeps>;
  let manager: MultimodalManager;

  beforeEach(async () => {
    vi.resetAllMocks();
    storage = createMockStorage();
    deps = createMockDeps();
    manager = new MultimodalManager(storage, deps, defaultConfig);
    await manager.initialize();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of [
      'STT_PROVIDER',
      'GOOGLE_API_KEY',
      'SPEECH_KEY',
      'SPEECH_REGION',
      'ASSEMBLYAI_API_KEY',
    ]) {
      delete process.env[k];
    }
  });

  it('routes to Google STT when STT_PROVIDER=google', async () => {
    process.env.STT_PROVIDER = 'google';
    process.env.GOOGLE_API_KEY = 'gapi-key';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ alternatives: [{ transcript: 'hello google stt' }] }],
        }),
      })
    );

    const result = await manager.transcribeAudio({ audioBase64: 'dGVzdA==', format: 'wav' });
    expect(result.text).toBe('hello google stt');
  });

  it('throws when STT_PROVIDER=google without GOOGLE_API_KEY', async () => {
    process.env.STT_PROVIDER = 'google';
    delete process.env.GOOGLE_API_KEY;

    await expect(
      manager.transcribeAudio({ audioBase64: 'dGVzdA==', format: 'wav' })
    ).rejects.toThrow('GOOGLE_API_KEY');
  });

  it('routes to Azure STT when STT_PROVIDER=azure', async () => {
    process.env.STT_PROVIDER = 'azure';
    process.env.SPEECH_KEY = 'speech-key';
    process.env.SPEECH_REGION = 'westus';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ RecognitionStatus: 'Success', DisplayText: 'hello azure stt' }),
      })
    );

    const result = await manager.transcribeAudio({ audioBase64: 'dGVzdA==', format: 'wav' });
    expect(result.text).toBe('hello azure stt');
  });

  it('throws when Azure STT returns non-Success status', async () => {
    process.env.STT_PROVIDER = 'azure';
    process.env.SPEECH_KEY = 'speech-key';
    process.env.SPEECH_REGION = 'westus';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ RecognitionStatus: 'NoMatch', DisplayText: '' }),
      })
    );

    await expect(
      manager.transcribeAudio({ audioBase64: 'dGVzdA==', format: 'wav' })
    ).rejects.toThrow('Azure STT recognition failed');
  });

  it('throws when STT_PROVIDER=azure without credentials', async () => {
    process.env.STT_PROVIDER = 'azure';
    delete process.env.SPEECH_KEY;
    delete process.env.SPEECH_REGION;

    await expect(
      manager.transcribeAudio({ audioBase64: 'dGVzdA==', format: 'wav' })
    ).rejects.toThrow('SPEECH_KEY and SPEECH_REGION');
  });

  it('routes to AssemblyAI when STT_PROVIDER=assemblyai (upload + submit + completed)', async () => {
    process.env.STT_PROVIDER = 'assemblyai';
    process.env.ASSEMBLYAI_API_KEY = 'aai-key';

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ upload_url: 'https://cdn.assemblyai.com/upload/test' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'transcript-123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            status: 'completed',
            text: 'hello assemblyai',
            language_code: 'en',
          }),
        })
    );

    const result = await manager.transcribeAudio({ audioBase64: 'dGVzdA==', format: 'wav' });
    expect(result.text).toBe('hello assemblyai');
    expect(result.language).toBe('en');
  });

  it('throws when AssemblyAI upload fails', async () => {
    process.env.STT_PROVIDER = 'assemblyai';
    process.env.ASSEMBLYAI_API_KEY = 'aai-key';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Server Error',
      })
    );

    await expect(
      manager.transcribeAudio({ audioBase64: 'dGVzdA==', format: 'wav' })
    ).rejects.toThrow('AssemblyAI upload error (500)');
  });

  it('throws when AssemblyAI transcript status is error', async () => {
    process.env.STT_PROVIDER = 'assemblyai';
    process.env.ASSEMBLYAI_API_KEY = 'aai-key';

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ upload_url: 'https://cdn.assemblyai.com/upload/test' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'transcript-err' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'error', error: 'Audio too short' }),
        })
    );

    await expect(
      manager.transcribeAudio({ audioBase64: 'dGVzdA==', format: 'wav' })
    ).rejects.toThrow('AssemblyAI transcription error: Audio too short');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 58 — synthesizeSpeechBinary
// ─────────────────────────────────────────────────────────────────────────────

describe('MultimodalManager — synthesizeSpeechBinary', () => {
  let storage: MultimodalStorage;
  let deps: ReturnType<typeof createMockDeps>;
  let manager: MultimodalManager;

  beforeEach(async () => {
    vi.resetAllMocks();
    storage = createMockStorage();
    deps = createMockDeps();
    manager = new MultimodalManager(storage, deps, defaultConfig);
    await manager.initialize();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of [
      'TTS_PROVIDER',
      'OPENAI_API_KEY',
      'VOICEBOX_PROFILE_ID',
      'VOICEBOX_URL',
      'ELEVENLABS_API_KEY',
      'DEEPGRAM_API_KEY',
    ]) {
      delete process.env[k];
    }
  });

  it('throws when TTS is disabled', async () => {
    const disabledMgr = new MultimodalManager(storage, deps, {
      ...defaultConfig,
      tts: { ...defaultConfig.tts, enabled: false },
    });
    await disabledMgr.initialize();

    await expect(
      disabledMgr.synthesizeSpeechBinary({
        text: 'Hello',
        voice: 'alloy',
        model: 'tts-1',
        responseFormat: 'mp3',
      })
    ).rejects.toThrow('Text-to-speech capability is disabled');
  });

  it('returns Buffer from OpenAI (default provider), creates and completes job, emits hook', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-key-for-unit-test';
    const audioBytes = Buffer.from('fake-mp3-audio');
    const ab = audioBytes.buffer.slice(
      audioBytes.byteOffset,
      audioBytes.byteOffset + audioBytes.byteLength
    );

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => ab,
      })
    );

    const result = await manager.synthesizeSpeechBinary({
      text: 'Hello world',
      voice: 'alloy',
      model: 'tts-1',
      responseFormat: 'mp3',
    });

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.toString()).toBe('fake-mp3-audio');
    expect(result.format).toBe('mp3');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(storage.createJob).toHaveBeenCalledWith('tts', expect.any(Object));
    expect(storage.completeJob).toHaveBeenCalled();
    expect(deps.extensionManager!.emit).toHaveBeenCalledWith(
      'multimodal:speech-generated',
      expect.any(Object)
    );
  });

  it('throws when OPENAI_API_KEY is missing (default provider) and fails job', async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(
      manager.synthesizeSpeechBinary({
        text: 'Hello',
        voice: 'alloy',
        model: 'tts-1',
        responseFormat: 'mp3',
      })
    ).rejects.toThrow('OPENAI_API_KEY');

    expect(storage.failJob).toHaveBeenCalled();
  });

  it('throws and fails job when OpenAI returns non-ok status', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-key-for-unit-test';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Bad Request',
      })
    );

    await expect(
      manager.synthesizeSpeechBinary({
        text: 'Hello',
        voice: 'alloy',
        model: 'tts-1',
        responseFormat: 'mp3',
      })
    ).rejects.toThrow('TTS API error (400)');

    expect(storage.failJob).toHaveBeenCalled();
  });

  it('converts voicebox base64 result to Buffer', async () => {
    process.env.TTS_PROVIDER = 'voicebox';
    process.env.VOICEBOX_PROFILE_ID = 'profile-abc';
    process.env.VOICEBOX_URL = 'http://localhost:17493';

    const audioBytes = Buffer.from('fake-voicebox-audio');
    const ab = audioBytes.buffer.slice(
      audioBytes.byteOffset,
      audioBytes.byteOffset + audioBytes.byteLength
    );

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'gen-123' }),
          text: async () => '',
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => ab,
        })
    );

    const result = await manager.synthesizeSpeechBinary({
      text: 'Hello voicebox',
      voice: 'alloy',
      model: 'tts-1',
      responseFormat: 'mp3',
    });

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.toString()).toBe('fake-voicebox-audio');
    expect(result.format).toBe('wav');
  });

  it('converts elevenlabs base64 result to Buffer', async () => {
    process.env.TTS_PROVIDER = 'elevenlabs';
    process.env.ELEVENLABS_API_KEY = 'sk_test_elevenlabs_key';

    const audioBytes = Buffer.from('elevenlabs-audio-data');
    const ab = audioBytes.buffer.slice(
      audioBytes.byteOffset,
      audioBytes.byteOffset + audioBytes.byteLength
    );

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => ab,
      })
    );

    const result = await manager.synthesizeSpeechBinary({
      text: 'Hello ElevenLabs',
      voice: 'alloy',
      model: 'tts-1',
      responseFormat: 'mp3',
    });

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.format).toBe('mp3');
  });

  it('converts deepgram base64 result to Buffer', async () => {
    process.env.TTS_PROVIDER = 'deepgram';
    process.env.DEEPGRAM_API_KEY = 'dg-test-key';

    const audioBytes = Buffer.from('deepgram-audio-data');
    const ab = audioBytes.buffer.slice(
      audioBytes.byteOffset,
      audioBytes.byteOffset + audioBytes.byteLength
    );

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => ab,
      })
    );

    const result = await manager.synthesizeSpeechBinary({
      text: 'Hello Deepgram',
      voice: 'alloy',
      model: 'tts-1',
      responseFormat: 'mp3',
    });

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.format).toBe('mp3');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 58 — STT model resolution (resolveSTTModel, setModel, detectAvailableProviders.stt.model)
// ─────────────────────────────────────────────────────────────────────────────

describe('MultimodalManager — STT model resolution (Phase 58)', () => {
  let storage: MultimodalStorage;
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    vi.resetAllMocks();
    storage = createMockStorage();
    deps = createMockDeps();
    delete process.env.WHISPER_MODEL;
  });

  afterEach(() => {
    delete process.env.WHISPER_MODEL;
    vi.unstubAllGlobals();
  });

  it('detectAvailableProviders includes stt.model from config default', async () => {
    const mgr = new MultimodalManager(storage, deps, defaultConfig);
    await mgr.initialize();

    const providers = await mgr.detectAvailableProviders();
    expect(providers.stt.model).toBe('whisper-1');
  });

  it('detectAvailableProviders stt.model reflects WHISPER_MODEL env var (highest priority)', async () => {
    process.env.WHISPER_MODEL = 'large-v3';
    const mgr = new MultimodalManager(storage, deps, defaultConfig);
    await mgr.initialize();

    const providers = await mgr.detectAvailableProviders();
    expect(providers.stt.model).toBe('large-v3');
  });

  it('detectAvailableProviders stt.model reflects prefsStorage value when no env var', async () => {
    const prefsStorage = {
      get: vi.fn().mockImplementation((key: string) => {
        if (key === 'multimodal.stt.model') return Promise.resolve('medium');
        return Promise.resolve(null);
      }),
      set: vi.fn(),
    };
    const mgr = new MultimodalManager(storage, { ...deps, prefsStorage }, defaultConfig);
    await mgr.initialize();

    const providers = await mgr.detectAvailableProviders();
    expect(providers.stt.model).toBe('medium');
    expect(prefsStorage.get).toHaveBeenCalledWith('multimodal.stt.model');
  });

  it('detectAvailableProviders stt.model falls back to config when no env or pref', async () => {
    const prefsStorage = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
    };
    const cfgWithLarge = {
      ...defaultConfig,
      stt: { ...defaultConfig.stt, model: 'large-v2' },
    };
    const mgr = new MultimodalManager(storage, { ...deps, prefsStorage }, cfgWithLarge);
    await mgr.initialize();

    const providers = await mgr.detectAvailableProviders();
    expect(providers.stt.model).toBe('large-v2');
  });

  it('setModel persists stt model to prefsStorage', async () => {
    const prefsStorage = { get: vi.fn().mockResolvedValue(null), set: vi.fn() };
    const mgr = new MultimodalManager(storage, { ...deps, prefsStorage }, defaultConfig);
    await mgr.initialize();

    await mgr.setModel('stt', 'large-v3');
    expect(prefsStorage.set).toHaveBeenCalledWith('multimodal.stt.model', 'large-v3');
  });

  it('setModel persists tts model to prefsStorage', async () => {
    const prefsStorage = { get: vi.fn().mockResolvedValue(null), set: vi.fn() };
    const mgr = new MultimodalManager(storage, { ...deps, prefsStorage }, defaultConfig);
    await mgr.initialize();

    await mgr.setModel('tts', 'tts-1-hd');
    expect(prefsStorage.set).toHaveBeenCalledWith('multimodal.tts.model', 'tts-1-hd');
  });

  it('transcribeAudio sends resolved model to OpenAI (WHISPER_MODEL env override)', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-key-for-unit-test';
    process.env.WHISPER_MODEL = 'large-v3';

    const mgr = new MultimodalManager(storage, deps, defaultConfig);
    await mgr.initialize();

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'hello', language: 'en' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await mgr.transcribeAudio({ audioBase64: 'dGVzdA==', format: 'wav' });

    const fetchCall = mockFetch.mock.calls[0];
    const formData = fetchCall[1].body as FormData;
    expect(formData.get('model')).toBe('large-v3');

    delete process.env.OPENAI_API_KEY;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage gap: OpenAI vision provider branch
// ─────────────────────────────────────────────────────────────────────────────

describe('MultimodalManager — analyzeImage OpenAI vision provider', () => {
  let storage: MultimodalStorage;
  let deps: ReturnType<typeof createMockDeps>;
  let manager: MultimodalManager;

  beforeEach(async () => {
    vi.resetAllMocks();
    storage = createMockStorage();
    deps = createMockDeps();
    manager = new MultimodalManager(storage, deps, defaultConfig);
    await manager.initialize();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.VISION_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  it('routes to OpenAI vision API when VISION_PROVIDER=openai', async () => {
    process.env.VISION_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-test-key-for-unit-test';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'OpenAI sees a cat' } }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await manager.analyzeImage({
      imageBase64: 'dGVzdA==',
      mimeType: 'image/jpeg',
    });

    expect(result.description).toBe('OpenAI sees a cat');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('api.openai.com/v1/chat/completions'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('throws when VISION_PROVIDER=openai without OPENAI_API_KEY', async () => {
    process.env.VISION_PROVIDER = 'openai';
    delete process.env.OPENAI_API_KEY;

    await expect(
      manager.analyzeImage({ imageBase64: 'dGVzdA==', mimeType: 'image/jpeg' })
    ).rejects.toThrow('OPENAI_API_KEY');
  });

  it('throws when OpenAI vision returns non-ok status', async () => {
    process.env.VISION_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-test-key-for-unit-test';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      })
    );

    await expect(
      manager.analyzeImage({ imageBase64: 'dGVzdA==', mimeType: 'image/jpeg' })
    ).rejects.toThrow('OpenAI vision error (429)');
  });

  it('routes to Gemini vision API when VISION_PROVIDER=gemini', async () => {
    process.env.VISION_PROVIDER = 'gemini';
    process.env.GOOGLE_API_KEY = 'gemini-test-key';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Gemini sees a dog' }] } }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await manager.analyzeImage({
      imageBase64: 'dGVzdA==',
      mimeType: 'image/jpeg',
    });

    expect(result.description).toBe('Gemini sees a dog');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('generativelanguage.googleapis.com'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('uses GEMINI_API_KEY when GOOGLE_API_KEY is not set', async () => {
    process.env.VISION_PROVIDER = 'gemini';
    delete process.env.GOOGLE_API_KEY;
    process.env.GEMINI_API_KEY = 'gemini-alt-key';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Gemini alt' }] } }],
        }),
      })
    );

    const result = await manager.analyzeImage({
      imageBase64: 'dGVzdA==',
      mimeType: 'image/jpeg',
    });
    expect(result.description).toBe('Gemini alt');
  });

  it('throws when VISION_PROVIDER=gemini without API key', async () => {
    process.env.VISION_PROVIDER = 'gemini';
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;

    await expect(
      manager.analyzeImage({ imageBase64: 'dGVzdA==', mimeType: 'image/jpeg' })
    ).rejects.toThrow('GOOGLE_API_KEY or GEMINI_API_KEY');
  });

  it('throws when Gemini vision returns non-ok status', async () => {
    process.env.VISION_PROVIDER = 'gemini';
    process.env.GOOGLE_API_KEY = 'gemini-test-key';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      })
    );

    await expect(
      manager.analyzeImage({ imageBase64: 'dGVzdA==', mimeType: 'image/jpeg' })
    ).rejects.toThrow('Gemini vision error (503)');
  });

  it('uses custom prompt when provided', async () => {
    const result = await manager.analyzeImage({
      imageBase64: 'dGVzdA==',
      mimeType: 'image/jpeg',
      prompt: 'What color is the sky?',
    });

    expect(result.description).toBeDefined();
    // The AIClient.chat should have been called with the custom prompt
    expect(deps.aiClient.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining('What color is the sky?'),
          }),
        ]),
      })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage gap: DALL-E no images, invalid URL for isAllowedDalleUrl
// ─────────────────────────────────────────────────────────────────────────────

describe('MultimodalManager — generateImage edge cases', () => {
  let storage: MultimodalStorage;
  let deps: ReturnType<typeof createMockDeps>;
  let manager: MultimodalManager;

  beforeEach(async () => {
    vi.resetAllMocks();
    storage = createMockStorage();
    deps = createMockDeps();
    manager = new MultimodalManager(storage, deps, defaultConfig);
    await manager.initialize();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
  });

  it('throws when DALL-E returns empty data array', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-key-for-unit-test';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      })
    );

    await expect(
      manager.generateImage({
        prompt: 'A cat',
        size: '1024x1024',
        quality: 'standard',
        style: 'vivid',
      })
    ).rejects.toThrow('DALL-E API returned no images');
  });

  it('throws when DALL-E API returns non-ok status', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-key-for-unit-test';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Bad prompt',
      })
    );

    await expect(
      manager.generateImage({
        prompt: 'A cat',
        size: '1024x1024',
        quality: 'standard',
        style: 'vivid',
      })
    ).rejects.toThrow('DALL-E API error (400)');
  });

  it('throws when OPENAI_API_KEY is missing for image gen', async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(
      manager.generateImage({
        prompt: 'A cat',
        size: '1024x1024',
        quality: 'standard',
        style: 'vivid',
      })
    ).rejects.toThrow('OPENAI_API_KEY');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage gap: getStorage, getConfig, no extensionManager
// ─────────────────────────────────────────────────────────────────────────────

describe('MultimodalManager — getStorage and getConfig', () => {
  it('getStorage returns the underlying storage instance', () => {
    const storage = createMockStorage();
    const deps = createMockDeps();
    const manager = new MultimodalManager(storage, deps, defaultConfig);
    expect(manager.getStorage()).toBe(storage);
  });

  it('getConfig returns the provided config', () => {
    const storage = createMockStorage();
    const deps = createMockDeps();
    const manager = new MultimodalManager(storage, deps, defaultConfig);
    const config = manager.getConfig();
    expect(config.enabled).toBe(true);
    expect(config.vision.enabled).toBe(true);
  });
});

describe('MultimodalManager — no extensionManager', () => {
  it('works without extensionManager (null)', async () => {
    const storage = createMockStorage();
    const deps = createMockDeps();
    deps.extensionManager = null;
    const manager = new MultimodalManager(storage, deps, defaultConfig);
    await manager.initialize();

    // analyzeImage should work without emitting hooks
    const result = await manager.analyzeImage({
      imageBase64: 'dGVzdA==',
      mimeType: 'image/jpeg',
    });
    expect(result.description).toBeDefined();
  });

  it('works without extensionManager (undefined)', async () => {
    const storage = createMockStorage();
    const deps = createMockDeps();
    delete (deps as any).extensionManager;
    const manager = new MultimodalManager(storage, deps, defaultConfig);
    await manager.initialize();

    const result = await manager.triggerHaptic({ pattern: 100 });
    expect(result.triggered).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage gap: sanitizeErrorMessage with Token pattern and sk_ pattern
// ─────────────────────────────────────────────────────────────────────────────

describe('MultimodalManager — error sanitization patterns', () => {
  let storage: MultimodalStorage;
  let deps: ReturnType<typeof createMockDeps>;
  let manager: MultimodalManager;

  beforeEach(async () => {
    vi.resetAllMocks();
    storage = createMockStorage();
    deps = createMockDeps();
    manager = new MultimodalManager(storage, deps, defaultConfig);
    await manager.initialize();
  });

  it('strips sk_ prefixed tokens from error messages', async () => {
    (deps.aiClient.chat as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Failed with key sk_abc123def456ghi789jkl012mno345')
    );

    await expect(
      manager.analyzeImage({ imageBase64: 'dGVzdA==', mimeType: 'image/jpeg' })
    ).rejects.toThrow('[REDACTED]');
  });

  it('strips Token prefixed values from error messages', async () => {
    (deps.aiClient.chat as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Failed with Token abcdefghijklmnopqrstuvwxyz12')
    );

    await expect(
      manager.analyzeImage({ imageBase64: 'dGVzdA==', mimeType: 'image/jpeg' })
    ).rejects.toThrow('Token [REDACTED]');
  });

  it('handles non-Error thrown objects', async () => {
    (deps.aiClient.chat as ReturnType<typeof vi.fn>).mockRejectedValue(42);

    await expect(
      manager.analyzeImage({ imageBase64: 'dGVzdA==', mimeType: 'image/jpeg' })
    ).rejects.toThrow('42');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage gap: TTS provider-specific voice selection (non-alloy voice)
// ─────────────────────────────────────────────────────────────────────────────

describe('MultimodalManager — TTS custom voice selection', () => {
  let storage: MultimodalStorage;
  let deps: ReturnType<typeof createMockDeps>;
  let manager: MultimodalManager;

  beforeEach(async () => {
    vi.resetAllMocks();
    storage = createMockStorage();
    deps = createMockDeps();
    manager = new MultimodalManager(storage, deps, defaultConfig);
    await manager.initialize();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TTS_PROVIDER;
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.DEEPGRAM_API_KEY;
    delete process.env.CARTESIA_API_KEY;
  });

  it('uses custom voice for ElevenLabs when voice is not alloy', async () => {
    process.env.TTS_PROVIDER = 'elevenlabs';
    process.env.ELEVENLABS_API_KEY = 'sk_test';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => Buffer.from('audio').buffer,
      })
    );

    await manager.synthesizeSpeech({
      text: 'Hello',
      voice: 'custom-voice-id',
      model: 'tts-1',
      responseFormat: 'mp3',
    });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toContain('custom-voice-id');
  });

  it('uses custom voice for Deepgram when voice is not alloy', async () => {
    process.env.TTS_PROVIDER = 'deepgram';
    process.env.DEEPGRAM_API_KEY = 'dg_test';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => Buffer.from('audio').buffer,
      })
    );

    await manager.synthesizeSpeech({
      text: 'Hello',
      voice: 'aura-custom',
      model: 'tts-1',
      responseFormat: 'mp3',
    });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toContain('aura-custom');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage gap: OpenAI STT with language param, Whisper API error
// ─────────────────────────────────────────────────────────────────────────────

describe('MultimodalManager — OpenAI STT branches', () => {
  let storage: MultimodalStorage;
  let deps: ReturnType<typeof createMockDeps>;
  let manager: MultimodalManager;

  beforeEach(async () => {
    vi.resetAllMocks();
    storage = createMockStorage();
    deps = createMockDeps();
    manager = new MultimodalManager(storage, deps, defaultConfig);
    await manager.initialize();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
  });

  it('sends language param to OpenAI Whisper when provided', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-key-for-unit-test';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'hola', language: 'es' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await manager.transcribeAudio({
      audioBase64: 'dGVzdA==',
      format: 'wav',
      language: 'es',
    });

    expect(result.text).toBe('hola');
    const formData = mockFetch.mock.calls[0][1].body as FormData;
    expect(formData.get('language')).toBe('es');
  });

  it('throws when OpenAI Whisper API returns non-ok status', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-key-for-unit-test';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Server Error',
      })
    );

    await expect(
      manager.transcribeAudio({ audioBase64: 'dGVzdA==', format: 'wav' })
    ).rejects.toThrow('Whisper API error (500)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage gap: OpenAI TTS synthesizeSpeech (non-voicebox default path)
// ─────────────────────────────────────────────────────────────────────────────

describe('MultimodalManager — OpenAI TTS default path', () => {
  let storage: MultimodalStorage;
  let deps: ReturnType<typeof createMockDeps>;
  let manager: MultimodalManager;

  beforeEach(async () => {
    vi.resetAllMocks();
    storage = createMockStorage();
    deps = createMockDeps();
    manager = new MultimodalManager(storage, deps, defaultConfig);
    await manager.initialize();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TTS_PROVIDER;
    delete process.env.OPENAI_API_KEY;
  });

  it('routes to OpenAI TTS as default provider', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-key-for-unit-test';

    const audioBytes = Buffer.from('fake-tts-audio');
    const ab = audioBytes.buffer.slice(
      audioBytes.byteOffset,
      audioBytes.byteOffset + audioBytes.byteLength
    );

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => ab,
      })
    );

    const result = await manager.synthesizeSpeech({
      text: 'Hello OpenAI',
      voice: 'alloy',
      model: 'tts-1',
      responseFormat: 'mp3',
    });

    expect(result.audioBase64).toBeDefined();
    expect(result.format).toBe('mp3');
    expect(storage.completeJob).toHaveBeenCalled();
  });

  it('throws when OPENAI_API_KEY is missing for default TTS', async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(
      manager.synthesizeSpeech({
        text: 'Hello',
        voice: 'alloy',
        model: 'tts-1',
        responseFormat: 'mp3',
      })
    ).rejects.toThrow('OPENAI_API_KEY');
  });

  it('throws when OpenAI TTS returns non-ok status', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-key-for-unit-test';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Bad Request',
      })
    );

    await expect(
      manager.synthesizeSpeech({
        text: 'Hello',
        voice: 'alloy',
        model: 'tts-1',
        responseFormat: 'mp3',
      })
    ).rejects.toThrow('TTS API error (400)');
  });
});
