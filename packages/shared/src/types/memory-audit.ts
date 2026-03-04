/**
 * Memory Audit Types — Phase 118
 *
 * Shared Zod schemas for memory audits, compression, and reorganization.
 */

import { z } from 'zod';

// ─── Enums ─────────────────────────────────────────────────────

export const MemoryAuditScopeSchema = z.enum(['daily', 'weekly', 'monthly']);
export type MemoryAuditScope = z.infer<typeof MemoryAuditScopeSchema>;

export const MemoryAuditStatusSchema = z.enum([
  'running',
  'completed',
  'failed',
  'pending_approval',
]);
export type MemoryAuditStatus = z.infer<typeof MemoryAuditStatusSchema>;

export const MemoryTransformTypeSchema = z.enum([
  'compressed',
  'merged',
  'reorganized',
  'promoted',
  'demoted',
]);
export type MemoryTransformType = z.infer<typeof MemoryTransformTypeSchema>;

// ─── Snapshot & Summary Types ──────────────────────────────────

export const AuditSnapshotSchema = z.object({
  totalMemories: z.number(),
  totalKnowledge: z.number(),
  byType: z.record(z.string(), z.number()),
  avgImportance: z.number(),
  oldestMemoryAge: z.number().optional(),
  expiringCount: z.number().optional(),
});
export type AuditSnapshot = z.infer<typeof AuditSnapshotSchema>;

export const CompressionSummarySchema = z.object({
  candidatesFound: z.number(),
  memoriesCompressed: z.number(),
  memoriesArchived: z.number(),
  compressionRatio: z.number(),
  qualityChecksPassed: z.number(),
  qualityChecksFailed: z.number(),
  errors: z.array(z.string()).default([]),
});
export type CompressionSummary = z.infer<typeof CompressionSummarySchema>;

export const ReorganizationSummarySchema = z.object({
  promoted: z.number(),
  demoted: z.number(),
  topicsMerged: z.number(),
  topicsSplit: z.number(),
  importanceRecalibrated: z.number(),
  coherenceIssuesFound: z.number(),
  coherenceIssuesFixed: z.number(),
  errors: z.array(z.string()).default([]),
});
export type ReorganizationSummary = z.infer<typeof ReorganizationSummarySchema>;

export const MaintenanceSummarySchema = z.object({
  expiredPruned: z.number(),
  decayApplied: z.number(),
  duplicatesRemoved: z.number(),
});
export type MaintenanceSummary = z.infer<typeof MaintenanceSummarySchema>;

// ─── Report & Archive ──────────────────────────────────────────

export const MemoryAuditReportSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  personalityId: z.string().nullable(),
  scope: MemoryAuditScopeSchema,
  startedAt: z.number(),
  completedAt: z.number().nullable(),
  preSnapshot: AuditSnapshotSchema.nullable(),
  postSnapshot: AuditSnapshotSchema.nullable(),
  compressionSummary: CompressionSummarySchema.nullable(),
  reorganizationSummary: ReorganizationSummarySchema.nullable(),
  maintenanceSummary: MaintenanceSummarySchema.nullable(),
  status: MemoryAuditStatusSchema,
  approvedBy: z.string().nullable(),
  approvedAt: z.number().nullable(),
  error: z.string().nullable(),
});
export type MemoryAuditReport = z.infer<typeof MemoryAuditReportSchema>;

export const MemoryArchiveEntrySchema = z.object({
  id: z.string().uuid(),
  originalMemoryId: z.string().uuid(),
  originalContent: z.string(),
  originalImportance: z.number(),
  originalContext: z.record(z.string(), z.unknown()).default({}),
  transformType: MemoryTransformTypeSchema,
  auditReportId: z.string().uuid().nullable(),
  archivedAt: z.number(),
  tenantId: z.string(),
});
export type MemoryArchiveEntry = z.infer<typeof MemoryArchiveEntrySchema>;

// ─── Policy ────────────────────────────────────────────────────

export const MemoryAuditPolicySchema = z
  .object({
    enabled: z.boolean().default(false),
    dailySchedule: z.string().default('30 3 * * *'),
    weeklySchedule: z.string().default('0 4 * * 0'),
    monthlySchedule: z.string().default('0 5 1 * *'),
    compressionEnabled: z.boolean().default(true),
    reorganizationEnabled: z.boolean().default(true),
    requireApproval: z.boolean().default(false),
    retainOriginals: z.boolean().default(true),
    archivalAgeDays: z.number().int().min(1).max(365).default(30),
    compressionThreshold: z.number().min(0).max(1).default(0.85),
    maxMemoriesPerPersonality: z.number().int().min(100).max(100000).default(10000),
    model: z.string().nullable().default(null),
  })
  .default({});
export type MemoryAuditPolicy = z.infer<typeof MemoryAuditPolicySchema>;

// ─── Health Metrics ────────────────────────────────────────────

export const MemoryHealthMetricsSchema = z.object({
  healthScore: z.number().min(0).max(100),
  totalMemories: z.number(),
  totalKnowledge: z.number(),
  avgImportance: z.number(),
  expiringWithin7Days: z.number(),
  lowImportanceRatio: z.number(),
  duplicateEstimate: z.number(),
  lastAuditAt: z.number().nullable(),
  lastAuditScope: MemoryAuditScopeSchema.nullable(),
  compressionSavings: z.number(),
});
export type MemoryHealthMetrics = z.infer<typeof MemoryHealthMetricsSchema>;
