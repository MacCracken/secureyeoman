/**
 * Multimodal I/O Types (Phase 7.3)
 *
 * Zod schemas and TypeScript types for vision analysis, speech-to-text,
 * text-to-speech, image generation, and multimodal job tracking.
 */

import { z } from 'zod';

// ─── Vision Schemas ─────────────────────────────────────────────────

export const VisionRequestSchema = z.object({
  imageBase64: z.string().min(1).max(28_000_000),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
  prompt: z.string().max(4096).optional(),
});

export const VisionResultSchema = z.object({
  description: z.string(),
  labels: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).optional(),
  durationMs: z.number().int().nonnegative(),
});

// ─── STT (Speech-to-Text) Schemas ───────────────────────────────────

export const STTRequestSchema = z.object({
  audioBase64: z.string().min(1).max(28_000_000),
  format: z.enum(['ogg', 'mp3', 'wav', 'webm', 'm4a', 'flac']).default('ogg'),
  language: z.string().max(10).optional(),
});

export const STTResultSchema = z.object({
  text: z.string(),
  language: z.string().optional(),
  durationMs: z.number().int().nonnegative(),
});

// ─── TTS (Text-to-Speech) Schemas ───────────────────────────────────

export const TTSRequestSchema = z.object({
  text: z.string().min(1).max(4096),
  voice: z.string().default('alloy'),
  model: z.string().default('tts-1'),
  responseFormat: z.enum(['mp3', 'opus', 'aac', 'flac']).default('mp3'),
});

export const TTSResultSchema = z.object({
  audioBase64: z.string(),
  format: z.string(),
  durationMs: z.number().int().nonnegative(),
});

// ─── Image Generation Schemas ───────────────────────────────────────

export const ImageGenRequestSchema = z.object({
  prompt: z.string().min(1).max(4000),
  size: z.enum(['1024x1024', '1024x1792', '1792x1024']).default('1024x1024'),
  quality: z.enum(['standard', 'hd']).default('standard'),
  style: z.enum(['vivid', 'natural']).default('vivid'),
});

export const ImageGenResultSchema = z.object({
  imageUrl: z.string().url(),
  revisedPrompt: z.string().optional(),
  durationMs: z.number().int().nonnegative(),
});

// ─── Haptic Schemas ─────────────────────────────────────────────────

export const HapticRequestSchema = z.object({
  pattern: z
    .union([
      z.number().int().positive().max(10_000),
      z.array(z.number().int().nonnegative().max(10_000)).min(1).max(20),
    ])
    .default(200),
  description: z.string().max(256).optional(),
});

export const HapticResultSchema = z.object({
  triggered: z.boolean(),
  patternMs: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
});

// ─── Job Tracking Schema ────────────────────────────────────────────

export const MultimodalJobTypeSchema = z.enum(['vision', 'stt', 'tts', 'image_gen', 'haptic']);

export const MultimodalJobStatusSchema = z.enum(['pending', 'running', 'completed', 'failed']);

export const MultimodalJobSchema = z.object({
  id: z.string(),
  type: MultimodalJobTypeSchema,
  status: MultimodalJobStatusSchema,
  input: z.record(z.unknown()),
  output: z.record(z.unknown()).nullable(),
  error: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  sourcePlatform: z.string().nullable().optional(),
  sourceMessageId: z.string().nullable().optional(),
  createdAt: z.string().or(z.date()),
  completedAt: z.string().or(z.date()).nullable().optional(),
});

// ─── Config Schema ──────────────────────────────────────────────────

export const MultimodalConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    vision: z
      .object({
        enabled: z.boolean().default(true),
        maxImageSizeMb: z.number().positive().max(20).default(10),
        maxImagesPerMessage: z.number().int().positive().max(10).default(4),
      })
      .default({}),
    stt: z
      .object({
        enabled: z.boolean().default(true),
        provider: z.enum(['openai']).default('openai'),
        maxDurationSeconds: z.number().int().positive().max(600).default(120),
        model: z.string().default('whisper-1'),
      })
      .default({}),
    tts: z
      .object({
        enabled: z.boolean().default(true),
        provider: z.enum(['openai']).default('openai'),
        voice: z.string().default('alloy'),
        model: z.string().default('tts-1'),
      })
      .default({}),
    imageGen: z
      .object({
        enabled: z.boolean().default(true),
        provider: z.enum(['openai']).default('openai'),
        model: z.string().default('dall-e-3'),
        maxPerDay: z.number().int().positive().max(1000).default(50),
      })
      .default({}),
    haptic: z
      .object({
        enabled: z.boolean().default(true),
        maxPatternDurationMs: z.number().int().positive().max(10_000).default(5_000),
      })
      .default({}),
  })
  .default({});

// ─── Inferred Types ─────────────────────────────────────────────────

export type VisionRequest = z.infer<typeof VisionRequestSchema>;
export type VisionResult = z.infer<typeof VisionResultSchema>;
export type STTRequest = z.infer<typeof STTRequestSchema>;
export type STTResult = z.infer<typeof STTResultSchema>;
export type TTSRequest = z.infer<typeof TTSRequestSchema>;
export type TTSResult = z.infer<typeof TTSResultSchema>;
export type ImageGenRequest = z.infer<typeof ImageGenRequestSchema>;
export type ImageGenResult = z.infer<typeof ImageGenResultSchema>;
export type HapticRequest = z.infer<typeof HapticRequestSchema>;
export type HapticResult = z.infer<typeof HapticResultSchema>;
export type MultimodalJobType = z.infer<typeof MultimodalJobTypeSchema>;
export type MultimodalJobStatus = z.infer<typeof MultimodalJobStatusSchema>;
export type MultimodalJob = z.infer<typeof MultimodalJobSchema>;
export type MultimodalConfig = z.infer<typeof MultimodalConfigSchema>;
