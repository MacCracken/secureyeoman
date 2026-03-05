/**
 * Responsible AI Types — Phase 130
 *
 * Cohort-based error analysis, fairness metrics, SHAP explainability,
 * data provenance audit, and model card generation.
 *
 * Inspired by Azure Responsible AI Dashboard and Google Vertex AI Explainability.
 * Required for EU AI Act compliance and enterprise governance.
 */

import { z } from 'zod';

// ── Cohort Error Analysis ───────────────────────────────────────────

export const CohortDimensionSchema = z.enum([
  'topic_category',
  'user_role',
  'time_of_day',
  'personality_id',
  'model_name',
  'language',
  'custom',
]);
export type CohortDimension = z.infer<typeof CohortDimensionSchema>;

export const CohortSliceSchema = z.object({
  dimension: CohortDimensionSchema,
  value: z.string(),
  sampleCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  errorRate: z.number().min(0).max(1),
  avgScore: z.number().min(0).max(5),
  avgGroundedness: z.number().min(0).max(5),
  avgCoherence: z.number().min(0).max(5),
  avgRelevance: z.number().min(0).max(5),
  avgFluency: z.number().min(0).max(5),
  avgHarmlessness: z.number().min(0).max(5),
});
export type CohortSlice = z.infer<typeof CohortSliceSchema>;

export const CohortAnalysisSchema = z.object({
  id: z.string(),
  evalRunId: z.string(),
  datasetId: z.string(),
  dimension: CohortDimensionSchema,
  slices: z.array(CohortSliceSchema),
  totalSamples: z.number().int(),
  overallErrorRate: z.number().min(0).max(1),
  createdAt: z.number(),
});
export type CohortAnalysis = z.infer<typeof CohortAnalysisSchema>;

export const CohortAnalysisCreateSchema = z.object({
  evalRunId: z.string(),
  datasetId: z.string(),
  dimension: CohortDimensionSchema,
  /** Custom metadata key when dimension = 'custom'. */
  customKey: z.string().optional(),
});
export type CohortAnalysisCreate = z.infer<typeof CohortAnalysisCreateSchema>;

// ── Fairness Metrics ────────────────────────────────────────────────

export const FairnessMetricTypeSchema = z.enum([
  'demographic_parity',
  'equalized_odds',
  'disparate_impact',
]);
export type FairnessMetricType = z.infer<typeof FairnessMetricTypeSchema>;

export const FairnessGroupResultSchema = z.object({
  group: z.string(),
  sampleCount: z.number().int().nonnegative(),
  positiveRate: z.number().min(0).max(1),
  errorRate: z.number().min(0).max(1),
  truePositiveRate: z.number().min(0).max(1),
  falsePositiveRate: z.number().min(0).max(1),
});
export type FairnessGroupResult = z.infer<typeof FairnessGroupResultSchema>;

export const FairnessReportSchema = z.object({
  id: z.string(),
  evalRunId: z.string(),
  datasetId: z.string(),
  protectedAttribute: z.string(),
  groups: z.array(FairnessGroupResultSchema),
  demographicParity: z.number(),
  equalizedOdds: z.number(),
  disparateImpactRatio: z.number(),
  passesThreshold: z.boolean(),
  threshold: z.number().default(0.8),
  createdAt: z.number(),
});
export type FairnessReport = z.infer<typeof FairnessReportSchema>;

export const FairnessReportCreateSchema = z.object({
  evalRunId: z.string(),
  datasetId: z.string(),
  protectedAttribute: z.string(),
  /** Threshold for disparate impact ratio (default 0.8 = four-fifths rule). */
  threshold: z.number().min(0).max(1).default(0.8),
});
export type FairnessReportCreate = z.infer<typeof FairnessReportCreateSchema>;

// ── SHAP Explainability ─────────────────────────────────────────────

export const TokenAttributionSchema = z.object({
  token: z.string(),
  attribution: z.number(),
});
export type TokenAttribution = z.infer<typeof TokenAttributionSchema>;

export const ShapExplanationSchema = z.object({
  id: z.string(),
  evalRunId: z.string().nullable().optional(),
  modelName: z.string(),
  prompt: z.string(),
  response: z.string(),
  inputTokens: z.array(TokenAttributionSchema),
  /** Overall prediction confidence or score. */
  predictionScore: z.number().optional(),
  /** Dimension being explained (e.g. 'groundedness'). */
  dimension: z.string().optional(),
  createdAt: z.number(),
});
export type ShapExplanation = z.infer<typeof ShapExplanationSchema>;

export const ShapExplanationCreateSchema = z.object({
  modelName: z.string(),
  prompt: z.string(),
  response: z.string(),
  evalRunId: z.string().optional(),
  dimension: z.string().optional(),
});
export type ShapExplanationCreate = z.infer<typeof ShapExplanationCreateSchema>;

// ── Data Provenance ─────────────────────────────────────────────────

