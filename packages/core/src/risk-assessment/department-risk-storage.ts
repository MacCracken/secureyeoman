/**
 * DepartmentRiskStorage — Phase 111: Departmental Risk Register
 *
 * PostgreSQL-backed storage for departments, register entries, and department score snapshots.
 * Uses the risk schema extended in migration 003_departmental_risk.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';
import type {
  Department,
  DepartmentCreate,
  DepartmentUpdate,
  RegisterEntry,
  RegisterEntryCreate,
  RegisterEntryUpdate,
  DepartmentScore,
} from '@secureyeoman/shared';

// ─── Internal row types ────────────────────────────────────────────────────────

interface DepartmentRow {
  id: string;
  name: string;
  description: string | null;
  mission: string | null;
  objectives: unknown;
  parent_id: string | null;
  team_id: string | null;
  risk_appetite: unknown;
  compliance_targets: unknown;
  metadata: unknown;
  tenant_id: string | null;
  created_at: string | number;
  updated_at: string | number;
}

interface RegisterEntryRow {
  id: string;
  department_id: string;
  title: string;
  description: string | null;
  category: string;
  severity: string;
  likelihood: number | string;
  impact: number | string;
  risk_score: number | string;
  owner: string | null;
  mitigations: unknown;
  status: string;
  due_date: string | null;
  source: string | null;
  source_ref: string | null;
  evidence_refs: unknown;
  tenant_id: string | null;
  created_by: string | null;
  created_at: string | number;
  updated_at: string | number;
  closed_at: string | number | null;
}

interface DepartmentScoreRow {
  id: string;
  department_id: string;
  scored_at: string;
  overall_score: number | string;
  domain_scores: unknown;
  open_risks: number | string;
  overdue_risks: number | string;
  appetite_breaches: unknown;
  assessment_id: string | null;
  tenant_id: string | null;
  created_at: string | number;
}

// ─── Row converters ────────────────────────────────────────────────────────────

function rowToDepartment(row: DepartmentRow): Department {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    mission: row.mission ?? undefined,
    objectives: Array.isArray(row.objectives) ? (row.objectives as Department['objectives']) : [],
    parentId: row.parent_id ?? undefined,
    teamId: row.team_id ?? undefined,
    riskAppetite: (row.risk_appetite as Department['riskAppetite']) ?? {
      security: 50,
      operational: 50,
      financial: 50,
      compliance: 50,
      reputational: 50,
    },
    complianceTargets: Array.isArray(row.compliance_targets)
      ? (row.compliance_targets as Department['complianceTargets'])
      : [],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    tenantId: row.tenant_id ?? undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function rowToRegisterEntry(row: RegisterEntryRow): RegisterEntry {
  return {
    id: row.id,
    departmentId: row.department_id,
    title: row.title,
    description: row.description ?? undefined,
    category: row.category as RegisterEntry['category'],
    severity: row.severity as RegisterEntry['severity'],
    likelihood: Number(row.likelihood),
    impact: Number(row.impact),
    riskScore: Number(row.risk_score),
    owner: row.owner ?? undefined,
    mitigations: Array.isArray(row.mitigations)
      ? (row.mitigations as RegisterEntry['mitigations'])
      : [],
    status: row.status as RegisterEntry['status'],
    dueDate: row.due_date ?? undefined,
    source: (row.source as RegisterEntry['source']) ?? undefined,
    sourceRef: row.source_ref ?? undefined,
    evidenceRefs: Array.isArray(row.evidence_refs) ? (row.evidence_refs as string[]) : [],
    tenantId: row.tenant_id ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    closedAt: row.closed_at ? Number(row.closed_at) : undefined,
  };
}

function rowToDepartmentScore(row: DepartmentScoreRow): DepartmentScore {
  return {
    id: row.id,
    departmentId: row.department_id,
    scoredAt: String(row.scored_at),
    overallScore: Number(row.overall_score),
    domainScores: (row.domain_scores as Record<string, number>) ?? {},
    openRisks: Number(row.open_risks),
    overdueRisks: Number(row.overdue_risks),
    appetiteBreaches: Array.isArray(row.appetite_breaches)
      ? (row.appetite_breaches as DepartmentScore['appetiteBreaches'])
      : [],
    assessmentId: row.assessment_id ?? undefined,
    tenantId: row.tenant_id ?? undefined,
    createdAt: Number(row.created_at),
  };
}

// ─── Storage ────────────────────────────────────────────────────────────────────

export class DepartmentRiskStorage extends PgBaseStorage {
  constructor() {
    super();
  }

  // ── Department CRUD ──────────────────────────────────────────

  async createDepartment(data: DepartmentCreate, tenantId?: string): Promise<Department> {
    const id = uuidv7();
    const now = Date.now();
    const row = await this.queryOne<DepartmentRow>(
      `INSERT INTO risk.departments (id, name, description, mission, objectives, parent_id, team_id,
        risk_appetite, compliance_targets, metadata, tenant_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        id,
        data.name,
        data.description ?? null,
        data.mission ?? null,
        JSON.stringify(data.objectives ?? []),
        data.parentId ?? null,
        data.teamId ?? null,
        JSON.stringify(data.riskAppetite ?? { security: 50, operational: 50, financial: 50, compliance: 50, reputational: 50 }),
        JSON.stringify(data.complianceTargets ?? []),
        JSON.stringify(data.metadata ?? {}),
        tenantId ?? null,
        now,
        now,
      ]
    );
    return rowToDepartment(row!);
  }

  async getDepartment(id: string): Promise<Department | null> {
    const row = await this.queryOne<DepartmentRow>(
      `SELECT * FROM risk.departments WHERE id = $1`,
      [id]
    );
    return row ? rowToDepartment(row) : null;
  }

  async updateDepartment(id: string, data: DepartmentUpdate): Promise<Department | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) { sets.push(`name = $${idx++}`); params.push(data.name); }
    if (data.description !== undefined) { sets.push(`description = $${idx++}`); params.push(data.description); }
    if (data.mission !== undefined) { sets.push(`mission = $${idx++}`); params.push(data.mission); }
    if (data.objectives !== undefined) { sets.push(`objectives = $${idx++}`); params.push(JSON.stringify(data.objectives)); }
    if (data.parentId !== undefined) { sets.push(`parent_id = $${idx++}`); params.push(data.parentId); }
    if (data.teamId !== undefined) { sets.push(`team_id = $${idx++}`); params.push(data.teamId); }
    if (data.riskAppetite !== undefined) { sets.push(`risk_appetite = $${idx++}`); params.push(JSON.stringify(data.riskAppetite)); }
    if (data.complianceTargets !== undefined) { sets.push(`compliance_targets = $${idx++}`); params.push(JSON.stringify(data.complianceTargets)); }
    if (data.metadata !== undefined) { sets.push(`metadata = $${idx++}`); params.push(JSON.stringify(data.metadata)); }

    if (sets.length === 0) return this.getDepartment(id);

    sets.push(`updated_at = $${idx++}`);
    params.push(Date.now());
    params.push(id);

    const row = await this.queryOne<DepartmentRow>(
      `UPDATE risk.departments SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    return row ? rowToDepartment(row) : null;
  }

  async deleteDepartment(id: string): Promise<boolean> {
    const rowCount = await this.execute(
      `DELETE FROM risk.departments WHERE id = $1`,
      [id]
    );
    return rowCount > 0;
  }

  async listDepartments(opts?: {
    parentId?: string | null;
    tenantId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: Department[]; total: number }> {
    const where: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (opts?.parentId !== undefined) {
      if (opts.parentId === null) {
        where.push('parent_id IS NULL');
      } else {
        where.push(`parent_id = $${idx++}`);
        params.push(opts.parentId);
      }
    }
    if (opts?.tenantId) {
      where.push(`tenant_id = $${idx++}`);
      params.push(opts.tenantId);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const limit = opts?.limit ?? 100;
    const offset = opts?.offset ?? 0;

    const countRow = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM risk.departments ${whereClause}`,
      params
    );
    const total = Number(countRow?.count ?? 0);

    const rows = await this.queryMany<DepartmentRow>(
      `SELECT * FROM risk.departments ${whereClause} ORDER BY name ASC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    return { items: rows.map(rowToDepartment), total };
  }

  async getDepartmentTree(rootId?: string): Promise<Department[]> {
    const sql = rootId
      ? `WITH RECURSIVE tree AS (
           SELECT * FROM risk.departments WHERE id = $1
           UNION ALL
           SELECT d.* FROM risk.departments d JOIN tree t ON d.parent_id = t.id
         ) SELECT * FROM tree ORDER BY name`
      : `WITH RECURSIVE tree AS (
           SELECT * FROM risk.departments WHERE parent_id IS NULL
           UNION ALL
           SELECT d.* FROM risk.departments d JOIN tree t ON d.parent_id = t.id
         ) SELECT * FROM tree ORDER BY name`;

    const rows = await this.queryMany<DepartmentRow>(sql, rootId ? [rootId] : []);
    return rows.map(rowToDepartment);
  }

  // ── Register Entry CRUD ──────────────────────────────────────

  async createRegisterEntry(data: RegisterEntryCreate, createdBy?: string, tenantId?: string): Promise<RegisterEntry> {
    const id = uuidv7();
    const now = Date.now();
    const row = await this.queryOne<RegisterEntryRow>(
      `INSERT INTO risk.register_entries (id, department_id, title, description, category, severity,
        likelihood, impact, owner, mitigations, status, due_date, source, source_ref, evidence_refs,
        tenant_id, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       RETURNING *`,
      [
        id,
        data.departmentId,
        data.title,
        data.description ?? null,
        data.category,
        data.severity,
        data.likelihood,
        data.impact,
        data.owner ?? null,
        JSON.stringify(data.mitigations ?? []),
        data.status ?? 'open',
        data.dueDate ?? null,
        data.source ?? null,
        data.sourceRef ?? null,
        JSON.stringify(data.evidenceRefs ?? []),
        tenantId ?? null,
        createdBy ?? null,
        now,
        now,
      ]
    );
    return rowToRegisterEntry(row!);
  }

  async getRegisterEntry(id: string): Promise<RegisterEntry | null> {
    const row = await this.queryOne<RegisterEntryRow>(
      `SELECT * FROM risk.register_entries WHERE id = $1`,
      [id]
    );
    return row ? rowToRegisterEntry(row) : null;
  }

  async updateRegisterEntry(id: string, data: RegisterEntryUpdate): Promise<RegisterEntry | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.title !== undefined) { sets.push(`title = $${idx++}`); params.push(data.title); }
    if (data.description !== undefined) { sets.push(`description = $${idx++}`); params.push(data.description); }
    if (data.category !== undefined) { sets.push(`category = $${idx++}`); params.push(data.category); }
    if (data.severity !== undefined) { sets.push(`severity = $${idx++}`); params.push(data.severity); }
    if (data.likelihood !== undefined) { sets.push(`likelihood = $${idx++}`); params.push(data.likelihood); }
    if (data.impact !== undefined) { sets.push(`impact = $${idx++}`); params.push(data.impact); }
    if (data.owner !== undefined) { sets.push(`owner = $${idx++}`); params.push(data.owner); }
    if (data.mitigations !== undefined) { sets.push(`mitigations = $${idx++}`); params.push(JSON.stringify(data.mitigations)); }
    if (data.status !== undefined) { sets.push(`status = $${idx++}`); params.push(data.status); }
    if (data.dueDate !== undefined) { sets.push(`due_date = $${idx++}`); params.push(data.dueDate); }
    if (data.source !== undefined) { sets.push(`source = $${idx++}`); params.push(data.source); }
    if (data.sourceRef !== undefined) { sets.push(`source_ref = $${idx++}`); params.push(data.sourceRef); }
    if (data.evidenceRefs !== undefined) { sets.push(`evidence_refs = $${idx++}`); params.push(JSON.stringify(data.evidenceRefs)); }

    if (sets.length === 0) return this.getRegisterEntry(id);

    sets.push(`updated_at = $${idx++}`);
    params.push(Date.now());
    params.push(id);

    const row = await this.queryOne<RegisterEntryRow>(
      `UPDATE risk.register_entries SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    return row ? rowToRegisterEntry(row) : null;
  }

  async deleteRegisterEntry(id: string): Promise<boolean> {
    const rowCount = await this.execute(
      `DELETE FROM risk.register_entries WHERE id = $1`,
      [id]
    );
    return rowCount > 0;
  }

  async listRegisterEntries(opts?: {
    departmentId?: string;
    status?: string;
    category?: string;
    severity?: string;
    overdue?: boolean;
    owner?: string;
    tenantId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: RegisterEntry[]; total: number }> {
    const where: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (opts?.departmentId) { where.push(`department_id = $${idx++}`); params.push(opts.departmentId); }
    if (opts?.status) { where.push(`status = $${idx++}`); params.push(opts.status); }
    if (opts?.category) { where.push(`category = $${idx++}`); params.push(opts.category); }
    if (opts?.severity) { where.push(`severity = $${idx++}`); params.push(opts.severity); }
    if (opts?.owner) { where.push(`owner = $${idx++}`); params.push(opts.owner); }
    if (opts?.tenantId) { where.push(`tenant_id = $${idx++}`); params.push(opts.tenantId); }
    if (opts?.overdue) { where.push(`due_date < now() AND status NOT IN ('closed', 'mitigated', 'accepted', 'transferred')`); }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const limit = opts?.limit ?? 100;
    const offset = opts?.offset ?? 0;

    const countRow = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM risk.register_entries ${whereClause}`,
      params
    );
    const total = Number(countRow?.count ?? 0);

    const rows = await this.queryMany<RegisterEntryRow>(
      `SELECT * FROM risk.register_entries ${whereClause} ORDER BY risk_score DESC, created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    return { items: rows.map(rowToRegisterEntry), total };
  }

  async getRegisterStats(departmentId: string): Promise<{
    total: number;
    open: number;
    overdue: number;
    critical: number;
    avgRiskScore: number;
  }> {
    const row = await this.queryOne<{
      total: string;
      open: string;
      overdue: string;
      critical: string;
      avg_score: string | null;
    }>(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status NOT IN ('closed', 'mitigated', 'accepted', 'transferred')) as open,
         COUNT(*) FILTER (WHERE due_date < now() AND status NOT IN ('closed', 'mitigated', 'accepted', 'transferred')) as overdue,
         COUNT(*) FILTER (WHERE severity = 'critical' AND status NOT IN ('closed', 'mitigated', 'accepted', 'transferred')) as critical,
         AVG(risk_score) as avg_score
       FROM risk.register_entries WHERE department_id = $1`,
      [departmentId]
    );

    return {
      total: Number(row?.total ?? 0),
      open: Number(row?.open ?? 0),
      overdue: Number(row?.overdue ?? 0),
      critical: Number(row?.critical ?? 0),
      avgRiskScore: Number(row?.avg_score ?? 0),
    };
  }

  // ── Department Scores ────────────────────────────────────────

  async recordDepartmentScore(data: {
    departmentId: string;
    overallScore: number;
    domainScores: Record<string, number>;
    openRisks: number;
    overdueRisks: number;
    appetiteBreaches: Array<{ domain: string; score: number; threshold: number }>;
    assessmentId?: string;
    tenantId?: string;
  }): Promise<DepartmentScore> {
    const id = uuidv7();
    const now = Date.now();
    const row = await this.queryOne<DepartmentScoreRow>(
      `INSERT INTO risk.department_scores (id, department_id, overall_score, domain_scores,
        open_risks, overdue_risks, appetite_breaches, assessment_id, tenant_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        id,
        data.departmentId,
        data.overallScore,
        JSON.stringify(data.domainScores),
        data.openRisks,
        data.overdueRisks,
        JSON.stringify(data.appetiteBreaches),
        data.assessmentId ?? null,
        data.tenantId ?? null,
        now,
      ]
    );
    return rowToDepartmentScore(row!);
  }

  async listDepartmentScores(opts: {
    departmentId: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<DepartmentScore[]> {
    const where: string[] = ['department_id = $1'];
    const params: unknown[] = [opts.departmentId];
    let idx = 2;

    if (opts.from) { where.push(`scored_at >= $${idx++}`); params.push(opts.from); }
    if (opts.to) { where.push(`scored_at <= $${idx++}`); params.push(opts.to); }

    const limit = opts.limit ?? 100;
    const rows = await this.queryMany<DepartmentScoreRow>(
      `SELECT * FROM risk.department_scores WHERE ${where.join(' AND ')} ORDER BY scored_at DESC LIMIT $${idx}`,
      [...params, limit]
    );
    return rows.map(rowToDepartmentScore);
  }

  async getLatestScores(tenantId?: string): Promise<DepartmentScore[]> {
    const sql = tenantId
      ? `SELECT DISTINCT ON (department_id) * FROM risk.department_scores
         WHERE tenant_id = $1 ORDER BY department_id, scored_at DESC`
      : `SELECT DISTINCT ON (department_id) * FROM risk.department_scores
         ORDER BY department_id, scored_at DESC`;
    const rows = await this.queryMany<DepartmentScoreRow>(sql, tenantId ? [tenantId] : []);
    return rows.map(rowToDepartmentScore);
  }

  async getAppetiteBreaches(tenantId?: string): Promise<DepartmentScore[]> {
    const latest = await this.getLatestScores(tenantId);
    return latest.filter((s) => s.appetiteBreaches.length > 0);
  }
}
