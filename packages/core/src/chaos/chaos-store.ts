/**
 * Chaos Store — PostgreSQL persistence for experiments and results.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { buildWhere, buildSet, parseCount } from '../storage/query-helpers.js';
import type {
  ChaosExperiment,
  ChaosExperimentStatus,
  ChaosExperimentResult,
} from '@secureyeoman/shared';

function rowToExperiment(row: Record<string, unknown>): ChaosExperiment {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? '',
    status: (row.status as ChaosExperimentStatus) ?? 'draft',
    rules: (row.rules as ChaosExperiment['rules']) ?? [],
    durationMs: Number(row.duration_ms ?? 60000),
    steadyStateHypothesis: (row.steady_state_hypothesis as string) ?? '',
    rollbackOnFailure: (row.rollback_on_failure as boolean) ?? true,
    scheduledAt: Number(row.scheduled_at ?? 0),
    startedAt: Number(row.started_at ?? 0),
    completedAt: Number(row.completed_at ?? 0),
    tenantId: (row.tenant_id as string) ?? 'default',
    createdBy: (row.created_by as string) ?? 'system',
    createdAt: Number(row.created_at ?? 0),
  };
}

function rowToResult(row: Record<string, unknown>): ChaosExperimentResult {
  return {
    experimentId: row.experiment_id as string,
    status: row.status as ChaosExperimentResult['status'],
    startedAt: Number(row.started_at ?? 0),
    completedAt: Number(row.completed_at ?? 0),
    durationMs: Number(row.duration_ms ?? 0),
    faultResults: (row.fault_results as ChaosExperimentResult['faultResults']) ?? [],
    steadyStateValidated: (row.steady_state_validated as boolean) ?? false,
    summary: (row.summary as string) ?? '',
    metrics: (row.metrics as ChaosExperimentResult['metrics']) ?? {
      totalFaultsInjected: 0,
      faultsRecovered: 0,
      meanRecoveryTimeMs: 0,
      circuitBreakersTripped: 0,
    },
  };
}

export class ChaosStore extends PgBaseStorage {
  // ── Experiments ──────────────────────────────────────────────────

  async saveExperiment(e: ChaosExperiment): Promise<void> {
    await this.execute(
      `INSERT INTO chaos.experiments (
        id, name, description, status, rules, duration_ms,
        steady_state_hypothesis, rollback_on_failure,
        scheduled_at, started_at, completed_at,
        tenant_id, created_by, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        status = EXCLUDED.status, rules = EXCLUDED.rules,
        duration_ms = EXCLUDED.duration_ms,
        steady_state_hypothesis = EXCLUDED.steady_state_hypothesis,
        rollback_on_failure = EXCLUDED.rollback_on_failure,
        scheduled_at = EXCLUDED.scheduled_at,
        started_at = EXCLUDED.started_at,
        completed_at = EXCLUDED.completed_at`,
      [
        e.id,
        e.name,
        e.description,
        e.status,
        JSON.stringify(e.rules),
        e.durationMs,
        e.steadyStateHypothesis,
        e.rollbackOnFailure,
        e.scheduledAt,
        e.startedAt,
        e.completedAt,
        e.tenantId,
        e.createdBy,
        e.createdAt,
      ]
    );
  }

  async getExperiment(id: string): Promise<ChaosExperiment | null> {
    const row = await this.queryOne('SELECT * FROM chaos.experiments WHERE id = $1', [id]);
    return row ? rowToExperiment(row) : null;
  }

  async listExperiments(
    opts: {
      status?: ChaosExperimentStatus;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ items: ChaosExperiment[]; total: number }> {
    const { where, values, nextIdx } = buildWhere([{ column: 'status', value: opts.status }]);

    const countResult = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count FROM chaos.experiments ${where}`,
      values
    );
    const total = parseCount(countResult);

    const limit = Math.min(opts.limit ?? 50, 200);
    const offset = opts.offset ?? 0;
    let idx = nextIdx;

    const rows = await this.queryMany(
      `SELECT * FROM chaos.experiments ${where}
       ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...values, limit, offset]
    );

    return { items: rows.map(rowToExperiment), total };
  }

  async updateExperimentStatus(
    id: string,
    status: ChaosExperimentStatus,
    timestamps: { startedAt?: number; completedAt?: number } = {}
  ): Promise<boolean> {
    const { setClause, values, nextIdx } = buildSet([
      { column: 'status', value: status },
      { column: 'started_at', value: timestamps.startedAt },
      { column: 'completed_at', value: timestamps.completedAt },
    ]);

    values.push(id);
    const count = await this.execute(
      `UPDATE chaos.experiments SET ${setClause} WHERE id = $${nextIdx}`,
      values
    );
    return count > 0;
  }

  async deleteExperiment(id: string): Promise<boolean> {
    const count = await this.execute('DELETE FROM chaos.experiments WHERE id = $1', [id]);
    return count > 0;
  }

  /** Atomic delete — only removes if status is not 'running' (prevents TOCTOU race). */
  async deleteExperimentIfNotRunning(id: string): Promise<boolean> {
    const count = await this.execute(
      "DELETE FROM chaos.experiments WHERE id = $1 AND status != 'running'",
      [id]
    );
    return count > 0;
  }

  // ── Results ─────────────────────────────────────────────────────

  async saveResult(result: ChaosExperimentResult & { id: string }): Promise<void> {
    await this.execute(
      `INSERT INTO chaos.experiment_results (
        id, experiment_id, status, started_at, completed_at,
        duration_ms, fault_results, steady_state_validated,
        summary, metrics, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        result.id,
        result.experimentId,
        result.status,
        result.startedAt,
        result.completedAt,
        result.durationMs,
        JSON.stringify(result.faultResults),
        result.steadyStateValidated,
        result.summary,
        JSON.stringify(result.metrics),
        Date.now(),
      ]
    );
  }

  async getResults(experimentId: string): Promise<ChaosExperimentResult[]> {
    const rows = await this.queryMany(
      `SELECT * FROM chaos.experiment_results
       WHERE experiment_id = $1 ORDER BY created_at DESC`,
      [experimentId]
    );
    return rows.map(rowToResult);
  }

  async deleteResults(experimentId: string): Promise<number> {
    return this.execute('DELETE FROM chaos.experiment_results WHERE experiment_id = $1', [
      experimentId,
    ]);
  }
}
