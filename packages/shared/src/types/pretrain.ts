/**
 * Pre-Training Types — Corpus-based model pre-training for small models (≤3B params).
 *
 * Defines job configuration, corpus source management, and training
 * hyperparameters for pre-training from scratch.
 */

import { z } from 'zod';

// ── Corpus Source ───────────────────────────────────────────────────

export const CorpusFormatSchema = z.enum(['plaintext', 'jsonl', 'parquet', 'csv', 'markdown']);
export type CorpusFormat = z.infer<typeof CorpusFormatSchema>;

export const CorpusSourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  format: CorpusFormatSchema,
  path: z.string().min(1),
  sizeBytes: z.number().int().min(0).default(0),
  tokenCount: z.number().int().min(0).default(0),
  documentCount: z.number().int().min(0).default(0),
  textField: z.string().default('text'),
  validated: z.boolean().default(false),
  addedAt: z.number().default(0),
});
export type CorpusSource = z.infer<typeof CorpusSourceSchema>;

// ── Pre-Training Job ────────────────────────────────────────────────

export const PretrainStatusSchema = z.enum([
  'pending',
  'validating',
  'tokenizing',
  'training',
  'complete',
  'failed',
  'cancelled',
]);
export type PretrainStatus = z.infer<typeof PretrainStatusSchema>;

export const ModelArchitectureSchema = z.enum(['gpt2', 'llama', 'mistral', 'phi', 'mamba']);
export type ModelArchitecture = z.infer<typeof ModelArchitectureSchema>;

export const LearningRateScheduleSchema = z.enum([
  'cosine',
  'linear',
  'constant',
  'cosine_with_restarts',
]);
export type LearningRateSchedule = z.infer<typeof LearningRateScheduleSchema>;

export const PretrainJobSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  status: PretrainStatusSchema.default('pending'),
  architecture: ModelArchitectureSchema.default('llama'),
  parameterCount: z.string().default('125M'),
  vocabSize: z.number().int().min(1000).max(256000).default(32000),
  contextLength: z.number().int().min(128).max(8192).default(2048),
  hiddenSize: z.number().int().min(64).max(4096).default(768),
  numLayers: z.number().int().min(1).max(48).default(12),
  numHeads: z.number().int().min(1).max(64).default(12),
  intermediateSize: z.number().int().min(64).max(16384).default(3072),
  corpusSourceIds: z.array(z.string()).default([]),
  totalTokens: z.number().int().min(0).default(0),
  tokensProcessed: z.number().int().min(0).default(0),
  batchSize: z.number().int().min(1).max(1024).default(32),
  gradientAccumulationSteps: z.number().int().min(1).max(256).default(4),
  learningRate: z.number().min(1e-7).max(1e-1).default(3e-4),
  lrSchedule: LearningRateScheduleSchema.default('cosine'),
  warmupSteps: z.number().int().min(0).default(1000),
  weightDecay: z.number().min(0).max(1).default(0.01),
  maxSteps: z.number().int().min(1).default(100000),
  currentStep: z.number().int().min(0).default(0),
  checkpointSteps: z.number().int().min(100).default(5000),
  evalSteps: z.number().int().min(100).default(1000),
  trainingLoss: z.number().optional(),
  validationLoss: z.number().optional(),
  validationPerplexity: z.number().optional(),
  image: z.string().default('ghcr.io/secureyeoman/pretrain-runner:latest'),
  containerId: z.string().nullable().default(null),
  outputPath: z.string().nullable().default(null),
  errorMessage: z.string().nullable().default(null),
  numGpus: z.number().int().min(1).max(8).default(1),
  createdAt: z.number().default(0),
  startedAt: z.number().default(0),
  completedAt: z.number().default(0),
  tenantId: z.string().default('default'),
  /** Execute on local Docker (default) or delegate to a remote Synapse instance. */
  backend: z.enum(['local', 'synapse']).default('local'),
  synapseDelegatedJobId: z.string().nullable().default(null),
});
export type PretrainJob = z.infer<typeof PretrainJobSchema>;

export const PretrainJobCreateSchema = PretrainJobSchema.omit({
  id: true,
  status: true,
  tokensProcessed: true,
  currentStep: true,
  trainingLoss: true,
  validationLoss: true,
  validationPerplexity: true,
  containerId: true,
  outputPath: true,
  errorMessage: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
});
export type PretrainJobCreate = z.infer<typeof PretrainJobCreateSchema>;

// ── Config ──────────────────────────────────────────────────────────

export const PretrainingConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    maxConcurrentJobs: z.number().int().min(1).max(5).default(1),
    maxModelParams: z.string().default('3B'),
    defaultImage: z.string().default('ghcr.io/secureyeoman/pretrain-runner:latest'),
    corpusDir: z.string().default('/data/corpus'),
    outputDir: z.string().default('/data/models'),
    maxCorpusSizeGb: z.number().min(0.1).max(500).default(50),
    checkpointRetentionDays: z.number().int().min(1).max(365).default(30),
  })
  .default({});
export type PretrainingConfig = z.infer<typeof PretrainingConfigSchema>;
