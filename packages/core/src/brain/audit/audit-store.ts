/**
 * Memory Audit Storage — PostgreSQL-backed storage for audit reports and archives.
 *
 * Phase 118: Memory Audits, Compression & Reorganization.
 */

import { PgBaseStorage } from '../../storage/pg-base.js';
import { buildWhere, buildSet } from '../../storage/query-helpers.js';
import { uuidv7 } from '../../utils/crypto.js';
import type {
  MemoryAuditReport,
  MemoryArchiveEntry,
  MemoryAuditScope,
  MemoryAuditStatus,
  AuditSnapshot,
  CompressionSummary,
  ReorganizationSummary,
  MaintenanceSummary,
  MemoryHealthMetrics,
} from '@secureyeoman/shared';
import type {
  AuditReportRow,
  MemoryArchiveRow,
  CreateAuditReportOpts,
  ArchiveMemoryOpts,
} from './types.js';

// ── Helpers ──────────────────────────────────────────────────

function safeJsonParse(val: unknown): unknown {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val as string);
  } catch {
    return null;
  }
}

function rowToReport(row: AuditReportRow): MemoryAuditReport {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    personalityId: row.personality_id,
    scope: row.scope as MemoryAuditScope,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    preSnapshot: safeJsonParse(row.pre_snapshot) as AuditSnapshot | null,
    postSnapshot: safeJsonParse(row.post_snapshot) as AuditSnapshot | null,
    compressionSummary: safeJsonParse(row.compression_summary) as CompressionSummary | null,
    reorganizationSummary: safeJsonParse(
      row.reorganization_summary
    ) as ReorganizationSummary | null,
    maintenanceSummary: safeJsonParse(row.maintenance_summary) as MaintenanceSummary | null,
    status: row.status as MemoryAuditStatus,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    error: row.error,
  };
}

function rowToArchive(row: MemoryArchiveRow): MemoryArchiveEntry {
  return {
    id: row.id,
    originalMemoryId: row.original_memory_id,
    originalContent: row.original_content,
    originalImportance: row.original_importance,
    originalContext: (safeJsonParse(row.original_context) as Record<string, unknown> | null) ?? {},
    transformType: row.transform_type as MemoryArchiveEntry['transformType'],
    auditReportId: row.audit_report_id,
    archivedAt: row.archived_at,
    tenantId: row.tenant_id,
  };
}

// ── Storage ──────────────────────────────────────────────────

export class MemoryAuditStorage extends PgBaseStorage {
  // ── Report CRUD ────────────────────────────────────────────

  async createReport(opts: CreateAuditReportOpts): Promise<MemoryAuditReport> {
    const id = uuidv7();
    const now = Date.now();
    const row = await this.queryOne<AuditReportRow>(
      `INSERT INTO brain.audit_reports (id, tenant_id, personality_id, scope, started_at, status)
       VALUES ($1, $2, $3, $4, $5, 'running')
       RETURNING *`,
      [id, opts.tenantId ?? 'default', opts.personalityId ?? null, opts.scope, now]
    );
    return rowToReport(row!);
  }

  async updateReport(
    id: string,
    updates: {
      status?: MemoryAuditStatus;
      completedAt?: number;
      preSnapshot?: AuditSnapshot;
      postSnapshot?: AuditSnapshot;
      compressionSummary?: CompressionSummary;
      reorganizationSummary?: ReorganizationSummary;
      maintenanceSummary?: MaintenanceSummary;
      error?: string;
    }
  ): Promise<MemoryAuditReport | null> {
    const { setClause, values, nextIdx, hasUpdates } = buildSet([
      { column: 'status', value: updates.status },
      { column: 'completed_at', value: updates.completedAt },
      { column: 'pre_snapshot', value: updates.preSnapshot, json: true },
      { column: 'post_snapshot', value: updates.postSnapshot, json: true },
      { column: 'compression_summary', value: updates.compressionSummary, json: true },
      { column: 'reorganization_summary', value: updates.reorganizationSummary, json: true },
      { column: 'maintenance_summary', value: updates.maintenanceSummary, json: true },
      { column: 'error', value: updates.error },
    ]);

    if (!hasUpdates) return this.getReport(id);

    values.push(id);
    const row = await this.queryOne<AuditReportRow>(
      `UPDATE brain.audit_reports SET ${setClause} WHERE id = $${nextIdx} RETURNING *`,
      values
    );
    return row ? rowToReport(row) : null;
  }

  async getReport(id: string): Promise<MemoryAuditReport | null> {
    const row = await this.queryOne<AuditReportRow>(
      'SELECT * FROM brain.audit_reports WHERE id = $1',
      [id]
    );
    return row ? rowToReport(row) : null;
  }

