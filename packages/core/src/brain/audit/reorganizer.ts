/**
 * Memory Reorganizer — Promote, demote, merge, split, and recalibrate.
 *
 * Phase 118-C: Memory Reorganization.
 */

import type { BrainStorage } from '../storage.js';
import type { SecureLogger } from '../../logging/logger.js';
import type { MemoryAuditScope, ReorganizationSummary } from '@secureyeoman/shared';
import type { MemoryAuditStorage } from './audit-store.js';

export interface MemoryReorganizerOpts {
  brainStorage: BrainStorage;
  auditStorage: MemoryAuditStorage;
  logger: SecureLogger;
}

export class MemoryReorganizer {
  private readonly brainStorage: BrainStorage;
  private readonly auditStorage: MemoryAuditStorage;
  private readonly logger: SecureLogger;

  constructor(opts: MemoryReorganizerOpts) {
    this.brainStorage = opts.brainStorage;
    this.auditStorage = opts.auditStorage;
    this.logger = opts.logger;
  }

  async reorganize(
    scope: MemoryAuditScope,
    reportId: string,
    personalityId?: string
  ): Promise<ReorganizationSummary> {
    const summary: ReorganizationSummary = {
      promoted: 0,
      demoted: 0,
      topicsMerged: 0,
      topicsSplit: 0,
      importanceRecalibrated: 0,
      coherenceIssuesFound: 0,
      coherenceIssuesFixed: 0,
      errors: [],
    };

    try {
      // Daily: promote + demote
      await this.promoteMemories(reportId, personalityId, summary);
      await this.demoteMemories(reportId, personalityId, summary);

      // Weekly/Monthly: topic merge/split + recalibration
      if (scope !== 'daily') {
        await this.mergeTopics(reportId, personalityId, summary);
        await this.splitTopics(reportId, personalityId, summary);
        await this.recalibrateImportance(personalityId, summary);
      }
    } catch (err) {
      summary.errors.push(String(err));
    }

    return summary;
  }

  // ── Promote: Episodic → Semantic ───────────────────────────

  private async promoteMemories(
    reportId: string,
    personalityId: string | undefined,
    summary: ReorganizationSummary
  ): Promise<void> {
    const episodics = await this.brainStorage.queryMemories({
      type: 'episodic',
      personalityId,
      limit: 200,
    });

    for (const mem of episodics) {
      if (mem.accessCount > 5) {
        try {
          // Archive original
          await this.auditStorage.archiveMemory({
            originalMemoryId: mem.id,
            originalContent: mem.content,
            originalImportance: mem.importance,
            originalContext: mem.context,
            transformType: 'promoted',
            auditReportId: reportId,
          });

          // Strip temporal references and promote
          const cleaned = this.stripTemporalRefs(mem.content);
          await this.brainStorage.updateMemory(mem.id, {
            type: 'semantic',
            content: cleaned,
            expiresAt: null,
          });

          summary.promoted++;
        } catch (err) {
          summary.errors.push(`Promote ${mem.id}: ${String(err)}`);
        }
      }
    }
  }

  // ── Demote: Semantic → Episodic ────────────────────────────

  private async demoteMemories(
    reportId: string,
    personalityId: string | undefined,
    summary: ReorganizationSummary
  ): Promise<void> {
    const semantics = await this.brainStorage.queryMemories({
      type: 'semantic',
      personalityId,
      limit: 200,
    });

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const sevenDaysFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;

    for (const mem of semantics) {
      const lastAccess = mem.lastAccessedAt ?? mem.createdAt;
      if (lastAccess < thirtyDaysAgo && mem.importance < 0.2) {
        try {
          await this.auditStorage.archiveMemory({
            originalMemoryId: mem.id,
            originalContent: mem.content,
            originalImportance: mem.importance,
            originalContext: mem.context,
            transformType: 'demoted',
            auditReportId: reportId,
          });

          await this.brainStorage.updateMemory(mem.id, {
            type: 'episodic',
            expiresAt: sevenDaysFromNow,
          });

          summary.demoted++;
        } catch (err) {
          summary.errors.push(`Demote ${mem.id}: ${String(err)}`);
        }
      }
    }
  }

  // ── Topic Merge: Knowledge with high similarity ────────────

  private async mergeTopics(
    reportId: string,
    personalityId: string | undefined,
    summary: ReorganizationSummary
  ): Promise<void> {
    const knowledge = await this.brainStorage.queryKnowledge({
      personalityId,
      limit: 200,
    });

    const assigned = new Set<string>();

    for (let i = 0; i < knowledge.length; i++) {
      const entryA = knowledge[i]!;
      if (assigned.has(entryA.id)) continue;

      for (let j = i + 1; j < knowledge.length; j++) {
        const entryB = knowledge[j]!;
        if (assigned.has(entryB.id)) continue;

        const dist = this.editDistance(entryA.topic, entryB.topic);
        if (dist < 3) {
          try {
            // Higher confidence absorbs
            const winner = entryA.confidence >= entryB.confidence ? entryA : entryB;
            const loser = entryA.confidence >= entryB.confidence ? entryB : entryA;

            // Merge content
            const merged = `${winner.content}\n\n${loser.content}`;
            await this.brainStorage.updateKnowledge(winner.id, {
              content: merged,
            });

            // Set supersedes
            await this.brainStorage.updateKnowledge(loser.id, {
              content: `[Superseded by ${winner.id}] ${loser.content}`,
            });

            assigned.add(loser.id);
            summary.topicsMerged++;
          } catch (err) {
            summary.errors.push(`Merge topics: ${String(err)}`);
          }
        }
      }
    }
  }

