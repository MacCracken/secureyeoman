/**
 * MultimodalManager — Core orchestrator for multimodal I/O capabilities.
 *
 * Provides vision analysis (via AIClient), speech-to-text, text-to-speech,
 * and image generation (via direct OpenAI API calls).
 */

import type {
  MultimodalConfig,
  VisionRequest,
  VisionResult,
  STTRequest,
  STTResult,
  TTSRequest,
  TTSResult,
  ImageGenRequest,
  ImageGenResult,
  AIRequest,
  AIResponse,
} from '@friday/shared';
import type { MultimodalStorage } from './storage.js';
import type { SecureLogger } from '../logging/logger.js';
import type { HookPoint, HookContext, HookResult } from '../extensions/types.js';

const MAX_BASE64_LENGTH = 20_971_520; // ~20MB encoded
const FETCH_TIMEOUT_MS = 30_000;
const ALLOWED_DALLE_HOSTS = ['oaidalleapiprodscus.blob.core.windows.net'];

function sanitizeErrorMessage(msg: string): string {
  return msg
    .replace(/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED]')
    .replace(/Bearer [a-zA-Z0-9._-]+/g, 'Bearer [REDACTED]');
}

function isAllowedDalleUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return hostname.endsWith('.openai.com') || ALLOWED_DALLE_HOSTS.includes(hostname);
  } catch {
    return false;
  }
}

export interface MultimodalManagerDeps {
  logger: SecureLogger;
  aiClient: {
    chat: (request: AIRequest) => Promise<AIResponse>;
  };
  extensionManager?: {
    emit: (hookPoint: HookPoint, context: HookContext) => Promise<HookResult>;
  } | null;
}

export class MultimodalManager {
  private readonly storage: MultimodalStorage;
  private readonly deps: MultimodalManagerDeps;
  private readonly config: MultimodalConfig;
  private initialized = false;

  constructor(storage: MultimodalStorage, deps: MultimodalManagerDeps, config: MultimodalConfig) {
    this.storage = storage;
    this.deps = deps;
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.storage.ensureTables();
    this.initialized = true;
    this.deps.logger.info('MultimodalManager initialized');
  }

  /**
   * Analyze an image using the AI client's vision capability.
   */
  async analyzeImage(request: VisionRequest): Promise<VisionResult> {
    if (!this.config.vision.enabled) {
      throw new Error('Vision capability is disabled');
    }

    if (request.imageBase64.length > MAX_BASE64_LENGTH) {
      throw new Error('Image data exceeds maximum allowed size');
    }

    const jobId = await this.storage.createJob('vision', {
      mimeType: request.mimeType,
      prompt: request.prompt,
      imageSizeBytes: request.imageBase64.length,
    });

    const start = Date.now();
    try {
      const prompt = request.prompt ?? 'Describe this image in detail.';
      // Send image as part of the message content — AIClient/provider handles multimodal content
      const response = await this.deps.aiClient.chat({
        messages: [
          {
            role: 'user' as const,
            content: `[image:${request.mimeType};base64,${request.imageBase64}]\n${prompt}`,
          },
        ],
        maxTokens: 1024,
        stream: false,
      });

      const durationMs = Date.now() - start;
      const result: VisionResult = {
        description: response.content,
        labels: [],
        durationMs,
      };

      await this.storage.completeJob(
        jobId,
        result as unknown as Record<string, unknown>,
        durationMs
      );
      void this.deps.extensionManager?.emit('multimodal:image-analyzed', {
        event: 'multimodal:image-analyzed',
        data: { jobId, result },
        timestamp: Date.now(),
      });
      return result;
    } catch (error) {
      const msg = sanitizeErrorMessage(error instanceof Error ? error.message : String(error));
      await this.storage.failJob(jobId, msg);
      this.deps.logger.error('Vision analysis failed', { error: msg });
      throw new Error(msg);
    }
  }

