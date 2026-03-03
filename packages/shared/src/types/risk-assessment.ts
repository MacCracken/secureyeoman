/**
 * Risk Assessment Types — Phase 53
 *
 * Shared Zod schemas and TypeScript types for the cross-domain risk
 * assessment engine (security, autonomy, governance, infrastructure, external).
 */

import { z } from 'zod';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const RiskLevelSchema = z.enum(['low', 'medium', 'high', 'critical']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const RiskDomainSchema = z.enum([
  'security',
  'autonomy',
  'governance',
  'infrastructure',
  'external',
]);
export type RiskDomain = z.infer<typeof RiskDomainSchema>;

export const RiskFindingSeveritySchema = z.enum(['info', 'low', 'medium', 'high', 'critical']);
export type RiskFindingSeverity = z.infer<typeof RiskFindingSeveritySchema>;

export const AssessmentStatusSchema = z.enum(['pending', 'running', 'completed', 'failed']);
export type AssessmentStatus = z.infer<typeof AssessmentStatusSchema>;

export const ExternalFindingStatusSchema = z.enum(['open', 'acknowledged', 'resolved']);
export type ExternalFindingStatus = z.infer<typeof ExternalFindingStatusSchema>;

export const ExternalFeedSourceTypeSchema = z.enum(['webhook', 'upload', 'manual']);
export type ExternalFeedSourceType = z.infer<typeof ExternalFeedSourceTypeSchema>;

export const ExternalFeedCategorySchema = z.enum(['finance', 'compliance', 'cyber', 'other']);
export type ExternalFeedCategory = z.infer<typeof ExternalFeedCategorySchema>;

// ─── Risk Finding ─────────────────────────────────────────────────────────────

export const RiskFindingSchema = z.object({
  id: z.string(),
  domain: RiskDomainSchema,
  severity: RiskFindingSeveritySchema,
  title: z.string(),
  description: z.string(),
  affectedResource: z.string().optional(),
  recommendation: z.string().optional(),
  evidence: z.record(z.unknown()).optional(),
});
export type RiskFinding = z.infer<typeof RiskFindingSchema>;

// ─── Risk Assessment ──────────────────────────────────────────────────────────

export const RiskAssessmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: AssessmentStatusSchema,
  assessmentTypes: z.array(RiskDomainSchema),
  windowDays: z.number().int().default(7),
  compositeScore: z.number().int().min(0).max(100).optional(),
  riskLevel: RiskLevelSchema.optional(),
  domainScores: z.record(z.number()).optional(),
  findings: z.array(RiskFindingSchema).optional(),
  findingsCount: z.number().int().default(0),
  options: z.record(z.unknown()).optional(),
  departmentId: z.string().optional(),
  createdBy: z.string().optional(),
  createdAt: z.number().int(),
  completedAt: z.number().int().optional(),
  error: z.string().optional(),
});
export type RiskAssessment = z.infer<typeof RiskAssessmentSchema>;

export const CreateRiskAssessmentSchema = z.object({
  name: z.string().min(1),
  assessmentTypes: z
    .array(RiskDomainSchema)
    .default(['security', 'autonomy', 'governance', 'infrastructure', 'external']),
  windowDays: z.number().int().min(1).max(365).default(7),
  options: z.record(z.unknown()).optional(),
  departmentId: z.string().optional(),
});
export type CreateRiskAssessment = z.infer<typeof CreateRiskAssessmentSchema>;

// ─── External Feed ────────────────────────────────────────────────────────────

export const ExternalFeedSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  sourceType: ExternalFeedSourceTypeSchema,
  category: ExternalFeedCategorySchema,
  enabled: z.boolean().default(true),
  config: z.record(z.unknown()).optional(),
  lastIngestedAt: z.number().int().optional(),
  recordCount: z.number().int().default(0),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type ExternalFeed = z.infer<typeof ExternalFeedSchema>;

export const CreateExternalFeedSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  sourceType: ExternalFeedSourceTypeSchema,
  category: ExternalFeedCategorySchema,
  enabled: z.boolean().default(true),
  config: z.record(z.unknown()).optional(),
});
export type CreateExternalFeed = z.infer<typeof CreateExternalFeedSchema>;

// ─── External Finding ─────────────────────────────────────────────────────────

export const ExternalFindingSchema = z.object({
  id: z.string(),
  feedId: z.string().optional(),
  sourceRef: z.string().optional(),
  category: ExternalFeedCategorySchema,
  severity: RiskFindingSeveritySchema,
  title: z.string(),
  description: z.string().optional(),
  affectedResource: z.string().optional(),
  recommendation: z.string().optional(),
  evidence: z.record(z.unknown()).optional(),
  status: ExternalFindingStatusSchema,
  acknowledgedBy: z.string().optional(),
  acknowledgedAt: z.number().int().optional(),
  resolvedAt: z.number().int().optional(),
  sourceDate: z.number().int().optional(),
  departmentId: z.string().optional(),
  importedAt: z.number().int(),
});
export type ExternalFinding = z.infer<typeof ExternalFindingSchema>;

export const CreateExternalFindingSchema = z.object({
  feedId: z.string().optional(),
  sourceRef: z.string().optional(),
  category: ExternalFeedCategorySchema,
  severity: RiskFindingSeveritySchema,
  title: z.string().min(1),
  description: z.string().optional(),
  affectedResource: z.string().optional(),
  recommendation: z.string().optional(),
  evidence: z.record(z.unknown()).optional(),
  sourceDate: z.number().int().optional(),
  departmentId: z.string().optional(),
});
export type CreateExternalFinding = z.infer<typeof CreateExternalFindingSchema>;
