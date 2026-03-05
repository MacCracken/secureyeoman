import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('AWS Polly TTS Provider', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.POLLY_REGION = 'us-east-1';
    process.env.AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
    process.env.AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('synthesizeViaPolly', () => {
    it('should throw when POLLY_REGION is not set', async () => {
      delete process.env.POLLY_REGION;
      const { synthesizeViaPolly } = await import('./polly.js');

      await expect(synthesizeViaPolly({ text: 'Hello world' })).rejects.toThrow('POLLY_REGION');
    });

    it('should throw when AWS credentials are not set', async () => {
      delete process.env.AWS_ACCESS_KEY_ID;
      const { synthesizeViaPolly } = await import('./polly.js');

      await expect(synthesizeViaPolly({ text: 'Hello world' })).rejects.toThrow(
        'AWS_ACCESS_KEY_ID'
      );
    });

    it('should call Polly SynthesizeSpeech endpoint', async () => {
      const audioData = Buffer.from('fake-audio');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(audioData.buffer),
      });
      const { synthesizeViaPolly } = await import('./polly.js');

      const result = await synthesizeViaPolly({ text: 'Hello' });

      expect(result.format).toBe('mp3');
      expect(result.audioBase64).toBeTruthy();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('polly.us-east-1.amazonaws.com/v1/speech');
      expect(opts.headers.Authorization).toContain('AWS4-HMAC-SHA256');
    });

    it('should use default Joanna voice', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });
      const { synthesizeViaPolly } = await import('./polly.js');

      await synthesizeViaPolly({ text: 'Hello' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.VoiceId).toBe('Joanna');
      expect(body.Engine).toBe('neural');
    });

    it('should resolve known voice names', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });
      const { synthesizeViaPolly } = await import('./polly.js');

      await synthesizeViaPolly({ text: 'Hello', voice: 'matthew' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.VoiceId).toBe('Matthew');
      expect(body.LanguageCode).toBe('en-US');
    });

    it('should use custom voice ID directly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });
      const { synthesizeViaPolly } = await import('./polly.js');

      await synthesizeViaPolly({ text: 'Hello', voice: 'CustomVoice123' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.VoiceId).toBe('CustomVoice123');
    });

    it('should map OpenAI alloy voice to Polly default', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });
      const { synthesizeViaPolly } = await import('./polly.js');

      await synthesizeViaPolly({ text: 'Hello', voice: 'alloy' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.VoiceId).toBe('Joanna');
    });

    it('should use POLLY_VOICE_ID env for default', async () => {
      process.env.POLLY_VOICE_ID = 'Amy';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });
      const { synthesizeViaPolly } = await import('./polly.js');

      await synthesizeViaPolly({ text: 'Hello' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.VoiceId).toBe('Amy');
    });

    it('should use custom engine when specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });
      const { synthesizeViaPolly } = await import('./polly.js');

      await synthesizeViaPolly({ text: 'Hello', engine: 'standard' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.Engine).toBe('standard');
    });

    it('should apply lexicon names from env', async () => {
      process.env.POLLY_LEXICON_NAMES = 'lex1,lex2';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });
      const { synthesizeViaPolly } = await import('./polly.js');

      await synthesizeViaPolly({ text: 'Hello' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.LexiconNames).toEqual(['lex1', 'lex2']);
    });

    it('should apply lexicon names from request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });
      const { synthesizeViaPolly } = await import('./polly.js');

      await synthesizeViaPolly({ text: 'Hello', lexiconNames: ['custom-lex'] });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.LexiconNames).toEqual(['custom-lex']);
    });

    it('should detect SSML input', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });
      const { synthesizeViaPolly } = await import('./polly.js');

      await synthesizeViaPolly({
        text: '<speak>Hello <prosody rate="slow">world</prosody></speak>',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.TextType).toBe('ssml');
    });

    it('should handle API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Invalid voice'),
      });
      const { synthesizeViaPolly } = await import('./polly.js');

      await expect(synthesizeViaPolly({ text: 'Hello' })).rejects.toThrow('AWS Polly error (400)');
    });

    it('should include session token when set', async () => {
      process.env.AWS_SESSION_TOKEN = 'test-session-token';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });
      const { synthesizeViaPolly } = await import('./polly.js');

      await synthesizeViaPolly({ text: 'Hello' });

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['x-amz-security-token']).toBe('test-session-token');
    });
  });

  describe('resolvePollyVoice', () => {
    it('should resolve known voice names case-insensitively', async () => {
      const { resolvePollyVoice } = await import('./polly.js');

      expect(resolvePollyVoice('joanna')).toEqual({
        voiceId: 'Joanna',
        languageCode: 'en-US',
      });
      expect(resolvePollyVoice('MATTHEW')).toEqual({
        voiceId: 'Matthew',
        languageCode: 'en-US',
      });
      expect(resolvePollyVoice('Lea')).toEqual({
        voiceId: 'Lea',
        languageCode: 'fr-FR',
      });
    });

    it('should pass through unknown voice IDs', async () => {
      const { resolvePollyVoice } = await import('./polly.js');
      expect(resolvePollyVoice('CustomVoice')).toEqual({ voiceId: 'CustomVoice' });
    });

    it('should default to Joanna for undefined/alloy', async () => {
      const { resolvePollyVoice } = await import('./polly.js');
      expect(resolvePollyVoice(undefined)).toEqual({ voiceId: 'Joanna' });
      expect(resolvePollyVoice('alloy')).toEqual({ voiceId: 'Joanna' });
    });
  });

  describe('POLLY_VOICES registry', () => {
    it('should have voices for multiple languages', async () => {
      const { POLLY_VOICES } = await import('./polly.js');

      const languages = new Set(Object.values(POLLY_VOICES).map((v) => v.languageCode));
      expect(languages.size).toBeGreaterThanOrEqual(10);
      expect(languages.has('en-US')).toBe(true);
      expect(languages.has('fr-FR')).toBe(true);
      expect(languages.has('ja-JP')).toBe(true);
      expect(languages.has('es-US')).toBe(true);
    });

    it('should have voice IDs for all entries', async () => {
      const { POLLY_VOICES } = await import('./polly.js');
      for (const [name, voice] of Object.entries(POLLY_VOICES)) {
        expect(voice.voiceId, `${name} missing voiceId`).toBeTruthy();
        expect(voice.engines.length, `${name} missing engines`).toBeGreaterThan(0);
      }
    });
  });

  describe('describeVoices', () => {
    it('should list voices from Polly API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            Voices: [
              {
                Id: 'Joanna',
                Name: 'Joanna',
                Gender: 'Female',
                LanguageCode: 'en-US',
                SupportedEngines: ['neural', 'standard'],
              },
            ],
          }),
      });
      const { describeVoices } = await import('./polly.js');

      const voices = await describeVoices();
      expect(voices).toHaveLength(1);
      expect(voices[0].voiceId).toBe('Joanna');
    });
  });

  describe('putLexicon', () => {
    it('should upload a lexicon', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const { putLexicon } = await import('./polly.js');

      await putLexicon('test-lex', '<lexicon>...</lexicon>');

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/v1/lexicons/test-lex');
      expect(opts.method).toBe('PUT');
    });
  });

  describe('listLexicons', () => {
    it('should list lexicons', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            Lexicons: [
              {
                Name: 'lex1',
                Attributes: { LanguageCode: 'en-US', LastModified: '2026-03-05' },
              },
            ],
          }),
      });
      const { listLexicons } = await import('./polly.js');

      const result = await listLexicons();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('lex1');
    });
  });
});
