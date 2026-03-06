/**
 * Infrastructure-as-Code Types — Git-backed IaC template management
 *
 * Defines the type system for managing Terraform, CloudFormation, Pulumi,
 * Helm, and other IaC templates in a Git repository with versioning,
 * validation, and deployment tracking.
 */

import { z } from 'zod';

// ─── IaC Provider / Tool ────────────────────────────────────────────────────

export const IacToolSchema = z.enum([
  'terraform',
  'cloudformation',
  'pulumi',
  'helm',
  'bicep',
  'ansible',
  'kubernetes',
  'cdk',
]);
export type IacTool = z.infer<typeof IacToolSchema>;

// ─── Cloud Provider ─────────────────────────────────────────────────────────

export const IacCloudProviderSchema = z.enum([
  'aws',
  'azure',
  'gcp',
  'multi_cloud',
  'on_premises',
  'generic',
]);
export type IacCloudProvider = z.infer<typeof IacCloudProviderSchema>;

// ─── Template Category ──────────────────────────────────────────────────────

export const IacCategorySchema = z.enum([
  'networking',
  'compute',
  'storage',
  'database',
  'security',
  'identity',
  'monitoring',
  'compliance',
  'container',
  'serverless',
  'cicd',
  'other',
]);
export type IacCategory = z.infer<typeof IacCategorySchema>;

// ─── Template File ──────────────────────────────────────────────────────────

export const IacTemplateFileSchema = z.object({
  /** Relative path within the template (e.g. "main.tf", "variables.tf") */
  path: z.string().min(1),
  /** File content */
  content: z.string(),
  /** SHA-256 hash */
  sha256: z.string().min(64).max(64),
});
export type IacTemplateFile = z.infer<typeof IacTemplateFileSchema>;

// ─── Template Variable ──────────────────────────────────────────────────────

export const IacVariableSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  type: z.string().default('string'),
  default: z.unknown().optional(),
  required: z.boolean().default(true),
  sensitive: z.boolean().default(false),
});
export type IacVariable = z.infer<typeof IacVariableSchema>;

// ─── IaC Template ───────────────────────────────────────────────────────────

export const IacTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().default(''),
  tool: IacToolSchema,
  cloudProvider: IacCloudProviderSchema,
  category: IacCategorySchema,
  version: z.string().default('0.0.0'),
  /** Files composing this template */
  files: z.array(IacTemplateFileSchema).default([]),
  /** Input variables / parameters */
  variables: z.array(IacVariableSchema).default([]),
  /** Tags for search/filtering */
  tags: z.array(z.string()).default([]),
  /** Optional link to SRA control IDs this template implements */
  sraControlIds: z.array(z.string()).default([]),
  /** Optional link to policy-as-code bundle this template enforces */
  policyBundleName: z.string().optional(),
  /** Git commit SHA */
  commitSha: z.string().default(''),
  /** Git ref (branch/tag) */
  ref: z.string().default('main'),
  compiledAt: z.number().default(0),
  valid: z.boolean().default(false),
  validationErrors: z.array(z.string()).default([]),
  /** Whether this is a built-in template */
  isBuiltin: z.boolean().default(false),
  tenantId: z.string().default('default'),
});
export type IacTemplate = z.infer<typeof IacTemplateSchema>;

// ─── Validation Result ──────────────────────────────────────────────────────

export const IacValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  tool: IacToolSchema,
  fileCount: z.number().default(0),
  durationMs: z.number().default(0),
});
export type IacValidationResult = z.infer<typeof IacValidationResultSchema>;

// ─── Template Deployment ────────────────────────────────────────────────────

export const IacDeploymentStatusSchema = z.enum([
  'pending',
  'planning',
  'applying',
  'applied',
  'failed',
  'destroyed',
  'rolled_back',
]);
export type IacDeploymentStatus = z.infer<typeof IacDeploymentStatusSchema>;

export const IacDeploymentSchema = z.object({
  id: z.string().min(1),
  templateId: z.string().min(1),
  templateName: z.string().min(1),
  templateVersion: z.string(),
  status: IacDeploymentStatusSchema,
  /** Variable values used for this deployment (sensitive values redacted) */
  variables: z.record(z.unknown()).default({}),
  /** Plan output (terraform plan, cfn changeset, etc.) */
  planOutput: z.string().default(''),
  /** Apply output */
  applyOutput: z.string().default(''),
  /** Errors */
  errors: z.array(z.string()).default([]),
  /** Resources created/modified/destroyed counts */
  resourcesCreated: z.number().default(0),
  resourcesModified: z.number().default(0),
  resourcesDestroyed: z.number().default(0),
  deployedBy: z.string().default('system'),
  deployedAt: z.number().default(0),
  /** Previous deployment for rollback chain */
  previousDeploymentId: z.string().optional(),
  tenantId: z.string().default('default'),
});
export type IacDeployment = z.infer<typeof IacDeploymentSchema>;

// ─── IaC Repository Config ─────────────────────────────────────────────────

export const IacRepoConfigSchema = z
  .object({
    /** Local path to the IaC git repository */
    repoPath: z.string().default(''),
    /** Remote URL for cloning */
    remoteUrl: z.string().default(''),
    /** Branch to track */
    branch: z.string().default('main'),
    /** Sub-directory within the repo containing templates */
    templateDir: z.string().default('templates'),
    /** Auto-sync interval in seconds (0 = disabled) */
    syncIntervalSec: z.number().int().min(0).default(0),
  })
  .default({});
export type IacRepoConfig = z.infer<typeof IacRepoConfigSchema>;

// ─── IaC Config ─────────────────────────────────────────────────────────────

export const IacConfigSchema = z
  .object({
    /** Enable IaC subsystem */
    enabled: z.boolean().default(false),
    /** Git repository configuration */
    repo: IacRepoConfigSchema,
    /** Maximum template files */
    maxTemplateFiles: z.number().int().min(1).default(200),
    /** Maximum single file size in bytes */
    maxFileSizeBytes: z.number().int().min(1).default(512_000),
    /** Retain this many deployment records per template */
    retainDeployments: z.number().int().min(1).default(100),
    /** Enable built-in SRA remediation templates */
    enableBuiltinTemplates: z.boolean().default(true),
  })
  .default({});
export type IacConfig = z.infer<typeof IacConfigSchema>;
