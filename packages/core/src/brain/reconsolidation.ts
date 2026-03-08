/**
 * Memory Reconsolidation — LLM-Powered Memory Evolution (Phase 125 — Future)
 *
 * When a memory is retrieved alongside new context that partially overlaps,
 * the LLM decides whether to: (a) keep as-is, (b) update content to
 * integrate new information, or (c) split into distinct memories.
 *
 * Mirrors biological memory reconsolidation where recalled memories enter
 * a labile state and can be rewritten.
 *
 * STATUS: Implemented — Phase 141
 */

import type { AIProvider } from '../ai/providers/base.js';
import type { BrainStorage } from './storage.js';
import type { Memory } from './types.js';
import type { SecureLogger } from '../logging/logger.js';
import { uuidv7 } from '../utils/crypto.js';

export type ReconsolidationAction = 'keep' | 'update' | 'split';

export interface ReconsolidationDecision {
  action: ReconsolidationAction;
  /** Updated content (when action is 'update'). */
  updatedContent?: string;
  /** Split contents (when action is 'split'). */
  splitContents?: string[];
  /** LLM reasoning for the decision. */
  reasoning: string;
  /** Similarity score between query context and retrieved memory. */
  overlapScore: number;
}

export interface ReconsolidationConfig {
  enabled: boolean;
  /** Minimum cosine similarity to trigger reconsolidation check. Default 0.7 */
  overlapThreshold: number;
  /** Maximum cosine similarity — above this, memories are too similar (dedup territory). Default 0.95 */
  dedupThreshold: number;
  /** Cooldown period before a memory can be reconsolidated again (ms). Default 1 hour */
  cooldownMs: number;
  /** Max reconsolidations per maintenance cycle. Default 5 */
  batchLimit: number;
}

export const DEFAULT_RECONSOLIDATION_CONFIG: ReconsolidationConfig = {
  enabled: false,
  overlapThreshold: 0.7,
  dedupThreshold: 0.95,
  cooldownMs: 3_600_000,
  batchLimit: 5,
};

export interface ReconsolidationManagerDeps {
  aiProvider: AIProvider;
  storage: BrainStorage;
  logger: SecureLogger;
}

const RECONSOLIDATION_PROMPT = `You are evaluating whether a stored memory should be updated given new context.

Stored Memory:
{memory}

New Context (from current query):
{context}

Overlap Score: {overlapScore}

The memory and context overlap but are not identical. Decide:
- "keep": The memory is fine as-is, the new context adds nothing.
- "update": The memory should be updated to integrate the new information. Provide the updated content.
- "split": The memory conflates two distinct topics. Provide the split contents as separate entries.

Respond with JSON only:
{
  "action": "keep" | "update" | "split",
  "updatedContent": "...",
  "splitContents": ["...", "..."],
  "reasoning": "brief explanation"
}`;

/**
 * ReconsolidationManager — LLM-powered memory evolution.
 *
 * Wired into BrainManager.recall() to check retrieved memories
 * against the current query context and evolve them when appropriate.
 */
export class ReconsolidationManager {
  private readonly config: ReconsolidationConfig;
  private readonly deps: ReconsolidationManagerDeps;

  /** Track last reconsolidation time per memory to enforce cooldown. */
  private readonly cooldowns = new Map<string, number>();
  private static readonly MAX_COOLDOWN_ENTRIES = 10_000;

  /** Stats for monitoring. */
  private stats = { evaluated: 0, kept: 0, updated: 0, split: 0, errors: 0 };

  constructor(config: Partial<ReconsolidationConfig>, deps: ReconsolidationManagerDeps) {
    this.config = { ...DEFAULT_RECONSOLIDATION_CONFIG, ...config };
    this.deps = deps;
  }

  /** Evict expired cooldown entries to prevent unbounded growth. */
  private evictStaleCooldowns(): void {
    const cutoff = Date.now() - this.config.cooldownMs * 2;
    for (const [id, ts] of this.cooldowns) {
      if (ts < cutoff) this.cooldowns.delete(id);
    }
    // Hard cap if still too large after TTL eviction
    while (this.cooldowns.size > ReconsolidationManager.MAX_COOLDOWN_ENTRIES) {
      const oldest = this.cooldowns.keys().next().value;
      if (oldest !== undefined) this.cooldowns.delete(oldest);
      else break;
    }
  }

