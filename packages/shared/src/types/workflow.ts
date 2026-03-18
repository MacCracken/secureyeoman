/**
 * Workflow Engine Types
 *
 * Schemas for DAG-based workflow orchestration. Distinct from Swarms:
 * workflows are user-defined, deterministic, and directly executable.
 */

import { z } from 'zod';
import { AutonomyLevelSchema } from './soul.js';

// ─── Trigger Mode ────────────────────────────────────────────────────

export const WorkflowTriggerModeSchema = z.enum(['any', 'all']);
export type WorkflowTriggerMode = z.infer<typeof WorkflowTriggerModeSchema>;

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
  'council',
  // ML Pipeline step types (Phase 73)
  'data_curation',
  'training_job',
  'evaluation',
  'conditional_deploy',
  'human_approval',
  // CI/CD step types (Phase 90)
  'ci_trigger', // fire a CI/CD job, returns { runId, url, status: 'queued' }
  'ci_wait', // poll until job done, returns { status, conclusion, logs_url, durationMs }
  // Diagramming step types (Phase 117)
  'diagram_generation', // generate Excalidraw diagram from description, returns { scene, validationIssues, renderedSvg? }
  // Document analysis step types (Phase 122-B)
  'document_analysis', // analyze documents with configurable analysis type, returns { analysisType, document, outputFormat, toolChain }
  // Agnostic crew delegation step types
  'agnostic_crew', // submit a crew to Agnostic, returns { crewId, status: 'queued' }
  'agnostic_crew_wait', // poll crew until done, returns { status, results, durationMs }
  // DAG expansion step types (Phase 150)
  'loop', // repeat step(s) N times or until condition, returns { iterations, lastOutput }
  'parallel_map', // fan-out: run step template across input list, returns { results: unknown[] }
  'code_execution', // run sandboxed code inline, returns { stdout, stderr, exitCode }
  'delay', // pause for duration or until timestamp, returns { delayedMs }
  'notification', // send alert via channel, returns { channel, sent: boolean }
  'data_validation', // validate data against JSON Schema, returns { valid, errors? }
  'cache_lookup', // check cache before expensive ops, returns { hit, value? }
  'a2a_delegate', // delegate to remote SY instance via A2A, returns { taskId, result }
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
  triggerMode: WorkflowTriggerModeSchema.default('all'),
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
/** Input type for creating workflows — fields with `.default()` (e.g. `triggerMode`) are optional. */
export type WorkflowDefinitionCreateInput = z.input<typeof WorkflowDefinitionCreateSchema>;

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
