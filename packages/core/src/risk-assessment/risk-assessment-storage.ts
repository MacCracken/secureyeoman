/**
 * RiskAssessmentStorage — Phase 53: Risk Assessment & Reporting System
 *
 * PostgreSQL-backed storage for risk assessments, external feeds, and findings.
 * Uses the risk schema created in migration 053.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';
import type {
  RiskAssessment,
  RiskFinding,
  ExternalFeed,
  ExternalFinding,
  CreateRiskAssessment,
  CreateExternalFeed,
  CreateExternalFinding,
} from '@secureyeoman/shared';

// ─── Internal row types ────────────────────────────────────────────────────────

interface AssessmentRow {
  id: string;
  name: string;
  status: string;
  assessment_types: unknown;
  window_days: number | string;
  composite_score: number | null;
  risk_level: string | null;
  domain_scores: unknown;
  findings: unknown;
  findings_count: number | string;
  report_json: unknown;
  report_html: string | null;
  report_markdown: string | null;
  report_csv: string | null;
  options: unknown;
  department_id: string | null;
  created_by: string | null;
  created_at: string | number;
  completed_at: string | number | null;
  error: string | null;
}

interface FeedRow {
  id: string;
  name: string;
  description: string | null;
  source_type: string;
  category: string;
  enabled: boolean;
  config: unknown;
  last_ingested_at: string | number | null;
  record_count: number | string;
  created_at: string | number;
  updated_at: string | number;
}

interface FindingRow {
  id: string;
  feed_id: string | null;
  source_ref: string | null;
  category: string;
  severity: string;
  title: string;
  description: string | null;
  affected_resource: string | null;
  recommendation: string | null;
  evidence: unknown;
  status: string;
  acknowledged_by: string | null;
  acknowledged_at: string | number | null;
  resolved_at: string | number | null;
  source_date: string | number | null;
  department_id: string | null;
  imported_at: string | number;
}

// ─── Row converters ────────────────────────────────────────────────────────────

function rowToAssessment(row: AssessmentRow): RiskAssessment {
  return {
    id: row.id,
    name: row.name,
    status: row.status as RiskAssessment['status'],
    assessmentTypes: (row.assessment_types as RiskAssessment['assessmentTypes']) ?? [],
    windowDays: typeof row.window_days === 'string' ? Number(row.window_days) : row.window_days,
    compositeScore: row.composite_score ?? undefined,
    riskLevel: (row.risk_level ?? undefined) as RiskAssessment['riskLevel'],
    domainScores: (row.domain_scores as Record<string, number>) ?? undefined,
    findings: (row.findings as RiskFinding[]) ?? undefined,
    findingsCount:
      typeof row.findings_count === 'string' ? Number(row.findings_count) : row.findings_count,
    options: (row.options as Record<string, unknown>) ?? undefined,
    departmentId: row.department_id ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: typeof row.created_at === 'string' ? Number(row.created_at) : row.created_at,
    completedAt:
      row.completed_at != null
        ? typeof row.completed_at === 'string'
          ? Number(row.completed_at)
          : row.completed_at
        : undefined,
    error: row.error ?? undefined,
  };
}

function rowToFeed(row: FeedRow): ExternalFeed {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    sourceType: row.source_type as ExternalFeed['sourceType'],
    category: row.category as ExternalFeed['category'],
    enabled: row.enabled,
    config: (row.config as Record<string, unknown>) ?? undefined,
    lastIngestedAt:
      row.last_ingested_at != null
        ? typeof row.last_ingested_at === 'string'
          ? Number(row.last_ingested_at)
          : row.last_ingested_at
        : undefined,
    recordCount: typeof row.record_count === 'string' ? Number(row.record_count) : row.record_count,
    createdAt: typeof row.created_at === 'string' ? Number(row.created_at) : row.created_at,
    updatedAt: typeof row.updated_at === 'string' ? Number(row.updated_at) : row.updated_at,
  };
}

function rowToFinding(row: FindingRow): ExternalFinding {
  return {
    id: row.id,
    feedId: row.feed_id ?? undefined,
    sourceRef: row.source_ref ?? undefined,
    category: row.category as ExternalFinding['category'],
    severity: row.severity as ExternalFinding['severity'],
    title: row.title,
    description: row.description ?? undefined,
    affectedResource: row.affected_resource ?? undefined,
    recommendation: row.recommendation ?? undefined,
    evidence: (row.evidence as Record<string, unknown>) ?? undefined,
    status: row.status as ExternalFinding['status'],
    acknowledgedBy: row.acknowledged_by ?? undefined,
    acknowledgedAt:
      row.acknowledged_at != null
        ? typeof row.acknowledged_at === 'string'
          ? Number(row.acknowledged_at)
          : row.acknowledged_at
        : undefined,
    resolvedAt:
      row.resolved_at != null
        ? typeof row.resolved_at === 'string'
          ? Number(row.resolved_at)
          : row.resolved_at
        : undefined,
    sourceDate:
      row.source_date != null
        ? typeof row.source_date === 'string'
          ? Number(row.source_date)
          : row.source_date
        : undefined,
    departmentId: row.department_id ?? undefined,
    importedAt: typeof row.imported_at === 'string' ? Number(row.imported_at) : row.imported_at,
  };
}

// ─── AssessmentResults shape ───────────────────────────────────────────────────

export interface AssessmentResults {
  compositeScore: number;
  riskLevel: RiskAssessment['riskLevel'];
  domainScores: Record<string, number>;
  findings: RiskFinding[];
  findingsCount: number;
  reportJson?: unknown;
  reportHtml?: string;
  reportMarkdown?: string;
  reportCsv?: string;
}

// ─── Storage class ────────────────────────────────────────────────────────────

export class RiskAssessmentStorage extends PgBaseStorage {
  // ── Assessments ─────────────────────────────────────────────────────────────

  async create(opts: CreateRiskAssessment, createdBy?: string): Promise<RiskAssessment> {
    const id = uuidv7();
    const now = Date.now();
    const row = await this.queryOne<AssessmentRow>(
      `INSERT INTO risk.assessments
         (id, name, status, assessment_types, window_days, findings_count, options, department_id, created_by, created_at)
       VALUES ($1, $2, 'pending', $3::jsonb, $4, 0, $5::jsonb, $6, $7, $8)
       RETURNING *`,
      [
        id,
        opts.name,
        JSON.stringify(
          opts.assessmentTypes ?? [
            'security',
            'autonomy',
            'governance',
            'infrastructure',
            'external',
          ]
        ),
        opts.windowDays ?? 7,
        JSON.stringify(opts.options ?? {}),
        opts.departmentId ?? null,
        createdBy ?? null,
        now,
      ]
    );
    return rowToAssessment(row!);
  }

  async list(opts: { limit?: number; offset?: number; status?: string } = {}): Promise<{
    items: RiskAssessment[];
    total: number;
  }> {
    const { limit = 50, offset = 0, status } = opts;
    const where = status ? `WHERE status = $3` : '';
    const params: unknown[] = [limit, offset];
    if (status) params.push(status);

    const [rows, countRow] = await Promise.all([
      this.queryMany<AssessmentRow>(
        `SELECT * FROM risk.assessments ${where} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        params
      ),
      this.queryOne<{ count: string }>(
        `SELECT COUNT(*) AS count FROM risk.assessments ${where}`,
        status ? [status] : []
      ),
    ]);

    return {
      items: rows.map(rowToAssessment),
      total: Number(countRow?.count ?? 0),
    };
  }

  async get(id: string): Promise<RiskAssessment | null> {
    const row = await this.queryOne<AssessmentRow>(`SELECT * FROM risk.assessments WHERE id = $1`, [
      id,
    ]);
    return row ? rowToAssessment(row) : null;
  }

  async updateStatus(id: string, status: string, error?: string): Promise<void> {
    await this.execute(`UPDATE risk.assessments SET status = $1, error = $2 WHERE id = $3`, [
      status,
      error ?? null,
      id,
    ]);
  }

  async saveResults(id: string, results: AssessmentResults): Promise<RiskAssessment> {
    const row = await this.queryOne<AssessmentRow>(
      `UPDATE risk.assessments
       SET status = 'completed',
           composite_score = $2,
           risk_level = $3,
           domain_scores = $4::jsonb,
           findings = $5::jsonb,
           findings_count = $6,
           report_json = $7::jsonb,
           report_html = $8,
           report_markdown = $9,
           report_csv = $10,
           completed_at = $11,
           error = NULL
       WHERE id = $1
       RETURNING *`,
      [
        id,
        results.compositeScore,
        results.riskLevel ?? null,
        JSON.stringify(results.domainScores),
        JSON.stringify(results.findings),
        results.findingsCount,
        results.reportJson ? JSON.stringify(results.reportJson) : null,
        results.reportHtml ?? null,
        results.reportMarkdown ?? null,
        results.reportCsv ?? null,
        Date.now(),
      ]
    );
    return rowToAssessment(row!);
  }

  // ── External Feeds ───────────────────────────────────────────────────────────

  async createFeed(feed: CreateExternalFeed): Promise<ExternalFeed> {
    const id = uuidv7();
    const now = Date.now();
    const row = await this.queryOne<FeedRow>(
      `INSERT INTO risk.external_feeds
         (id, name, description, source_type, category, enabled, config, record_count, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 0, $8, $8)
       RETURNING *`,
      [
        id,
        feed.name,
        feed.description ?? null,
        feed.sourceType,
        feed.category,
        feed.enabled ?? true,
        JSON.stringify(feed.config ?? {}),
        now,
      ]
    );
    return rowToFeed(row!);
  }

  async listFeeds(): Promise<ExternalFeed[]> {
    const rows = await this.queryMany<FeedRow>(
      `SELECT * FROM risk.external_feeds ORDER BY created_at DESC`
    );
    return rows.map(rowToFeed);
  }

  async getFeed(id: string): Promise<ExternalFeed | null> {
    const row = await this.queryOne<FeedRow>(`SELECT * FROM risk.external_feeds WHERE id = $1`, [
      id,
    ]);
    return row ? rowToFeed(row) : null;
  }

  async updateFeed(
    id: string,
    updates: Partial<Pick<ExternalFeed, 'name' | 'description' | 'enabled' | 'config'>>
  ): Promise<ExternalFeed | null> {
    const now = Date.now();
    const row = await this.queryOne<FeedRow>(
      `UPDATE risk.external_feeds
       SET name = COALESCE($2, name),
           description = COALESCE($3, description),
           enabled = COALESCE($4, enabled),
           config = COALESCE($5::jsonb, config),
           updated_at = $6
       WHERE id = $1
       RETURNING *`,
      [
        id,
        updates.name ?? null,
        updates.description ?? null,
        updates.enabled ?? null,
        updates.config ? JSON.stringify(updates.config) : null,
        now,
      ]
    );
    return row ? rowToFeed(row) : null;
  }

  async deleteFeed(id: string): Promise<boolean> {
    const count = await this.execute(`DELETE FROM risk.external_feeds WHERE id = $1`, [id]);
    return count > 0;
  }

  // ── External Findings ────────────────────────────────────────────────────────

  async createFinding(finding: CreateExternalFinding): Promise<ExternalFinding> {
    const id = uuidv7();
    const now = Date.now();
    const row = await this.queryOne<FindingRow>(
      `INSERT INTO risk.external_findings
         (id, feed_id, source_ref, category, severity, title, description,
          affected_resource, recommendation, evidence, status, source_date, department_id, imported_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, 'open', $11, $12, $13)
       RETURNING *`,
      [
        id,
        finding.feedId ?? null,
        finding.sourceRef ?? null,
        finding.category,
        finding.severity,
        finding.title,
        finding.description ?? null,
        finding.affectedResource ?? null,
        finding.recommendation ?? null,
        finding.evidence ? JSON.stringify(finding.evidence) : null,
        finding.sourceDate ?? null,
        finding.departmentId ?? null,
        now,
      ]
    );
    return rowToFinding(row!);
  }

  async ingestFindings(
    feedId: string,
    findings: CreateExternalFinding[]
  ): Promise<{ created: number; skipped: number }> {
    const now = Date.now();
    let created = 0;
    let skipped = 0;

    for (const finding of findings) {
      // Dedup by source_ref within the same feed
      if (finding.sourceRef) {
        const existing = await this.queryOne<{ id: string }>(
          `SELECT id FROM risk.external_findings WHERE feed_id = $1 AND source_ref = $2`,
          [feedId, finding.sourceRef]
        );
        if (existing) {
          skipped++;
          continue;
        }
      }

      await this.createFinding({ ...finding, feedId });
      created++;
    }

    // Update feed stats
    if (created > 0) {
      await this.execute(
        `UPDATE risk.external_feeds
         SET record_count = record_count + $1, last_ingested_at = $2, updated_at = $2
         WHERE id = $3`,
        [created, now, feedId]
      );
    }

    return { created, skipped };
  }

  async listFindings(
    opts: {
      feedId?: string;
      status?: string;
      severity?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ items: ExternalFinding[]; total: number }> {
    const { feedId, status, severity, limit = 50, offset = 0 } = opts;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (feedId) {
      params.push(feedId);
      conditions.push(`feed_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (severity) {
      params.push(severity);
      conditions.push(`severity = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countParams = [...params];

    params.push(limit);
    params.push(offset);

    const [rows, countRow] = await Promise.all([
      this.queryMany<FindingRow>(
        `SELECT * FROM risk.external_findings ${where}
         ORDER BY imported_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      ),
      this.queryOne<{ count: string }>(
        `SELECT COUNT(*) AS count FROM risk.external_findings ${where}`,
        countParams
      ),
    ]);

    return {
      items: rows.map(rowToFinding),
      total: Number(countRow?.count ?? 0),
    };
  }

  async updateFindingStatus(
    id: string,
    status: string,
    userId?: string
  ): Promise<ExternalFinding | null> {
    const now = Date.now();
    let extra = '';
    const params: unknown[] = [status, id];

    if (status === 'acknowledged') {
      params.splice(1, 0, userId ?? null, now);
      extra = ', acknowledged_by = $2, acknowledged_at = $3';
      params[params.length - 1] = id;
      // rebuild properly
      const row = await this.queryOne<FindingRow>(
        `UPDATE risk.external_findings
         SET status = $1, acknowledged_by = $2, acknowledged_at = $3
         WHERE id = $4
         RETURNING *`,
        [status, userId ?? null, now, id]
      );
      return row ? rowToFinding(row) : null;
    }

    if (status === 'resolved') {
      const row = await this.queryOne<FindingRow>(
        `UPDATE risk.external_findings
         SET status = $1, resolved_at = $2
         WHERE id = $3
         RETURNING *`,
        [status, now, id]
      );
      return row ? rowToFinding(row) : null;
    }

    // generic status update
    void extra;
    const row = await this.queryOne<FindingRow>(
      `UPDATE risk.external_findings SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );
    return row ? rowToFinding(row) : null;
  }
}
