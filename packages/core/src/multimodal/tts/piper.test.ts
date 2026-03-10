import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Piper TTS Provider', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('synthesizePiper', () => {
    it('should call POST /api/tts on the Piper server', async () => {
      const audioData = Buffer.from('fake-piper-audio');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(audioData.buffer),
      });
      const { synthesizePiper } = await import('./piper.js');

      const result = await synthesizePiper('Hello world');

      expect(result.format).toBe('wav');
      expect(result.audioBase64).toBeTruthy();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:17502/api/tts');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body);
      expect(body.text).toBe('Hello world');
      expect(body.voice).toBe('en_US-lessac-medium');
      expect(body.output_format).toBe('wav');
    });

    it('should use custom voice and output format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });
      const { synthesizePiper } = await import('./piper.js');

      const result = await synthesizePiper('Test', 'de_DE-thorsten-high', 'mp3');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.voice).toBe('de_DE-thorsten-high');
      expect(body.output_format).toBe('mp3');
      expect(result.format).toBe('mp3');
    });

    it('should use PIPER_URL env var', async () => {
      process.env.PIPER_URL = 'http://my-piper:8080';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });
      const { synthesizePiper } = await import('./piper.js');

      await synthesizePiper('Hello');

      expect(mockFetch.mock.calls[0][0]).toBe('http://my-piper:8080/api/tts');
    });

    it('should strip trailing slash from PIPER_URL', async () => {
      process.env.PIPER_URL = 'http://my-piper:8080/';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });
      const { synthesizePiper } = await import('./piper.js');

      await synthesizePiper('Hello');

      expect(mockFetch.mock.calls[0][0]).toBe('http://my-piper:8080/api/tts');
    });

    it('should throw on server error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Model not loaded'),
      });
      const { synthesizePiper } = await import('./piper.js');

      await expect(synthesizePiper('Hello')).rejects.toThrow('Piper TTS error (500)');
    });

    it('should throw on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const { synthesizePiper } = await import('./piper.js');

      await expect(synthesizePiper('Hello')).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('isPiperAvailable', () => {
    it('should return true when health check succeeds', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const { isPiperAvailable } = await import('./piper.js');

      const available = await isPiperAvailable();

      expect(available).toBe(true);
      expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:17502/health');
    });

    it('should return false when health check fails', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
      const { isPiperAvailable } = await import('./piper.js');

      const available = await isPiperAvailable();

      expect(available).toBe(false);
    });

    it('should return false when server is unreachable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const { isPiperAvailable } = await import('./piper.js');

      const available = await isPiperAvailable();

      expect(available).toBe(false);
    });
  });
});
