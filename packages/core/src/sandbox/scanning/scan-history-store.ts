/**
 * Scan History Store — PostgreSQL storage for scan results (Phase 116-B)
 *
 * Named -store.ts (not -storage.ts) to be picked up by DB test config.
 */

import { randomUUID } from 'node:crypto';
import { PgBaseStorage } from '../../storage/pg-base.js';
import { buildWhere, parseCount } from '../../storage/query-helpers.js';
import type { ScanResult, ScanHistoryRow } from '@secureyeoman/shared';

export interface ScanHistoryRecordInput {
  artifactId: string;
  artifactType: string;
  sourceContext: string;
  personalityId?: string;
  userId?: string;
  scanResult: ScanResult;
  tenantId?: string;
}

export interface ScanHistoryListOptions {
  limit?: number;
  offset?: number;
  verdict?: string;
  sourceContext?: string;
  personalityId?: string;
  from?: number;
  to?: number;
}

export interface ScanStats {
  total: number;
  byVerdict: Record<string, number>;
  bySeverity: Record<string, number>;
  avgDurationMs: number;
  last24h: number;
}

export class ScanHistoryStore extends PgBaseStorage {
  async record(input: ScanHistoryRecordInput): Promise<ScanHistoryRow> {
    const id = randomUUID();
    const now = Date.now();
    const sr = input.scanResult;

    const row = await this.queryOne<ScanHistoryRow>(
      `INSERT INTO sandbox.scan_history (
        id, artifact_id, artifact_type, source_context, personality_id, user_id,
        verdict, finding_count, worst_severity, intent_score, scan_duration_ms,
        findings, threat_assessment, tenant_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        id,
        input.artifactId,
        input.artifactType,
        input.sourceContext,
        input.personalityId ?? null,
        input.userId ?? null,
        sr.verdict,
        sr.findings.length,
        sr.worstSeverity,
        sr.threatAssessment?.intentScore ?? null,
        sr.scanDurationMs,
        JSON.stringify(sr.findings),
        sr.threatAssessment ? JSON.stringify(sr.threatAssessment) : null,
        input.tenantId ?? null,
        now,
      ]
    );

    return this.mapRow(row!);
  }

  async list(
    opts: ScanHistoryListOptions = {}
  ): Promise<{ items: ScanHistoryRow[]; total: number }> {
    const { where, values, nextIdx } = buildWhere([
      { column: 'verdict', value: opts.verdict },
      { column: 'source_context', value: opts.sourceContext },
      { column: 'personality_id', value: opts.personalityId },
      { column: 'created_at', value: opts.from, op: '>=' },
      { column: 'created_at', value: opts.to, op: '<=' },
    ]);

    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    const countResult = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM sandbox.scan_history ${where}`,
      values
    );
    const total = parseCount(countResult);

    const rows = await this.queryMany(
      `SELECT * FROM sandbox.scan_history ${where}
       ORDER BY created_at DESC
       LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
      [...values, limit, offset]
    );

    return { items: rows.map((r) => this.mapRow(r)), total };
  }

  async getById(id: string): Promise<ScanHistoryRow | null> {
    const row = await this.queryOne('SELECT * FROM sandbox.scan_history WHERE id = $1', [id]);
    return row ? this.mapRow(row) : null;
  }

  async getStats(): Promise<ScanStats> {
    const now = Date.now();
    const dayAgo = now - 86_400_000;

    const [totalRow, verdictRows, severityRows, avgRow, recentRow] = await Promise.all([
      this.queryOne<{ count: string }>('SELECT COUNT(*)::text AS count FROM sandbox.scan_history'),
      this.queryMany<{ verdict: string; count: string }>(
        'SELECT verdict, COUNT(*)::text AS count FROM sandbox.scan_history GROUP BY verdict'
      ),
      this.queryMany<{ worst_severity: string; count: string }>(
        'SELECT worst_severity, COUNT(*)::text AS count FROM sandbox.scan_history GROUP BY worst_severity'
      ),
      this.queryOne<{ avg: string }>(
        'SELECT COALESCE(AVG(scan_duration_ms), 0)::text AS avg FROM sandbox.scan_history'
      ),
      this.queryOne<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM sandbox.scan_history WHERE created_at >= $1',
        [dayAgo]
      ),
    ]);

    const byVerdict: Record<string, number> = {};
    for (const r of verdictRows) {
      byVerdict[r.verdict] = parseInt(r.count, 10);
    }

    const bySeverity: Record<string, number> = {};
    for (const r of severityRows) {
      bySeverity[r.worst_severity] = parseInt(r.count, 10);
    }

    return {
      total: parseInt(totalRow?.count ?? '0', 10),
      byVerdict,
      bySeverity,
      avgDurationMs: parseFloat(avgRow?.avg ?? '0'),
      last24h: parseInt(recentRow?.count ?? '0', 10),
    };
  }

  private mapRow(row: Record<string, unknown>): ScanHistoryRow {
    return {
      id: row.id as string,
      artifactId: (row.artifact_id ?? row.artifactId) as string,
      artifactType: (row.artifact_type ?? row.artifactType) as string,
      sourceContext: (row.source_context ?? row.sourceContext) as string,
      personalityId: (row.personality_id ?? row.personalityId) as string | undefined,
      userId: (row.user_id ?? row.userId) as string | undefined,
      verdict: row.verdict as ScanHistoryRow['verdict'],
      findingCount: Number(row.finding_count ?? row.findingCount ?? 0),
      worstSeverity: (row.worst_severity ??
        row.worstSeverity ??
        'info') as ScanHistoryRow['worstSeverity'],
      intentScore: row.intent_score != null ? Number(row.intent_score) : undefined,
      scanDurationMs: Number(row.scan_duration_ms ?? row.scanDurationMs ?? 0),
      findings:
        typeof row.findings === 'string'
          ? JSON.parse(row.findings)
          : ((row.findings as any[]) ?? []),
      threatAssessment: row.threat_assessment
        ? ((typeof row.threat_assessment === 'string'
            ? JSON.parse(row.threat_assessment)
            : row.threat_assessment) as ScanHistoryRow['threatAssessment'])
        : undefined,
      tenantId: (row.tenant_id ?? row.tenantId) as string | undefined,
      createdAt: Number(row.created_at ?? row.createdAt),
    };
  }
}
