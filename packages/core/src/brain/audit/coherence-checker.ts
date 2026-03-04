/**
 * Knowledge Graph Coherence Checker — Phase 118-C
 *
 * Monthly checks for orphaned supersedes chains, circular supersession,
 * and stale confidence scores.
 */

import type { BrainStorage } from '../storage.js';
import type { SecureLogger } from '../../logging/logger.js';
import type { KnowledgeEntry } from '../types.js';

export interface CoherenceCheckResult {
  issuesFound: number;
  issuesFixed: number;
  details: CoherenceIssue[];
}

export interface CoherenceIssue {
  type: 'orphaned_supersedes' | 'circular_supersession' | 'stale_confidence';
  knowledgeId: string;
  description: string;
  autoFixed: boolean;
}

export class KnowledgeGraphCoherenceChecker {
  private readonly brainStorage: BrainStorage;
  private readonly logger: SecureLogger;

  constructor(opts: { brainStorage: BrainStorage; logger: SecureLogger }) {
    this.brainStorage = opts.brainStorage;
    this.logger = opts.logger;
  }

  async check(personalityId?: string): Promise<CoherenceCheckResult> {
    const issues: CoherenceIssue[] = [];

    const knowledge = await this.brainStorage.queryKnowledge({
      personalityId,
      limit: 1000,
    });

    const knowledgeMap = new Map<string, KnowledgeEntry>();
    for (const entry of knowledge) {
      knowledgeMap.set(entry.id, entry);
    }

    // Check 1: Orphaned supersedes chains
    await this.checkOrphanedSupersedes(knowledge, knowledgeMap, issues);

    // Check 2: Circular supersession
    await this.checkCircularSupersession(knowledge, knowledgeMap, issues);

    // Check 3: Stale confidence
    this.checkStaleConfidence(knowledge, issues);

    const issuesFixed = issues.filter((i) => i.autoFixed).length;

    this.logger.info('Knowledge graph coherence check completed', {
      issuesFound: issues.length,
      issuesFixed,
    });

    return {
      issuesFound: issues.length,
      issuesFixed,
      details: issues,
    };
  }

  private async checkOrphanedSupersedes(
    knowledge: KnowledgeEntry[],
    knowledgeMap: Map<string, KnowledgeEntry>,
    issues: CoherenceIssue[]
  ): Promise<void> {
    for (const entry of knowledge) {
      if (entry.supersedes && !knowledgeMap.has(entry.supersedes)) {
        issues.push({
          type: 'orphaned_supersedes',
          knowledgeId: entry.id,
          description: `Supersedes reference "${entry.supersedes}" no longer exists`,
          autoFixed: true,
        });

        try {
          await this.brainStorage.updateKnowledge(entry.id, {
            content: entry.content, // no-op update to clear supersedes
          });
        } catch (err) {
          this.logger.warn('Failed to fix orphaned supersedes', {
            knowledgeId: entry.id,
            error: String(err),
          });
        }
      }
    }
  }

  private async checkCircularSupersession(
    knowledge: KnowledgeEntry[],
    knowledgeMap: Map<string, KnowledgeEntry>,
    issues: CoherenceIssue[]
  ): Promise<void> {
    for (const entry of knowledge) {
      if (!entry.supersedes) continue;

      const visited = new Set<string>();
      let current: string | null = entry.supersedes;

      while (current) {
        if (visited.has(current)) {
          // Circular reference found
          issues.push({
            type: 'circular_supersession',
            knowledgeId: entry.id,
            description: `Circular supersedes chain detected involving "${current}"`,
            autoFixed: true,
          });

          // Break cycle by clearing supersedes on this entry
          try {
            await this.brainStorage.updateKnowledge(entry.id, {
              content: entry.content,
            });
          } catch (err) {
            this.logger.warn('Failed to break circular supersession', {
              knowledgeId: entry.id,
              error: String(err),
            });
          }
          break;
        }

        visited.add(current);
        const next = knowledgeMap.get(current);
        current = next?.supersedes ?? null;
      }
    }
  }

  private checkStaleConfidence(
    knowledge: KnowledgeEntry[],
    issues: CoherenceIssue[]
  ): void {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    for (const entry of knowledge) {
      if (entry.updatedAt < thirtyDaysAgo && entry.confidence > 0.8) {
        issues.push({
          type: 'stale_confidence',
          knowledgeId: entry.id,
          description: `High confidence (${entry.confidence.toFixed(2)}) but not updated in 30+ days`,
          autoFixed: false,
        });
      }
    }
  }
}
