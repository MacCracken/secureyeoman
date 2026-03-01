/**
 * TeamStorage — PostgreSQL-backed storage for agent teams and team runs.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';
import type {
  TeamDefinition,
  TeamCreate,
  TeamUpdate,
  TeamRun,
  TeamRunStatus,
} from '@secureyeoman/shared';

// ─── Row types ──────────────────────────────────────────────────────

interface TeamRow {
  id: string;
  name: string;
  description: string | null;
  members: unknown;
  coordinator_profile_name: string | null;
  is_builtin: boolean;
  created_at: string | number;
  updated_at: string | number;
}

interface TeamRunRow {
  id: string;
  team_id: string;
  team_name: string;
  task: string;
  status: string;
  result: string | null;
  error: string | null;
  coordinator_reasoning: string | null;
  assigned_members: unknown;
  token_budget: number;
  tokens_used: number;
  created_at: string | number;
  started_at: string | number | null;
  completed_at: string | number | null;
  initiated_by: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────

function toTs(val: string | number | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  return new Date(val).getTime();
}

function teamFromRow(row: TeamRow): TeamDefinition {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    members: (row.members as TeamDefinition['members']) ?? [],
    coordinatorProfileName: row.coordinator_profile_name ?? undefined,
    isBuiltin: row.is_builtin,
    createdAt: toTs(row.created_at) ?? Date.now(),
    updatedAt: toTs(row.updated_at) ?? Date.now(),
  };
}

function runFromRow(row: TeamRunRow): TeamRun {
  return {
    id: row.id,
    teamId: row.team_id,
    teamName: row.team_name,
    task: row.task,
    status: row.status as TeamRunStatus,
    result: row.result,
    error: row.error,
    coordinatorReasoning: row.coordinator_reasoning,
    assignedMembers: (row.assigned_members as string[]) ?? [],
    tokenBudget: row.token_budget,
    tokensUsed: row.tokens_used,
    createdAt: toTs(row.created_at) ?? Date.now(),
    startedAt: toTs(row.started_at),
    completedAt: toTs(row.completed_at),
    initiatedBy: row.initiated_by ?? undefined,
  };
}

// ─── Builtin team definitions ────────────────────────────────────────

const BUILTIN_TEAMS: Omit<TeamDefinition, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Full-Stack Development Crew',
    description:
      'A full-stack crew with research, coding, review, and specification roles. The coordinator assigns the right member based on task type.',
    members: [
      {
        role: 'Researcher',
        profileName: 'researcher',
        description: 'Gathers information, analyzes requirements, and synthesises findings.',
      },
      {
        role: 'Backend Engineer',
        profileName: 'coder',
        description: 'Implements APIs, database logic, and server-side features.',
      },
      {
        role: 'Code Reviewer',
        profileName: 'reviewer',
        description: 'Reviews code for quality, security issues, and best practices.',
      },
      {
        role: 'Spec Engineer',
        profileName: 'spec-engineer',
        description: 'Writes detailed technical specifications and acceptance criteria.',
      },
    ],
    coordinatorProfileName: 'researcher',
    isBuiltin: true,
  },
  {
    name: 'Research Team',
    description:
      'A compact research team with a researcher and analyst. Best for information gathering and analysis tasks.',
    members: [
      {
        role: 'Researcher',
        profileName: 'researcher',
        description: 'Gathers information and synthesises findings from multiple sources.',
      },
      {
        role: 'Analyst',
        profileName: 'analyst',
        description: 'Analyses data, identifies patterns, and produces structured reports.',
      },
    ],
    coordinatorProfileName: 'researcher',
    isBuiltin: true,
  },
  {
    name: 'Security Audit Team',
    description: 'A security-focused team for code audits and vulnerability assessments.',
    members: [
      {
        role: 'Analyst',
        profileName: 'analyst',
        description: 'Identifies security issues and threat vectors.',
      },
      {
        role: 'Code Reviewer',
        profileName: 'reviewer',
        description: 'Reviews code for security vulnerabilities and insecure patterns.',
      },
      {
        role: 'Spec Engineer',
        profileName: 'spec-engineer',
        description: 'Documents findings and writes remediation specifications.',
      },
    ],
    coordinatorProfileName: 'analyst',
    isBuiltin: true,
  },
];

// ─── TeamStorage ─────────────────────────────────────────────────────

export class TeamStorage extends PgBaseStorage {
  // ── Teams ──────────────────────────────────────────────────────

  async createTeam(data: TeamCreate): Promise<TeamDefinition> {
    const id = uuidv7();
    const now = Date.now();
    const row = await this.queryOne<TeamRow>(
      `INSERT INTO agents.teams
         (id, name, description, members, coordinator_profile_name, is_builtin, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        id,
        data.name,
        data.description ?? null,
        JSON.stringify(data.members),
        data.coordinatorProfileName ?? null,
        false,
        now,
        now,
      ]
    );
    if (!row) throw new Error('Failed to create team');
    return teamFromRow(row);
  }

  async getTeam(id: string): Promise<TeamDefinition | null> {
    const row = await this.queryOne<TeamRow>('SELECT * FROM agents.teams WHERE id = $1', [id]);
    return row ? teamFromRow(row) : null;
  }

  async listTeams(opts: { limit?: number; offset?: number } = {}): Promise<{
    teams: TeamDefinition[];
    total: number;
  }> {
    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;
    const [rows, countRow] = await Promise.all([
      this.queryMany<TeamRow>(
        'SELECT * FROM agents.teams ORDER BY created_at ASC LIMIT $1 OFFSET $2',
        [limit, offset]
      ),
      this.queryOne<{ count: string }>('SELECT COUNT(*) AS count FROM agents.teams'),
    ]);
    return {
      teams: rows.map(teamFromRow),
      total: Number(countRow?.count ?? 0),
    };
  }

  async updateTeam(id: string, updates: TeamUpdate): Promise<TeamDefinition> {
    const now = Date.now();
    const fields: string[] = ['updated_at = $1'];
    const values: unknown[] = [now];
    let i = 2;
    if (updates.name !== undefined) {
      fields.push(`name = $${i}`);
      values.push(updates.name);
      i++;
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${i}`);
      values.push(updates.description);
      i++;
    }
    if (updates.members !== undefined) {
      fields.push(`members = $${i}`);
      values.push(JSON.stringify(updates.members));
      i++;
    }
    if (updates.coordinatorProfileName !== undefined) {
      fields.push(`coordinator_profile_name = $${i}`);
      values.push(updates.coordinatorProfileName);
      i++;
    }
    values.push(id);
    const row = await this.queryOne<TeamRow>(
      `UPDATE agents.teams SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    if (!row) throw new Error(`Team not found: ${id}`);
    return teamFromRow(row);
  }

  async deleteTeam(id: string): Promise<void> {
    await this.execute('DELETE FROM agents.teams WHERE id = $1', [id]);
  }

  async seedBuiltinTeams(): Promise<void> {
    for (const def of BUILTIN_TEAMS) {
      try {
        const existing = await this.queryOne<{ id: string }>(
          'SELECT id FROM agents.teams WHERE name = $1 AND is_builtin = TRUE',
          [def.name]
        );
        if (existing) continue;
        const id = uuidv7();
        const now = Date.now();
        await this.execute(
          `INSERT INTO agents.teams
             (id, name, description, members, coordinator_profile_name, is_builtin, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (id) DO NOTHING`,
          [
            id,
            def.name,
            def.description ?? null,
            JSON.stringify(def.members),
            def.coordinatorProfileName ?? null,
            true,
            now,
            now,
          ]
        );
      } catch {
        // Non-fatal — skip individual seed failures
      }
    }
  }

  // ── Runs ───────────────────────────────────────────────────────

  async createRun(params: {
    teamId: string;
    teamName: string;
    task: string;
    tokenBudget: number;
    initiatedBy?: string;
  }): Promise<TeamRun> {
    const id = uuidv7();
    const now = Date.now();
    const row = await this.queryOne<TeamRunRow>(
      `INSERT INTO agents.team_runs
         (id, team_id, team_name, task, status, assigned_members, token_budget, tokens_used, created_at, initiated_by)
       VALUES ($1,$2,$3,$4,'pending','[]',$5,0,$6,$7)
       RETURNING *`,
      [
        id,
        params.teamId,
        params.teamName,
        params.task,
        params.tokenBudget,
        now,
        params.initiatedBy ?? null,
      ]
    );
    if (!row) throw new Error('Failed to create team run');
    return runFromRow(row);
  }

  async getRun(id: string): Promise<TeamRun | null> {
    const row = await this.queryOne<TeamRunRow>('SELECT * FROM agents.team_runs WHERE id = $1', [
      id,
    ]);
    return row ? runFromRow(row) : null;
  }

  async updateRun(
    id: string,
    updates: Partial<{
      status: TeamRunStatus;
      result: string | null;
      error: string | null;
      coordinatorReasoning: string | null;
      assignedMembers: string[];
      tokensUsed: number;
      startedAt: number;
      completedAt: number;
    }>
  ): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (updates.status !== undefined) {
      fields.push(`status = $${i}`);
      values.push(updates.status);
      i++;
    }
    if ('result' in updates) {
      fields.push(`result = $${i}`);
      values.push(updates.result);
      i++;
    }
    if ('error' in updates) {
      fields.push(`error = $${i}`);
      values.push(updates.error);
      i++;
    }
    if ('coordinatorReasoning' in updates) {
      fields.push(`coordinator_reasoning = $${i}`);
      values.push(updates.coordinatorReasoning);
      i++;
    }
    if (updates.assignedMembers !== undefined) {
      fields.push(`assigned_members = $${i}`);
      values.push(JSON.stringify(updates.assignedMembers));
      i++;
    }
    if (updates.tokensUsed !== undefined) {
      fields.push(`tokens_used = $${i}`);
      values.push(updates.tokensUsed);
      i++;
    }
    if (updates.startedAt !== undefined) {
      fields.push(`started_at = $${i}`);
      values.push(updates.startedAt);
      i++;
    }
    if (updates.completedAt !== undefined) {
      fields.push(`completed_at = $${i}`);
      values.push(updates.completedAt);
      i++;
    }
    if (fields.length === 0) return;
    values.push(id);
    await this.execute(`UPDATE agents.team_runs SET ${fields.join(', ')} WHERE id = $${i}`, values);
  }

  async listRuns(
    teamId?: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<{ runs: TeamRun[]; total: number }> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const where = teamId ? 'WHERE team_id = $3' : '';
    const countWhere = teamId ? 'WHERE team_id = $1' : '';
    const [rows, countRow] = await Promise.all([
      this.queryMany<TeamRunRow>(
        `SELECT * FROM agents.team_runs ${where} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        teamId ? [limit, offset, teamId] : [limit, offset]
      ),
      this.queryOne<{ count: string }>(
        `SELECT COUNT(*) AS count FROM agents.team_runs ${countWhere}`,
        teamId ? [teamId] : []
      ),
    ]);
    return {
      runs: rows.map(runFromRow),
      total: Number(countRow?.count ?? 0),
    };
  }
}