  async listReports(opts?: {
    scope?: MemoryAuditScope;
    personalityId?: string;
    status?: MemoryAuditStatus;
    limit?: number;
    offset?: number;
  }): Promise<MemoryAuditReport[]> {
    const { where, values, nextIdx } = buildWhere([
      { column: 'scope', value: opts?.scope },
      { column: 'personality_id', value: opts?.personalityId },
      { column: 'status', value: opts?.status },
    ]);

    const limit = Math.min(opts?.limit ?? 50, 200);
    const offset = opts?.offset ?? 0;

    const rows = await this.queryMany<AuditReportRow>(
      `SELECT * FROM brain.audit_reports ${where} ORDER BY started_at DESC LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
      [...values, limit, offset]
    );
    return rows.map(rowToReport);
  }

  async approveReport(id: string, approvedBy: string): Promise<MemoryAuditReport | null> {
    const row = await this.queryOne<AuditReportRow>(
      `UPDATE brain.audit_reports
       SET status = 'completed', approved_by = $1, approved_at = $2
       WHERE id = $3 AND status = 'pending_approval'
       RETURNING *`,
      [approvedBy, Date.now(), id]
    );
    return row ? rowToReport(row) : null;
  }

  // ── Archive ────────────────────────────────────────────────

  async archiveMemory(opts: ArchiveMemoryOpts): Promise<MemoryArchiveEntry> {
    const id = uuidv7();
    const row = await this.queryOne<MemoryArchiveRow>(
      `INSERT INTO brain.memory_archive
         (id, original_memory_id, original_content, original_importance, original_context,
          transform_type, audit_report_id, archived_at, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        id,
        opts.originalMemoryId,
        opts.originalContent,
        opts.originalImportance,
        JSON.stringify(opts.originalContext ?? {}),
        opts.transformType,
        opts.auditReportId ?? null,
        Date.now(),
        opts.tenantId ?? 'default',
      ]
    );
    return rowToArchive(row!);
  }

  async getArchiveForMemory(originalMemoryId: string): Promise<MemoryArchiveEntry[]> {
    const rows = await this.queryMany<MemoryArchiveRow>(
      'SELECT * FROM brain.memory_archive WHERE original_memory_id = $1 ORDER BY archived_at DESC',
      [originalMemoryId]
    );
    return rows.map(rowToArchive);
  }

  async cleanupOldArchives(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    return this.execute('DELETE FROM brain.memory_archive WHERE archived_at < $1', [cutoff]);
  }

  async getHealthMetrics(personalityId?: string): Promise<MemoryHealthMetrics> {
    const pidCondition = personalityId ? 'AND personality_id = $1' : '';
    const pidVals = personalityId ? [personalityId] : [];

    // Total memories count
    const memRow = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM brain.memories WHERE 1=1 ${pidCondition}`,
      pidVals
    );
    const totalMemories = parseInt(memRow?.count ?? '0', 10);

    // Total knowledge count
    const knRow = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM brain.knowledge WHERE 1=1 ${pidCondition}`,
      pidVals
    );
    const totalKnowledge = parseInt(knRow?.count ?? '0', 10);

    // Avg importance
    const avgRow = await this.queryOne<{ avg: number | null }>(
      `SELECT AVG(importance) as avg FROM brain.memories WHERE 1=1 ${pidCondition}`,
      pidVals
    );
    const avgImportance = avgRow?.avg ?? 0;

    // Expiring within 7 days
    const sevenDays = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const expRow = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM brain.memories WHERE expires_at IS NOT NULL AND expires_at < $${pidVals.length + 1} ${pidCondition}`,
      [...pidVals, sevenDays]
    );
    const expiringWithin7Days = parseInt(expRow?.count ?? '0', 10);

    // Low importance ratio (< 0.2)
    const lowRow = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM brain.memories WHERE importance < 0.2 ${pidCondition}`,
      pidVals
    );
    const lowCount = parseInt(lowRow?.count ?? '0', 10);
    const lowImportanceRatio = totalMemories > 0 ? lowCount / totalMemories : 0;

    // Last audit
    const lastAudit = await this.queryOne<{ started_at: number; scope: string }>(
      `SELECT started_at, scope FROM brain.audit_reports WHERE status = 'completed' ORDER BY started_at DESC LIMIT 1`,
      []
    );

    // Compression savings (total archived)
    const archiveRow = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM brain.memory_archive WHERE transform_type = 'compressed'`,
      []
    );
    const compressionSavings = parseInt(archiveRow?.count ?? '0', 10);

    // Health score calculation
    let healthScore = 100;
    if (lowImportanceRatio > 0.5) healthScore -= 20;
    else if (lowImportanceRatio > 0.3) healthScore -= 10;
    if (expiringWithin7Days > totalMemories * 0.2) healthScore -= 15;
    if (!lastAudit) healthScore -= 10;
    else {
      const daysSinceAudit = (Date.now() - lastAudit.started_at) / (24 * 60 * 60 * 1000);
      if (daysSinceAudit > 30) healthScore -= 15;
      else if (daysSinceAudit > 7) healthScore -= 5;
    }
    healthScore = Math.max(0, Math.min(100, healthScore));

    return {
      healthScore,
      totalMemories,
      totalKnowledge,
      avgImportance: Math.round(avgImportance * 1000) / 1000,
      expiringWithin7Days,
      lowImportanceRatio: Math.round(lowImportanceRatio * 1000) / 1000,
      duplicateEstimate: 0,
      lastAuditAt: lastAudit?.started_at ?? null,
      lastAuditScope: (lastAudit?.scope as MemoryAuditScope) ?? null,
      compressionSavings,
    };
  }
}
