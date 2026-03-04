/**
 * SraStorage — Phase 123: Security Reference Architecture
 *
 * PostgreSQL-backed storage for SRA blueprints, assessments,
 * compliance mappings, and aggregate queries. Uses the security schema.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';
import type {
  SraBlueprint,
  SraBlueprintCreate,
  SraBlueprintUpdate,
  SraAssessment,
  SraAssessmentCreate,
  SraAssessmentUpdate,
  SraComplianceMappingRecord,
} from '@secureyeoman/shared';

// ─── Internal row types ──────────────────────────────────────────────────────

interface BlueprintRow {
  id: string;
  org_id: string | null;
  name: string;
  description: string | null;
  provider: string;
  framework: string;
  controls: unknown;
  status: string;
  is_builtin: boolean;
  metadata: unknown;
  created_by: string | null;
  created_at: string | number;
  updated_at: string | number;
}

interface AssessmentRow {
  id: string;
  org_id: string | null;
  blueprint_id: string;
  name: string;
  infrastructure_description: string | null;
  control_results: unknown;
  summary: unknown;
  status: string;
  linked_risk_assessment_id: string | null;
  created_by: string | null;
  created_at: string | number;
  updated_at: string | number;
}

interface MappingRow {
  domain: string;
  framework: string;
  control_id: string;
  control_title: string;
  description: string;
}

// ─── Row converters ──────────────────────────────────────────────────────────

function rowToBlueprint(row: BlueprintRow): SraBlueprint {
  return {
    id: row.id,
    orgId: row.org_id ?? undefined,
    name: row.name,
    description: row.description ?? undefined,
    provider: row.provider as SraBlueprint['provider'],
    framework: row.framework as SraBlueprint['framework'],
    controls: (row.controls as SraBlueprint['controls']) ?? [],
    status: row.status as SraBlueprint['status'],
    isBuiltin: row.is_builtin,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdBy: row.created_by ?? undefined,
    createdAt: typeof row.created_at === 'string' ? Number(row.created_at) : row.created_at,
    updatedAt: typeof row.updated_at === 'string' ? Number(row.updated_at) : row.updated_at,
  };
}

function rowToAssessment(row: AssessmentRow): SraAssessment {
  return {
    id: row.id,
    orgId: row.org_id ?? undefined,
    blueprintId: row.blueprint_id,
    name: row.name,
    infrastructureDescription: row.infrastructure_description ?? undefined,
    controlResults: (row.control_results as SraAssessment['controlResults']) ?? [],
    summary: (row.summary as SraAssessment['summary']) ?? undefined,
    status: row.status as SraAssessment['status'],
    linkedRiskAssessmentId: row.linked_risk_assessment_id ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: typeof row.created_at === 'string' ? Number(row.created_at) : row.created_at,
    updatedAt: typeof row.updated_at === 'string' ? Number(row.updated_at) : row.updated_at,
  };
}

function rowToMapping(row: MappingRow): SraComplianceMappingRecord {
  return {
    domain: row.domain as SraComplianceMappingRecord['domain'],
    framework: row.framework,
    controlId: row.control_id,
    controlTitle: row.control_title,
    description: row.description,
  };
}

// ─── Storage class ──────────────────────────────────────────────────────────

export class SraStorage extends PgBaseStorage {
  // ── Blueprints ─────────────────────────────────────────────────

  async createBlueprint(
    data: SraBlueprintCreate,
    createdBy?: string,
    orgId?: string
  ): Promise<SraBlueprint> {
    const id = uuidv7();
    const now = Date.now();
    const row = await this.queryOne<BlueprintRow>(
      `INSERT INTO security.sra_blueprints
         (id, org_id, name, description, provider, framework, controls, status,
          is_builtin, metadata, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8,
               FALSE, $9::jsonb, $10, $11, $11)
       RETURNING *`,
      [
        id,
        orgId ?? null,
        data.name,
        data.description ?? null,
        data.provider,
        data.framework,
        JSON.stringify(data.controls ?? []),
        data.status ?? 'draft',
        JSON.stringify(data.metadata ?? {}),
        createdBy ?? null,
        now,
      ]
    );
    return rowToBlueprint(row!);
  }

  async getBlueprint(id: string): Promise<SraBlueprint | null> {
    const row = await this.queryOne<BlueprintRow>(
      `SELECT * FROM security.sra_blueprints WHERE id = $1`,
      [id]
    );
    return row ? rowToBlueprint(row) : null;
  }

  async updateBlueprint(id: string, data: SraBlueprintUpdate): Promise<SraBlueprint | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      sets.push(`name = $${idx++}`);
      params.push(data.name);
    }
    if (data.description !== undefined) {
      sets.push(`description = $${idx++}`);
      params.push(data.description);
    }
    if (data.provider !== undefined) {
      sets.push(`provider = $${idx++}`);
      params.push(data.provider);
    }
    if (data.framework !== undefined) {
      sets.push(`framework = $${idx++}`);
      params.push(data.framework);
    }
    if (data.controls !== undefined) {
      sets.push(`controls = $${idx++}::jsonb`);
      params.push(JSON.stringify(data.controls));
    }
    if (data.status !== undefined) {
      sets.push(`status = $${idx++}`);
      params.push(data.status);
    }
    if (data.metadata !== undefined) {
      sets.push(`metadata = $${idx++}::jsonb`);
      params.push(JSON.stringify(data.metadata));
    }

    if (sets.length === 0) return this.getBlueprint(id);

    sets.push(`updated_at = $${idx++}`);
    params.push(Date.now());
    params.push(id);

    const row = await this.queryOne<BlueprintRow>(
      `UPDATE security.sra_blueprints SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    return row ? rowToBlueprint(row) : null;
  }

  async deleteBlueprint(id: string): Promise<boolean> {
    const count = await this.execute(
      `DELETE FROM security.sra_blueprints WHERE id = $1`,
      [id]
    );
    return count > 0;
  }

  async listBlueprints(
    opts: {
      provider?: string;
      framework?: string;
      status?: string;
      orgId?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ items: SraBlueprint[]; total: number }> {
    const { provider, framework, status, orgId, limit = 50, offset = 0 } = opts;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (provider) {
      params.push(provider);
      conditions.push(`provider = $${params.length}`);
    }
    if (framework) {
      params.push(framework);
      conditions.push(`framework = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (orgId) {
      params.push(orgId);
      conditions.push(`(org_id = $${params.length} OR org_id IS NULL)`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countParams = [...params];

    params.push(limit);
    params.push(offset);

    const [rows, countRow] = await Promise.all([
      this.queryMany<BlueprintRow>(
        `SELECT * FROM security.sra_blueprints ${where}
         ORDER BY created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      ),
      this.queryOne<{ count: string }>(
        `SELECT COUNT(*) AS count FROM security.sra_blueprints ${where}`,
        countParams
      ),
    ]);

    return {
      items: rows.map(rowToBlueprint),
      total: Number(countRow?.count ?? 0),
    };
  }

  async createBuiltinBlueprint(
    data: SraBlueprintCreate & { id: string },
    createdBy?: string
  ): Promise<SraBlueprint> {
    const now = Date.now();
    const row = await this.queryOne<BlueprintRow>(
      `INSERT INTO security.sra_blueprints
         (id, org_id, name, description, provider, framework, controls, status,
          is_builtin, metadata, created_by, created_at, updated_at)
       VALUES ($1, NULL, $2, $3, $4, $5, $6::jsonb, 'active',
               TRUE, $7::jsonb, $8, $9, $9)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         controls = EXCLUDED.controls,
         metadata = EXCLUDED.metadata,
         updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [
        data.id,
        data.name,
        data.description ?? null,
        data.provider,
        data.framework,
        JSON.stringify(data.controls ?? []),
        JSON.stringify(data.metadata ?? {}),
        createdBy ?? 'system',
        now,
      ]
    );
    return rowToBlueprint(row!);
  }

  // ── Assessments ────────────────────────────────────────────────

  async createAssessment(
    data: SraAssessmentCreate,
    createdBy?: string,
    orgId?: string
  ): Promise<SraAssessment> {
    const id = uuidv7();
    const now = Date.now();
    const row = await this.queryOne<AssessmentRow>(
      `INSERT INTO security.sra_assessments
         (id, org_id, blueprint_id, name, infrastructure_description,
          control_results, status, linked_risk_assessment_id,
          created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $10)
       RETURNING *`,
      [
        id,
        orgId ?? null,
        data.blueprintId,
        data.name,
        data.infrastructureDescription ?? null,
        JSON.stringify(data.controlResults ?? []),
        data.status ?? 'in_progress',
        data.linkedRiskAssessmentId ?? null,
        createdBy ?? null,
        now,
      ]
    );
    return rowToAssessment(row!);
  }

  async getAssessment(id: string): Promise<SraAssessment | null> {
    const row = await this.queryOne<AssessmentRow>(
      `SELECT * FROM security.sra_assessments WHERE id = $1`,
      [id]
    );
    return row ? rowToAssessment(row) : null;
  }

  async updateAssessment(id: string, data: SraAssessmentUpdate): Promise<SraAssessment | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      sets.push(`name = $${idx++}`);
      params.push(data.name);
    }
    if (data.infrastructureDescription !== undefined) {
      sets.push(`infrastructure_description = $${idx++}`);
      params.push(data.infrastructureDescription);
    }
    if (data.controlResults !== undefined) {
      sets.push(`control_results = $${idx++}::jsonb`);
      params.push(JSON.stringify(data.controlResults));
    }
    if (data.summary !== undefined) {
      sets.push(`summary = $${idx++}::jsonb`);
      params.push(JSON.stringify(data.summary));
    }
    if (data.status !== undefined) {
      sets.push(`status = $${idx++}`);
      params.push(data.status);
    }
    if (data.linkedRiskAssessmentId !== undefined) {
      sets.push(`linked_risk_assessment_id = $${idx++}`);
      params.push(data.linkedRiskAssessmentId);
    }

    if (sets.length === 0) return this.getAssessment(id);

    sets.push(`updated_at = $${idx++}`);
    params.push(Date.now());
    params.push(id);

    const row = await this.queryOne<AssessmentRow>(
      `UPDATE security.sra_assessments SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    return row ? rowToAssessment(row) : null;
  }

  async listAssessments(
    opts: {
      blueprintId?: string;
      status?: string;
      orgId?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ items: SraAssessment[]; total: number }> {
    const { blueprintId, status, orgId, limit = 50, offset = 0 } = opts;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (blueprintId) {
      params.push(blueprintId);
      conditions.push(`blueprint_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (orgId) {
      params.push(orgId);
      conditions.push(`org_id = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countParams = [...params];

    params.push(limit);
    params.push(offset);

    const [rows, countRow] = await Promise.all([
      this.queryMany<AssessmentRow>(
        `SELECT * FROM security.sra_assessments ${where}
         ORDER BY created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      ),
      this.queryOne<{ count: string }>(
        `SELECT COUNT(*) AS count FROM security.sra_assessments ${where}`,
        countParams
      ),
    ]);

    return {
      items: rows.map(rowToAssessment),
      total: Number(countRow?.count ?? 0),
    };
  }

  // ── Compliance mappings ────────────────────────────────────────

  async getComplianceMappings(
    opts: { domain?: string; framework?: string } = {}
  ): Promise<SraComplianceMappingRecord[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (opts.domain) {
      params.push(opts.domain);
      conditions.push(`domain = $${params.length}`);
    }
    if (opts.framework) {
      params.push(opts.framework);
      conditions.push(`framework = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await this.queryMany<MappingRow>(
      `SELECT * FROM security.sra_compliance_mappings ${where} ORDER BY domain, framework, control_id`,
      params
    );
    return rows.map(rowToMapping);
  }

  async seedComplianceMappings(mappings: SraComplianceMappingRecord[]): Promise<void> {
    for (const m of mappings) {
      await this.execute(
        `INSERT INTO security.sra_compliance_mappings
           (domain, framework, control_id, control_title, description)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (domain, framework, control_id) DO UPDATE SET
           control_title = EXCLUDED.control_title,
           description = EXCLUDED.description`,
        [m.domain, m.framework, m.controlId, m.controlTitle, m.description]
      );
    }
  }

  // ── Summary ────────────────────────────────────────────────────

  async getBlueprintCounts(): Promise<{
    total: number;
    byProvider: Record<string, number>;
    byFramework: Record<string, number>;
  }> {
    const [providerRows, frameworkRows, totalRow] = await Promise.all([
      this.queryMany<{ provider: string; count: string }>(
        `SELECT provider, COUNT(*)::text AS count FROM security.sra_blueprints GROUP BY provider`
      ),
      this.queryMany<{ framework: string; count: string }>(
        `SELECT framework, COUNT(*)::text AS count FROM security.sra_blueprints GROUP BY framework`
      ),
      this.queryOne<{ count: string }>(
        `SELECT COUNT(*) AS count FROM security.sra_blueprints`
      ),
    ]);

    const byProvider: Record<string, number> = {};
    for (const r of providerRows) byProvider[r.provider] = Number(r.count);

    const byFramework: Record<string, number> = {};
    for (const r of frameworkRows) byFramework[r.framework] = Number(r.count);

    return {
      total: Number(totalRow?.count ?? 0),
      byProvider,
      byFramework,
    };
  }

  async getAssessmentStats(): Promise<{
    total: number;
    avgComplianceScore: number;
    topGaps: string[];
    recent: SraAssessment[];
  }> {
    const [totalRow, avgRow, recentRows] = await Promise.all([
      this.queryOne<{ count: string }>(
        `SELECT COUNT(*) AS count FROM security.sra_assessments`
      ),
      this.queryOne<{ avg: string | null }>(
        `SELECT AVG((summary->>'complianceScore')::numeric)::text AS avg
         FROM security.sra_assessments
         WHERE summary IS NOT NULL`
      ),
      this.queryMany<AssessmentRow>(
        `SELECT * FROM security.sra_assessments ORDER BY created_at DESC LIMIT 5`
      ),
    ]);

    // Aggregate top gaps from recent assessments
    const topGaps: string[] = [];
    for (const row of recentRows) {
      const summary = row.summary as { topGaps?: string[] } | null;
      if (summary?.topGaps) {
        for (const gap of summary.topGaps) {
          if (!topGaps.includes(gap)) topGaps.push(gap);
          if (topGaps.length >= 10) break;
        }
      }
    }

    return {
      total: Number(totalRow?.count ?? 0),
      avgComplianceScore: avgRow?.avg ? Number(Number(avgRow.avg).toFixed(1)) : 0,
      topGaps,
      recent: recentRows.map(rowToAssessment),
    };
  }
}