  // ── Topic Split: Knowledge > 2000 chars ────────────────────

  private async splitTopics(
    _reportId: string,
    personalityId: string | undefined,
    summary: ReorganizationSummary
  ): Promise<void> {
    const knowledge = await this.brainStorage.queryKnowledge({
      personalityId,
      limit: 200,
    });

    for (const entry of knowledge) {
      if (entry.content.length > 2000) {
        try {
          const parts = this.splitAtParagraphs(entry.content);
          if (parts.length < 2) continue;

          // Update original with first part
          await this.brainStorage.updateKnowledge(entry.id, {
            content: parts[0]!,
          });

          // Create new entries for remaining parts
          for (let i = 1; i < parts.length; i++) {
            await this.brainStorage.createKnowledge(
              {
                topic: `${entry.topic} (${i + 1}/${parts.length})`,
                content: parts[i]!,
                source: entry.source,
                confidence: entry.confidence,
              },
              personalityId
            );
          }

          summary.topicsSplit++;
        } catch (err) {
          summary.errors.push(`Split topic ${entry.id}: ${String(err)}`);
        }
      }
    }
  }

  // ── Importance Recalibration ───────────────────────────────

  private async recalibrateImportance(
    personalityId: string | undefined,
    summary: ReorganizationSummary
  ): Promise<void> {
    const memories = await this.brainStorage.queryMemories({
      personalityId,
      limit: 1000,
    });

    if (memories.length === 0) return;

    // Sort by importance descending
    const sorted = [...memories].sort((a, b) => b.importance - a.importance);
    const total = sorted.length;

    // Target: 10% >0.8, 60% 0.3-0.8, 30% <0.3
    const highCutoff = Math.floor(total * 0.1);
    const midCutoff = Math.floor(total * 0.7); // 10% + 60%

    for (let i = 0; i < sorted.length; i++) {
      const mem = sorted[i]!;
      let targetImportance: number;

      if (i < highCutoff) {
        targetImportance = 0.8 + (0.2 * (highCutoff - i)) / Math.max(highCutoff, 1);
      } else if (i < midCutoff) {
        const pos = (i - highCutoff) / Math.max(midCutoff - highCutoff, 1);
        targetImportance = 0.8 - pos * 0.5;
      } else {
        const pos = (i - midCutoff) / Math.max(total - midCutoff, 1);
        targetImportance = 0.3 - pos * 0.25;
      }

      const diff = Math.abs(mem.importance - targetImportance);
      if (diff > 0.1) {
        const newImportance = mem.importance + (targetImportance - mem.importance) * 0.5;
        const clamped = Math.max(0.01, Math.min(1, newImportance));

        try {
          await this.brainStorage.updateMemory(mem.id, { importance: clamped });
          summary.importanceRecalibrated++;
        } catch (err) {
          summary.errors.push(`Recalibrate ${mem.id}: ${String(err)}`);
        }
      }
    }
  }

  // ── Utilities ──────────────────────────────────────────────

  private stripTemporalRefs(content: string): string {
    return content
      .replace(/\b(yesterday|today|this morning|last night|just now|earlier|recently)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private editDistance(a: string, b: string): number {
    const la = a.toLowerCase();
    const lb = b.toLowerCase();
    if (la === lb) return 0;

    const m = la.length;
    const n = lb.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i]![0] = i;
    for (let j = 0; j <= n; j++) dp[0]![j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i]![j] =
          la[i - 1] === lb[j - 1]
            ? dp[i - 1]![j - 1]!
            : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
      }
    }

    return dp[m]![n]!;
  }

  private splitAtParagraphs(content: string): string[] {
    const paragraphs = content.split(/\n\n+/);
    if (paragraphs.length < 2) {
      // Split at ~1000 char boundaries on sentence ends
      const parts: string[] = [];
      let current = '';
      for (const sentence of content.split(/(?<=[.!?])\s+/)) {
        if (current.length + sentence.length > 1000 && current.length > 0) {
          parts.push(current.trim());
          current = sentence;
        } else {
          current += (current ? ' ' : '') + sentence;
        }
      }
      if (current.trim()) parts.push(current.trim());
      return parts.length >= 2 ? parts : [content];
    }

    return paragraphs.filter((p) => p.trim().length > 0);
  }
}
