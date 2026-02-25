/**
 * Workflow Engine Types
 *
 * Schemas for DAG-based workflow orchestration. Distinct from Swarms:
 * workflows are user-defined, deterministic, and directly executable.
 */

import { z } from 'zod';
import { AutonomyLevelSchema } from './soul.js';

// ─── Step Types ─────────────────────────────────────────────────────

export const WorkflowStepTypeSchema = z.enum([
  'agent',
  'tool',
  'mcp',
  'condition',
  'transform',
  'resource',
  'webhook',
  'subworkflow',
  'swarm',
]);
export type WorkflowStepType = z.infer<typeof WorkflowStepTypeSchema>;

// ─── Step ───────────────────────────────────────────────────────────

export const WorkflowStepSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/, 'Step id must be alphanumeric/underscore/dash'),
  type: WorkflowStepTypeSchema,
  name: z.string().min(1).max(256),
  description: z.string().max(1000).optional(),
  config: z.record(z.unknown()),
  dependsOn: z.array(z.string()).default([]),
  retryPolicy: z
    .object({
      maxAttempts: z.number().int().min(1).max(10),
      backoffMs: z.number().int(),
    })
    .optional(),
  onError: z.enum(['fail', 'continue', 'skip', 'fallback']).default('fail'),
  fallbackStepId: z.string().optional(),
  condition: z.string().max(2000).optional(),
});
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

// ─── Edge ───────────────────────────────────────────────────────────

export const WorkflowEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
});
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;

// ─── Trigger ────────────────────────────────────────────────────────

export const WorkflowTriggerSchema = z.object({
  type: z.enum(['manual', 'schedule', 'event', 'webhook', 'skill']),
  config: z.record(z.unknown()).default({}),
});
export type WorkflowTrigger = z.infer<typeof WorkflowTriggerSchema>;

// ─── Definition ─────────────────────────────────────────────────────

export const WorkflowDefinitionSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(256),
  description: z.string().max(1000).optional(),
  steps: z.array(WorkflowStepSchema).default([]),
  edges: z.array(WorkflowEdgeSchema).default([]),
  triggers: z.array(WorkflowTriggerSchema).default([]),
  isEnabled: z.boolean().default(true),
  version: z.number().int().default(1),
  createdBy: z.string().default('system'),
  // Autonomy classification (Phase 49)
  autonomyLevel: AutonomyLevelSchema.default('L2'),
  emergencyStopProcedure: z.string().max(1000).optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

export const WorkflowDefinitionCreateSchema = WorkflowDefinitionSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type WorkflowDefinitionCreate = z.infer<typeof WorkflowDefinitionCreateSchema>;

export const WorkflowDefinitionUpdateSchema = WorkflowDefinitionCreateSchema.partial();
export type WorkflowDefinitionUpdate = z.infer<typeof WorkflowDefinitionUpdateSchema>;

// ─── Run Status ─────────────────────────────────────────────────────

export const WorkflowRunStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);
export type WorkflowRunStatus = z.infer<typeof WorkflowRunStatusSchema>;

// ─── Step Run Status ────────────────────────────────────────────────

export const WorkflowStepRunStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
]);
export type WorkflowStepRunStatus = z.infer<typeof WorkflowStepRunStatusSchema>;

// ─── Run ────────────────────────────────────────────────────────────

export const WorkflowRunSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  workflowName: z.string(),
  status: WorkflowRunStatusSchema,
  input: z.record(z.unknown()).nullable().optional(),
  output: z.record(z.unknown()).nullable().optional(),
  error: z.string().nullable().optional(),
  triggeredBy: z.string().default('manual'),
  createdAt: z.number(),
  startedAt: z.number().nullable().optional(),
  completedAt: z.number().nullable().optional(),
  stepRuns: z.array(z.lazy(() => WorkflowStepRunSchema)).optional(),
});
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;

// ─── Step Run ───────────────────────────────────────────────────────

export const WorkflowStepRunSchema = z.object({
  id: z.string(),
  runId: z.string(),
  stepId: z.string(),
  stepName: z.string(),
  stepType: z.string(),
  status: WorkflowStepRunStatusSchema,
  input: z.record(z.unknown()).nullable().optional(),
  output: z.record(z.unknown()).nullable().optional(),
  error: z.string().nullable().optional(),
  startedAt: z.number().nullable().optional(),
  completedAt: z.number().nullable().optional(),
  durationMs: z.number().int().nullable().optional(),
});
export type WorkflowStepRun = z.infer<typeof WorkflowStepRunSchema>;
