import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('AWS Transcribe STT Provider', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.TRANSCRIBE_REGION = 'us-east-1';
    process.env.AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
    process.env.AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('transcribeViaAWSTranscribe', () => {
    it('should throw when TRANSCRIBE_REGION is not set', async () => {
      delete process.env.TRANSCRIBE_REGION;
      const { transcribeViaAWSTranscribe } = await import('./transcribe.js');

      await expect(
        transcribeViaAWSTranscribe({
          audioBase64: Buffer.from('test').toString('base64'),
          format: 'wav',
        })
      ).rejects.toThrow('TRANSCRIBE_REGION');
    });

    it('should throw when AWS credentials are not set', async () => {
      delete process.env.AWS_ACCESS_KEY_ID;
      const { transcribeViaAWSTranscribe } = await import('./transcribe.js');

      await expect(
        transcribeViaAWSTranscribe({
          audioBase64: Buffer.from('test').toString('base64'),
          format: 'wav',
        })
      ).rejects.toThrow('AWS_ACCESS_KEY_ID');
    });

    it('should throw on API start error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad request'),
      });
      const { transcribeViaAWSTranscribe } = await import('./transcribe.js');

      await expect(
        transcribeViaAWSTranscribe({
          audioBase64: Buffer.from('test').toString('base64'),
          format: 'wav',
        })
      ).rejects.toThrow('AWS Transcribe start error');
    });

    it('should include Authorization header with AWS signature', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('server error'),
      });
      const { transcribeViaAWSTranscribe } = await import('./transcribe.js');

      await transcribeViaAWSTranscribe({
        audioBase64: Buffer.from('test').toString('base64'),
      }).catch(() => {});

      expect(mockFetch).toHaveBeenCalled();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('transcribe.us-east-1.amazonaws.com');
      expect(opts.headers.Authorization).toContain('AWS4-HMAC-SHA256');
      expect(opts.headers['x-amz-date']).toBeDefined();
    });

    it('should send X-Amz-Target header for StartTranscriptionJob', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('error'),
      });
      const { transcribeViaAWSTranscribe } = await import('./transcribe.js');

      await transcribeViaAWSTranscribe({
        audioBase64: Buffer.from('test').toString('base64'),
      }).catch(() => {});

      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers['X-Amz-Target']).toBe('Transcribe.StartTranscriptionJob');
    });

    it('should include custom vocabulary when set via env', async () => {
      process.env.TRANSCRIBE_CUSTOM_VOCABULARY = 'my-vocab';
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('error'),
      });
      const { transcribeViaAWSTranscribe } = await import('./transcribe.js');

      await transcribeViaAWSTranscribe({
        audioBase64: Buffer.from('test').toString('base64'),
      }).catch(() => {});

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.Settings.VocabularyName).toBe('my-vocab');
    });

    it('should enable diarization when configured', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('error'),
      });
      const { transcribeViaAWSTranscribe } = await import('./transcribe.js');

      await transcribeViaAWSTranscribe({
        audioBase64: Buffer.from('test').toString('base64'),
        enableDiarization: true,
        maxSpeakers: 3,
      }).catch(() => {});

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.Settings.ShowSpeakerLabels).toBe(true);
      expect(body.Settings.MaxSpeakerLabels).toBe(3);
    });

    it('should use IdentifyLanguage when no language specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('error'),
      });
      const { transcribeViaAWSTranscribe } = await import('./transcribe.js');

      await transcribeViaAWSTranscribe({
        audioBase64: Buffer.from('test').toString('base64'),
      }).catch(() => {});

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.IdentifyLanguage).toBe(true);
      expect(body.LanguageCode).toBeUndefined();
    });

    it('should set LanguageCode when language specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('error'),
      });
      const { transcribeViaAWSTranscribe } = await import('./transcribe.js');

      await transcribeViaAWSTranscribe({
        audioBase64: Buffer.from('test').toString('base64'),
        language: 'en',
      }).catch(() => {});

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.LanguageCode).toBe('en-US');
      expect(body.IdentifyLanguage).toBeUndefined();
    });
  });

  describe('createCustomVocabulary', () => {
    it('should create a vocabulary', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            VocabularyName: 'test-vocab',
            VocabularyState: 'PENDING',
          }),
      });
      const { createCustomVocabulary } = await import('./transcribe.js');

      const result = await createCustomVocabulary({
        vocabularyName: 'test-vocab',
        languageCode: 'en-US',
        entries: [{ phrase: 'SecureYeoman' }],
      });

      expect(result.vocabularyName).toBe('test-vocab');
      expect(result.status).toBe('PENDING');
      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers['X-Amz-Target']).toBe('Transcribe.CreateVocabulary');
    });

    it('should fall back to update on conflict', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 409,
          text: () => Promise.resolve('ConflictException: already exists'),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              VocabularyName: 'test-vocab',
              VocabularyState: 'PENDING',
            }),
        });
      const { createCustomVocabulary } = await import('./transcribe.js');

      const result = await createCustomVocabulary({
        vocabularyName: 'test-vocab',
        languageCode: 'en-US',
        entries: [{ phrase: 'test' }],
      });

      expect(result.vocabularyName).toBe('test-vocab');
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[1][1].headers['X-Amz-Target']).toBe(
        'Transcribe.UpdateVocabulary'
      );
    });
  });

  describe('listCustomVocabularies', () => {
    it('should list vocabularies', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            Vocabularies: [
              {
                VocabularyName: 'v1',
                LanguageCode: 'en-US',
                VocabularyState: 'READY',
                LastModifiedTime: '2026-03-05T00:00:00Z',
              },
            ],
          }),
      });
      const { listCustomVocabularies } = await import('./transcribe.js');

      const result = await listCustomVocabularies();
      expect(result).toHaveLength(1);
      expect(result[0].vocabularyName).toBe('v1');
      expect(result[0].status).toBe('READY');
    });
  });

  describe('deleteCustomVocabulary', () => {
    it('should delete a vocabulary', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const { deleteCustomVocabulary } = await import('./transcribe.js');

      await deleteCustomVocabulary('test-vocab');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers['X-Amz-Target']).toBe('Transcribe.DeleteVocabulary');
    });

    it('should throw on error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not found'),
      });
      const { deleteCustomVocabulary } = await import('./transcribe.js');

      await expect(deleteCustomVocabulary('nonexistent')).rejects.toThrow(
        'AWS Transcribe DeleteVocabulary error'
      );
    });
  });
});
