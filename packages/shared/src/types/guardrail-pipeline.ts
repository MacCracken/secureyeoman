/**
 * Guardrail Pipeline Types — Phase 143
 *
 * Extensible filter chain for input/output content enforcement.
 * Wraps existing guards (ContentGuardrail, ResponseGuard, ToolOutputScanner)
 * and allows user-defined TypeScript filters to be inserted at any priority.
 */

import { z } from 'zod';

// ── Filter finding ───────────────────────────────────────────────────

export interface GuardrailFilterFinding {
  filterId: string;
  type: string;
  action: 'block' | 'warn' | 'redact' | 'flag';
  detail: string;
  contentHash?: string;
}

// ── Filter context ───────────────────────────────────────────────────

export interface GuardrailFilterContext {
  source: string;
  direction: 'input' | 'output';
  personalityId?: string;
  conversationId?: string;
  dryRun: boolean;
  metadata?: Record<string, unknown>;
}

// ── Filter result ────────────────────────────────────────────────────

export interface GuardrailFilterResult {
  passed: boolean;
  text: string;
  findings: GuardrailFilterFinding[];
}

// ── Filter interface (plugin contract) ───────────────────────────────

export interface GuardrailFilter {
  /** Unique filter identifier (e.g. 'builtin:content-guardrail', 'custom:profanity-filter') */
  id: string;
  /** Display name */
  name: string;
  /** Execution priority — lower values run first. Builtins use 100–500. */
  priority: number;
  /** Whether this filter is enabled */
  enabled: boolean;
  /** Input hook — runs before LLM call. Return null to skip. */
  onInput?(text: string, ctx: GuardrailFilterContext): Promise<GuardrailFilterResult>;
  /** Output hook — runs after LLM response. Return null to skip. */
  onOutput?(text: string, ctx: GuardrailFilterContext): Promise<GuardrailFilterResult>;
  /** Optional cleanup when filter is unloaded */
  dispose?(): void;
}

// ── Pipeline result ──────────────────────────────────────────────────

export interface GuardrailPipelineResult {
  passed: boolean;
  text: string;
  findings: GuardrailFilterFinding[];
  /** Per-filter execution metrics (only when metrics are enabled) */
  filterMetrics?: FilterExecutionMetric[];
}

export interface FilterExecutionMetric {
  filterId: string;
  filterName: string;
  direction: 'input' | 'output';
  durationMs: number;
  findingCount: number;
  action: 'passed' | 'blocked' | 'skipped' | 'error';
}

// ── Pipeline config ──────────────────────────────────────────────────

export const GuardrailPipelineConfigSchema = z.object({
  /** Master switch for the pipeline */
  enabled: z.boolean().default(false),
  /** Dry-run mode — filters execute and report findings but never block */
  dryRun: z.boolean().default(false),
  /** Collect per-filter execution metrics */
  metricsEnabled: z.boolean().default(true),
  /** Directory for user-written custom filter modules (relative to CWD or absolute) */
  customFilterDir: z.string().default('guardrails'),
  /** Auto-load custom filters from customFilterDir on startup */
  autoLoadCustomFilters: z.boolean().default(true),
  /** Disabled filter IDs — skip these even if registered */
  disabledFilters: z.array(z.string()).default([]),
});

export type GuardrailPipelineConfig = z.infer<typeof GuardrailPipelineConfigSchema>;

// ── Per-personality pipeline overrides ────────────────────────────────

export const GuardrailPipelinePersonalityConfigSchema = z.object({
  /** Override dry-run for this personality */
  dryRun: z.boolean().optional(),
  /** Disable specific filters for this personality */
  disabledFilters: z.array(z.string()).default([]),
  /** Enable specific filters only for this personality (allowlist — overrides global) */
  enabledFilters: z.array(z.string()).optional(),
  /** Per-filter config overrides (filterId → arbitrary config) */
  filterConfig: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
});

export type GuardrailPipelinePersonalityConfig = z.infer<
  typeof GuardrailPipelinePersonalityConfigSchema
>;

// ── Aggregate metrics ────────────────────────────────────────────────

export interface GuardrailMetricsSnapshot {
  filters: FilterMetricsSummary[];
  period: { from: number; to: number };
}

export interface FilterMetricsSummary {
  filterId: string;
  filterName: string;
  totalExecutions: number;
  totalBlocks: number;
  totalWarnings: number;
  totalFindings: number;
  avgDurationMs: number;
  p95DurationMs: number;
  errorCount: number;
  activationRate: number;
}

// ── Custom filter module export shape ────────────────────────────────

/** Shape that a custom filter module must default-export */
export interface GuardrailFilterModule {
  createFilter(config?: Record<string, unknown>): GuardrailFilter;
}