  /**
   * Transcribe audio using OpenAI Whisper API.
   */
  async transcribeAudio(request: STTRequest): Promise<STTResult> {
    if (!this.config.stt.enabled) {
      throw new Error('Speech-to-text capability is disabled');
    }

    if (request.audioBase64.length > MAX_BASE64_LENGTH) {
      throw new Error('Audio data exceeds maximum allowed size');
    }

    const jobId = await this.storage.createJob('stt', {
      format: request.format,
      language: request.language,
      audioSizeBytes: request.audioBase64.length,
    });

    const start = Date.now();
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OPENAI_API_KEY environment variable is not set');

      const audioBuffer = Buffer.from(request.audioBase64, 'base64');
      const blob = new Blob([audioBuffer], { type: `audio/${request.format}` });

      const formData = new FormData();
      formData.append('file', blob, `audio.${request.format}`);
      formData.append('model', this.config.stt.model);
      if (request.language) formData.append('language', request.language);

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Whisper API error (${response.status}): ${errBody}`);
      }

      const data = (await response.json()) as { text: string; language?: string };
      const durationMs = Date.now() - start;

      const result: STTResult = {
        text: data.text,
        language: data.language,
        durationMs,
      };

      await this.storage.completeJob(
        jobId,
        result as unknown as Record<string, unknown>,
        durationMs
      );
      void this.deps.extensionManager?.emit('multimodal:audio-transcribed', {
        event: 'multimodal:audio-transcribed',
        data: { jobId, result },
        timestamp: Date.now(),
      });
      return result;
    } catch (error) {
      const msg = sanitizeErrorMessage(error instanceof Error ? error.message : String(error));
      await this.storage.failJob(jobId, msg);
      this.deps.logger.error('Audio transcription failed', { error: msg });
      throw new Error(msg);
    }
  }

  /**
   * Synthesize speech using OpenAI TTS API.
   */
  async synthesizeSpeech(request: TTSRequest): Promise<TTSResult> {
    if (!this.config.tts.enabled) {
      throw new Error('Text-to-speech capability is disabled');
    }

    const jobId = await this.storage.createJob('tts', {
      textLength: request.text.length,
      voice: request.voice,
      model: request.model,
    });

    const start = Date.now();
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OPENAI_API_KEY environment variable is not set');

      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model,
          input: request.text,
          voice: request.voice,
          response_format: request.responseFormat,
        }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`TTS API error (${response.status}): ${errBody}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBase64 = Buffer.from(arrayBuffer).toString('base64');
      const durationMs = Date.now() - start;

      const result: TTSResult = {
        audioBase64,
        format: request.responseFormat,
        durationMs,
      };

      await this.storage.completeJob(
        jobId,
        { format: result.format, durationMs, audioSizeBytes: audioBase64.length },
        durationMs
      );
      void this.deps.extensionManager?.emit('multimodal:speech-generated', {
        event: 'multimodal:speech-generated',
        data: { jobId, format: result.format },
        timestamp: Date.now(),
      });
      return result;
    } catch (error) {
      const msg = sanitizeErrorMessage(error instanceof Error ? error.message : String(error));
      await this.storage.failJob(jobId, msg);
      this.deps.logger.error('Speech synthesis failed', { error: msg });
      throw new Error(msg);
    }
  }

  /**
   * Generate an image using OpenAI DALL-E API.
   */
  async generateImage(request: ImageGenRequest): Promise<ImageGenResult> {
    if (!this.config.imageGen.enabled) {
      throw new Error('Image generation capability is disabled');
    }

    const jobId = await this.storage.createJob('image_gen', {
      promptLength: request.prompt.length,
      size: request.size,
      quality: request.quality,
    });

    const start = Date.now();
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OPENAI_API_KEY environment variable is not set');

      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.imageGen.model,
          prompt: request.prompt,
          n: 1,
          size: request.size,
          quality: request.quality,
          style: request.style,
        }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`DALL-E API error (${response.status}): ${errBody}`);
      }

      const data = (await response.json()) as {
        data: { url: string; revised_prompt?: string }[];
      };

      const firstImage = data.data[0];
      if (!firstImage) {
        throw new Error('DALL-E API returned no images');
      }

      if (!isAllowedDalleUrl(firstImage.url)) {
        throw new Error('DALL-E API returned URL from unexpected origin');
      }

      const durationMs = Date.now() - start;
      const result: ImageGenResult = {
        imageUrl: firstImage.url,
        revisedPrompt: firstImage.revised_prompt,
        durationMs,
      };

      await this.storage.completeJob(
        jobId,
        result as unknown as Record<string, unknown>,
        durationMs
      );
      void this.deps.extensionManager?.emit('multimodal:image-generated', {
        event: 'multimodal:image-generated',
        data: { jobId, result },
        timestamp: Date.now(),
      });
      return result;
    } catch (error) {
      const msg = sanitizeErrorMessage(error instanceof Error ? error.message : String(error));
      await this.storage.failJob(jobId, msg);
      this.deps.logger.error('Image generation failed', { error: msg });
      throw new Error(msg);
    }
  }

  /** Get the underlying storage for direct queries. */
  getStorage(): MultimodalStorage {
    return this.storage;
  }

  /** Get current config. */
  getConfig(): MultimodalConfig {
    return this.config;
  }

  close(): void {
    this.storage.close();
    this.initialized = false;
  }
}
