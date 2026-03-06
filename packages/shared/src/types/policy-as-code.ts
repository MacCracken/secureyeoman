/**
 * Policy-as-Code Types — Git-backed OPA/CEL policy bundles
 *
 * Defines the type system for managing policies as code in a Git repository
 * with PR-based review workflows, bundle compilation, and deployment tracking.
 */

import { z } from 'zod';

// ─── Policy Language ─────────────────────────────────────────────────────────

export const PolicyLanguageSchema = z.enum(['rego', 'cel']);
export type PolicyLanguage = z.infer<typeof PolicyLanguageSchema>;

// ─── Policy Enforcement Mode ────────────────────────────────────────────────

export const PolicyEnforcementSchema = z.enum(['warn', 'block', 'audit']);
export type PolicyEnforcement = z.infer<typeof PolicyEnforcementSchema>;

// ─── Policy File ─────────────────────────────────────────────────────────────

export const PolicyFileSchema = z.object({
  /** Relative path within the bundle (e.g. "access/require-mfa.rego") */
  path: z.string().min(1),
  /** Policy language */
  language: PolicyLanguageSchema,
  /** Policy source code */
  source: z.string().min(1),
  /** SHA-256 hash of the source */
  sha256: z.string().min(64).max(64),
});
export type PolicyFile = z.infer<typeof PolicyFileSchema>;

// ─── Bundle Metadata ─────────────────────────────────────────────────────────

export const BundleMetadataSchema = z.object({
  /** Unique bundle name (e.g. "security-baseline") */
  name: z.string().min(1).max(128),
  /** Semver or date-based version */
  version: z.string().min(1).max(64),
  description: z.string().default(''),
  /** Bundle author or team */
  author: z.string().default(''),
  /** Tags for categorization */
  tags: z.array(z.string()).default([]),
  /** Default enforcement mode for policies in this bundle */
  enforcement: PolicyEnforcementSchema.default('warn'),
});
export type BundleMetadata = z.infer<typeof BundleMetadataSchema>;

// ─── Policy Bundle ──────────────────────────────────────────────────────────

export const PolicyBundleSchema = z.object({
  id: z.string().min(1),
  metadata: BundleMetadataSchema,
  /** Policy files in this bundle */
  files: z.array(PolicyFileSchema).default([]),
  /** Git commit SHA this bundle was compiled from */
  commitSha: z.string().default(''),
  /** Git branch or tag reference */
  ref: z.string().default('main'),
  /** Compilation timestamp (epoch ms) */
  compiledAt: z.number().default(0),
  /** Whether bundle passed validation */
  valid: z.boolean().default(false),
  /** Validation errors, if any */
  validationErrors: z.array(z.string()).default([]),
});
export type PolicyBundle = z.infer<typeof PolicyBundleSchema>;

// ─── Bundle Status ──────────────────────────────────────────────────────────

export const BundleStatusSchema = z.enum([
  'draft',
  'validating',
  'valid',
  'invalid',
  'deployed',
  'superseded',
  'rolled_back',
]);
export type BundleStatus = z.infer<typeof BundleStatusSchema>;

// ─── Deployment Record ──────────────────────────────────────────────────────

export const PolicyDeploymentSchema = z.object({
  id: z.string().min(1),
  bundleId: z.string().min(1),
  bundleName: z.string().min(1),
  bundleVersion: z.string().min(1),
  status: BundleStatusSchema,
  /** Who triggered the deployment */
  deployedBy: z.string().default('system'),
  /** PR number that approved this deployment, if any */
  prNumber: z.number().optional(),
  /** PR URL for audit trail */
  prUrl: z.string().optional(),
  /** Git commit SHA */
  commitSha: z.string().default(''),
  /** Number of policies deployed */
  policyCount: z.number().default(0),
  /** Number of policies that failed OPA upload */
  errorCount: z.number().default(0),
  /** Error details */
  errors: z.array(z.string()).default([]),
  deployedAt: z.number().default(0),
  /** Previous deployment ID (for rollback chain) */
  previousDeploymentId: z.string().optional(),
  tenantId: z.string().default('default'),
});
export type PolicyDeployment = z.infer<typeof PolicyDeploymentSchema>;

// ─── Policy Evaluation Request ──────────────────────────────────────────────

export const PolicyEvalRequestSchema = z.object({
  /** OPA data path or CEL expression ID */
  policyId: z.string().min(1),
  /** Input context for evaluation */
  input: z.record(z.unknown()),
  /** Override enforcement for this evaluation */
  enforcement: PolicyEnforcementSchema.optional(),
});
export type PolicyEvalRequest = z.infer<typeof PolicyEvalRequestSchema>;

// ─── Policy Evaluation Result ───────────────────────────────────────────────

export const PolicyEvalResultSchema = z.object({
  policyId: z.string(),
  /** Whether the policy allows the action */
  allowed: z.boolean(),
  /** Enforcement mode applied */
  enforcement: PolicyEnforcementSchema,
  /** Human-readable reason */
  reason: z.string().default(''),
  /** Evaluation duration in ms */
  durationMs: z.number().default(0),
  /** Which engine evaluated (opa | cel | local) */
  engine: z.enum(['opa', 'cel', 'local']),
  evaluatedAt: z.number().default(0),
});
export type PolicyEvalResult = z.infer<typeof PolicyEvalResultSchema>;

// ─── Git Repository Config ─────────────────────────────────────────────────

export const PolicyRepoConfigSchema = z
  .object({
    /** Local path to the policy git repository */
    repoPath: z.string().default(''),
    /** Remote URL for cloning (optional — can use existing local repo) */
    remoteUrl: z.string().default(''),
    /** Branch to track for auto-sync */
    branch: z.string().default('main'),
    /** Sub-directory within the repo containing policy bundles */
    bundleDir: z.string().default('bundles'),
    /** Auto-sync interval in seconds (0 = disabled) */
    syncIntervalSec: z.number().int().min(0).default(0),
    /** Require PR approval before deploying (recommended) */
    requirePrApproval: z.boolean().default(true),
  })
  .default({});
export type PolicyRepoConfig = z.infer<typeof PolicyRepoConfigSchema>;

// ─── Policy-as-Code Config ─────────────────────────────────────────────────

export const PolicyAsCodeConfigSchema = z
  .object({
    /** Enable policy-as-code subsystem */
    enabled: z.boolean().default(false),
    /** Git repository configuration */
    repo: PolicyRepoConfigSchema,
    /** Maximum bundle size in files */
    maxBundleFiles: z.number().int().min(1).default(500),
    /** Maximum single policy file size in bytes */
    maxFileSizeBytes: z.number().int().min(1).default(256_000),
    /** Retain this many deployment records per bundle */
    retainDeployments: z.number().int().min(1).default(50),
  })
  .default({});
export type PolicyAsCodeConfig = z.infer<typeof PolicyAsCodeConfigSchema>;
