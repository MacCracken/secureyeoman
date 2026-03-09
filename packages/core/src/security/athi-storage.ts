/**
 * AthiStorage — Phase 107-F: ATHI Threat Governance Framework
 *
 * PostgreSQL-backed storage for ATHI threat scenarios, risk matrix,
 * and aggregate queries. Uses the security schema.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { buildWhere, buildSet, parseCount } from '../storage/query-helpers.js';
import { uuidv7 } from '../utils/crypto.js';
import type {
  AthiScenario,
  AthiScenarioCreate,
  AthiScenarioUpdate,
  AthiRiskMatrixCell,
} from '@secureyeoman/shared';

// ─── Internal row type ──────────────────────────────────────────────────────

interface AthiScenarioRow {
  id: string;
  org_id: string | null;
  title: string;
  description: string | null;
  actor: string;
  techniques: unknown;
  harms: unknown;
  impacts: unknown;
  likelihood: number | string;
  severity: number | string;
  risk_score: number | string;
  mitigations: unknown;
  linked_event_ids: string[] | null;
  status: string;
  created_by: string | null;
  created_at: string | number;
  updated_at: string | number;
}

// ─── Row converter ──────────────────────────────────────────────────────────

function rowToScenario(row: AthiScenarioRow): AthiScenario {
  return {
    id: row.id,
    orgId: row.org_id ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    actor: row.actor as AthiScenario['actor'],
    techniques: (row.techniques as AthiScenario['techniques']) ?? [],
    harms: (row.harms as AthiScenario['harms']) ?? [],
    impacts: (row.impacts as AthiScenario['impacts']) ?? [],
    likelihood: typeof row.likelihood === 'string' ? Number(row.likelihood) : row.likelihood,
    severity: typeof row.severity === 'string' ? Number(row.severity) : row.severity,
    riskScore: typeof row.risk_score === 'string' ? Number(row.risk_score) : row.risk_score,
    mitigations: (row.mitigations as AthiScenario['mitigations']) ?? [],
    linkedEventIds: row.linked_event_ids ?? [],
    status: row.status as AthiScenario['status'],
    createdBy: row.created_by ?? undefined,
    createdAt: typeof row.created_at === 'string' ? Number(row.created_at) : row.created_at,
    updatedAt: typeof row.updated_at === 'string' ? Number(row.updated_at) : row.updated_at,
  };
}

// ─── Storage class ──────────────────────────────────────────────────────────

export class AthiStorage extends PgBaseStorage {
  async createScenario(
    data: AthiScenarioCreate,
    createdBy?: string,
    orgId?: string
  ): Promise<AthiScenario> {
    const id = uuidv7();
    const now = Date.now();
    const row = await this.queryOne<AthiScenarioRow>(
      `INSERT INTO security.athi_scenarios
         (id, org_id, title, description, actor, techniques, harms, impacts,
          likelihood, severity, mitigations, linked_event_ids, status, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb,
               $9, $10, $11::jsonb, $12, $13, $14, $15, $15)
       RETURNING *`,
      [
        id,
        orgId ?? null,
        data.title,
        data.description ?? null,
        data.actor,
        JSON.stringify(data.techniques),
        JSON.stringify(data.harms),
        JSON.stringify(data.impacts),
        data.likelihood,
        data.severity,
        JSON.stringify(data.mitigations ?? []),
        data.linkedEventIds ?? [],
        data.status ?? 'identified',
        createdBy ?? null,
        now,
      ]
    );
    return rowToScenario(row!);
  }

  async getScenario(id: string): Promise<AthiScenario | null> {
    const row = await this.queryOne<AthiScenarioRow>(
      `SELECT * FROM security.athi_scenarios WHERE id = $1`,
      [id]
    );
    return row ? rowToScenario(row) : null;
  }

  async updateScenario(id: string, data: AthiScenarioUpdate): Promise<AthiScenario | null> {
    const { setClause, values, nextIdx, hasUpdates } = buildSet([
      { column: 'title', value: data.title },
      { column: 'description', value: data.description },
      { column: 'actor', value: data.actor },
      { column: 'techniques', value: data.techniques, json: true },
      { column: 'harms', value: data.harms, json: true },
      { column: 'impacts', value: data.impacts, json: true },
      { column: 'likelihood', value: data.likelihood },
      { column: 'severity', value: data.severity },
      { column: 'mitigations', value: data.mitigations, json: true },
      { column: 'linked_event_ids', value: data.linkedEventIds },
      { column: 'status', value: data.status },
    ]);

    if (!hasUpdates) return this.getScenario(id);

    values.push(Date.now(), id);
    const row = await this.queryOne<AthiScenarioRow>(
      `UPDATE security.athi_scenarios SET ${setClause}, updated_at = $${nextIdx} WHERE id = $${nextIdx + 1} RETURNING *`,
      values
    );
    return row ? rowToScenario(row) : null;
  }

  async deleteScenario(id: string): Promise<boolean> {
    const count = await this.execute(`DELETE FROM security.athi_scenarios WHERE id = $1`, [id]);
    return count > 0;
  }

  async listScenarios(
    opts: {
      actor?: string;
      status?: string;
      orgId?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ items: AthiScenario[]; total: number }> {
    const { actor, status, orgId, limit = 50, offset = 0 } = opts;

    const { where, values, nextIdx } = buildWhere([
      { column: 'actor', value: actor },
      { column: 'status', value: status },
      { column: 'org_id', value: orgId },
    ]);

    const countValues = [...values];
    values.push(limit, offset);

    const [rows, countRow] = await Promise.all([
      this.queryMany<AthiScenarioRow>(
        `SELECT * FROM security.athi_scenarios ${where}
         ORDER BY risk_score DESC, created_at DESC
         LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
        values
      ),
      this.queryOne<{ count: string }>(
        `SELECT COUNT(*) AS count FROM security.athi_scenarios ${where}`,
        countValues
      ),
    ]);

    return {
      items: rows.map(rowToScenario),
      total: parseCount(countRow),
    };
  }

  async getRiskMatrix(orgId?: string): Promise<AthiRiskMatrixCell[]> {
    const where = orgId ? 'WHERE org_id = $1' : '';
    const params = orgId ? [orgId] : [];

    const rows = await this.queryMany<{
      actor: string;
      technique: string;
      count: string;
      avg_risk_score: string;
      max_risk_score: string;
      scenario_ids: string[];
    }>(
      `SELECT
         actor,
         t.technique,
         COUNT(*)::text AS count,
         AVG(risk_score)::text AS avg_risk_score,
         MAX(risk_score)::text AS max_risk_score,
         array_agg(id) AS scenario_ids
       FROM security.athi_scenarios,
            jsonb_array_elements_text(techniques) AS t(technique)
       ${where}
       GROUP BY actor, t.technique
       ORDER BY AVG(risk_score) DESC`,
      params
    );

    return rows.map((r) => ({
      actor: r.actor as AthiRiskMatrixCell['actor'],
      technique: r.technique as AthiRiskMatrixCell['technique'],
      count: Number(r.count),
      avgRiskScore: Number(Number(r.avg_risk_score).toFixed(1)),
      maxRiskScore: Number(r.max_risk_score),
      scenarioIds: r.scenario_ids ?? [],
    }));
  }

  async getTopRisks(limit = 10, orgId?: string): Promise<AthiScenario[]> {
    const where = orgId ? 'WHERE org_id = $2' : '';
    const params: unknown[] = [limit];
    if (orgId) params.push(orgId);

    const rows = await this.queryMany<AthiScenarioRow>(
      `SELECT * FROM security.athi_scenarios ${where}
       ORDER BY risk_score DESC, created_at DESC
       LIMIT $1`,
      params
    );
    return rows.map(rowToScenario);
  }

  async getStatusCounts(orgId?: string): Promise<Record<string, number>> {
    const where = orgId ? 'WHERE org_id = $1' : '';
    const params = orgId ? [orgId] : [];

    const rows = await this.queryMany<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count FROM security.athi_scenarios ${where} GROUP BY status`,
      params
    );

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.status] = Number(row.count);
    }
    return result;
  }

  async linkEvents(id: string, eventIds: string[]): Promise<AthiScenario | null> {
    const row = await this.queryOne<AthiScenarioRow>(
      `UPDATE security.athi_scenarios
       SET linked_event_ids = (
         SELECT array_agg(DISTINCT e) FROM unnest(linked_event_ids || $2::text[]) AS e
       ),
       updated_at = $3
       WHERE id = $1
       RETURNING *`,
      [id, eventIds, Date.now()]
    );
    return row ? rowToScenario(row) : null;
  }

  async findByTechnique(technique: string): Promise<AthiScenario[]> {
    const rows = await this.queryMany<AthiScenarioRow>(
      `SELECT * FROM security.athi_scenarios
       WHERE techniques @> $1::jsonb
       ORDER BY risk_score DESC, created_at DESC`,
      [JSON.stringify([technique])]
    );
    return rows.map(rowToScenario);
  }

  async getScenariosWithLinkedEvents(): Promise<AthiScenario[]> {
    const rows = await this.queryMany<AthiScenarioRow>(
      `SELECT * FROM security.athi_scenarios
       WHERE array_length(linked_event_ids, 1) > 0
       ORDER BY updated_at DESC`
    );
    return rows.map(rowToScenario);
  }

  async getActorCounts(orgId?: string): Promise<Record<string, number>> {
    const where = orgId ? 'WHERE org_id = $1' : '';
    const params = orgId ? [orgId] : [];

    const rows = await this.queryMany<{ actor: string; count: string }>(
      `SELECT actor, COUNT(*)::text AS count FROM security.athi_scenarios ${where} GROUP BY actor`,
      params
    );

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.actor] = Number(row.count);
    }
    return result;
  }
}
