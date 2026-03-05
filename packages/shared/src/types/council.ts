/**
 * Council of AIs Types
 *
 * Schemas for multi-round group deliberation where agents see each other's
 * positions, rebut, and converge toward a decision.
 */

import { z } from 'zod';

// ─── Deliberation Strategy ────────────────────────────────────────

export const CouncilDeliberationStrategySchema = z.enum([
  'rounds', // Fixed N rounds
  'until_consensus', // Run until facilitator judges convergence (up to maxRounds)
  'single_pass', // One round only, no convergence check
]);
export type CouncilDeliberationStrategy = z.infer<typeof CouncilDeliberationStrategySchema>;

// ─── Voting Strategy ──────────────────────────────────────────────

export const CouncilVotingStrategySchema = z.enum([
  'facilitator_judgment', // Facilitator synthesizes and decides
  'majority', // Simple majority of members
  'unanimous', // All must agree
  'weighted', // Weight-based voting
]);
export type CouncilVotingStrategy = z.infer<typeof CouncilVotingStrategySchema>;

// ─── Status ───────────────────────────────────────────────────────

export const CouncilStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);
export type CouncilStatus = z.infer<typeof CouncilStatusSchema>;

// ─── Member Config ────────────────────────────────────────────────

export const CouncilMemberConfigSchema = z.object({
  role: z.string().min(1).max(64),
  profileName: z.string().min(1).max(64),
  description: z.string().max(500).default(''),
  weight: z.number().min(0).max(100).default(1),
  perspective: z.string().max(1000).optional(),
});
export type CouncilMemberConfig = z.infer<typeof CouncilMemberConfigSchema>;

// ─── Template ─────────────────────────────────────────────────────

export const CouncilTemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(128),
  description: z.string().max(500).default(''),
  members: z.array(CouncilMemberConfigSchema),
  facilitatorProfile: z.string().min(1).max(64),
  deliberationStrategy: CouncilDeliberationStrategySchema.default('rounds'),
  maxRounds: z.number().int().min(1).max(10).default(3),
  votingStrategy: CouncilVotingStrategySchema.default('facilitator_judgment'),
  isBuiltin: z.boolean().default(false),
  createdAt: z.number(),
});
export type CouncilTemplate = z.infer<typeof CouncilTemplateSchema>;

export const CouncilTemplateCreateSchema = CouncilTemplateSchema.omit({
  id: true,
  isBuiltin: true,
  createdAt: true,
});
export type CouncilTemplateCreate = z.infer<typeof CouncilTemplateCreateSchema>;

// ─── Position (per-member, per-round) ─────────────────────────────

export const CouncilPositionSchema = z.object({
  id: z.string(),
  councilRunId: z.string(),
  memberRole: z.string(),
  profileName: z.string(),
  round: z.number().int(),
  position: z.string(),
  confidence: z.number().min(0).max(1),
  keyPoints: z.array(z.string()),
  agreements: z.array(z.string()),
  disagreements: z.array(z.string()),
  createdAt: z.number(),
});
export type CouncilPosition = z.infer<typeof CouncilPositionSchema>;

// ─── Run ──────────────────────────────────────────────────────────

export const CouncilRunSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  templateName: z.string(),
  topic: z.string(),
  context: z.string().nullable(),
  status: CouncilStatusSchema,
  deliberationStrategy: CouncilDeliberationStrategySchema,
  maxRounds: z.number().int(),
  completedRounds: z.number().int(),
  decision: z.string().nullable(),
  consensus: z.enum(['full', 'majority', 'split']).nullable(),
  dissents: z.array(z.string()).nullable(),
  reasoning: z.string().nullable(),
  confidence: z.number().nullable(),
  tokenBudget: z.number().int(),
  tokensUsed: z.number().int(),
  createdAt: z.number(),
  startedAt: z.number().nullable(),
  completedAt: z.number().nullable(),
  initiatedBy: z.string().nullable(),
  positions: z.array(CouncilPositionSchema).optional(),
});
export type CouncilRun = z.infer<typeof CouncilRunSchema>;

// ─── Run Params ───────────────────────────────────────────────────

export const CouncilRunParamsSchema = z.object({
  templateId: z.string(),
  topic: z.string().min(1).max(50000),
  context: z.string().max(100000).optional(),
  tokenBudget: z.number().int().positive().max(2000000).optional(),
  maxRounds: z.number().int().min(1).max(10).optional(),
  initiatedBy: z.string().optional(),
});
export type CouncilRunParams = z.infer<typeof CouncilRunParamsSchema>;
