/**
 * Team Types — Schemas for the Team primitive (Phase 83).
 *
 * A Team is a dynamic auto-manager: a coordinator LLM reads member
 * descriptions and decides who to assign to, rather than requiring a
 * pre-wired delegation graph as Swarms do.
 */

import { z } from 'zod';

// ─── Member ──────────────────────────────────────────────────────────

export const TeamMemberSchema = z.object({
  role: z.string().min(1).max(128),
  profileName: z.string().min(1).max(128),
  description: z.string().max(1000).optional(),
});
export type TeamMember = z.infer<typeof TeamMemberSchema>;

// ─── Definition ──────────────────────────────────────────────────────

export const TeamDefinitionSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(256),
  description: z.string().max(1000).optional(),
  members: z.array(TeamMemberSchema).min(1),
  coordinatorProfileName: z.string().optional(),
  isBuiltin: z.boolean().default(false),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type TeamDefinition = z.infer<typeof TeamDefinitionSchema>;

export const TeamCreateSchema = TeamDefinitionSchema.omit({
  id: true,
  isBuiltin: true,
  createdAt: true,
  updatedAt: true,
});
export type TeamCreate = z.infer<typeof TeamCreateSchema>;

export const TeamUpdateSchema = TeamCreateSchema.partial();
export type TeamUpdate = z.infer<typeof TeamUpdateSchema>;

// ─── Run Params ──────────────────────────────────────────────────────

export const TeamRunParamsSchema = z.object({
  task: z.string().min(1),
  context: z.string().optional(),
  tokenBudget: z.number().int().positive().default(100000),
});
export type TeamRunParams = z.infer<typeof TeamRunParamsSchema>;

// ─── Run ─────────────────────────────────────────────────────────────

export const TeamRunStatusSchema = z.enum(['pending', 'running', 'completed', 'failed']);
export type TeamRunStatus = z.infer<typeof TeamRunStatusSchema>;

export const TeamRunSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  teamName: z.string(),
  task: z.string(),
  status: TeamRunStatusSchema,
  result: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  coordinatorReasoning: z.string().nullable().optional(),
  assignedMembers: z.array(z.string()).default([]),
  tokenBudget: z.number().int().default(100000),
  tokensUsed: z.number().int().default(0),
  createdAt: z.number(),
  startedAt: z.number().nullable().optional(),
  completedAt: z.number().nullable().optional(),
  initiatedBy: z.string().optional(),
});
export type TeamRun = z.infer<typeof TeamRunSchema>;