  /**
   * Check if a memory should be reconsolidated given the current context.
   * Returns null if no reconsolidation is needed.
   */
  async evaluate(
    memory: Memory,
    queryContext: string,
    overlapScore: number
  ): Promise<ReconsolidationDecision | null> {
    if (!this.config.enabled) return null;

    // Check overlap bounds
    if (overlapScore < this.config.overlapThreshold || overlapScore > this.config.dedupThreshold) {
      return null;
    }

    // Evict stale entries periodically (every 100 evaluations)
    if (this.stats.evaluated % 100 === 0) this.evictStaleCooldowns();

    // Check cooldown
    const lastTime = this.cooldowns.get(memory.id);
    if (lastTime && Date.now() - lastTime < this.config.cooldownMs) {
      return null;
    }

    this.stats.evaluated++;

    try {
      const prompt = RECONSOLIDATION_PROMPT.replace('{memory}', memory.content)
        .replace('{context}', queryContext)
        .replace('{overlapScore}', overlapScore.toFixed(2));

      const response = await this.deps.aiProvider.chat({
        messages: [{ role: 'user' as const, content: prompt }],
        temperature: 0,
        maxTokens: 500,
        stream: false,
      });

      const decision = this.parseDecision(response.content, overlapScore);
      this.cooldowns.set(memory.id, Date.now());

      switch (decision.action) {
        case 'keep':
          this.stats.kept++;
          break;
        case 'update':
          this.stats.updated++;
          break;
        case 'split':
          this.stats.split++;
          break;
      }

      return decision;
    } catch (err) {
      this.stats.errors++;
      this.deps.logger.warn(
        {
          memoryId: memory.id,
          error: String(err),
        },
        'Reconsolidation evaluation failed'
      );
      return null;
    }
  }

  /**
   * Apply a reconsolidation decision to a memory.
   */
  async apply(memoryId: string, decision: ReconsolidationDecision): Promise<void> {
    if (decision.action === 'keep') return;

    try {
      if (decision.action === 'update' && decision.updatedContent) {
        await this.deps.storage.updateMemory(memoryId, {
          content: decision.updatedContent,
        });
        this.deps.logger.info(
          {
            memoryId,
            reasoning: decision.reasoning,
          },
          'Memory reconsolidated (update)'
        );
      } else if (decision.action === 'split' && decision.splitContents?.length) {
        // Get the original memory to preserve metadata
        const original = await this.deps.storage.getMemory(memoryId);
        if (!original) return;

        // Create new memories for each split piece
        for (const content of decision.splitContents) {
          await this.deps.storage.createMemory(
            {
              type: original.type,
              content,
              source: original.source,
              context: original.context,
              importance: original.importance,
            },
            original.personalityId ?? undefined
          );
        }

        // Delete the original
        await this.deps.storage.deleteMemory(memoryId);
        this.deps.logger.info(
          {
            memoryId,
            splitCount: decision.splitContents.length,
            reasoning: decision.reasoning,
          },
          'Memory reconsolidated (split)'
        );
      }
    } catch (err) {
      this.deps.logger.warn(
        {
          memoryId,
          action: decision.action,
          error: String(err),
        },
        'Failed to apply reconsolidation'
      );
    }
  }

  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  private parseDecision(content: string, overlapScore: number): ReconsolidationDecision {
    try {
      const json = JSON.parse(content);
      const action = (['keep', 'update', 'split'] as const).includes(json.action)
        ? json.action
        : 'keep';
      return {
        action,
        updatedContent: json.updatedContent,
        splitContents: Array.isArray(json.splitContents) ? json.splitContents : undefined,
        reasoning: json.reasoning ?? '',
        overlapScore,
      };
    } catch {
      return { action: 'keep', reasoning: 'Failed to parse LLM response', overlapScore };
    }
  }
}
