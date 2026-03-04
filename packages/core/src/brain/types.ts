/**
 * Brain Module — Internal Types
 *
 * Re-exports shared types and defines internal interfaces.
 */

export type { Skill, SkillCreate, SkillUpdate, Tool, ProvenanceScores } from '@secureyeoman/shared';
import type { ProvenanceScores } from '@secureyeoman/shared';

import type { AuditChain } from '../logging/audit-chain.js';
import type { SecureLogger } from '../logging/logger.js';
import type { AuditQueryOptions, AuditQueryResult } from '../logging/sqlite-storage.js';

export interface AuditStorage {
  queryEntries(opts: AuditQueryOptions): Promise<AuditQueryResult>;
  searchFullText(
    query: string,
    opts?: { limit?: number; offset?: number }
  ): Promise<AuditQueryResult>;
}

export interface Memory {
  id: string;
  /** Personality this memory belongs to, or null for shared/global memories. */
  personalityId: string | null;
  type: MemoryType;
  content: string;
  source: string;
  context: Record<string, string>;
  importance: number;
  accessCount: number;
  lastAccessedAt: number | null;
  expiresAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export type MemoryType = 'episodic' | 'semantic' | 'procedural' | 'preference';

export interface MemoryCreate {
  type: MemoryType;
  content: string;
  source: string;
  context?: Record<string, string>;
  importance?: number;
  expiresAt?: number | null;
}

export interface MemoryQuery {
  type?: MemoryType;
  source?: string;
  context?: Record<string, string>;
  minImportance?: number;
  limit?: number;
  search?: string;
  sortDirection?: 'asc' | 'desc';
  offset?: number;
  /** When set, returns only memories scoped to this personality OR unscoped (NULL) entries. */
  personalityId?: string;
}

export interface KnowledgeEntry {
  id: string;
  /** Personality this knowledge entry belongs to, or null for shared/global entries. */
  personalityId: string | null;
  topic: string;
  content: string;
  source: string;
  confidence: number;
  supersedes: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeCreate {
  topic: string;
  content: string;
  source: string;
  confidence?: number;
}

export interface KnowledgeQuery {
  topic?: string;
  search?: string;
  minConfidence?: number;
  limit?: number;
  /** When set, returns only knowledge scoped to this personality OR unscoped (NULL) entries. */
  personalityId?: string;
}

export interface SkillFilter {
  status?: string;
  source?: string;
  enabled?: boolean;
  personalityId?: string | null;
  /** Return skills scoped to this personality AND global skills (personality_id IS NULL) */
  forPersonalityId?: string;
}

import type { VectorMemoryManager } from './vector/manager.js';
import type { ConsolidationManager } from './consolidation/manager.js';
import type { CognitiveMemoryStorage } from './cognitive-memory-store.js';

export interface BrainManagerDeps {
  auditChain: AuditChain;
  logger: SecureLogger;
  auditStorage?: AuditStorage;
  vectorMemoryManager?: VectorMemoryManager;
  consolidationManager?: ConsolidationManager;
  cognitiveStorage?: CognitiveMemoryStorage;
}

// ── Cognitive Memory Types ──────────────────────────────────

export interface Association {
  sourceId: string;
  targetId: string;
  weight: number;
  coActivationCount: number;
  updatedAt: number;
}

export interface CognitiveStats {
  topMemories: Array<{ id: string; activation: number }>;
  topDocuments: Array<{ id: string; activation: number }>;
  associationCount: number;
  avgAssociationWeight: number;
  accessTrend: Array<{ day: string; count: number }>;
}

export interface BrainStats {
  memories: {
    total: number;
    byType: Record<string, number>;
  };
  knowledge: {
    total: number;
  };
  skills: {
    total: number;
  };
}

// ── Knowledge Base Documents ───────────────────────────────────

export type DocumentFormat = 'pdf' | 'html' | 'md' | 'txt' | 'url' | 'excalidraw';
export type DocumentVisibility = 'private' | 'shared';
export type DocumentStatus = 'pending' | 'processing' | 'ready' | 'error';

export interface KbDocument {
  id: string;
  personalityId: string | null;
  title: string;
  filename: string | null;
  format: DocumentFormat | null;
  sourceUrl: string | null;
  visibility: DocumentVisibility;
  status: DocumentStatus;
  chunkCount: number;
  errorMessage: string | null;
  /** 8-dimension provenance quality scores (Phase 110). */
  sourceQuality: ProvenanceScores | null;
  /** Composite trust score derived from provenance weights (0.0–1.0, default 0.5). */
  trustScore: number;
  createdAt: number;
  updatedAt: number;
}

export interface DocumentCreate {
  personalityId: string | null;
  title: string;
  filename?: string;
  format?: DocumentFormat;
  sourceUrl?: string;
  visibility: DocumentVisibility;
  status: DocumentStatus;
}

export interface KnowledgeHealthStats {
  totalDocuments: number;
  totalChunks: number;
  byFormat: Record<string, number>;
  recentQueryCount: number;
  avgTopScore: number | null;
  lowCoverageQueries: number;
}

export interface QueryLogCreate {
  personalityId: string | null;
  queryText: string;
  resultsCount: number;
  topScore?: number;
}

// ── Notebook Mode ──────────────────────────────────────────────

/**
 * A single document's worth of ordered, reconstructed text for notebook mode.
 * Chunks are concatenated in source-index order to restore reading order.
 */
export interface NotebookCorpusDocument {
  docId: string;
  title: string;
  format: string | null;
  chunkCount: number;
  /** Reconstructed full text (all chunks concatenated in order). */
  text: string;
  /** Rough token estimate (~4 chars/token). */
  estimatedTokens: number;
}

/**
 * The assembled notebook corpus for a personality — all documents + budget metadata.
 */
export interface NotebookCorpus {
  documents: NotebookCorpusDocument[];
  /** Total tokens across all documents. */
  totalTokens: number;
  /** Whether the corpus fits inside the provided token budget. */
  fitsInBudget: boolean;
  /** The budget used for the fit check (tokens). */
  budget: number;
}
