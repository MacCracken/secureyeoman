/**
 * Inline Citations & Grounding — Shared Types (Phase 110)
 *
 * Source attribution, groundedness enforcement, and document provenance
 * scoring types shared between core, dashboard, and MCP packages.
 */

import { z } from 'zod';

// ── Source References ───────────────────────────────────────────

export const SourceReferenceTypeSchema = z.enum([
  'memory',
  'knowledge',
  'document_chunk',
  'web_search',
]);
export type SourceReferenceType = z.infer<typeof SourceReferenceTypeSchema>;

export const SourceReferenceSchema = z.object({
  /** 1-based citation index displayed as [1], [2], etc. */
  index: z.number().int().min(1),
  type: SourceReferenceTypeSchema,
  /** ID of the underlying record (memory id, knowledge id, etc.) */
  sourceId: z.string(),
  /** Excerpt or snippet used as context */
  content: z.string(),
  /** Human-readable label (e.g. "Document Title [chunk 3]") */
  sourceLabel: z.string(),
  /** Knowledge base document ID (when type is document_chunk) */
  documentId: z.string().optional(),
  /** Document title (when type is document_chunk) */
  documentTitle: z.string().optional(),
  /** Retrieval confidence / similarity score */
  confidence: z.number().min(0).max(1).optional(),
  /** Trust score from document provenance (0.0–1.0) */
  trustScore: z.number().min(0).max(1).optional(),
  /** URL for web search sources */
  url: z.string().url().optional(),
});
export type SourceReference = z.infer<typeof SourceReferenceSchema>;

// ── Citation Metadata ───────────────────────────────────────────

export const GroundednessMode = z.enum([
  'off',
  'annotate_only',
  'block_unverified',
  'strip_unverified',
]);
export type GroundednessMode = z.infer<typeof GroundednessMode>;

export const CitationMetaSchema = z.object({
  sources: z.array(SourceReferenceSchema),
  citationsEnabled: z.boolean(),
  groundednessMode: GroundednessMode.optional(),
  groundingScore: z.number().min(0).max(1).optional(),
});
export type CitationMeta = z.infer<typeof CitationMetaSchema>;

// ── Provenance Scoring ──────────────────────────────────────────

export const ProvenanceScoresSchema = z.object({
  /** Credibility of the source (e.g., peer-reviewed, .gov domain) */
  authority: z.number().min(0).max(1),
  /** Timeliness — how recent is the information? */
  currency: z.number().min(0).max(1),
  /** Neutrality — free from bias? */
  objectivity: z.number().min(0).max(1),
  /** Factual correctness verifiability */
  accuracy: z.number().min(0).max(1),
  /** Rigor of underlying research methodology */
  methodology: z.number().min(0).max(1),
  /** Breadth of topic coverage */
  coverage: z.number().min(0).max(1),
  /** Consistency and reproducibility */
  reliability: z.number().min(0).max(1),
  /** Chain-of-custody clarity */
  provenance: z.number().min(0).max(1),
});
export type ProvenanceScores = z.infer<typeof ProvenanceScoresSchema>;

/** Weights for computing composite trust score from provenance dimensions. */
export const PROVENANCE_WEIGHTS: Record<keyof ProvenanceScores, number> = {
  authority: 0.2,
  currency: 0.1,
  objectivity: 0.1,
  accuracy: 0.2,
  methodology: 0.1,
  coverage: 0.05,
  reliability: 0.15,
  provenance: 0.1,
};

// ── Citation Feedback ───────────────────────────────────────────

export const CitationFeedbackSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  citationIndex: z.number().int().min(1),
  sourceId: z.string(),
  relevant: z.boolean(),
  createdAt: z.number(),
});
export type CitationFeedback = z.infer<typeof CitationFeedbackSchema>;

// ── Grounding Check Result ──────────────────────────────────────

export interface GroundingCheckResult {
  /** Overall grounding score (0.0–1.0) */
  score: number;
  /** Number of sentences checked */
  totalSentences: number;
  /** Number of sentences with adequate grounding */
  groundedSentences: number;
  /** Modified content (only differs from input when mode is annotate_only or strip_unverified) */
  content: string;
  /** Whether the response was blocked (block_unverified mode with low score) */
  blocked: boolean;
}
