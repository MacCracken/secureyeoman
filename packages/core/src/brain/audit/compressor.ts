/**
 * Memory Compressor — Temporal and thematic memory compression.
 *
 * Phase 118-B: Memory Compression.
 */

import type { BrainStorage } from '../storage.js';
import type { SecureLogger } from '../../logging/logger.js';
import type { MemoryAuditScope, CompressionSummary } from '@secureyeoman/shared';
import type { MemoryAuditStorage } from './audit-store.js';
import type { MemoryAuditPolicy } from './policy.js';
import type { Memory, MemoryType } from '../types.js';
import type { AIProvider } from '../../ai/providers/base.js';
import {
  COMPRESSION_SYSTEM_PROMPT,
  buildTemporalCompressionPrompt,
  buildThematicCompressionPrompt,
  parseCompressionResponse,
} from './compression-prompts.js';

export interface MemoryCompressorOpts {
  brainStorage: BrainStorage;
  auditStorage: MemoryAuditStorage;
  policy: MemoryAuditPolicy;
  logger: SecureLogger;
  aiProvider?: AIProvider | null;
}

export class MemoryCompressor {
  private readonly brainStorage: BrainStorage;
  private readonly auditStorage: MemoryAuditStorage;
  private readonly policy: MemoryAuditPolicy;
  private readonly logger: SecureLogger;
  private readonly aiProvider: AIProvider | null;

  constructor(opts: MemoryCompressorOpts) {
    this.brainStorage = opts.brainStorage;
    this.auditStorage = opts.auditStorage;
    this.policy = opts.policy;
    this.logger = opts.logger;
    this.aiProvider = opts.aiProvider ?? null;
  }

  async compress(
    scope: MemoryAuditScope,
    reportId: string,
    personalityId?: string
  ): Promise<CompressionSummary> {
    const summary: CompressionSummary = {
      candidatesFound: 0,
      memoriesCompressed: 0,
      memoriesArchived: 0,
      compressionRatio: 0,
      qualityChecksPassed: 0,
      qualityChecksFailed: 0,
      errors: [],
    };

    try {
      if (scope === 'daily') {
        await this.temporalCompression(reportId, personalityId, summary);
      } else {
        await this.thematicCompression(scope, reportId, personalityId, summary);
      }

      // Calculate compression ratio
      if (summary.candidatesFound > 0) {
        summary.compressionRatio =
          Math.round(
            ((summary.candidatesFound - summary.memoriesCompressed) / summary.candidatesFound) * 100
          ) / 100;
      }
    } catch (err) {
      summary.errors.push(String(err));
    }

    return summary;
  }

  // ── Temporal Compression (Daily) ───────────────────────────

  private async temporalCompression(
    reportId: string,
    personalityId: string | undefined,
    summary: CompressionSummary
  ): Promise<void> {
    // Find episodic memories older than archival age
    const archivalAge = this.policy.getArchivalAgeDays();
    const cutoff = Date.now() - archivalAge * 24 * 60 * 60 * 1000;

    const candidates = await this.brainStorage.queryMemories({
      type: 'episodic',
      personalityId,
      limit: 200,
    });

    const oldMemories = candidates.filter((m) => m.createdAt < cutoff);
    summary.candidatesFound = oldMemories.length;

    if (oldMemories.length === 0) return;

    // Group by context overlap
    const groups = this.groupByContext(oldMemories);

    for (const group of groups) {
      if (group.length < 2) continue;

      try {
        const compressed = await this.compressGroup(group, 'temporal');
        if (!compressed) continue;

        // Quality check
        const passes = this.qualityCheck(group, compressed);
        if (passes) {
          summary.qualityChecksPassed++;

          // Create new semantic memory
          await this.brainStorage.createMemory(
            {
              type: 'semantic',
              content: compressed,
              source: 'audit:compression:temporal',
              context: {
                compressedFrom: group.map((m) => m.id).join(','),
                compressionLevel: '1',
              },
              importance: Math.max(...group.map((m) => m.importance)),
            },
            personalityId
          );

          // Archive originals
          if (this.policy.shouldRetainOriginals()) {
            await Promise.all(
              group.map((mem) =>
                this.auditStorage.archiveMemory({
                  originalMemoryId: mem.id,
                  originalContent: mem.content,
                  originalImportance: mem.importance,
                  originalContext: mem.context,
                  transformType: 'compressed',
                  auditReportId: reportId,
                })
              )
            );
          }

          // Delete originals
          await this.brainStorage.deleteMemories(group.map((m) => m.id));
          summary.memoriesArchived += group.length;

          summary.memoriesCompressed++;
        } else {
          summary.qualityChecksFailed++;
        }
      } catch (err) {
        summary.errors.push(`Temporal group error: ${String(err)}`);
      }
    }
  }

  // ── Thematic Compression (Weekly/Monthly) ──────────────────

