/**
 * Memory Compression LLM Prompts — Phase 118-B
 *
 * Prompt templates for AI-assisted memory compression.
 * Follows the consolidation/prompts.ts pattern.
 */

import type { Memory } from '../types.js';

export const COMPRESSION_SYSTEM_PROMPT = `You are a memory compression engine for an AI assistant. Your task is to compress multiple related memories into a single, concise summary that preserves all key information.

Rules:
- Preserve all important facts, decisions, and context.
- Remove redundancy and temporal markers that are no longer relevant.
- Maintain specific names, numbers, and technical details.
- The compressed summary should be self-contained and understandable without the originals.
- Do NOT add information that wasn't in the originals.

Respond with ONLY the compressed text, no markdown formatting or explanation.`;

export function buildTemporalCompressionPrompt(memories: Memory[]): string {
  const items = memories
    .map(
      (m, i) =>
        `Memory ${i + 1} (importance: ${m.importance.toFixed(2)}, age: ${formatAge(m.createdAt)}):\n"${m.content}"`
    )
    .join('\n\n');

  return `Compress the following ${memories.length} episodic memories into a single semantic summary. These memories share temporal context and can be consolidated:

${items}

Produce a single compressed summary that captures all key information.`;
}

export function buildThematicCompressionPrompt(memories: Memory[]): string {
  const items = memories
    .map(
      (m, i) =>
        `Memory ${i + 1} (type: ${m.type}, importance: ${m.importance.toFixed(2)}, accesses: ${m.accessCount}):\n"${m.content}"`
    )
    .join('\n\n');

  return `Merge the following ${memories.length} thematically related memories into a single comprehensive entry. Preserve all unique information while eliminating redundancy:

${items}

Produce a single merged summary.`;
}

export function parseCompressionResponse(response: string): string | null {
  if (!response || response.trim().length === 0) return null;

  // Strip markdown code blocks if present
  let text = response.trim();
  const codeMatch = /```(?:\w*)?\s*([\s\S]*?)```/.exec(text);
  if (codeMatch?.[1]) {
    text = codeMatch[1].trim();
  }

  // Strip leading/trailing quotes
  if (text.startsWith('"') && text.endsWith('"')) {
    text = text.slice(1, -1);
  }

  return text.length > 0 ? text : null;
}

function formatAge(createdAt: number): string {
  const days = Math.floor((Date.now() - createdAt) / (24 * 60 * 60 * 1000));
  if (days < 1) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month ago' : `${months} months ago`;
}
