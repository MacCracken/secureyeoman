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

  describe('updateCustomVocabulary', () => {
    it('should update a vocabulary', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            VocabularyName: 'updated-vocab',
            VocabularyState: 'PENDING',
          }),
      });
      const { updateCustomVocabulary } = await import('./transcribe.js');

      const result = await updateCustomVocabulary({
        vocabularyName: 'updated-vocab',
        languageCode: 'en-US',
        entries: [{ phrase: 'test' }],
      });
      expect(result.vocabularyName).toBe('updated-vocab');
      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers['X-Amz-Target']).toBe('Transcribe.UpdateVocabulary');
    });

    it('should throw on error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Server error'),
      });
      const { updateCustomVocabulary } = await import('./transcribe.js');

      await expect(
        updateCustomVocabulary({
          vocabularyName: 'fail-vocab',
          languageCode: 'en-US',
          entries: [{ phrase: 'test' }],
        })
      ).rejects.toThrow('AWS Transcribe UpdateVocabulary error');
    });
  });

  describe('listCustomVocabularies — edge cases', () => {
    it('should handle empty Vocabularies array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ Vocabularies: [] }),
      });
      const { listCustomVocabularies } = await import('./transcribe.js');

      const result = await listCustomVocabularies();
      expect(result).toHaveLength(0);
    });

    it('should handle undefined Vocabularies', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });
      const { listCustomVocabularies } = await import('./transcribe.js');

      const result = await listCustomVocabularies();
      expect(result).toHaveLength(0);
    });

    it('should throw on error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Server error'),
      });
      const { listCustomVocabularies } = await import('./transcribe.js');

      await expect(listCustomVocabularies()).rejects.toThrow(
        'AWS Transcribe ListVocabularies error'
      );
    });
  });

  describe('transcribeViaAWSTranscribe — full flow', () => {
    it('should complete transcription with speaker labels', async () => {
      // Start job
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ TranscriptionJob: { TranscriptionJobStatus: 'IN_PROGRESS' } }),
      });
      // Poll — completed
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            TranscriptionJob: {
              TranscriptionJobStatus: 'COMPLETED',
              Transcript: { TranscriptFileUri: 'https://s3.example.com/transcript.json' },
              LanguageCode: 'en-US',
            },
          }),
      });
      // Fetch transcript
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: {
              transcripts: [{ transcript: 'Hello world' }],
              speaker_labels: {
                segments: [
                  {
                    speaker_label: 'spk_0',
                    start_time: '0.0',
                    end_time: '1.5',
                    items: [
                      { content: 'Hello', start_time: '0.0', end_time: '0.5' },
                      { content: 'world', start_time: '0.6', end_time: '1.5' },
                    ],
                  },
                ],
              },
            },
          }),
      });

      const { transcribeViaAWSTranscribe } = await import('./transcribe.js');

      const result = await transcribeViaAWSTranscribe({
        audioBase64: Buffer.from('test').toString('base64'),
        format: 'mp3',
        language: 'en-US',
        enableDiarization: true,
      });

      expect(result.text).toBe('Hello world');
      expect(result.language).toBe('en-US');
      expect(result.speakers).toHaveLength(1);
      expect(result.speakers![0].speakerLabel).toBe('spk_0');
      expect(result.speakers![0].content).toBe('Hello world');
    });

    it('should throw on poll error', async () => {
      // Start job
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ TranscriptionJob: { TranscriptionJobStatus: 'IN_PROGRESS' } }),
      });
      // Poll fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Poll error'),
      });

      const { transcribeViaAWSTranscribe } = await import('./transcribe.js');

      await expect(
        transcribeViaAWSTranscribe({
          audioBase64: Buffer.from('test').toString('base64'),
        })
      ).rejects.toThrow('AWS Transcribe poll error');
    });

    it('should throw on FAILED job status', async () => {
      // Start job
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ TranscriptionJob: { TranscriptionJobStatus: 'IN_PROGRESS' } }),
      });
      // Poll — FAILED
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            TranscriptionJob: { TranscriptionJobStatus: 'FAILED' },
          }),
      });

      const { transcribeViaAWSTranscribe } = await import('./transcribe.js');

      await expect(
        transcribeViaAWSTranscribe({
          audioBase64: Buffer.from('test').toString('base64'),
        })
      ).rejects.toThrow('AWS Transcribe job failed');
    });

    it('should throw when transcript URI is missing', async () => {
      // Start job
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ TranscriptionJob: { TranscriptionJobStatus: 'IN_PROGRESS' } }),
      });
      // Poll — completed but no URI
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            TranscriptionJob: {
              TranscriptionJobStatus: 'COMPLETED',
              // No Transcript field
            },
          }),
      });

      const { transcribeViaAWSTranscribe } = await import('./transcribe.js');

      await expect(
        transcribeViaAWSTranscribe({
          audioBase64: Buffer.from('test').toString('base64'),
        })
      ).rejects.toThrow('no transcript URI returned');
    });

    it('should throw when transcript fetch fails', async () => {
      // Start job
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ TranscriptionJob: { TranscriptionJobStatus: 'IN_PROGRESS' } }),
      });
      // Poll — completed
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            TranscriptionJob: {
              TranscriptionJobStatus: 'COMPLETED',
              Transcript: { TranscriptFileUri: 'https://s3.example.com/transcript.json' },
            },
          }),
      });
      // Transcript fetch fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const { transcribeViaAWSTranscribe } = await import('./transcribe.js');

      await expect(
        transcribeViaAWSTranscribe({
          audioBase64: Buffer.from('test').toString('base64'),
        })
      ).rejects.toThrow('Failed to fetch transcript');
    });

    it('should use format mapping for m4a', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('error'),
      });
      const { transcribeViaAWSTranscribe } = await import('./transcribe.js');

      await transcribeViaAWSTranscribe({
        audioBase64: Buffer.from('test').toString('base64'),
        format: 'm4a',
      }).catch(() => {});

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.MediaFormat).toBe('mp4');
    });

    it('should use unknown format as-is', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('error'),
      });
      const { transcribeViaAWSTranscribe } = await import('./transcribe.js');

      await transcribeViaAWSTranscribe({
        audioBase64: Buffer.from('test').toString('base64'),
        format: 'aac',
      }).catch(() => {});

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.MediaFormat).toBe('aac');
    });

    it('should pass through full language code', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('error'),
      });
      const { transcribeViaAWSTranscribe } = await import('./transcribe.js');

      await transcribeViaAWSTranscribe({
        audioBase64: Buffer.from('test').toString('base64'),
        language: 'pt-BR',
      }).catch(() => {});

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.LanguageCode).toBe('pt-BR');
    });

    it('should construct language code for unknown short code', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('error'),
      });
      const { transcribeViaAWSTranscribe } = await import('./transcribe.js');

      await transcribeViaAWSTranscribe({
        audioBase64: Buffer.from('test').toString('base64'),
        language: 'xx',
      }).catch(() => {});

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.LanguageCode).toBe('xx-XX');
    });

    it('should include session token when set', async () => {
      process.env.AWS_SESSION_TOKEN = 'my-session-token';
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
      expect(opts.headers['x-amz-security-token']).toBe('my-session-token');
      delete process.env.AWS_SESSION_TOKEN;
    });

    it('should enable diarization via env var', async () => {
      process.env.TRANSCRIBE_ENABLE_DIARIZATION = 'true';
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
      expect(body.Settings.ShowSpeakerLabels).toBe(true);
      expect(body.Settings.MaxSpeakerLabels).toBe(5); // default
      delete process.env.TRANSCRIBE_ENABLE_DIARIZATION;
    });

    it('should use vocabulary name from request over env', async () => {
      process.env.TRANSCRIBE_CUSTOM_VOCABULARY = 'env-vocab';
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('error'),
      });
      const { transcribeViaAWSTranscribe } = await import('./transcribe.js');

      await transcribeViaAWSTranscribe({
        audioBase64: Buffer.from('test').toString('base64'),
        vocabularyName: 'request-vocab',
      }).catch(() => {});

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.Settings.VocabularyName).toBe('request-vocab');
      delete process.env.TRANSCRIBE_CUSTOM_VOCABULARY;
    });

    it('should throw when AWS_SECRET_ACCESS_KEY is missing', async () => {
      delete process.env.AWS_SECRET_ACCESS_KEY;
      const { transcribeViaAWSTranscribe } = await import('./transcribe.js');

      await expect(
        transcribeViaAWSTranscribe({
          audioBase64: Buffer.from('test').toString('base64'),
        })
      ).rejects.toThrow('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
    });
  });

  describe('createCustomVocabulary — additional branches', () => {
    it('should throw on non-conflict error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal server error'),
      });
      const { createCustomVocabulary } = await import('./transcribe.js');

      await expect(
        createCustomVocabulary({
          vocabularyName: 'fail-vocab',
          languageCode: 'en-US',
          entries: [{ phrase: 'test' }],
        })
      ).rejects.toThrow('AWS Transcribe CreateVocabulary error');
    });

    it('should handle entries with soundsLike, ipa, displayAs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            VocabularyName: 'rich-vocab',
            VocabularyState: 'PENDING',
          }),
      });
      const { createCustomVocabulary } = await import('./transcribe.js');

      const result = await createCustomVocabulary({
        vocabularyName: 'rich-vocab',
        languageCode: 'en-US',
        entries: [
          {
            phrase: 'SecureYeoman',
            soundsLike: ['secure', 'yeoman'],
            ipa: 'sɪˈkjʊr ˈjoʊmən',
            displayAs: 'SecureYeoman',
          },
          {
            phrase: 'FRIDAY',
          },
        ],
      });

      expect(result.vocabularyName).toBe('rich-vocab');
    });
  });
});
