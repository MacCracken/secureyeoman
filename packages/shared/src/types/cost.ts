/**
 * Cost Optimization Types
 */

import { z } from 'zod';

export const RecommendationPrioritySchema = z.enum(['low', 'medium', 'high']);
export type RecommendationPriority = z.infer<typeof RecommendationPrioritySchema>;

export const CostRecommendationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(2000),
  priority: RecommendationPrioritySchema,
  estimatedSavingsUsd: z.number().nonnegative(),
  currentCostUsd: z.number().nonnegative(),
  suggestedAction: z.string().max(1000),
  category: z.enum(['model_selection', 'caching', 'batching', 'token_reduction', 'scheduling']),
  createdAt: z.number().int().nonnegative(),
});
export type CostRecommendation = z.infer<typeof CostRecommendationSchema>;

export const CostAnalysisSchema = z.object({
  totalCostUsd: z.number().nonnegative(),
  dailyAverageCostUsd: z.number().nonnegative(),
  topModels: z.array(z.object({
    model: z.string(),
    costUsd: z.number(),
    callCount: z.number(),
  })),
  recommendations: z.array(CostRecommendationSchema),
  analyzedAt: z.number().int().nonnegative(),
});
export type CostAnalysis = z.infer<typeof CostAnalysisSchema>;
