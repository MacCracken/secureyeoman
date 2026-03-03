/**
 * Sandbox Artifact Scanning Types (Phase 116)
 *
 * Zod schemas for the artifact scanning & externalization gate.
 * All sandbox outputs pass through scanning before leaving the boundary.
 */

import { z } from 'zod';

// ─── Enums ──────────────────────────────────────────────────────────

export const ScanFindingSeveritySchema = z.enum(['info', 'low', 'medium', 'high', 'critical']);
export type ScanFindingSeverity = z.infer<typeof ScanFindingSeveritySchema>;

export const ScanVerdictSchema = z.enum(['pass', 'warn', 'quarantine', 'block']);
export type ScanVerdict = z.infer<typeof ScanVerdictSchema>;

export const ThreatClassificationSchema = z.enum([
  'benign',
  'suspicious',
  'likely_malicious',
  'malicious',
]);
export type ThreatClassification = z.infer<typeof ThreatClassificationSchema>;

export const KillChainStageSchema = z.enum([
  'reconnaissance',
  'weaponization',
  'delivery',
  'exploitation',
  'installation',
  'command_and_control',
  'actions_on_objectives',
]);
export type KillChainStage = z.infer<typeof KillChainStageSchema>;

export const EscalationTierSchema = z.enum([
  'tier1_log',
  'tier2_alert',
  'tier3_suspend',
  'tier4_revoke',
]);
export type EscalationTier = z.infer<typeof EscalationTierSchema>;

// ─── Findings ───────────────────────────────────────────────────────

export const ScanFindingSchema = z.object({
  id: z.string().uuid(),
  scanner: z.string().max(64),
  severity: ScanFindingSeveritySchema,
  category: z.string().max(128),
  message: z.string().max(1024),
  line: z.number().int().nonnegative().optional(),
  column: z.number().int().nonnegative().optional(),
  evidence: z.string().max(512).optional(),
  cwe: z.string().max(32).optional(),
  recommendation: z.string().max(512).optional(),
});
export type ScanFinding = z.infer<typeof ScanFindingSchema>;

// ─── Threat Assessment ──────────────────────────────────────────────

export const ThreatAssessmentSchema = z.object({
  classification: ThreatClassificationSchema,
  intentScore: z.number().min(0).max(1),
  killChainStages: z.array(KillChainStageSchema).default([]),
  matchedPatterns: z.array(z.string()).default([]),
  escalationTier: EscalationTierSchema,
  summary: z.string().max(1024).optional(),
});
export type ThreatAssessment = z.infer<typeof ThreatAssessmentSchema>;

// ─── Scan Result ────────────────────────────────────────────────────

export const ScanResultSchema = z.object({
  artifactId: z.string().uuid(),
  verdict: ScanVerdictSchema,
  findings: z.array(ScanFindingSchema).default([]),
  worstSeverity: ScanFindingSeveritySchema.default('info'),
  scanDurationMs: z.number().int().nonnegative().default(0),
  scannerVersions: z.record(z.string(), z.string()).default({}),
  threatAssessment: ThreatAssessmentSchema.optional(),
  scannedAt: z.number().int().positive(),
});
export type ScanResult = z.infer<typeof ScanResultSchema>;

// ─── Externalization Policy ─────────────────────────────────────────

export const ExternalizationPolicySchema = z.object({
  enabled: z.boolean().default(true),
  /** Minimum severity that triggers quarantine. */
  quarantineThreshold: ScanFindingSeveritySchema.default('high'),
  /** Minimum severity that triggers block (immediate rejection). */
  blockThreshold: ScanFindingSeveritySchema.default('critical'),
  /** Maximum number of findings before auto-quarantine regardless of severity. */
  maxFindingsBeforeQuarantine: z.number().int().positive().default(50),
  /** Intent score threshold for auto-quarantine (0.0–1.0). */
  intentScoreQuarantineThreshold: z.number().min(0).max(1).default(0.7),
  /** Maximum artifact size in bytes before scanning is skipped (with block). */
  maxArtifactSizeBytes: z.number().int().positive().default(52_428_800), // 50MB
  /** Enable redaction of secrets instead of blocking. */
  redactSecrets: z.boolean().default(true),
  /** Fail open on scanner errors (pass) vs fail closed (quarantine). */
  failOpen: z.boolean().default(false),
});
export type ExternalizationPolicy = z.infer<typeof ExternalizationPolicySchema>;

// ─── Quarantine ─────────────────────────────────────────────────────

export const QuarantineEntrySchema = z.object({
  id: z.string().uuid(),
  artifactId: z.string().uuid(),
  artifactType: z.string().max(64),
  sourceContext: z.string().max(256),
  personalityId: z.string().uuid().optional(),
  userId: z.string().optional(),
  scanResult: ScanResultSchema,
  status: z.enum(['quarantined', 'approved', 'released', 'deleted']),
  approvedBy: z.string().optional(),
  approvedAt: z.number().int().positive().optional(),
  createdAt: z.number().int().positive(),
});
export type QuarantineEntry = z.infer<typeof QuarantineEntrySchema>;

// ─── Scan History ───────────────────────────────────────────────────

export const ScanHistoryRowSchema = z.object({
  id: z.string().uuid(),
  artifactId: z.string().uuid(),
  artifactType: z.string().max(64),
  sourceContext: z.string().max(256),
  personalityId: z.string().uuid().optional(),
  userId: z.string().optional(),
  verdict: ScanVerdictSchema,
  findingCount: z.number().int().nonnegative().default(0),
  worstSeverity: ScanFindingSeveritySchema.default('info'),
  intentScore: z.number().min(0).max(1).optional(),
  scanDurationMs: z.number().int().nonnegative().default(0),
  findings: z.array(ScanFindingSchema).default([]),
  threatAssessment: ThreatAssessmentSchema.optional(),
  tenantId: z.string().optional(),
  createdAt: z.number().int().positive(),
});
export type ScanHistoryRow = z.infer<typeof ScanHistoryRowSchema>;
