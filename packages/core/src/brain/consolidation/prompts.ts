/**
 * Memory Consolidation LLM Prompts
 *
 * Prompt templates for AI-assisted memory consolidation decisions.
 */

import type { ConsolidationCandidate, ConsolidationActionType } from './types.js';

export const CONSOLIDATION_SYSTEM_PROMPT = `You are a memory consolidation engine for an AI assistant. Your task is to analyze groups of similar memories and decide the best action for each group.

Available actions:
- MERGE: Combine multiple memories into one new, more comprehensive memory. Use when memories cover the same topic from different angles.
- REPLACE: Keep the better/newer memory and discard the other. Use when one memory strictly supersedes another.
- KEEP_SEPARATE: Leave both memories as-is. Use when memories are similar but contain distinct, valuable information. PREFER THIS WHEN UNCERTAIN.
- UPDATE: Modify an existing memory's content slightly. Use when a memory needs minor corrections or additions.
- SKIP: Take no action. Use when the memories are not similar enough to warrant consolidation.

IMPORTANT: When uncertain, always prefer KEEP_SEPARATE. It is safer to keep separate memories than to accidentally lose information through incorrect merging.

Respond with a JSON array of actions. Each action should have:
- "type": One of the action types above
- "sourceIds": Array of memory IDs involved
- "mergedContent": (for MERGE) The new combined content
- "replaceTargetId": (for REPLACE) The ID of the memory to keep
- "updateData": (for UPDATE) Object with updated "content" and/or "importance"
- "reason": Brief explanation of the decision`;

export function buildConsolidationPrompt(candidates: ConsolidationCandidate[]): string {
  const groups = candidates.map((c, i) => {
    const similar = c.similarMemories
      .map((s) => `    - ID: ${s.id} | Score: ${s.score.toFixed(3)} | Importance: ${s.importance}\n      Content: "${s.content}"`)
      .join('\n');

    return `Group ${i + 1}:
  Primary Memory:
    - ID: ${c.memoryId} | Type: ${c.type} | Importance: ${c.importance}
    - Content: "${c.content}"
  Similar Memories:
${similar}`;
  });

  return `Analyze the following memory groups and decide the best consolidation action for each:

${groups.join('\n\n')}

Respond with a JSON array of consolidation actions.`;
}

export function parseConsolidationResponse(
  response: string,
): Array<{ type: ConsolidationActionType; sourceIds: string[]; mergedContent?: string; replaceTargetId?: string; updateData?: { content?: string; importance?: number }; reason: string }> {
  // Extract JSON from response (handle markdown code blocks)
  let jsonStr = response;
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch?.[1]) {
    jsonStr = jsonMatch[1].trim();
  }

  // Try to find JSON array
  const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (!arrayMatch) {
    return [];
  }

  try {
    const parsed = JSON.parse(arrayMatch[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (action: any) =>
        action &&
        typeof action.type === 'string' &&
        Array.isArray(action.sourceIds) &&
        typeof action.reason === 'string',
    );
  } catch {
    return [];
  }
}
