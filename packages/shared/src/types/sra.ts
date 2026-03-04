/**
 * SRA Types — Phase 123: Security Reference Architecture
 *
 * Cloud-specific Security Reference Architecture support: blueprints,
 * assessments, compliance mappings, and executive summary.
 */

import { z } from 'zod';

// ─── Enums ───────────────────────────────────────────────────────

export const SraProviderSchema = z.enum([
  'aws',
  'azure',
  'gcp',
  'multi_cloud',
  'on_premises',
  'hybrid',
  'generic',
]);
export type SraProvider = z.infer<typeof SraProviderSchema>;

export const SraFrameworkSchema = z.enum([
  'aws_sra',
  'cisa_tra',
  'mcra',
  'nist_csf',
  'cis_benchmarks',
  'custom',
]);
export type SraFramework = z.infer<typeof SraFrameworkSchema>;

export const SraControlDomainSchema = z.enum([
  'identity_access',
  'network_security',
  'data_protection',
  'compute_workload',
  'logging_monitoring',
  'incident_response',
  'governance_compliance',
  'supply_chain',
  'account_organization',
  'application_security',
]);
export type SraControlDomain = z.infer<typeof SraControlDomainSchema>;

export const SraControlStatusSchema = z.enum([
  'not_assessed',
  'not_implemented',
  'partially_implemented',
  'fully_implemented',
  'not_applicable',
]);
export type SraControlStatus = z.infer<typeof SraControlStatusSchema>;

export const SraBlueprintStatusSchema = z.enum([
  'draft',
  'active',
  'archived',
]);
export type SraBlueprintStatus = z.infer<typeof SraBlueprintStatusSchema>;

export const SraAssessmentStatusSchema = z.enum([
  'in_progress',
  'completed',
  'archived',
]);
export type SraAssessmentStatus = z.infer<typeof SraAssessmentStatusSchema>;

// ─── Sub-schemas ─────────────────────────────────────────────────

export const ComplianceMappingSchema = z.object({
  framework: z.string(),
  controlId: z.string(),
  description: z.string(),
});
export type ComplianceMapping = z.infer<typeof ComplianceMappingSchema>;

export const IacSnippetSchema = z.object({
  provider: z.string(),
  code: z.string(),
  filename: z.string(),
});
export type IacSnippet = z.infer<typeof IacSnippetSchema>;

export const SraControlSchema = z.object({
  id: z.string(),
  domain: SraControlDomainSchema,
  title: z.string(),
  description: z.string(),
  implementationGuidance: z.string().optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  complianceMappings: z.array(ComplianceMappingSchema).default([]),
  iacSnippets: z.array(IacSnippetSchema).default([]),
  dependencies: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});
export type SraControl = z.infer<typeof SraControlSchema>;

// ─── Full entities ───────────────────────────────────────────────

export const SraBlueprintSchema = z.object({
  id: z.string(),
  orgId: z.string().optional(),
  name: z.string().max(300),
  description: z.string().optional(),
  provider: SraProviderSchema,
  framework: SraFrameworkSchema,
  controls: z.array(SraControlSchema),
  status: SraBlueprintStatusSchema,
  isBuiltin: z.boolean().default(false),
  metadata: z.record(z.unknown()).default({}),
  createdBy: z.string().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type SraBlueprint = z.infer<typeof SraBlueprintSchema>;

export const SraControlResultSchema = z.object({
  controlId: z.string(),
  status: SraControlStatusSchema,
  notes: z.string().optional(),
  evidence: z.string().optional(),
  remediationSteps: z.array(z.string()).default([]),
});
export type SraControlResult = z.infer<typeof SraControlResultSchema>;

export const SraAssessmentSummarySchema = z.object({
  complianceScore: z.number().min(0).max(100),
  totalControls: z.number().int(),
  implemented: z.number().int(),
  partial: z.number().int(),
  notImplemented: z.number().int(),
  notApplicable: z.number().int(),
  topGaps: z.array(z.string()),
  domainScores: z.record(z.number()).default({}),
});
export type SraAssessmentSummary = z.infer<typeof SraAssessmentSummarySchema>;

export const SraAssessmentSchema = z.object({
  id: z.string(),
  orgId: z.string().optional(),
  blueprintId: z.string(),
  name: z.string().max(300),
  infrastructureDescription: z.string().optional(),
  controlResults: z.array(SraControlResultSchema),
  summary: SraAssessmentSummarySchema.optional(),
  status: SraAssessmentStatusSchema,
  linkedRiskAssessmentId: z.string().optional(),
  createdBy: z.string().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type SraAssessment = z.infer<typeof SraAssessmentSchema>;

// ─── Create / Update ─────────────────────────────────────────────

export const SraBlueprintCreateSchema = z.object({
  name: z.string().min(1).max(300),
  description: z.string().optional(),
  provider: SraProviderSchema,
  framework: SraFrameworkSchema,
  controls: z.array(SraControlSchema).default([]),
  status: SraBlueprintStatusSchema.default('draft'),
  metadata: z.record(z.unknown()).default({}),
});
export type SraBlueprintCreate = z.infer<typeof SraBlueprintCreateSchema>;

export const SraBlueprintUpdateSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  description: z.string().optional(),
  provider: SraProviderSchema.optional(),
  framework: SraFrameworkSchema.optional(),
  controls: z.array(SraControlSchema).optional(),
  status: SraBlueprintStatusSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type SraBlueprintUpdate = z.infer<typeof SraBlueprintUpdateSchema>;

export const SraAssessmentCreateSchema = z.object({
  blueprintId: z.string().min(1),
  name: z.string().min(1).max(300),
  infrastructureDescription: z.string().optional(),
  controlResults: z.array(SraControlResultSchema).default([]),
  status: SraAssessmentStatusSchema.default('in_progress'),
  linkedRiskAssessmentId: z.string().optional(),
});
export type SraAssessmentCreate = z.infer<typeof SraAssessmentCreateSchema>;

export const SraAssessmentUpdateSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  infrastructureDescription: z.string().optional(),
  controlResults: z.array(SraControlResultSchema).optional(),
  summary: SraAssessmentSummarySchema.optional(),
  status: SraAssessmentStatusSchema.optional(),
  linkedRiskAssessmentId: z.string().optional(),
});
export type SraAssessmentUpdate = z.infer<typeof SraAssessmentUpdateSchema>;

// ─── Compliance Mapping record ───────────────────────────────────

export const SraComplianceMappingRecordSchema = z.object({
  domain: SraControlDomainSchema,
  framework: z.string(),
  controlId: z.string(),
  controlTitle: z.string(),
  description: z.string(),
});
export type SraComplianceMappingRecord = z.infer<typeof SraComplianceMappingRecordSchema>;

// ─── Executive Summary ───────────────────────────────────────────

export const SraExecutiveSummarySchema = z.object({
  totalBlueprints: z.number().int(),
  totalAssessments: z.number().int(),
  avgComplianceScore: z.number(),
  byProvider: z.record(z.number().int()),
  byFramework: z.record(z.number().int()),
  topGaps: z.array(z.string()),
  recentAssessments: z.array(SraAssessmentSchema),
});
export type SraExecutiveSummary = z.infer<typeof SraExecutiveSummarySchema>;
