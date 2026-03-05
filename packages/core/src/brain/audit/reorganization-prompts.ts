/**
 * Memory Reorganization LLM Prompts — Phase 118-C
 *
 * Prompt templates for AI-assisted reorganization decisions.
 */

import type { Memory, KnowledgeEntry } from '../types.js';

export const REORGANIZATION_SYSTEM_PROMPT = `You are a memory reorganization engine for an AI assistant. Your task is to decide how to best reorganize and restructure memories for optimal retrieval and utility.

Available operations:
- PROMOTE: Upgrade episodic memory to semantic (it has been accessed frequently and contains lasting value)
- DEMOTE: Downgrade semantic memory to episodic (it is stale and no longer relevant)
- MERGE: Combine knowledge entries with highly similar topics
- SPLIT: Break apart long knowledge entries into focused sub-entries
- KEEP: Leave as-is (PREFER THIS WHEN UNCERTAIN)

Respond with a JSON array of operations.`;

export function buildClusterDecisionPrompt(memories: Memory[]): string {
  const items = memories
    .map(
      (m, i) =>
        `${i + 1}. [${m.type}] importance=${m.importance.toFixed(2)} accesses=${m.accessCount}\n   "${m.content}"`
    )
    .join('\n\n');

  return `Analyze this cluster of related memories and decide which operations to apply:

${items}

For each memory, decide: PROMOTE, DEMOTE, MERGE (with which other IDs), or KEEP.
Respond with a JSON array of { "id": "...", "action": "...", "mergeWith": [...], "reason": "..." }.`;
}

export function buildKnowledgeMergePrompt(entries: KnowledgeEntry[]): string {
  const items = entries
    .map(
      (e, i) =>
        `${i + 1}. Topic: "${e.topic}" (confidence: ${e.confidence.toFixed(2)})\n   "${e.content}"`
    )
    .join('\n\n');

  return `These knowledge entries have very similar topics. Should they be merged?

${items}

If yes, provide the merged content. If no, explain why they should remain separate.
Respond with: { "shouldMerge": true/false, "mergedContent": "...", "reason": "..." }`;
}

export function parseReorganizationResponse(
  response: string
): { action: string; id?: string; mergeWith?: string[]; reason: string }[] {
  let jsonStr = response;
  const jsonMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(response);
  if (jsonMatch?.[1]) {
    jsonStr = jsonMatch[1].trim();
  }

  const arrayMatch = /\[[\s\S]*\]/.exec(jsonStr);
  if (!arrayMatch) return [];

  try {
    const parsed = JSON.parse(arrayMatch[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item: any) => item && typeof item.action === 'string' && typeof item.reason === 'string'
    );
  } catch {
    return [];
  }
}
