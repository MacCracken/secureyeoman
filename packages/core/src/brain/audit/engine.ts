/**
 * Memory Audit Engine — Orchestrates a single audit pass.
 *
 * Flow: create report → pre-snapshot → compression pass → reorganization pass
 *       → maintenance pass → post-snapshot → diff → persist.
 *
 * Phase 118: Memory Audits, Compression & Reorganization.
 */

import type { BrainStorage } from '../storage.js';
import type { BrainManager } from '../manager.js';
import type { SecureLogger } from '../../logging/logger.js';
import type { AlertManager } from '../../telemetry/alert-manager.js';
import type {
  MemoryAuditScope,
  AuditSnapshot,
  CompressionSummary,
  ReorganizationSummary,
  MaintenanceSummary,
  MemoryAuditReport,
} from '@secureyeoman/shared';
import type { MemoryAuditStorage } from './audit-store.js';
import type { MemoryAuditPolicy } from './policy.js';
import type { MemoryCompressor } from './compressor.js';
import type { MemoryReorganizer } from './reorganizer.js';
import type { KnowledgeGraphCoherenceChecker } from './coherence-checker.js';

export interface AuditEngineOpts {
  brainStorage: BrainStorage;
  auditStorage: MemoryAuditStorage;
  policy: MemoryAuditPolicy;
  brainManager: BrainManager;
  compressor?: MemoryCompressor | null;
  reorganizer?: MemoryReorganizer | null;
  coherenceChecker?: KnowledgeGraphCoherenceChecker | null;
  logger: SecureLogger;
  getAlertManager?: () => AlertManager | null;
}

export class MemoryAuditEngine {
  private readonly brainStorage: BrainStorage;
  private readonly auditStorage: MemoryAuditStorage;
  private readonly policy: MemoryAuditPolicy;
  private readonly brainManager: BrainManager;
  private readonly compressor: MemoryCompressor | null;
  private readonly reorganizer: MemoryReorganizer | null;
  private readonly coherenceChecker: KnowledgeGraphCoherenceChecker | null;
  private readonly logger: SecureLogger;
  private readonly getAlertManager?: () => AlertManager | null;

  constructor(opts: AuditEngineOpts) {
    this.brainStorage = opts.brainStorage;
    this.auditStorage = opts.auditStorage;
    this.policy = opts.policy;
    this.brainManager = opts.brainManager;
    this.compressor = opts.compressor ?? null;
    this.reorganizer = opts.reorganizer ?? null;
    this.coherenceChecker = opts.coherenceChecker ?? null;
    this.logger = opts.logger;
    this.getAlertManager = opts.getAlertManager;
  }

  async runAudit(scope: MemoryAuditScope, personalityId?: string): Promise<MemoryAuditReport> {
    const report = await this.auditStorage.createReport({
      scope,
      personalityId: personalityId ?? null,
    });

    this.logger.info({ scope, personalityId, reportId: report.id }, 'Memory audit started');

    try {
      // Pre-snapshot
      const preSnapshot = await this.takeSnapshot(personalityId);
      await this.auditStorage.updateReport(report.id, { preSnapshot });

      // Compression pass
      let compressionSummary: CompressionSummary | undefined;
      if (this.policy.isCompressionEnabled() && this.compressor) {
        compressionSummary = await this.runCompressionPass(scope, report.id, personalityId);
        await this.auditStorage.updateReport(report.id, { compressionSummary });
      }

      // Reorganization pass
      let reorganizationSummary: ReorganizationSummary | undefined;
      if (this.policy.isReorganizationEnabled() && this.reorganizer) {
        reorganizationSummary = await this.runReorganizationPass(scope, report.id, personalityId);

        // Coherence check (monthly only)
        if (scope === 'monthly' && this.coherenceChecker) {
          const coherenceResult = await this.coherenceChecker.check(personalityId);
          reorganizationSummary = {
            ...reorganizationSummary,
            coherenceIssuesFound: coherenceResult.issuesFound,
            coherenceIssuesFixed: coherenceResult.issuesFixed,
          };
        }

        await this.auditStorage.updateReport(report.id, { reorganizationSummary });
      }

      // Maintenance pass (prune expired, apply decay)
      const maintenanceSummary = await this.runMaintenancePass(personalityId);
      await this.auditStorage.updateReport(report.id, { maintenanceSummary });

      // Post-snapshot
      const postSnapshot = await this.takeSnapshot(personalityId);

      // Determine final status
      const finalStatus = this.policy.requiresApproval()
        ? ('pending_approval' as const)
        : ('completed' as const);

      const updated = await this.auditStorage.updateReport(report.id, {
        status: finalStatus,
        completedAt: Date.now(),
        postSnapshot,
      });

      this.logger.info(
        {
          reportId: report.id,
          scope,
          status: finalStatus,
          memoriesBefore: preSnapshot.totalMemories,
          memoriesAfter: postSnapshot.totalMemories,
        },
        'Memory audit completed'
      );

      // Alert: audit completed
      this.emitAlert('brain.audit_completed', 'info', 'Memory audit completed', {
        scope,
        personalityId: personalityId ?? null,
        memoriesBefore: preSnapshot.totalMemories,
        memoriesAfter: postSnapshot.totalMemories,
        compressionRatio: compressionSummary?.compressionRatio ?? 0,
      });

      // Alert: health degraded
      if (postSnapshot.totalMemories > 0) {
        const health = await this.auditStorage.getHealthMetrics(personalityId);
        if (health.healthScore < 50) {
          this.emitAlert(
            'brain.memory_health_degraded',
            'warning',
            'Memory health score below threshold',
            {
              healthScore: health.healthScore,
              threshold: 50,
            }
          );
        }
      }

      return updated!;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error({ reportId: report.id, error: errorMessage }, 'Memory audit failed');

      this.emitAlert('brain.audit_failed', 'error', 'Memory audit failed', {
        scope,
        error: errorMessage,
      });

      const updated = await this.auditStorage.updateReport(report.id, {
        status: 'failed',
        completedAt: Date.now(),
        error: errorMessage,
      });
      return updated!;
    }
  }

