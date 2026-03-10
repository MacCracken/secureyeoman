import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('faster-whisper STT Provider', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('transcribeFasterWhisper', () => {
    it('should call POST /v1/audio/transcriptions on the faster-whisper server', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ text: 'Hello world', language: 'en', duration: 2.5 }),
      });
      const { transcribeFasterWhisper } = await import('./faster-whisper.js');

      const result = await transcribeFasterWhisper(Buffer.from('fake-audio'));

      expect(result.text).toBe('Hello world');
      expect(result.language).toBe('en');
      expect(result.duration).toBe(2.5);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:17501/v1/audio/transcriptions');
      expect(opts.method).toBe('POST');
    });

    it('should send multipart form data with file and model', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ text: 'test' }),
      });
      const { transcribeFasterWhisper } = await import('./faster-whisper.js');

      await transcribeFasterWhisper(Buffer.from('audio-data'), 'mp3', undefined, 'large-v3');

      const opts = mockFetch.mock.calls[0][1];
      expect(opts.body).toBeInstanceOf(FormData);
      const formData = opts.body as FormData;
      expect(formData.get('model')).toBe('large-v3');
    });

    it('should use default model "base" when not specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ text: 'test' }),
      });
      const { transcribeFasterWhisper } = await import('./faster-whisper.js');

      await transcribeFasterWhisper(Buffer.from('audio-data'));

      const formData = mockFetch.mock.calls[0][1].body as FormData;
      expect(formData.get('model')).toBe('base');
    });

    it('should include language hint when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ text: 'Bonjour' }),
      });
      const { transcribeFasterWhisper } = await import('./faster-whisper.js');

      await transcribeFasterWhisper(Buffer.from('audio-data'), 'wav', 'fr');

      const formData = mockFetch.mock.calls[0][1].body as FormData;
      expect(formData.get('language')).toBe('fr');
    });

    it('should not include language when not provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ text: 'Hello' }),
      });
      const { transcribeFasterWhisper } = await import('./faster-whisper.js');

      await transcribeFasterWhisper(Buffer.from('audio-data'));

      const formData = mockFetch.mock.calls[0][1].body as FormData;
      expect(formData.get('language')).toBeNull();
    });

    it('should use FASTER_WHISPER_URL env var', async () => {
      process.env.FASTER_WHISPER_URL = 'http://my-whisper:9000';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ text: 'test' }),
      });
      const { transcribeFasterWhisper } = await import('./faster-whisper.js');

      await transcribeFasterWhisper(Buffer.from('audio-data'));

      expect(mockFetch.mock.calls[0][0]).toBe(
        'http://my-whisper:9000/v1/audio/transcriptions'
      );
    });

    it('should strip trailing slash from FASTER_WHISPER_URL', async () => {
      process.env.FASTER_WHISPER_URL = 'http://my-whisper:9000/';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ text: 'test' }),
      });
      const { transcribeFasterWhisper } = await import('./faster-whisper.js');

      await transcribeFasterWhisper(Buffer.from('audio-data'));

      expect(mockFetch.mock.calls[0][0]).toBe(
        'http://my-whisper:9000/v1/audio/transcriptions'
      );
    });

    it('should throw on server error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Model not loaded'),
      });
      const { transcribeFasterWhisper } = await import('./faster-whisper.js');

      await expect(
        transcribeFasterWhisper(Buffer.from('audio-data'))
      ).rejects.toThrow('faster-whisper STT error (500)');
    });

    it('should throw on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const { transcribeFasterWhisper } = await import('./faster-whisper.js');

      await expect(
        transcribeFasterWhisper(Buffer.from('audio-data'))
      ).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('isFasterWhisperAvailable', () => {
    it('should return true when health check succeeds', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const { isFasterWhisperAvailable } = await import('./faster-whisper.js');

      const available = await isFasterWhisperAvailable();

      expect(available).toBe(true);
      expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:17501/health');
    });

    it('should return false when health check fails', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
      const { isFasterWhisperAvailable } = await import('./faster-whisper.js');

      const available = await isFasterWhisperAvailable();

      expect(available).toBe(false);
    });

    it('should return false when server is unreachable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const { isFasterWhisperAvailable } = await import('./faster-whisper.js');

      const available = await isFasterWhisperAvailable();

      expect(available).toBe(false);
    });
  });

  describe('FASTER_WHISPER_MODELS', () => {
    it('should export available model sizes', async () => {
      const { FASTER_WHISPER_MODELS } = await import('./faster-whisper.js');

      expect(FASTER_WHISPER_MODELS).toContain('tiny');
      expect(FASTER_WHISPER_MODELS).toContain('base');
      expect(FASTER_WHISPER_MODELS).toContain('small');
      expect(FASTER_WHISPER_MODELS).toContain('medium');
      expect(FASTER_WHISPER_MODELS).toContain('large-v3');
    });
  });
});
