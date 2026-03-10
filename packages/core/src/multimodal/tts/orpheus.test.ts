import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Orpheus TTS Provider', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('synthesizeOrpheus', () => {
    it('should call POST /v1/audio/speech on the Orpheus server', async () => {
      const audioData = Buffer.from('fake-orpheus-audio');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(audioData.buffer),
      });
      const { synthesizeOrpheus } = await import('./orpheus.js');

      const result = await synthesizeOrpheus('Hello world');

      expect(result.format).toBe('mp3');
      expect(result.audioBase64).toBeTruthy();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:17500/v1/audio/speech');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body);
      expect(body.text).toBe('Hello world');
      expect(body.voice).toBe('default');
      expect(body.model).toBe('orpheus');
      expect(body.response_format).toBe('mp3');
    });

    it('should use custom voice and model', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });
      const { synthesizeOrpheus } = await import('./orpheus.js');

      await synthesizeOrpheus('Test', 'emma', 'orpheus-v2');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.voice).toBe('emma');
      expect(body.model).toBe('orpheus-v2');
    });

    it('should use ORPHEUS_URL env var', async () => {
      process.env.ORPHEUS_URL = 'http://my-orpheus:9000';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });
      const { synthesizeOrpheus } = await import('./orpheus.js');

      await synthesizeOrpheus('Hello');

      expect(mockFetch.mock.calls[0][0]).toBe('http://my-orpheus:9000/v1/audio/speech');
    });

    it('should strip trailing slash from ORPHEUS_URL', async () => {
      process.env.ORPHEUS_URL = 'http://my-orpheus:9000/';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });
      const { synthesizeOrpheus } = await import('./orpheus.js');

      await synthesizeOrpheus('Hello');

      expect(mockFetch.mock.calls[0][0]).toBe('http://my-orpheus:9000/v1/audio/speech');
    });

    it('should throw on server error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal server error'),
      });
      const { synthesizeOrpheus } = await import('./orpheus.js');

      await expect(synthesizeOrpheus('Hello')).rejects.toThrow('Orpheus TTS error (500)');
    });

    it('should handle emotion markers in text', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });
      const { synthesizeOrpheus } = await import('./orpheus.js');

      const textWithEmotions = 'Hello <laugh> how are you <sigh>';
      await synthesizeOrpheus(textWithEmotions);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.text).toBe(textWithEmotions);
    });
  });

  describe('isOrpheusAvailable', () => {
    it('should return true when health check succeeds', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const { isOrpheusAvailable } = await import('./orpheus.js');

      const available = await isOrpheusAvailable();

      expect(available).toBe(true);
      expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:17500/health');
    });

    it('should return false when health check fails', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
      const { isOrpheusAvailable } = await import('./orpheus.js');

      const available = await isOrpheusAvailable();

      expect(available).toBe(false);
    });

    it('should return false when server is unreachable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const { isOrpheusAvailable } = await import('./orpheus.js');

      const available = await isOrpheusAvailable();

      expect(available).toBe(false);
    });
  });

  describe('ORPHEUS_EMOTION_MARKERS', () => {
    it('should export supported emotion markers', async () => {
      const { ORPHEUS_EMOTION_MARKERS } = await import('./orpheus.js');

      expect(ORPHEUS_EMOTION_MARKERS).toContain('<laugh>');
      expect(ORPHEUS_EMOTION_MARKERS).toContain('<sigh>');
      expect(ORPHEUS_EMOTION_MARKERS).toContain('<excited>');
      expect(ORPHEUS_EMOTION_MARKERS).toContain('<whisper>');
    });
  });
});
