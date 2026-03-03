/**
 * Departmental Risk Register Types — Phase 111
 *
 * Schemas and types for departments, register entries, and department score snapshots.
 */

import { z } from 'zod';

// ─── Enums ───────────────────────────────────────────────────────

export const RiskCategorySchema = z.enum([
  'security',
  'operational',
  'financial',
  'compliance',
  'reputational',
  'strategic',
  'technology',
  'third_party',
  'environmental',
  'other',
]);
export type RiskCategory = z.infer<typeof RiskCategorySchema>;

export const RegisterEntryStatusSchema = z.enum([
  'open',
  'in_progress',
  'mitigated',
  'accepted',
  'closed',
  'transferred',
]);
export type RegisterEntryStatus = z.infer<typeof RegisterEntryStatusSchema>;

export const RegisterEntrySourceSchema = z.enum([
  'manual',
  'assessment',
  'scan',
  'audit',
  'incident',
  'external_feed',
  'workflow',
]);
export type RegisterEntrySource = z.infer<typeof RegisterEntrySourceSchema>;

export const RegisterEntrySeveritySchema = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export type RegisterEntrySeverity = z.infer<typeof RegisterEntrySeveritySchema>;

// ─── Nested Objects ──────────────────────────────────────────────

export const DepartmentObjectiveSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
});
export type DepartmentObjective = z.infer<typeof DepartmentObjectiveSchema>;

export const ComplianceTargetSchema = z.object({
  framework: z.string().min(1).max(100),
  requirement: z.string().max(500).optional(),
  targetDate: z.string().optional(),
  status: z
    .enum(['not_started', 'in_progress', 'compliant', 'non_compliant'])
    .default('not_started'),
});
export type ComplianceTarget = z.infer<typeof ComplianceTargetSchema>;

export const RiskAppetiteSchema = z.object({
  security: z.number().min(0).max(100).default(50),
  operational: z.number().min(0).max(100).default(50),
  financial: z.number().min(0).max(100).default(50),
  compliance: z.number().min(0).max(100).default(50),
  reputational: z.number().min(0).max(100).default(50),
});
export type RiskAppetite = z.infer<typeof RiskAppetiteSchema>;

export const MitigationItemSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(1).max(1000),
  status: z.enum(['planned', 'in_progress', 'implemented', 'verified']).default('planned'),
  owner: z.string().max(200).optional(),
  dueDate: z.string().optional(),
  effectiveness: z.enum(['high', 'medium', 'low']).optional(),
});
export type MitigationItem = z.infer<typeof MitigationItemSchema>;

// ─── Department ──────────────────────────────────────────────────

export const DepartmentSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  mission: z.string().nullable().optional(),
  objectives: z.array(DepartmentObjectiveSchema).default([]),
  parentId: z.string().nullable().optional(),
  teamId: z.string().nullable().optional(),
  riskAppetite: RiskAppetiteSchema.default({}),
  complianceTargets: z.array(ComplianceTargetSchema).default([]),
  metadata: z.record(z.unknown()).default({}),
  tenantId: z.string().nullable().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Department = z.infer<typeof DepartmentSchema>;

export const DepartmentCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  mission: z.string().optional(),
  objectives: z.array(DepartmentObjectiveSchema).optional(),
  parentId: z.string().optional(),
  teamId: z.string().optional(),
  riskAppetite: RiskAppetiteSchema.optional(),
  complianceTargets: z.array(ComplianceTargetSchema).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type DepartmentCreate = z.infer<typeof DepartmentCreateSchema>;

export const DepartmentUpdateSchema = DepartmentCreateSchema.partial();
export type DepartmentUpdate = z.infer<typeof DepartmentUpdateSchema>;

// ─── Register Entry ──────────────────────────────────────────────

