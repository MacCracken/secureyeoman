/**
 * WorkflowStorage — PostgreSQL-backed storage for workflow definitions, runs, and step runs.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';
import type {
  WorkflowDefinition,
  WorkflowDefinitionCreate,
  WorkflowDefinitionCreateInput,
  WorkflowDefinitionUpdate,
  WorkflowRun,
  WorkflowRunStatus,
  WorkflowStepRun,
  WorkflowStepRunStatus,
  WorkflowStep,
  WorkflowEdge,
  WorkflowTrigger,
} from '@secureyeoman/shared';

// ─── Row types ──────────────────────────────────────────────────────

interface WorkflowDefinitionRow {
  id: string;
  name: string;
  description: string | null;
  steps_json: unknown;
  edges_json: unknown;
  triggers_json: unknown;
  is_enabled: boolean;
  version: number;
  created_by: string;
  autonomy_level: string | null;
  emergency_stop_procedure: string | null;
  created_at: string | number;
  updated_at: string | number;
}

interface WorkflowRunRow {
  id: string;
  workflow_id: string;
  workflow_name: string;
  status: string;
  input_json: unknown;
  output_json: unknown;
  error: string | null;
  triggered_by: string;
  created_at: string | number;
  started_at: string | number | null;
  completed_at: string | number | null;
}

interface WorkflowStepRunRow {
  id: string;
  run_id: string;
  step_id: string;
  step_name: string;
  step_type: string;
  status: string;
  input_json: unknown;
  output_json: unknown;
  error: string | null;
  started_at: string | number | null;
  completed_at: string | number | null;
  duration_ms: number | null;
}

// ─── Helpers ────────────────────────────────────────────────────────

function toTs(val: string | number | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  return new Date(val).getTime();
}

function definitionFromRow(row: WorkflowDefinitionRow): WorkflowDefinition {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    steps: (row.steps_json as WorkflowStep[]) ?? [],
    edges: (row.edges_json as WorkflowEdge[]) ?? [],
    triggers: (row.triggers_json as WorkflowTrigger[]) ?? [],
    isEnabled: row.is_enabled,
    version: row.version,
    createdBy: row.created_by,
    autonomyLevel: (row.autonomy_level ?? 'L2') as WorkflowDefinition['autonomyLevel'],
    emergencyStopProcedure: row.emergency_stop_procedure ?? undefined,
    createdAt: toTs(row.created_at) ?? Date.now(),
    updatedAt: toTs(row.updated_at) ?? Date.now(),
  };
}

function runFromRow(row: WorkflowRunRow): WorkflowRun {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    workflowName: row.workflow_name,
    status: row.status as WorkflowRunStatus,
    input: (row.input_json as Record<string, unknown>) ?? null,
    output: (row.output_json as Record<string, unknown>) ?? null,
    error: row.error,
    triggeredBy: row.triggered_by,
    createdAt: toTs(row.created_at) ?? Date.now(),
    startedAt: toTs(row.started_at),
    completedAt: toTs(row.completed_at),
  };
}

function stepRunFromRow(row: WorkflowStepRunRow): WorkflowStepRun {
  return {
    id: row.id,
    runId: row.run_id,
    stepId: row.step_id,
    stepName: row.step_name,
    stepType: row.step_type,
    status: row.status as WorkflowStepRunStatus,
    input: (row.input_json as Record<string, unknown>) ?? null,
    output: (row.output_json as Record<string, unknown>) ?? null,
    error: row.error,
    startedAt: toTs(row.started_at),
    completedAt: toTs(row.completed_at),
    durationMs: row.duration_ms,
  };
}

// ─── Storage ────────────────────────────────────────────────────────

export class WorkflowStorage extends PgBaseStorage {
  // ── Definition operations ─────────────────────────────────────

  async seedBuiltinWorkflows(templates: WorkflowDefinitionCreateInput[]): Promise<void> {
    const now = Date.now();
    for (const tmpl of templates) {
      await this.query(
        `INSERT INTO workflow.definitions
           (id, name, description, steps_json, edges_json, triggers_json, is_enabled, version, created_by, autonomy_level, emergency_stop_procedure, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (name) DO NOTHING`,
        [
          tmpl.name,
          tmpl.description ?? null,
          JSON.stringify(tmpl.steps ?? []),
          JSON.stringify(tmpl.edges ?? []),
          JSON.stringify(tmpl.triggers ?? []),
          tmpl.isEnabled ?? true,
          tmpl.version ?? 1,
          tmpl.createdBy ?? 'system',
          tmpl.autonomyLevel ?? 'L2',
          tmpl.emergencyStopProcedure ?? null,
          now,
          now,
        ]
      );
    }
  }

  async createDefinition(data: WorkflowDefinitionCreate): Promise<WorkflowDefinition> {
    const id = uuidv7();
    const now = Date.now();
    const row = await this.queryOne<WorkflowDefinitionRow>(
      `INSERT INTO workflow.definitions
         (id, name, description, steps_json, edges_json, triggers_json, is_enabled, version, created_by, autonomy_level, emergency_stop_procedure, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        id,
        data.name,
        data.description ?? null,
        JSON.stringify(data.steps ?? []),
        JSON.stringify(data.edges ?? []),
        JSON.stringify(data.triggers ?? []),
        data.isEnabled ?? true,
        data.version ?? 1,
        data.createdBy ?? 'system',
        data.autonomyLevel ?? 'L2',
        data.emergencyStopProcedure ?? null,
        now,
        now,
      ]
    );
    return definitionFromRow(row!);
  }

  async getDefinition(id: string): Promise<WorkflowDefinition | null> {
    const row = await this.queryOne<WorkflowDefinitionRow>(
      `SELECT * FROM workflow.definitions WHERE id = $1`,
      [id]
    );
    return row ? definitionFromRow(row) : null;
  }

  async listDefinitions(opts?: {
    limit?: number;
    offset?: number;
  }): Promise<{ definitions: WorkflowDefinition[]; total: number }> {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;

    const countRow = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM workflow.definitions`
    );

    const rows = await this.queryMany<WorkflowDefinitionRow>(
      `SELECT * FROM workflow.definitions ORDER BY name ASC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return {
      definitions: rows.map(definitionFromRow),
      total: parseInt(countRow?.count ?? '0', 10),
    };
  }

  async updateDefinition(
    id: string,
    data: WorkflowDefinitionUpdate
  ): Promise<WorkflowDefinition | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${p++}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${p++}`);
      values.push(data.description ?? null);
    }
    if (data.steps !== undefined) {
      updates.push(`steps_json = $${p++}::jsonb`);
      values.push(JSON.stringify(data.steps));
    }
    if (data.edges !== undefined) {
      updates.push(`edges_json = $${p++}::jsonb`);
      values.push(JSON.stringify(data.edges));
    }
    if (data.triggers !== undefined) {
      updates.push(`triggers_json = $${p++}::jsonb`);
      values.push(JSON.stringify(data.triggers));
    }
    if (data.isEnabled !== undefined) {
      updates.push(`is_enabled = $${p++}`);
      values.push(data.isEnabled);
    }
    if (data.version !== undefined) {
      updates.push(`version = $${p++}`);
      values.push(data.version);
    }
    if (data.autonomyLevel !== undefined) {
      updates.push(`autonomy_level = $${p++}`);
      values.push(data.autonomyLevel);
    }
    if (data.emergencyStopProcedure !== undefined) {
      updates.push(`emergency_stop_procedure = $${p++}`);
      values.push(data.emergencyStopProcedure ?? null);
    }

    if (updates.length === 0) return this.getDefinition(id);

    updates.push(`updated_at = $${p++}`);
    values.push(Date.now());
    values.push(id);

    const row = await this.queryOne<WorkflowDefinitionRow>(
      `UPDATE workflow.definitions SET ${updates.join(', ')} WHERE id = $${p} RETURNING *`,
      values
    );
    return row ? definitionFromRow(row) : null;
  }

  async deleteDefinition(id: string): Promise<boolean> {
    const count = await this.execute(`DELETE FROM workflow.definitions WHERE id = $1`, [id]);
    return count > 0;
  }

  // ── Run operations ────────────────────────────────────────────

  async createRun(
    workflowId: string,
    workflowName: string,
    input?: Record<string, unknown> | null,
    triggeredBy = 'manual'
  ): Promise<WorkflowRun> {
    const id = uuidv7();
    const now = Date.now();
    const row = await this.queryOne<WorkflowRunRow>(
      `INSERT INTO workflow.runs
         (id, workflow_id, workflow_name, status, input_json, triggered_by, created_at)
       VALUES ($1, $2, $3, 'pending', $4::jsonb, $5, $6)
       RETURNING *`,
      [id, workflowId, workflowName, input ? JSON.stringify(input) : null, triggeredBy, now]
    );
    return runFromRow(row!);
  }

  async updateRun(
    id: string,
    data: Partial<{
      status: WorkflowRunStatus;
      output: Record<string, unknown> | null;
      error: string | null;
      startedAt: number;
      completedAt: number;
    }>
  ): Promise<WorkflowRun | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    if (data.status !== undefined) {
      updates.push(`status = $${p++}`);
      values.push(data.status);
    }
    if (data.output !== undefined) {
      updates.push(`output_json = $${p++}::jsonb`);
      values.push(data.output ? JSON.stringify(data.output) : null);
    }
    if (data.error !== undefined) {
      updates.push(`error = $${p++}`);
      values.push(data.error);
    }
    if (data.startedAt !== undefined) {
      updates.push(`started_at = $${p++}`);
      values.push(data.startedAt);
    }
    if (data.completedAt !== undefined) {
      updates.push(`completed_at = $${p++}`);
      values.push(data.completedAt);
    }

    if (updates.length === 0) return null;
    values.push(id);

    const row = await this.queryOne<WorkflowRunRow>(
      `UPDATE workflow.runs SET ${updates.join(', ')} WHERE id = $${p} RETURNING *`,
      values
    );
    return row ? runFromRow(row) : null;
  }

  async getRun(id: string): Promise<WorkflowRun | null> {
    const row = await this.queryOne<WorkflowRunRow>(`SELECT * FROM workflow.runs WHERE id = $1`, [
      id,
    ]);
    return row ? runFromRow(row) : null;
  }

  async listRuns(
    workflowId?: string,
    opts?: { limit?: number; offset?: number }
  ): Promise<{ runs: WorkflowRun[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    if (workflowId) {
      conditions.push(`workflow_id = $${p++}`);
      values.push(workflowId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;

    const countRow = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM workflow.runs ${where}`,
      values
    );

    const rows = await this.queryMany<WorkflowRunRow>(
      `SELECT * FROM workflow.runs ${where} ORDER BY created_at DESC LIMIT $${p++} OFFSET $${p++}`,
      [...values, limit, offset]
    );

    return {
      runs: rows.map(runFromRow),
      total: parseInt(countRow?.count ?? '0', 10),
    };
  }

  // ── Step run operations ───────────────────────────────────────

  async createStepRun(
    runId: string,
    stepId: string,
    stepName: string,
    stepType: string
  ): Promise<WorkflowStepRun> {
    const id = uuidv7();
    const row = await this.queryOne<WorkflowStepRunRow>(
      `INSERT INTO workflow.step_runs (id, run_id, step_id, step_name, step_type, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING *`,
      [id, runId, stepId, stepName, stepType]
    );
    return stepRunFromRow(row!);
  }

  async updateStepRun(
    id: string,
    data: Partial<{
      status: WorkflowStepRunStatus;
      input: Record<string, unknown> | null;
      output: Record<string, unknown> | null;
      error: string | null;
      startedAt: number;
      completedAt: number;
      durationMs: number;
    }>
  ): Promise<WorkflowStepRun | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    if (data.status !== undefined) {
      updates.push(`status = $${p++}`);
      values.push(data.status);
    }
    if (data.input !== undefined) {
      updates.push(`input_json = $${p++}::jsonb`);
      values.push(data.input ? JSON.stringify(data.input) : null);
    }
    if (data.output !== undefined) {
      updates.push(`output_json = $${p++}::jsonb`);
      values.push(data.output ? JSON.stringify(data.output) : null);
    }
    if (data.error !== undefined) {
      updates.push(`error = $${p++}`);
      values.push(data.error);
    }
    if (data.startedAt !== undefined) {
      updates.push(`started_at = $${p++}`);
      values.push(data.startedAt);
    }
    if (data.completedAt !== undefined) {
      updates.push(`completed_at = $${p++}`);
      values.push(data.completedAt);
    }
    if (data.durationMs !== undefined) {
      updates.push(`duration_ms = $${p++}`);
      values.push(data.durationMs);
    }

    if (updates.length === 0) return null;
    values.push(id);

    const row = await this.queryOne<WorkflowStepRunRow>(
      `UPDATE workflow.step_runs SET ${updates.join(', ')} WHERE id = $${p} RETURNING *`,
      values
    );
    return row ? stepRunFromRow(row) : null;
  }

  async getStepRunsForRun(runId: string): Promise<WorkflowStepRun[]> {
    const rows = await this.queryMany<WorkflowStepRunRow>(
      `SELECT * FROM workflow.step_runs WHERE run_id = $1 ORDER BY started_at ASC NULLS LAST`,
      [runId]
    );
    return rows.map(stepRunFromRow);
  }
}
