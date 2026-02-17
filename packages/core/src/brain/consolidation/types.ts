/**
 * Memory Consolidation Types
 *
 * Types for the memory deduplication and consolidation system.
 */

export type ConsolidationActionType =
  | 'MERGE'
  | 'REPLACE'
  | 'KEEP_SEPARATE'
  | 'UPDATE'
  | 'SKIP';

export interface ConsolidationAction {
  type: ConsolidationActionType;
  sourceIds: string[];
  mergedContent?: string;
  replaceTargetId?: string;
  updateData?: { content?: string; importance?: number };
  reason: string;
}

export interface ConsolidationReport {
  timestamp: number;
  totalCandidates: number;
  actions: ConsolidationAction[];
  summary: {
    merged: number;
    replaced: number;
    updated: number;
    keptSeparate: number;
    skipped: number;
  };
  dryRun: boolean;
  durationMs: number;
}

export interface ConsolidationCandidate {
  memoryId: string;
  content: string;
  type: string;
  importance: number;
  similarMemories: Array<{
    id: string;
    content: string;
    score: number;
    importance: number;
  }>;
}
