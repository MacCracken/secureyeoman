/**
 * ConsolidationManager — Manages memory deduplication and consolidation.
 *
 * Quick check on every memory save:
 * - >0.95 similarity: auto-dedup
 * - 0.85–0.95 similarity: flag for scheduled run
 * - <0.85: insert directly
 *
 * Deep consolidation runs on a cron schedule or manually.
 */

import type { Memory } from '../types.js';
import type { VectorMemoryManager } from '../vector/manager.js';
import type { BrainStorage } from '../storage.js';
import type { AuditChain } from '../../logging/audit-chain.js';
import type { SecureLogger } from '../../logging/logger.js';
import type { AIProvider } from '../../ai/providers/base.js';
import type { ConsolidationReport, ConsolidationCandidate } from './types.js';
import { ConsolidationExecutor, type ExecutorDeps } from './executor.js';
import { CONSOLIDATION_SYSTEM_PROMPT, buildConsolidationPrompt, parseConsolidationResponse } from './prompts.js';

export interface ConsolidationConfig {
  enabled: boolean;
  schedule: string;
  quickCheck: {
    autoDedupThreshold: number;
    flagThreshold: number;
  };
  deepConsolidation: {
    replaceThreshold: number;
    batchSize: number;
    timeoutMs: number;
    dryRun: boolean;
  };
  model: string | null;
}

export interface ConsolidationManagerDeps {
  vectorManager: VectorMemoryManager;
  storage: BrainStorage;
  auditChain: AuditChain;
  logger: SecureLogger;
  aiProvider?: AIProvider;
}

export class ConsolidationManager {
  private readonly config: ConsolidationConfig;
  private readonly vectorManager: VectorMemoryManager;
  private readonly storage: BrainStorage;
  private readonly executor: ConsolidationExecutor;
  private readonly logger: SecureLogger;
  private readonly aiProvider?: AIProvider;
  private schedule: string;
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  private flaggedIds: Set<string> = new Set();
  private history: ConsolidationReport[] = [];

  constructor(config: ConsolidationConfig, deps: ConsolidationManagerDeps) {
    this.config = config;
    this.vectorManager = deps.vectorManager;
    this.storage = deps.storage;
    this.logger = deps.logger;
    this.aiProvider = deps.aiProvider;
    this.schedule = config.schedule;

    this.executor = new ConsolidationExecutor({
      storage: deps.storage,
      auditChain: deps.auditChain,
      logger: deps.logger,
      vectorManager: deps.vectorManager,
    });
  }

  /**
   * Quick check on memory save. Called by BrainManager after creating a memory.
   * - >autoDedupThreshold: auto-dedup (delete the new duplicate)
   * - >flagThreshold: flag for deep consolidation
   * - Otherwise: no action needed
   */
  async onMemorySave(memory: Memory): Promise<'deduped' | 'flagged' | 'clean'> {
    if (!this.config.enabled) return 'clean';

    try {
      const results = await this.vectorManager.searchMemories(
        memory.content,
        5,
        this.config.quickCheck.flagThreshold,
      );

      // Filter out the memory itself
      const similar = results.filter((r) => r.id !== memory.id);

      if (similar.length === 0) return 'clean';

      const topResult = similar[0]!;
      const topScore = topResult.score;

      // Auto-dedup: very high similarity
      if (topScore >= this.config.quickCheck.autoDedupThreshold) {
        this.logger.debug('Auto-dedup: removing duplicate memory', {
          memoryId: memory.id,
          duplicateOf: topResult.id,
          score: topScore,
        });

        await this.storage.deleteMemory(memory.id);
        await this.vectorManager.removeMemory(memory.id);
        return 'deduped';
      }

      // Flag for scheduled run
      if (topScore >= this.config.quickCheck.flagThreshold) {
        this.flaggedIds.add(memory.id);
        return 'flagged';
      }

      return 'clean';
    } catch (err) {
      this.logger.warn('Quick check failed', { error: String(err) });
      return 'clean';
    }
  }