  // ── Snapshot ────────────────────────────────────────────────

  private async takeSnapshot(personalityId?: string): Promise<AuditSnapshot> {
    const stats = await this.brainManager.getStats(personalityId);
    const memories = await this.brainStorage.queryMemories({
      personalityId,
      limit: 1,
      sortDirection: 'asc',
    });

    let avgImportance = 0;
    if (stats.memories.total > 0) {
      const avgRow = await this.brainStorage.getMeta('__avg_importance_cache');
      avgImportance = avgRow ? parseFloat(avgRow) : 0.5;
    }

    const now = Date.now();
    const oldestAge = memories.length > 0 ? now - memories[0]!.createdAt : 0;

    const expiringMemories = await this.brainStorage.queryMemories({
      personalityId,
      limit: 200,
    });
    const sevenDays = now + 7 * 24 * 60 * 60 * 1000;
    const expiringCount = expiringMemories.filter(
      (m) => m.expiresAt !== null && m.expiresAt < sevenDays
    ).length;

    return {
      totalMemories: stats.memories.total,
      totalKnowledge: stats.knowledge.total,
      byType: stats.memories.byType,
      avgImportance,
      oldestMemoryAge: oldestAge,
      expiringCount,
    };
  }

  // ── Compression Pass ───────────────────────────────────────

  private async runCompressionPass(
    scope: MemoryAuditScope,
    reportId: string,
    personalityId?: string
  ): Promise<CompressionSummary> {
    if (!this.compressor) {
      return {
        candidatesFound: 0,
        memoriesCompressed: 0,
        memoriesArchived: 0,
        compressionRatio: 0,
        qualityChecksPassed: 0,
        qualityChecksFailed: 0,
        errors: [],
      };
    }

    try {
      return await this.compressor.compress(scope, reportId, personalityId);
    } catch (err) {
      this.logger.warn({ error: String(err) }, 'Compression pass failed');
      return {
        candidatesFound: 0,
        memoriesCompressed: 0,
        memoriesArchived: 0,
        compressionRatio: 0,
        qualityChecksPassed: 0,
        qualityChecksFailed: 0,
        errors: [String(err)],
      };
    }
  }

  // ── Reorganization Pass ────────────────────────────────────

  private async runReorganizationPass(
    scope: MemoryAuditScope,
    reportId: string,
    personalityId?: string
  ): Promise<ReorganizationSummary> {
    if (!this.reorganizer) {
      return {
        promoted: 0,
        demoted: 0,
        topicsMerged: 0,
        topicsSplit: 0,
        importanceRecalibrated: 0,
        coherenceIssuesFound: 0,
        coherenceIssuesFixed: 0,
        errors: [],
      };
    }

    try {
      return await this.reorganizer.reorganize(scope, reportId, personalityId);
    } catch (err) {
      this.logger.warn({ error: String(err) }, 'Reorganization pass failed');
      return {
        promoted: 0,
        demoted: 0,
        topicsMerged: 0,
        topicsSplit: 0,
        importanceRecalibrated: 0,
        coherenceIssuesFound: 0,
        coherenceIssuesFixed: 0,
        errors: [String(err)],
      };
    }
  }

  // ── Maintenance Pass ───────────────────────────────────────

  private async runMaintenancePass(_personalityId?: string): Promise<MaintenanceSummary> {
    try {
      const result = await this.brainManager.runMaintenance();
      return {
        expiredPruned: result?.pruned ?? 0,
        decayApplied: result?.decayed ?? 0,
        duplicatesRemoved: 0,
      };
    } catch (err) {
      this.logger.warn({ error: String(err) }, 'Maintenance pass failed');
      return { expiredPruned: 0, decayApplied: 0, duplicatesRemoved: 0 };
    }
  }

  // ── Alerts ─────────────────────────────────────────────────

  private emitAlert(
    type: string,
    _severity: string,
    _message: string,
    _meta?: Record<string, unknown>
  ): void {
    try {
      const am = this.getAlertManager?.();
      if (am) {
        void am.evaluate({ [type]: 1 });
      }
    } catch {
      // Alert emission is best-effort
    }
  }
}