export const RegisterEntrySchema = z.object({
  id: z.string(),
  departmentId: z.string(),
  title: z.string().min(1).max(300),
  description: z.string().nullable().optional(),
  category: RiskCategorySchema,
  severity: RegisterEntrySeveritySchema,
  likelihood: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  riskScore: z.number().int().optional(),
  owner: z.string().max(200).nullable().optional(),
  mitigations: z.array(MitigationItemSchema).default([]),
  status: RegisterEntryStatusSchema.default('open'),
  dueDate: z.string().nullable().optional(),
  source: RegisterEntrySourceSchema.nullable().optional(),
  sourceRef: z.string().nullable().optional(),
  evidenceRefs: z.array(z.string()).default([]),
  tenantId: z.string().nullable().optional(),
  createdBy: z.string().nullable().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  closedAt: z.number().nullable().optional(),
});
export type RegisterEntry = z.infer<typeof RegisterEntrySchema>;

export const RegisterEntryCreateSchema = z.object({
  departmentId: z.string(),
  title: z.string().min(1).max(300),
  description: z.string().optional(),
  category: RiskCategorySchema,
  severity: RegisterEntrySeveritySchema,
  likelihood: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  owner: z.string().max(200).optional(),
  mitigations: z.array(MitigationItemSchema).optional(),
  status: RegisterEntryStatusSchema.optional(),
  dueDate: z.string().optional(),
  source: RegisterEntrySourceSchema.optional(),
  sourceRef: z.string().optional(),
  evidenceRefs: z.array(z.string()).optional(),
});
export type RegisterEntryCreate = z.infer<typeof RegisterEntryCreateSchema>;

export const RegisterEntryUpdateSchema = RegisterEntryCreateSchema.omit({
  departmentId: true,
}).partial();
export type RegisterEntryUpdate = z.infer<typeof RegisterEntryUpdateSchema>;

// ─── Department Score ────────────────────────────────────────────

export const DepartmentScoreSchema = z.object({
  id: z.string(),
  departmentId: z.string(),
  scoredAt: z.string(),
  overallScore: z.number(),
  domainScores: z.record(z.number()).default({}),
  openRisks: z.number().int().default(0),
  overdueRisks: z.number().int().default(0),
  appetiteBreaches: z
    .array(
      z.object({
        domain: z.string(),
        score: z.number(),
        threshold: z.number(),
      })
    )
    .default([]),
  assessmentId: z.string().nullable().optional(),
  tenantId: z.string().nullable().optional(),
  createdAt: z.number(),
});
export type DepartmentScore = z.infer<typeof DepartmentScoreSchema>;

// ─── Composite Views ────────────────────────────────────────────

export const DepartmentScorecardSchema = z.object({
  department: DepartmentSchema,
  latestScore: DepartmentScoreSchema.nullable(),
  openRisks: z.number().int(),
  overdueRisks: z.number().int(),
  criticalRisks: z.number().int(),
  appetiteBreaches: z.array(
    z.object({
      domain: z.string(),
      score: z.number(),
      threshold: z.number(),
    })
  ),
  topRisks: z.array(RegisterEntrySchema),
});
export type DepartmentScorecard = z.infer<typeof DepartmentScorecardSchema>;

export const DepartmentIntentSummarySchema = z.object({
  department: DepartmentSchema,
  mission: z.string().nullable().optional(),
  objectives: z.array(DepartmentObjectiveSchema),
  complianceTargets: z.array(ComplianceTargetSchema),
  teamName: z.string().nullable().optional(),
  childDepartments: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    })
  ),
});
export type DepartmentIntentSummary = z.infer<typeof DepartmentIntentSummarySchema>;

export const RiskHeatmapCellSchema = z.object({
  departmentId: z.string(),
  departmentName: z.string(),
  domain: z.string(),
  score: z.number(),
  threshold: z.number(),
  breached: z.boolean(),
});
export type RiskHeatmapCell = z.infer<typeof RiskHeatmapCellSchema>;

export const RiskTrendPointSchema = z.object({
  date: z.string(),
  overallScore: z.number(),
  openRisks: z.number().int(),
  overdueRisks: z.number().int(),
});
export type RiskTrendPoint = z.infer<typeof RiskTrendPointSchema>;