  private async thematicCompression(
    scope: MemoryAuditScope,
    reportId: string,
    personalityId: string | undefined,
    summary: CompressionSummary
  ): Promise<void> {
    const types: MemoryType[] = ['semantic', 'procedural'];

    for (const type of types) {
      const memories = await this.brainStorage.queryMemories({
        type,
        personalityId,
        limit: 200,
      });

      if (memories.length < 2) continue;

      // Simple similarity-based clustering via content overlap
      const clusters = this.clusterByContent(memories, this.policy.getCompressionThreshold());
      summary.candidatesFound += clusters.reduce((sum, c) => sum + c.length, 0);

      for (const cluster of clusters) {
        if (cluster.length < 2) continue;

        try {
          // Anchor = highest confidence/access
          const anchor = cluster.reduce((best, m) =>
            m.accessCount > best.accessCount || m.importance > best.importance ? m : best
          );

          const compressed = await this.compressGroup(cluster, 'thematic');
          if (!compressed) continue;

          const passes = this.qualityCheck(cluster, compressed);
          if (passes) {
            summary.qualityChecksPassed++;

            // Update anchor with merged content
            await this.brainStorage.updateMemory(anchor.id, {
              content: compressed,
              context: {
                ...anchor.context,
                compressedFrom: cluster.map((m) => m.id).join(','),
                compressionLevel: String(parseInt(anchor.context.compressionLevel ?? '0', 10) + 1),
              },
            });

            // Archive and delete non-anchor members
            const nonAnchor = cluster.filter((m) => m.id !== anchor.id);
            if (this.policy.shouldRetainOriginals()) {
              await Promise.all(
                nonAnchor.map((mem) =>
                  this.auditStorage.archiveMemory({
                    originalMemoryId: mem.id,
                    originalContent: mem.content,
                    originalImportance: mem.importance,
                    originalContext: mem.context,
                    transformType: 'merged',
                    auditReportId: reportId,
                  })
                )
              );
            }
            await this.brainStorage.deleteMemories(nonAnchor.map((m) => m.id));
            summary.memoriesArchived += nonAnchor.length;

            summary.memoriesCompressed++;
          } else {
            summary.qualityChecksFailed++;
          }
        } catch (err) {
          summary.errors.push(`Thematic cluster error: ${String(err)}`);
        }
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────

  private groupByContext(memories: Memory[]): Memory[][] {
    const groups: Memory[][] = [];
    const assigned = new Set<string>();

    for (const mem of memories) {
      if (assigned.has(mem.id)) continue;

      const group = [mem];
      assigned.add(mem.id);

      for (const other of memories) {
        if (assigned.has(other.id)) continue;
        if (this.contextOverlap(mem.context, other.context) > 0.5) {
          group.push(other);
          assigned.add(other.id);
        }
      }

      groups.push(group);
    }

    return groups.filter((g) => g.length >= 2);
  }

  private contextOverlap(a: Record<string, string>, b: Record<string, string>): number {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length === 0 && keysB.length === 0) return 1;
    const allKeys = new Set([...keysA, ...keysB]);
    if (allKeys.size === 0) return 1;
    let matching = 0;
    for (const key of allKeys) {
      if (a[key] === b[key]) matching++;
    }
    return matching / allKeys.size;
  }

  private clusterByContent(memories: Memory[], threshold: number): Memory[][] {
    const clusters: Memory[][] = [];
    const assigned = new Set<string>();

    for (const mem of memories) {
      if (assigned.has(mem.id)) continue;

      const cluster = [mem];
      assigned.add(mem.id);

      for (const other of memories) {
        if (assigned.has(other.id)) continue;
        if (this.contentSimilarity(mem.content, other.content) >= threshold) {
          cluster.push(other);
          assigned.add(other.id);
        }
      }

      if (cluster.length >= 2) clusters.push(cluster);
    }

    return clusters;
  }

  private contentSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private async compressGroup(
    memories: Memory[],
    strategy: 'temporal' | 'thematic'
  ): Promise<string | null> {
    if (this.aiProvider) {
      try {
        const prompt =
          strategy === 'temporal'
            ? buildTemporalCompressionPrompt(memories)
            : buildThematicCompressionPrompt(memories);

        const response = await this.aiProvider.chat({
          model: this.policy.getModel() ?? undefined,
          messages: [
            { role: 'system', content: COMPRESSION_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          stream: false,
        });

        const text = typeof response === 'string' ? response : (response?.content ?? '');
        const parsed = parseCompressionResponse(text);
        return parsed;
      } catch (err) {
        this.logger.warn({ error: String(err) }, 'AI compression failed, using fallback');
      }
    }

    // Fallback: concatenate + truncate
    const combined = memories.map((m) => m.content).join(' | ');
    return combined.length > 4096 ? combined.slice(0, 4096) : combined;
  }

  /** Quality guard: check that key terms from originals appear in compressed text. */
  private qualityCheck(originals: Memory[], compressed: string): boolean {
    const keyTerms = new Set<string>();
    for (const mem of originals) {
      const words = mem.content
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 4);
      for (const w of words) keyTerms.add(w);
    }

    if (keyTerms.size === 0) return true;

    const compressedLower = compressed.toLowerCase();
    let recalled = 0;
    for (const term of keyTerms) {
      if (compressedLower.includes(term)) recalled++;
    }

    const recallRate = recalled / keyTerms.size;
    return recallRate >= 0.8;
  }
}
