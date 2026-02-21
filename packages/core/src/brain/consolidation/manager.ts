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
import {
  CONSOLIDATION_SYSTEM_PROMPT,
  buildConsolidationPrompt,
  parseConsolidationResponse,
} from './prompts.js';

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

const FLAGGED_IDS_META_KEY = 'consolidation:flaggedIds';

export class ConsolidationManager {
  private readonly config: ConsolidationConfig;
  private readonly vectorManager: VectorMemoryManager;
  private readonly storage: BrainStorage;
  private readonly executor: ConsolidationExecutor;
  private readonly logger: SecureLogger;
  private readonly aiProvider?: AIProvider;
  private schedule: string;
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  private flaggedIds = new Set<string>();
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
        this.config.quickCheck.flagThreshold
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
        await this.persistFlaggedIds();
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
   * Enforces the configured timeout.
   */
  async runDeepConsolidation(): Promise<ConsolidationReport> {
    const timeoutMs = this.config.deepConsolidation.timeoutMs;

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => {
        reject(new Error(`Deep consolidation timed out after ${timeoutMs}ms`));
      }, timeoutMs)
    );

    return Promise.race([this.runDeepConsolidationInner(), timeoutPromise]);
  }

  private async runDeepConsolidationInner(): Promise<ConsolidationReport> {
    const startTime = Date.now();
    const dryRun = this.config.deepConsolidation.dryRun;

    // Snapshot current flagged IDs for this run; new flags during run are preserved
    await this.loadFlaggedIds();
    const snapshotIds = new Set(this.flaggedIds);

    this.logger.info('Starting deep consolidation', { dryRun, flaggedCount: snapshotIds.size });

    const candidates: ConsolidationCandidate[] = [];

    // Process flagged memories first, then sample others
    const idsToProcess = [...snapshotIds];

    // Also sample some non-flagged memories for broader consolidation
    const allMemories = await this.storage.queryMemories({
      limit: this.config.deepConsolidation.batchSize,
    });
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
        this.config.quickCheck.flagThreshold
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
          })
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
        .filter((c) =>
          c.similarMemories.some((s) => s.score >= this.config.deepConsolidation.replaceThreshold)
        )
        .map((c) => {
          const bestMatch = c.similarMemories.sort((a, b) => b.score - a.score)[0]!;
          // Keep the one with higher importance
          const keepId = c.importance >= bestMatch.importance ? c.memoryId : bestMatch.id;
          const removeId = keepId === c.memoryId ? bestMatch.id : c.memoryId;
          return {
            type: 'REPLACE' as const,
            sourceIds: [keepId, removeId],
            replaceTargetId: keepId,
            reason: `Auto-dedup: similarity ${bestMatch.score.toFixed(3)} >= ${this.config.deepConsolidation.replaceThreshold}`,
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

    // Clear only the snapshot IDs — new flags arriving during the run are preserved
    for (const id of snapshotIds) {
      this.flaggedIds.delete(id);
    }
    await this.persistFlaggedIds();

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

  // ── FlaggedIds Persistence ──────────────────────────────

  private async persistFlaggedIds(): Promise<void> {
    try {
      await this.storage.setMeta(FLAGGED_IDS_META_KEY, JSON.stringify([...this.flaggedIds]));
    } catch (err) {
      this.logger.warn('Failed to persist flaggedIds', { error: String(err) });
    }
  }

  private async loadFlaggedIds(): Promise<void> {
    try {
      const raw = await this.storage.getMeta(FLAGGED_IDS_META_KEY);
      if (raw) {
        const ids = JSON.parse(raw) as string[];
        for (const id of ids) {
          this.flaggedIds.add(id);
        }
      }
    } catch (err) {
      this.logger.warn('Failed to load flaggedIds', { error: String(err) });
    }
  }

  // ── Scheduling ──────────────────────────────────────────

  start(): void {
    if (this.schedulerTimer) return;

    // Load persisted flagged IDs on start
    void this.loadFlaggedIds().catch(() => {});

    // Check every 60 seconds for cron match
    this.schedulerTimer = setInterval(
      () => {
        this.checkSchedule();
      },
      60 * 1000 // Check every minute
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
    // Full 5-field cron matching: minute hour day-of-month month day-of-week
    const now = new Date();
    const parts = this.schedule.split(/\s+/);
    if (parts.length < 5) return;

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    const matches = (field: string | undefined, value: number): boolean => {
      if (!field || field === '*') return true;
      // Handle comma-separated values
      return field.split(',').some((f) => parseInt(f.trim(), 10) === value);
    };

    const matchesMinute = matches(minute, now.getMinutes());
    const matchesHour = matches(hour, now.getHours());
    const matchesDayOfMonth = matches(dayOfMonth, now.getDate());
    const matchesMonth = matches(month, now.getMonth() + 1);
    // JS: 0=Sunday, cron: 0=Sunday or 7=Sunday
    const currentDow = now.getDay();
    const matchesDayOfWeek =
      dayOfWeek === '*' ||
      dayOfWeek!.split(',').some((f) => {
        const v = parseInt(f.trim(), 10);
        return v === currentDow || (v === 7 && currentDow === 0);
      });

    if (matchesMinute && matchesHour && matchesDayOfMonth && matchesMonth && matchesDayOfWeek) {
      this.runDeepConsolidation().catch((err: unknown) => {
        this.logger.error('Scheduled consolidation failed', { error: String(err) });
      });
    }
  }
}
