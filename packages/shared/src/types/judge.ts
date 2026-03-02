/**
 * Judge Types — Schemas for the LLM-as-Judge evaluation system (Phase 97).
 *
 * Provides pointwise evaluation (5 dimensions), pairwise comparison,
 * and auto-eval gating for finetune deployments.
 */

import { z } from 'zod';

// ─── Dimensions ─────────────────────────────────────────────────────

export const JudgeDimensionSchema = z.enum([
  'groundedness',
  'coherence',
  'relevance',
  'fluency',
  'harmlessness',
]);
export type JudgeDimension = z.infer<typeof JudgeDimensionSchema>;

// ─── Dataset ────────────────────────────────────────────────────────

export const EvalDatasetSampleSchema = z.object({
  prompt: z.string().min(1),
  gold: z.string().optional(),
});
export type EvalDatasetSample = z.infer<typeof EvalDatasetSampleSchema>;

export const EvalDatasetSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(256),
  personalityId: z.string().nullable().optional(),
  contentHash: z.string(),
  samples: z.array(EvalDatasetSampleSchema),
  sampleCount: z.number().int(),
  judgePrompt: z.string().nullable().optional(),
  judgeModel: z.string().nullable().optional(),
  createdAt: z.number(),
});
export type EvalDataset = z.infer<typeof EvalDatasetSchema>;

export const EvalDatasetCreateSchema = z.object({
  name: z.string().min(1).max(256),
  samples: z.array(EvalDatasetSampleSchema).min(1),
  personalityId: z.string().optional(),
  judgePrompt: z.string().optional(),
  judgeModel: z.string().optional(),
});
export type EvalDatasetCreate = z.infer<typeof EvalDatasetCreateSchema>;

// ─── Pointwise Scores ───────────────────────────────────────────────

export const EvalScoreSchema = z.object({
  id: z.string(),
  evalRunId: z.string(),
  datasetId: z.string(),
  finetuneJobId: z.string().nullable().optional(),
  modelName: z.string(),
  sampleIndex: z.number().int(),
  prompt: z.string(),
  response: z.string(),
  groundedness: z.number().int().min(1).max(5),
  coherence: z.number().int().min(1).max(5),
  relevance: z.number().int().min(1).max(5),
  fluency: z.number().int().min(1).max(5),
  harmlessness: z.number().int().min(1).max(5),
  rationale: z.record(z.string()).nullable().optional(),
  scoredAt: z.number(),
});
export type EvalScore = z.infer<typeof EvalScoreSchema>;

export const EvalRunSummarySchema = z.object({
  evalRunId: z.string(),
  datasetId: z.string(),
  modelName: z.string(),
  sampleCount: z.number().int(),
  avgGroundedness: z.number(),
  avgCoherence: z.number(),
  avgRelevance: z.number(),
  avgFluency: z.number(),
  avgHarmlessness: z.number(),
  scoredAt: z.number(),
});
export type EvalRunSummary = z.infer<typeof EvalRunSummarySchema>;

// ─── Pairwise Comparison ────────────────────────────────────────────

export const PairwiseWinnerSchema = z.enum(['a', 'b', 'tie']);
export type PairwiseWinner = z.infer<typeof PairwiseWinnerSchema>;

export const PairwiseResultSchema = z.object({
  id: z.string(),
  comparisonId: z.string(),
  datasetId: z.string(),
  modelA: z.string(),
  modelB: z.string(),
  sampleIndex: z.number().int(),
  prompt: z.string(),
  responseA: z.string(),
  responseB: z.string(),
  winner: PairwiseWinnerSchema,
  reason: z.string(),
  scoredAt: z.number(),
});
export type PairwiseResult = z.infer<typeof PairwiseResultSchema>;

export const PairwiseComparisonSummarySchema = z.object({
  comparisonId: z.string(),
  datasetId: z.string(),
  modelA: z.string(),
  modelB: z.string(),
  sampleCount: z.number().int(),
  winsA: z.number().int(),
  winsB: z.number().int(),
  ties: z.number().int(),
  winRateA: z.number(),
  winRateB: z.number(),
  scoredAt: z.number(),
});
export type PairwiseComparisonSummary = z.infer<typeof PairwiseComparisonSummarySchema>;

// ─── Auto-Eval Config ───────────────────────────────────────────────

export const AutoEvalConfigSchema = z.object({
  enabled: z.boolean().default(false),
  datasetId: z.string(),
  judgeModel: z.string().optional(),
  judgePrompt: z.string().optional(),
  thresholds: z
    .object({
      groundedness: z.number().min(1).max(5).default(3.0),
      coherence: z.number().min(1).max(5).default(3.0),
    })
    .default({}),
});
export type AutoEvalConfig = z.infer<typeof AutoEvalConfigSchema>;
