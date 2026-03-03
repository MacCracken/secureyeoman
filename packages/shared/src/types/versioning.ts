/**
 * Versioning Types (Phase 114)
 *
 * Git-like version control for workflows and personality configurations.
 * Every save creates an immutable snapshot; versions can be tagged, compared, and rolled back.
 */

import { z } from 'zod';

// ─── Version Tag ───────────────────────────────────────────────────────────

/** Date-based version tag: YYYY.M.D or YYYY.M.D-N for same-day increments */
export const VersionTagSchema = z
  .string()
  .regex(/^\d{4}\.\d{1,2}\.\d{1,2}(-\d+)?$/, 'Version tag must match YYYY.M.D or YYYY.M.D-N');

export type VersionTag = z.infer<typeof VersionTagSchema>;

// ─── Personality Version ───────────────────────────────────────────────────

export const PersonalityVersionSchema = z.object({
  id: z.string(),
  personalityId: z.string(),
  versionTag: z.string().nullable(),
  snapshot: z.record(z.unknown()),
  snapshotMd: z.string(),
  diffSummary: z.string().nullable(),
  changedFields: z.array(z.string()),
  author: z.string(),
  createdAt: z.number(),
});

export type PersonalityVersion = z.infer<typeof PersonalityVersionSchema>;

// ─── Workflow Version ──────────────────────────────────────────────────────

export const WorkflowVersionSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  versionTag: z.string().nullable(),
  snapshot: z.record(z.unknown()),
  diffSummary: z.string().nullable(),
  changedFields: z.array(z.string()),
  author: z.string(),
  createdAt: z.number(),
});

export type WorkflowVersion = z.infer<typeof WorkflowVersionSchema>;

// ─── Drift Summary ─────────────────────────────────────────────────────────

export const DriftSummarySchema = z.object({
  lastTaggedVersion: z.string().nullable(),
  lastTaggedAt: z.number().nullable(),
  uncommittedChanges: z.number(),
  changedFields: z.array(z.string()),
  diffSummary: z.string(),
});

export type DriftSummary = z.infer<typeof DriftSummarySchema>;
