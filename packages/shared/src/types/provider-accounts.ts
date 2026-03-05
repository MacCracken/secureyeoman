/**
 * Provider Account Types (Phase 112)
 *
 * Multi-account AI provider key management with per-account cost tracking.
 */

import { z } from 'zod';

// ─── Provider Account ──────────────────────────────────────────

export const ProviderAccountStatusSchema = z.enum([
  'active',
  'invalid',
  'rate_limited',
  'disabled',
]);
export type ProviderAccountStatus = z.infer<typeof ProviderAccountStatusSchema>;

export const ProviderAccountSchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  label: z.string().min(1).max(100),
  /** Name of the secret in SecretsManager (never the raw key) */
  secretName: z.string().min(1),
  isDefault: z.boolean(),
  accountInfo: z.record(z.string(), z.unknown()).nullable().default(null),
  status: ProviderAccountStatusSchema.default('active'),
  lastValidatedAt: z.number().nullable().default(null),
  baseUrl: z.string().url().nullable().default(null),
  tenantId: z.string().nullable().default(null),
  createdBy: z.string().nullable().default(null),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type ProviderAccount = z.infer<typeof ProviderAccountSchema>;

export const ProviderAccountCreateSchema = z.object({
  provider: z.string().min(1),
  label: z.string().min(1).max(100),
  apiKey: z.string().min(1),
  isDefault: z.boolean().default(false),
  baseUrl: z.string().url().nullable().optional(),
  tenantId: z.string().nullable().optional(),
});
export type ProviderAccountCreate = z.infer<typeof ProviderAccountCreateSchema>;

export const ProviderAccountUpdateSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  baseUrl: z.string().url().nullable().optional(),
  status: ProviderAccountStatusSchema.optional(),
});
export type ProviderAccountUpdate = z.infer<typeof ProviderAccountUpdateSchema>;

// ─── Cost Records ──────────────────────────────────────────────

export const AccountCostRecordSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  personalityId: z.string().nullable().default(null),
  model: z.string().min(1),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  totalTokens: z.number().int().min(0),
  costUsd: z.number().min(0),
  requestId: z.string().nullable().default(null),
  recordedAt: z.number(),
  tenantId: z.string().nullable().default(null),
});
export type AccountCostRecord = z.infer<typeof AccountCostRecordSchema>;

export const AccountCostSummarySchema = z.object({
  accountId: z.string(),
  provider: z.string(),
  label: z.string(),
  totalCostUsd: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  totalRequests: z.number(),
});
export type AccountCostSummary = z.infer<typeof AccountCostSummarySchema>;

export const CostBreakdownGroupBySchema = z.enum(['account', 'provider', 'personality', 'model']);
export type CostBreakdownGroupBy = z.infer<typeof CostBreakdownGroupBySchema>;

export const CostTrendPointSchema = z.object({
  date: z.string(),
  costUsd: z.number(),
  requests: z.number(),
});
export type CostTrendPoint = z.infer<typeof CostTrendPointSchema>;
