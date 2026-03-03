/**
 * CouncilStorage — PostgreSQL-backed storage for council templates, runs, and positions.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';
import type {
  CouncilTemplate,
  CouncilTemplateCreate,
  CouncilRun,
  CouncilRunParams,
  CouncilPosition,
  CouncilDeliberationStrategy,
  CouncilStatus,
} from '@secureyeoman/shared';

// ─── Row types ──────────────────────────────────────────────────────

interface CouncilTemplateRow {
  id: string;
  name: string;
  description: string;
  members: unknown;
  facilitator_profile: string;
  deliberation_strategy: string;
  max_rounds: number;
  voting_strategy: string;
  is_builtin: boolean;
  created_at: string | number;
}

interface CouncilRunRow {
  id: string;
  template_id: string;
  template_name: string;
  topic: string;
  context: string | null;
  status: string;
  deliberation_strategy: string;
  max_rounds: number;
  completed_rounds: number;
  decision: string | null;
  consensus: string | null;
  dissents: unknown;
  reasoning: string | null;
  confidence: number | null;
  token_budget: number;
  tokens_used: number;
  created_at: string | number;
  started_at: string | number | null;
  completed_at: string | number | null;
  initiated_by: string | null;
}

interface CouncilPositionRow {
  id: string;
  council_run_id: string;
  member_role: string;
  profile_name: string;
  round: number;
  position: string;
  confidence: number;
  key_points: unknown;
  agreements: unknown;
  disagreements: unknown;
  created_at: string | number;
}

// ─── Helpers ────────────────────────────────────────────────────────

function toTs(val: string | number | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  return new Date(val).getTime();
}

function templateFromRow(row: CouncilTemplateRow): CouncilTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    members: (row.members as CouncilTemplate['members']) ?? [],
    facilitatorProfile: row.facilitator_profile,
    deliberationStrategy: row.deliberation_strategy as CouncilDeliberationStrategy,
    maxRounds: row.max_rounds,
    votingStrategy: row.voting_strategy as CouncilTemplate['votingStrategy'],
    isBuiltin: row.is_builtin,
    createdAt: toTs(row.created_at) ?? Date.now(),
  };
}

function runFromRow(row: CouncilRunRow): CouncilRun {
  return {
    id: row.id,
    templateId: row.template_id,
    templateName: row.template_name,
    topic: row.topic,
    context: row.context,
    status: row.status as CouncilStatus,
    deliberationStrategy: row.deliberation_strategy as CouncilDeliberationStrategy,
    maxRounds: row.max_rounds,
    completedRounds: row.completed_rounds,
    decision: row.decision,
    consensus: row.consensus as CouncilRun['consensus'],
    dissents: (row.dissents as string[] | null) ?? null,
    reasoning: row.reasoning,
    confidence: row.confidence,
    tokenBudget: row.token_budget,
    tokensUsed: row.tokens_used,
    createdAt: toTs(row.created_at) ?? Date.now(),
    startedAt: toTs(row.started_at),
    completedAt: toTs(row.completed_at),
    initiatedBy: row.initiated_by,
  };
}

function positionFromRow(row: CouncilPositionRow): CouncilPosition {
  return {
    id: row.id,
    councilRunId: row.council_run_id,
    memberRole: row.member_role,
    profileName: row.profile_name,
    round: row.round,
    position: row.position,
    confidence: row.confidence,
    keyPoints: (row.key_points as string[]) ?? [],
    agreements: (row.agreements as string[]) ?? [],
    disagreements: (row.disagreements as string[]) ?? [],
    createdAt: toTs(row.created_at) ?? Date.now(),
  };
}

// ─── Storage ────────────────────────────────────────────────────────

export class CouncilStorage extends PgBaseStorage {
  // ── Template operations ───────────────────────────────────────

  async getTemplate(id: string): Promise<CouncilTemplate | null> {
    const row = await this.queryOne<CouncilTemplateRow>(
      `SELECT * FROM agents.council_templates WHERE id = $1`,
      [id]
    );
    return row ? templateFromRow(row) : null;
  }

  async getTemplateByName(name: string): Promise<CouncilTemplate | null> {
    const row = await this.queryOne<CouncilTemplateRow>(
      `SELECT * FROM agents.council_templates WHERE name = $1`,
      [name]
    );
    return row ? templateFromRow(row) : null;
  }

  async listTemplates(opts?: {
    limit?: number;
    offset?: number;
  }): Promise<{ templates: CouncilTemplate[]; total: number }> {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;

    const countResult = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM agents.council_templates`
    );

    const rows = await this.queryMany<CouncilTemplateRow>(
      `SELECT * FROM agents.council_templates ORDER BY name ASC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return {
      templates: rows.map(templateFromRow),
      total: parseInt(countResult?.count ?? '0', 10),
    };
  }

  async createTemplate(data: CouncilTemplateCreate): Promise<CouncilTemplate> {
    const id = uuidv7();
    const now = Date.now();
    const row = await this.queryOne<CouncilTemplateRow>(
      `INSERT INTO agents.council_templates
         (id, name, description, members, facilitator_profile,
          deliberation_strategy, max_rounds, voting_strategy, is_builtin, created_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, false, $9)
       RETURNING *`,
      [
        id,
        data.name,
        data.description ?? '',
        JSON.stringify(data.members),
        data.facilitatorProfile,
        data.deliberationStrategy ?? 'rounds',
        data.maxRounds ?? 3,
        data.votingStrategy ?? 'facilitator_judgment',
        now,
      ]
    );
    return templateFromRow(row!);
  }

  async updateTemplate(
    id: string,
    data: Partial<CouncilTemplateCreate>
  ): Promise<CouncilTemplate | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${p++}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${p++}`);
      values.push(data.description);
    }
    if (data.members !== undefined) {
      updates.push(`members = $${p++}::jsonb`);
      values.push(JSON.stringify(data.members));
    }
    if (data.facilitatorProfile !== undefined) {
      updates.push(`facilitator_profile = $${p++}`);
      values.push(data.facilitatorProfile);
    }
    if (data.deliberationStrategy !== undefined) {
      updates.push(`deliberation_strategy = $${p++}`);
      values.push(data.deliberationStrategy);
    }
    if (data.maxRounds !== undefined) {
      updates.push(`max_rounds = $${p++}`);
      values.push(data.maxRounds);
    }
    if (data.votingStrategy !== undefined) {
      updates.push(`voting_strategy = $${p++}`);
      values.push(data.votingStrategy);
    }

    if (updates.length === 0) return null;
    values.push(id);

    const row = await this.queryOne<CouncilTemplateRow>(
      `UPDATE agents.council_templates SET ${updates.join(', ')} WHERE id = $${p} AND is_builtin = false RETURNING *`,
      values
    );
    return row ? templateFromRow(row) : null;
  }

  async deleteTemplate(id: string): Promise<boolean> {
    const count = await this.execute(
      `DELETE FROM agents.council_templates WHERE id = $1 AND is_builtin = false`,
      [id]
    );
    return count > 0;
  }

  // ── Run operations ────────────────────────────────────────────

  async createRun(params: CouncilRunParams, template: CouncilTemplate): Promise<CouncilRun> {
    const id = uuidv7();
    const now = Date.now();
    const row = await this.queryOne<CouncilRunRow>(
      `INSERT INTO agents.council_runs
         (id, template_id, template_name, topic, context, status,
          deliberation_strategy, max_rounds, token_budget, created_at, initiated_by)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        id,
        template.id,
        template.name,
        params.topic,
        params.context ?? null,
        template.deliberationStrategy,
        params.maxRounds ?? template.maxRounds,
        params.tokenBudget ?? 500000,
        now,
        params.initiatedBy ?? null,
      ]
    );
    return runFromRow(row!);
  }

  async updateRun(
    id: string,
    data: Partial<{
      status: CouncilStatus;
      completedRounds: number;
      decision: string | null;
      consensus: string | null;
      dissents: string[] | null;
      reasoning: string | null;
      confidence: number | null;
      tokensUsed: number;
      startedAt: number;
      completedAt: number;
    }>
  ): Promise<CouncilRun | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    if (data.status !== undefined) {
      updates.push(`status = $${p++}`);
      values.push(data.status);
    }
    if (data.completedRounds !== undefined) {
      updates.push(`completed_rounds = $${p++}`);
      values.push(data.completedRounds);
    }
    if (data.decision !== undefined) {
      updates.push(`decision = $${p++}`);
      values.push(data.decision);
    }
    if (data.consensus !== undefined) {
      updates.push(`consensus = $${p++}`);
      values.push(data.consensus);
    }
    if (data.dissents !== undefined) {
      updates.push(`dissents = $${p++}::jsonb`);
      values.push(JSON.stringify(data.dissents));
    }
    if (data.reasoning !== undefined) {
      updates.push(`reasoning = $${p++}`);
      values.push(data.reasoning);
    }
    if (data.confidence !== undefined) {
      updates.push(`confidence = $${p++}`);
      values.push(data.confidence);
    }
    if (data.tokensUsed !== undefined) {
      updates.push(`tokens_used = $${p++}`);
      values.push(data.tokensUsed);
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

    const row = await this.queryOne<CouncilRunRow>(
      `UPDATE agents.council_runs SET ${updates.join(', ')} WHERE id = $${p} RETURNING *`,
      values
    );
    return row ? runFromRow(row) : null;
  }

  async getRun(id: string): Promise<CouncilRun | null> {
    const row = await this.queryOne<CouncilRunRow>(
      `SELECT * FROM agents.council_runs WHERE id = $1`,
      [id]
    );
    return row ? runFromRow(row) : null;
  }

  async listRuns(filter?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ runs: CouncilRun[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    if (filter?.status) {
      conditions.push(`status = $${p++}`);
      values.push(filter.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;

    const countRow = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM agents.council_runs ${where}`,
      values
    );

    const rows = await this.queryMany<CouncilRunRow>(
      `SELECT * FROM agents.council_runs ${where} ORDER BY created_at DESC LIMIT $${p++} OFFSET $${p++}`,
      [...values, limit, offset]
    );

    return {
      runs: rows.map(runFromRow),
      total: parseInt(countRow?.count ?? '0', 10),
    };
  }

  // ── Position operations ───────────────────────────────────────

  async createPosition(data: {
    councilRunId: string;
    memberRole: string;
    profileName: string;
    round: number;
    position: string;
    confidence: number;
    keyPoints: string[];
    agreements: string[];
    disagreements: string[];
  }): Promise<CouncilPosition> {
    const id = uuidv7();
    const now = Date.now();
    const row = await this.queryOne<CouncilPositionRow>(
      `INSERT INTO agents.council_positions
         (id, council_run_id, member_role, profile_name, round,
          position, confidence, key_points, agreements, disagreements, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11)
       RETURNING *`,
      [
        id,
        data.councilRunId,
        data.memberRole,
        data.profileName,
        data.round,
        data.position,
        data.confidence,
        JSON.stringify(data.keyPoints),
        JSON.stringify(data.agreements),
        JSON.stringify(data.disagreements),
        now,
      ]
    );
    return positionFromRow(row!);
  }

  async getPositionsForRun(councilRunId: string): Promise<CouncilPosition[]> {
    const rows = await this.queryMany<CouncilPositionRow>(
      `SELECT * FROM agents.council_positions WHERE council_run_id = $1 ORDER BY round ASC, created_at ASC`,
      [councilRunId]
    );
    return rows.map(positionFromRow);
  }

  async getPositionsForRound(councilRunId: string, round: number): Promise<CouncilPosition[]> {
    const rows = await this.queryMany<CouncilPositionRow>(
      `SELECT * FROM agents.council_positions WHERE council_run_id = $1 AND round = $2 ORDER BY created_at ASC`,
      [councilRunId, round]
    );
    return rows.map(positionFromRow);
  }
}
