/**
 * Delegation Types for Sub-Agent System (Phase 6.3)
 *
 * Defines schemas for agent profiles, delegation parameters/results,
 * and delegation configuration. Used by SubAgentManager to spawn
 * subordinate agents with specialized personas.
 */

import { z } from 'zod';

// ─── Agent Profile ─────────────────────────────────────────────────

export const AgentProfileSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(64),
  description: z.string().max(500).default(''),
  systemPrompt: z.string().max(10000),
  maxTokenBudget: z.number().int().positive().max(500000).default(50000),
  allowedTools: z.array(z.string()).default([]),
  defaultModel: z.string().nullable().default(null),
  isBuiltin: z.boolean().default(false),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
});

export type AgentProfile = z.infer<typeof AgentProfileSchema>;

export const AgentProfileCreateSchema = AgentProfileSchema.omit({
  id: true,
  isBuiltin: true,
  createdAt: true,
  updatedAt: true,
});

export type AgentProfileCreate = z.infer<typeof AgentProfileCreateSchema>;

export const AgentProfileUpdateSchema = AgentProfileCreateSchema.partial();

export type AgentProfileUpdate = z.infer<typeof AgentProfileUpdateSchema>;

// ─── Delegation Status ─────────────────────────────────────────────

export const DelegationStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
  'timeout',
]);

export type DelegationStatus = z.infer<typeof DelegationStatusSchema>;

// ─── Delegation Parameters ─────────────────────────────────────────

export const DelegationParamsSchema = z.object({
  profile: z.string(),
  task: z.string().min(1).max(50000),
  context: z.string().max(100000).optional(),
  maxTokenBudget: z.number().int().positive().max(500000).optional(),
  maxDepth: z.number().int().min(1).max(10).optional(),
  timeout: z.number().int().positive().max(600000).optional(),
});

export type DelegationParams = z.infer<typeof DelegationParamsSchema>;

// ─── Delegation Result ─────────────────────────────────────────────

export interface DelegationResult {
  delegationId: string;
  profile: string;
  status: DelegationStatus;
  result: string | null;
  error: string | null;
  tokenUsage: {
    prompt: number;
    completion: number;
    total: number;
  };
  durationMs: number;
  subDelegations: DelegationResult[];
}

export const DelegationResultSchema: z.ZodType<DelegationResult, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({
    delegationId: z.string(),
    profile: z.string(),
    status: DelegationStatusSchema,
    result: z.string().nullable(),
    error: z.string().nullable(),
    tokenUsage: z.object({
      prompt: z.number(),
      completion: z.number(),
      total: z.number(),
    }),
    durationMs: z.number(),
    subDelegations: z.array(DelegationResultSchema).default([]),
  }),
) as z.ZodType<DelegationResult, z.ZodTypeDef, unknown>;

// ─── Sub-Agent Info (active listing) ───────────────────────────────

export const SubAgentInfoSchema = z.object({
  delegationId: z.string(),
  profileId: z.string(),
  profileName: z.string(),
  task: z.string(),
  status: DelegationStatusSchema,
  depth: z.number(),
  tokensUsed: z.number(),
  tokenBudget: z.number(),
  startedAt: z.number(),
  elapsedMs: z.number(),
});

export type SubAgentInfo = z.infer<typeof SubAgentInfoSchema>;

// ─── Delegation Configuration ──────────────────────────────────────

export const DelegationConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    maxDepth: z.number().int().min(1).max(10).default(3),
    defaultTimeout: z.number().int().positive().max(600000).default(300000),
    maxConcurrent: z.number().int().positive().max(20).default(5),
    tokenBudget: z
      .object({
        default: z.number().int().positive().max(500000).default(50000),
        max: z.number().int().positive().max(1000000).default(200000),
      })
      .default({}),
    context: z
      .object({
        sealOnComplete: z.boolean().default(true),
        brainWriteScope: z.enum(['none', 'delegated', 'all']).default('delegated'),
      })
      .default({}),
  })
  .default({});

export type DelegationConfig = z.infer<typeof DelegationConfigSchema>;
