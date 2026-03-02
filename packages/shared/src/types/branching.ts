/**
 * Branching Types — Schemas for conversation branching & replay (Phase 99).
 *
 * Provides branch trees, replay jobs, replay results, and batch reports.
 */

import { z } from 'zod';

// ─── Branch Tree ──────────────────────────────────────────────────────

export interface BranchTreeNode {
  conversationId: string;
  title: string;
  forkMessageIndex: number | null;
  branchLabel: string | null;
  model: string | null;
  qualityScore: number | null;
  messageCount: number;
  children: BranchTreeNode[];
}

// ─── Replay Job ───────────────────────────────────────────────────────

export const ReplayJobStatusSchema = z.enum(['pending', 'running', 'completed', 'failed']);
export type ReplayJobStatus = z.infer<typeof ReplayJobStatusSchema>;

export const ReplayJobSchema = z.object({
  id: z.string(),
  status: ReplayJobStatusSchema,
  sourceConversationIds: z.array(z.string()),
  replayModel: z.string(),
  replayProvider: z.string(),
  replayPersonalityId: z.string().nullable().optional(),
  totalConversations: z.number().int(),
  completedConversations: z.number().int(),
  failedConversations: z.number().int(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type ReplayJob = z.infer<typeof ReplayJobSchema>;

// ─── Replay Result ────────────────────────────────────────────────────

export const PairwiseWinnerValueSchema = z.enum(['source', 'replay', 'tie']);
export type PairwiseWinnerValue = z.infer<typeof PairwiseWinnerValueSchema>;

export const ReplayResultSchema = z.object({
  id: z.string(),
  replayJobId: z.string(),
  sourceConversationId: z.string(),
  replayConversationId: z.string(),
  sourceModel: z.string().nullable().optional(),
  replayModel: z.string(),
  sourceQualityScore: z.number().nullable().optional(),
  replayQualityScore: z.number().nullable().optional(),
  pairwiseWinner: PairwiseWinnerValueSchema.nullable().optional(),
  pairwiseReason: z.string().nullable().optional(),
  createdAt: z.number(),
});
export type ReplayResult = z.infer<typeof ReplayResultSchema>;

// ─── Replay Batch Report ──────────────────────────────────────────────

export const ReplayBatchSummarySchema = z.object({
  sourceWins: z.number().int(),
  replayWins: z.number().int(),
  ties: z.number().int(),
  avgSourceQuality: z.number().nullable(),
  avgReplayQuality: z.number().nullable(),
});
export type ReplayBatchSummary = z.infer<typeof ReplayBatchSummarySchema>;

export const ReplayBatchReportSchema = z.object({
  job: ReplayJobSchema,
  results: z.array(ReplayResultSchema),
  summary: ReplayBatchSummarySchema,
});
export type ReplayBatchReport = z.infer<typeof ReplayBatchReportSchema>;