export const ProvenanceEntryStatusSchema = z.enum([
  'included',
  'filtered',
  'synthetic',
  'redacted',
]);
export type ProvenanceEntryStatus = z.infer<typeof ProvenanceEntryStatusSchema>;

export const ProvenanceEntrySchema = z.object({
  id: z.string(),
  datasetId: z.string(),
  conversationId: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),
  personalityId: z.string().nullable().optional(),
  status: ProvenanceEntryStatusSchema,
  filterReason: z.string().nullable().optional(),
  /** Source type: conversation, synthetic, imported */
  sourceType: z.string(),
  /** Hash of the source data for integrity verification */
  contentHash: z.string().nullable().optional(),
  recordedAt: z.number(),
});
export type ProvenanceEntry = z.infer<typeof ProvenanceEntrySchema>;

export const ProvenanceQuerySchema = z.object({
  datasetId: z.string().optional(),
  conversationId: z.string().optional(),
  userId: z.string().optional(),
  status: ProvenanceEntryStatusSchema.optional(),
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().min(0).default(0),
});
export type ProvenanceQuery = z.infer<typeof ProvenanceQuerySchema>;

export const ProvenanceSummarySchema = z.object({
  datasetId: z.string(),
  totalEntries: z.number().int(),
  included: z.number().int(),
  filtered: z.number().int(),
  synthetic: z.number().int(),
  redacted: z.number().int(),
  uniqueUsers: z.number().int(),
  uniqueConversations: z.number().int(),
  filterReasons: z.record(z.number().int()),
});
export type ProvenanceSummary = z.infer<typeof ProvenanceSummarySchema>;

// ── Model Cards ─────────────────────────────────────────────────────

export const ModelCardSchema = z.object({
  id: z.string(),
  personalityId: z.string(),
  modelName: z.string(),
  version: z.string().optional(),
  /** Intended use description */
  intendedUse: z.string(),
  /** Known limitations */
  limitations: z.string(),
  /** Ethical considerations */
  ethicalConsiderations: z.string().optional(),
  /** Training data summary */
  trainingDataSummary: z.object({
    datasetId: z.string().nullable().optional(),
    sampleCount: z.number().int().nonnegative(),
    dateRange: z
      .object({
        from: z.string().nullable().optional(),
        to: z.string().nullable().optional(),
      })
      .optional(),
    sourceBreakdown: z.record(z.number().int()).optional(),
  }),
  /** Evaluation results summary */
  evaluationResults: z
    .object({
      evalRunId: z.string().nullable().optional(),
      avgGroundedness: z.number().optional(),
      avgCoherence: z.number().optional(),
      avgRelevance: z.number().optional(),
      avgFluency: z.number().optional(),
      avgHarmlessness: z.number().optional(),
      sampleCount: z.number().int().optional(),
    })
    .optional(),
  /** Fairness assessment summary */
  fairnessAssessment: z
    .object({
      reportId: z.string().nullable().optional(),
      protectedAttributes: z.array(z.string()).optional(),
      disparateImpactRatios: z.record(z.number()).optional(),
      passesThreshold: z.boolean().optional(),
    })
    .optional(),
  /** Deployment info */
  deployedAt: z.string().nullable().optional(),
  /** EU AI Act risk classification */
  riskClassification: z.enum(['minimal', 'limited', 'high', 'unacceptable']).optional(),
  /** Auto-generated or manually curated */
  generatedBy: z.enum(['auto', 'manual']).default('auto'),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type ModelCard = z.infer<typeof ModelCardSchema>;

export const ModelCardCreateSchema = z.object({
  personalityId: z.string(),
  modelName: z.string(),
  version: z.string().optional(),
  intendedUse: z.string().optional(),
  limitations: z.string().optional(),
  ethicalConsiderations: z.string().optional(),
  riskClassification: z.enum(['minimal', 'limited', 'high', 'unacceptable']).optional(),
});
export type ModelCardCreate = z.infer<typeof ModelCardCreateSchema>;

// ── Responsible AI Config ───────────────────────────────────────────

export const ResponsibleAiConfigSchema = z.object({
  /** Enable cohort error analysis on eval runs. */
  cohortAnalysis: z.boolean().default(false),
  /** Enable fairness metric computation. */
  fairnessMetrics: z.boolean().default(false),
  /** Disparate impact threshold (four-fifths rule = 0.8). */
  fairnessThreshold: z.number().min(0).max(1).default(0.8),
  /** Enable SHAP-style token attribution. */
  shapExplainability: z.boolean().default(false),
  /** Enable data provenance tracking on dataset curation. */
  dataProvenance: z.boolean().default(true),
  /** Auto-generate model cards on deployment. */
  autoModelCards: z.boolean().default(true),
  /** EU AI Act risk classification default. */
  defaultRiskClassification: z
    .enum(['minimal', 'limited', 'high', 'unacceptable'])
    .default('limited'),
});
export type ResponsibleAiConfig = z.infer<typeof ResponsibleAiConfigSchema>;
