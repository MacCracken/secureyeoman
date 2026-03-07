/**
 * Content Guardrail Types — Phase 95
 *
 * Output-side content policy enforcement: PII detection/redaction,
 * topic restrictions, toxicity filtering, custom block lists,
 * guardrail audit trail, and grounding checks.
 */

import { z } from 'zod';

// ── Config schemas ────────────────────────────────────────────────────

export const ContentGuardrailConfigSchema = z.object({
  enabled: z.boolean().default(true),
  /** PII detection mode: disabled = off, detect_only = flag without modifying, redact = replace with placeholders */
  piiMode: z.enum(['disabled', 'detect_only', 'redact']).default('redact'),
  /** Toxicity classification */
  toxicityEnabled: z.boolean().default(true),
  toxicityMode: z.enum(['block', 'warn', 'audit_only']).default('block'),
  toxicityClassifierUrl: z.string().optional(),
  toxicityThreshold: z.number().min(0).max(1).default(0.7),
  /** Custom block list — plain strings or regex: prefixed patterns */
  blockList: z.array(z.string()).default([]),
  /** Topics to restrict in responses — checked via embeddings or keyword fallback */
  blockedTopics: z.array(z.string()).default([]),
  /** Topic similarity threshold for embedding-based check */
  topicThreshold: z.number().min(0).max(1).default(0.75),
  /** Grounding verification against knowledge base */
  groundingEnabled: z.boolean().default(true),
  groundingMode: z.enum(['flag', 'block']).default('block'),
});

export type ContentGuardrailConfig = z.infer<typeof ContentGuardrailConfigSchema>;

/** Per-personality overrides (merged on top of global config) */
export const ContentGuardrailPersonalityConfigSchema = z.object({
  /** Additional block list entries for this personality */
  blockListAdditions: z.array(z.string()).default([]),
  /** Additional blocked topics for this personality */
  blockedTopicAdditions: z.array(z.string()).default([]),
  /** Override PII mode for this personality */
  piiMode: z.enum(['disabled', 'detect_only', 'redact']).optional(),
});

export type ContentGuardrailPersonalityConfig = z.infer<
  typeof ContentGuardrailPersonalityConfigSchema
>;

// ── Result types ──────────────────────────────────────────────────────

export type GuardrailAction = 'block' | 'warn' | 'redact' | 'flag';

export interface GuardrailFinding {
  type: 'pii' | 'block_list' | 'topic' | 'toxicity' | 'grounding';
  action: GuardrailAction;
  detail: string;
  /** SHA-256 hash of the triggering text segment */
  contentHash: string;
}

export interface GuardrailContext {
  source: string;
  personalityId?: string;
  conversationId?: string;
}

export interface GuardrailSyncResult {
  passed: boolean;
  findings: GuardrailFinding[];
  /** Modified text (only differs from input when PII redaction or block list replacement applied) */
  text: string;
}

export interface GuardrailAsyncResult {
  passed: boolean;
  findings: GuardrailFinding[];
  text: string;
}

export interface GuardrailResult {
  passed: boolean;
  findings: GuardrailFinding[];
  text: string;
}
