/**
 * Agent Swarm Types (Phase 17)
 *
 * Schemas for coordinated multi-agent execution with role-based specialization.
 */

import { z } from 'zod';

// ─── Strategy ──────────────────────────────────────────────────────

export const SwarmStrategySchema = z.enum(['sequential', 'parallel', 'dynamic']);
export type SwarmStrategy = z.infer<typeof SwarmStrategySchema>;

// ─── Status ────────────────────────────────────────────────────────

export const SwarmStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']);
export type SwarmStatus = z.infer<typeof SwarmStatusSchema>;

// ─── Role Config ───────────────────────────────────────────────────

export const SwarmRoleConfigSchema = z.object({
  role: z.string().min(1).max(64),
  profileName: z.string().min(1).max(64),
  description: z.string().max(500).default(''),
});
export type SwarmRoleConfig = z.infer<typeof SwarmRoleConfigSchema>;

// ─── Template ──────────────────────────────────────────────────────

export const SwarmTemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(128),
  description: z.string().max(500).default(''),
  strategy: SwarmStrategySchema,
  roles: z.array(SwarmRoleConfigSchema),
  coordinatorProfile: z.string().nullable().default(null),
  isBuiltin: z.boolean().default(false),
  createdAt: z.number(),
});
export type SwarmTemplate = z.infer<typeof SwarmTemplateSchema>;

export const SwarmTemplateCreateSchema = SwarmTemplateSchema.omit({
  id: true,
  isBuiltin: true,
  createdAt: true,
});
export type SwarmTemplateCreate = z.infer<typeof SwarmTemplateCreateSchema>;

// ─── Member ────────────────────────────────────────────────────────

export const SwarmMemberSchema = z.object({
  id: z.string(),
  swarmRunId: z.string(),
  role: z.string(),
  profileName: z.string(),
  delegationId: z.string().nullable(),
  status: z.string(),
  result: z.string().nullable(),
  seqOrder: z.number().int(),
  createdAt: z.number(),
  startedAt: z.number().nullable(),
  completedAt: z.number().nullable(),
});
export type SwarmMember = z.infer<typeof SwarmMemberSchema>;

// ─── Run ───────────────────────────────────────────────────────────

export const SwarmRunSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  templateName: z.string(),
  task: z.string(),
  context: z.string().nullable(),
  status: SwarmStatusSchema,
  strategy: SwarmStrategySchema,
  result: z.string().nullable(),
  error: z.string().nullable(),
  tokenBudget: z.number().int(),
  tokensUsedPrompt: z.number().int(),
  tokensUsedCompletion: z.number().int(),
  createdAt: z.number(),
  startedAt: z.number().nullable(),
  completedAt: z.number().nullable(),
  initiatedBy: z.string().nullable(),
  members: z.array(SwarmMemberSchema).optional(),
});
export type SwarmRun = z.infer<typeof SwarmRunSchema>;

// ─── Run Params ────────────────────────────────────────────────────

export const SwarmRunParamsSchema = z.object({
  templateId: z.string(),
  task: z.string().min(1).max(50000),
  context: z.string().max(100000).optional(),
  tokenBudget: z.number().int().positive().max(2000000).optional(),
  initiatedBy: z.string().optional(),
});
export type SwarmRunParams = z.infer<typeof SwarmRunParamsSchema>;
