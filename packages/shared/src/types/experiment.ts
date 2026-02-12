/**
 * A/B Testing Experiment Types
 */

import { z } from 'zod';

export const ExperimentStatusSchema = z.enum(['draft', 'running', 'paused', 'completed']);
export type ExperimentStatus = z.infer<typeof ExperimentStatusSchema>;

export const VariantSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).default(''),
  config: z.record(z.string(), z.unknown()).default({}),
  trafficPercent: z.number().min(0).max(100).default(50),
});
export type Variant = z.infer<typeof VariantSchema>;

export const ExperimentResultSchema = z.object({
  variantId: z.string().min(1),
  sampleSize: z.number().int().nonnegative(),
  successCount: z.number().int().nonnegative(),
  avgLatencyMs: z.number().nonnegative(),
  avgCostUsd: z.number().nonnegative(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type ExperimentResult = z.infer<typeof ExperimentResultSchema>;

export const ExperimentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  status: ExperimentStatusSchema.default('draft'),
  variants: z.array(VariantSchema).min(2),
  results: z.array(ExperimentResultSchema).default([]),
  startedAt: z.number().int().nonnegative().nullable().default(null),
  completedAt: z.number().int().nonnegative().nullable().default(null),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type Experiment = z.infer<typeof ExperimentSchema>;

export const ExperimentCreateSchema = ExperimentSchema.omit({
  id: true,
  results: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
});
export type ExperimentCreate = z.infer<typeof ExperimentCreateSchema>;