  /**
   * Run deep consolidation: analyze flagged and all memories for potential consolidation.
   */
  async runDeepConsolidation(): Promise<ConsolidationReport> {
    const startTime = Date.now();
    const dryRun = this.config.deepConsolidation.dryRun;

    this.logger.info('Starting deep consolidation', { dryRun, flaggedCount: this.flaggedIds.size });

    const candidates: ConsolidationCandidate[] = [];

    // Process flagged memories first, then sample others
    const idsToProcess = [...this.flaggedIds];

    // Also sample some non-flagged memories for broader consolidation
    const allMemories = await this.storage.queryMemories({ limit: this.config.deepConsolidation.batchSize });
    for (const mem of allMemories) {
      if (!idsToProcess.includes(mem.id)) {
        idsToProcess.push(mem.id);
      }
      if (idsToProcess.length >= this.config.deepConsolidation.batchSize) break;
    }

    // Find similar memories for each candidate
    for (const memId of idsToProcess) {
      const memory = await this.storage.getMemory(memId);
      if (!memory) continue;

      const similar = await this.vectorManager.searchMemories(
        memory.content,
        5,
        this.config.quickCheck.flagThreshold,
      );

      const filteredSimilar = similar.filter((r) => r.id !== memId);

      if (filteredSimilar.length > 0) {
        const similarWithContent = await Promise.all(
          filteredSimilar.map(async (r) => {
            const mem = await this.storage.getMemory(r.id);
            return {
              id: r.id,
              content: mem?.content ?? '',
              score: r.score,
              importance: mem?.importance ?? 0,
            };
          }),
        );

        candidates.push({
          memoryId: memId,
          content: memory.content,
          type: memory.type,
          importance: memory.importance,
          similarMemories: similarWithContent.filter((s) => s.content),
        });
      }
    }

    // Use LLM for consolidation decisions if available
    let report: ConsolidationReport;

    if (this.aiProvider && candidates.length > 0) {
      const prompt = buildConsolidationPrompt(candidates);

      try {
        const response = await this.aiProvider.chat({
          messages: [
            { role: 'system', content: CONSOLIDATION_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          model: this.config.model ?? undefined,
          stream: false,
          maxTokens: 2000,
          temperature: 0.2,
        });

        const actions = parseConsolidationResponse(response.content);
        const summary = await this.executor.execute(actions, dryRun);

        report = {
          timestamp: Date.now(),
          totalCandidates: candidates.length,
          actions: actions.map((a) => ({
            type: a.type,
            sourceIds: a.sourceIds,
            mergedContent: a.mergedContent,
            replaceTargetId: a.replaceTargetId,
            updateData: a.updateData,
            reason: a.reason,
          })),
          summary,
          dryRun,
          durationMs: Date.now() - startTime,
        };
      } catch (err) {
        this.logger.error('Deep consolidation LLM call failed', { error: String(err) });
        report = {
          timestamp: Date.now(),
          totalCandidates: candidates.length,
          actions: [],
          summary: { merged: 0, replaced: 0, updated: 0, keptSeparate: 0, skipped: 0 },
          dryRun,
          durationMs: Date.now() - startTime,
        };
      }
    } else {
      // No AI provider — only do simple threshold-based dedup
      const actions = candidates
        .filter((c) => c.similarMemories.some((s) => s.score >= this.config.deepConsolidation.replaceThreshold))
        .map((c) => {
          const bestMatch = c.similarMemories.sort((a, b) => b.score - a.score)[0]!;
          // Keep the one with higher importance
          const keepId = c.importance >= bestMatch!.importance ? c.memoryId : bestMatch!.id;
          const removeId = keepId === c.memoryId ? bestMatch!.id : c.memoryId;
          return {
            type: 'REPLACE' as const,
            sourceIds: [keepId, removeId],
            replaceTargetId: keepId,
            reason: `Auto-dedup: similarity ${bestMatch!.score.toFixed(3)} >= ${this.config.deepConsolidation.replaceThreshold}`,
          };
        });

      const summary = await this.executor.execute(actions, dryRun);
      report = {
        timestamp: Date.now(),
        totalCandidates: candidates.length,
        actions,
        summary,
        dryRun,
        durationMs: Date.now() - startTime,
      };
    }

    // Clear flagged IDs after processing
    this.flaggedIds.clear();

    // Store report in history
    this.history.push(report);
    if (this.history.length > 50) {
      this.history = this.history.slice(-50);
    }

    this.logger.info('Deep consolidation complete', {
      candidates: report.totalCandidates,
      ...report.summary,
      durationMs: report.durationMs,
    });

    return report;
  }

  // ── Scheduling ──────────────────────────────────────────

  start(): void {
    if (this.schedulerTimer) return;

    // Simple interval-based scheduling (every hour, check if cron matches)
    // For production, use a proper cron library
    this.schedulerTimer = setInterval(
      () => this.checkSchedule(),
      60 * 60 * 1000, // Check every hour
    );

    this.logger.info('Consolidation scheduler started', { schedule: this.schedule });
  }

  stop(): void {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    this.logger.info('Consolidation scheduler stopped');
  }

  getSchedule(): string {
    return this.schedule;
  }

  setSchedule(cron: string): void {
    this.schedule = cron;
    this.logger.info('Consolidation schedule updated', { schedule: cron });
  }

  getHistory(): ConsolidationReport[] {
    return [...this.history];
  }

  // ── Private ──────────────────────────────────────────────

  private checkSchedule(): void {
    // Simple cron check: parse "0 2 * * *" format
    const now = new Date();
    const parts = this.schedule.split(/\s+/);
    if (parts.length < 5) return;

    const minute = parts[0]!;
    const hour = parts[1]!;
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    const matchesHour = hour === '*' || parseInt(hour, 10) === currentHour;
    const matchesMinute = minute === '*' || parseInt(minute, 10) === currentMinute;

    if (matchesHour && matchesMinute) {
      this.runDeepConsolidation().catch((err) => {
        this.logger.error('Scheduled consolidation failed', { error: String(err) });
      });
    }
  }
}
