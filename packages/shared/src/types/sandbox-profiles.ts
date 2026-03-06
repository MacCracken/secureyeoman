/**
 * Sandbox Profiles — Named sandbox configurations for different environments.
 *
 * Presets provide sensible defaults for dev, staging, prod, and high-security
 * environments. Custom profiles allow per-deployment overrides.
 */

import { z } from 'zod';

export const SandboxProfileNameSchema = z.enum([
  'dev',
  'staging',
  'prod',
  'high-security',
  'custom',
]);
export type SandboxProfileName = z.infer<typeof SandboxProfileNameSchema>;

export const SandboxProfileSchema = z.object({
  name: SandboxProfileNameSchema,
  label: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  enabled: z.boolean().default(true),
  technology: z.enum(['auto', 'seccomp', 'landlock', 'gvisor', 'wasm', 'sgx', 'sev', 'none']).default('auto'),
  filesystem: z.object({
    allowedReadPaths: z.array(z.string()).default([]),
    allowedWritePaths: z.array(z.string()).default([]),
    allowedExecPaths: z.array(z.string()).default([]),
  }).default({}),
  resources: z.object({
    maxMemoryMb: z.number().int().positive().max(16384).default(1024),
    maxCpuPercent: z.number().int().positive().max(100).default(50),
    maxFileSizeMb: z.number().int().positive().max(10240).default(100),
    timeoutMs: z.number().int().positive().max(600000).default(30000),
  }).default({}),
  network: z.object({
    allowed: z.boolean().default(true),
    allowedHosts: z.array(z.string()).default([]),
    allowedPorts: z.array(z.number().int().min(1).max(65535)).default([]),
  }).default({}),
  credentialProxy: z.object({
    required: z.boolean().default(false),
    allowedHosts: z.array(z.string()).default([]),
  }).default({}),
  toolRestrictions: z.object({
    allowlist: z.array(z.string()).default([]),
    blocklist: z.array(z.string()).default([]),
  }).default({}),
  isBuiltin: z.boolean().default(false),
  createdAt: z.number().default(0),
  updatedAt: z.number().default(0),
  tenantId: z.string().default('default'),
});
export type SandboxProfile = z.infer<typeof SandboxProfileSchema>;

export const SandboxProfileCreateSchema = SandboxProfileSchema.omit({
  isBuiltin: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.literal('custom'),
});
export type SandboxProfileCreate = z.infer<typeof SandboxProfileCreateSchema>;
