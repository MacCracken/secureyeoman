/**
 * SwarmStorage — PostgreSQL-backed storage for swarm templates, runs, and members.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';
import { BUILTIN_SWARM_TEMPLATES } from './swarm-templates.js';
import type {
  SwarmTemplate,
  SwarmTemplateCreate,
  SwarmRun,
  SwarmRunParams,
  SwarmMember,
  SwarmStrategy,
  SwarmStatus,
  CatalogSkill,
} from '@secureyeoman/shared';

// ─── Row types ──────────────────────────────────────────────────────

interface SwarmTemplateRow {
  id: string;
  name: string;
  description: string;
  strategy: string;
  roles: unknown;
  coordinator_profile: string | null;
  is_builtin: boolean;
  created_at: string | number;
}

interface SwarmRunRow {
  id: string;
  template_id: string;
  template_name: string;
  task: string;
  context: string | null;
  status: string;
  strategy: string;
  result: string | null;
  error: string | null;
  token_budget: number;
  tokens_used_prompt: number;
  tokens_used_completion: number;
  created_at: string | number;
  started_at: string | number | null;
  completed_at: string | number | null;
  initiated_by: string | null;
}

interface SwarmMemberRow {
  id: string;
  swarm_run_id: string;
  role: string;
  profile_name: string;
  delegation_id: string | null;
  status: string;
  result: string | null;
  seq_order: number;
  created_at: string | number;
  started_at: string | number | null;
  completed_at: string | number | null;
}

// ─── Helpers ────────────────────────────────────────────────────────

function toTs(val: string | number | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  // ISO timestamp from PostgreSQL
  return new Date(val).getTime();
}

function templateFromRow(row: SwarmTemplateRow): SwarmTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    strategy: row.strategy as SwarmStrategy,
    roles: (row.roles as SwarmTemplate['roles']) ?? [],
    coordinatorProfile: row.coordinator_profile,
    isBuiltin: row.is_builtin,
    createdAt: toTs(row.created_at) ?? Date.now(),
  };
}

function runFromRow(row: SwarmRunRow): SwarmRun {
  return {
    id: row.id,
    templateId: row.template_id,
    templateName: row.template_name,
    task: row.task,
    context: row.context,
    status: row.status as SwarmStatus,
    strategy: row.strategy as SwarmStrategy,
    result: row.result,
    error: row.error,
    tokenBudget: row.token_budget,
    tokensUsedPrompt: row.tokens_used_prompt,
    tokensUsedCompletion: row.tokens_used_completion,
    createdAt: toTs(row.created_at) ?? Date.now(),
    startedAt: toTs(row.started_at),
    completedAt: toTs(row.completed_at),
    initiatedBy: row.initiated_by,
  };
}

function memberFromRow(row: SwarmMemberRow): SwarmMember {
  return {
    id: row.id,
    swarmRunId: row.swarm_run_id,
    role: row.role,
    profileName: row.profile_name,
    delegationId: row.delegation_id,
    status: row.status,
    result: row.result,
    seqOrder: row.seq_order,
    createdAt: toTs(row.created_at) ?? Date.now(),
    startedAt: toTs(row.started_at),
    completedAt: toTs(row.completed_at),
  };
}

// ─── Storage ────────────────────────────────────────────────────────

export class SwarmStorage extends PgBaseStorage {
  // ── Template operations ───────────────────────────────────────

  async seedBuiltinTemplates(): Promise<void> {
    const now = Date.now();
    for (const tmpl of BUILTIN_SWARM_TEMPLATES) {
      await this.query(
        `INSERT INTO agents.swarm_templates
           (id, name, description, strategy, roles, coordinator_profile, is_builtin, created_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, true, $7)
         ON CONFLICT (id) DO UPDATE SET
           name                = EXCLUDED.name,
           description         = EXCLUDED.description,
           strategy            = EXCLUDED.strategy,
           roles               = EXCLUDED.roles,
           coordinator_profile = EXCLUDED.coordinator_profile`,
        [
          tmpl.id,
          tmpl.name,
          tmpl.description,
          tmpl.strategy,
          JSON.stringify(tmpl.roles),
          tmpl.coordinatorProfile,
          now,
        ]
      );
    }
  }

  async getTemplate(id: string): Promise<SwarmTemplate | null> {
    const row = await this.queryOne<SwarmTemplateRow>(
      `SELECT * FROM agents.swarm_templates WHERE id = $1`,
      [id]
    );
    return row ? templateFromRow(row) : null;
  }

  async listTemplates(opts?: {
    limit?: number;
    offset?: number;
  }): Promise<{ templates: SwarmTemplate[]; total: number }> {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;

    const countResult = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM agents.swarm_templates`
    );

    const rows = await this.queryMany<SwarmTemplateRow>(
      `SELECT * FROM agents.swarm_templates ORDER BY is_builtin DESC, name ASC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return {
      templates: rows.map(templateFromRow),
      total: parseInt(countResult?.count ?? '0', 10),
    };
  }

  async createTemplate(data: SwarmTemplateCreate): Promise<SwarmTemplate> {
    const id = uuidv7();
    const now = Date.now();
    const row = await this.queryOne<SwarmTemplateRow>(
      `INSERT INTO agents.swarm_templates
         (id, name, description, strategy, roles, coordinator_profile, is_builtin, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, false, $7)
       RETURNING *`,
      [
        id,
        data.name,
        data.description ?? '',
        data.strategy,
        JSON.stringify(data.roles),
        data.coordinatorProfile ?? null,
        now,
      ]
    );
    return templateFromRow(row!);
  }

  async updateTemplate(
    id: string,
    data: Partial<SwarmTemplateCreate>
  ): Promise<SwarmTemplate | null> {
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
    if (data.strategy !== undefined) {
      updates.push(`strategy = $${p++}`);
      values.push(data.strategy);
    }
    if (data.roles !== undefined) {
      updates.push(`roles = $${p++}::jsonb`);
      values.push(JSON.stringify(data.roles));
    }
    if ('coordinatorProfile' in data) {
      updates.push(`coordinator_profile = $${p++}`);
      values.push(data.coordinatorProfile ?? null);
    }

    if (updates.length === 0) return null;
    values.push(id);

    const row = await this.queryOne<SwarmTemplateRow>(
      `UPDATE agents.swarm_templates SET ${updates.join(', ')} WHERE id = $${p} AND is_builtin = false RETURNING *`,
      values
    );
    return row ? templateFromRow(row) : null;
  }

  async deleteTemplate(id: string): Promise<boolean> {
    const count = await this.execute(
      `DELETE FROM agents.swarm_templates WHERE id = $1 AND is_builtin = false`,
      [id]
    );
    return count > 0;
  }

  // ── Run operations ────────────────────────────────────────────

  async createRun(params: SwarmRunParams, template: SwarmTemplate): Promise<SwarmRun> {
    const id = uuidv7();
    const now = Date.now();
    const row = await this.queryOne<SwarmRunRow>(
      `INSERT INTO agents.swarm_runs
         (id, template_id, template_name, task, context, status, strategy, token_budget, created_at, initiated_by)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9)
       RETURNING *`,
      [
        id,
        template.id,
        template.name,
        params.task,
        params.context ?? null,
        template.strategy,
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
      status: SwarmStatus;
      result: string | null;
      error: string | null;
      tokensUsedPrompt: number;
      tokensUsedCompletion: number;
      startedAt: number;
      completedAt: number;
    }>
  ): Promise<SwarmRun | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    if (data.status !== undefined) {
      updates.push(`status = $${p++}`);
      values.push(data.status);
    }
    if (data.result !== undefined) {
      updates.push(`result = $${p++}`);
      values.push(data.result);
    }
    if (data.error !== undefined) {
      updates.push(`error = $${p++}`);
      values.push(data.error);
    }
    if (data.tokensUsedPrompt !== undefined) {
      updates.push(`tokens_used_prompt = $${p++}`);
      values.push(data.tokensUsedPrompt);
    }
    if (data.tokensUsedCompletion !== undefined) {
      updates.push(`tokens_used_completion = $${p++}`);
      values.push(data.tokensUsedCompletion);
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

    const row = await this.queryOne<SwarmRunRow>(
      `UPDATE agents.swarm_runs SET ${updates.join(', ')} WHERE id = $${p} RETURNING *`,
      values
    );
    return row ? runFromRow(row) : null;
  }

  async getRun(id: string): Promise<SwarmRun | null> {
    const row = await this.queryOne<SwarmRunRow>(`SELECT * FROM agents.swarm_runs WHERE id = $1`, [
      id,
    ]);
    return row ? runFromRow(row) : null;
  }

  async listRuns(filter?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ runs: SwarmRun[]; total: number }> {
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
      `SELECT COUNT(*) as count FROM agents.swarm_runs ${where}`,
      values
    );

    const rows = await this.queryMany<SwarmRunRow>(
      `SELECT * FROM agents.swarm_runs ${where} ORDER BY created_at DESC LIMIT $${p++} OFFSET $${p++}`,
      [...values, limit, offset]
    );

    return {
      runs: rows.map(runFromRow),
      total: parseInt(countRow?.count ?? '0', 10),
    };
  }

  // ── Member operations ─────────────────────────────────────────

  async createMember(data: {
    swarmRunId: string;
    role: string;
    profileName: string;
    seqOrder: number;
  }): Promise<SwarmMember> {
    const id = uuidv7();
    const now = Date.now();
    const row = await this.queryOne<SwarmMemberRow>(
      `INSERT INTO agents.swarm_members
         (id, swarm_run_id, role, profile_name, seq_order, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, data.swarmRunId, data.role, data.profileName, data.seqOrder, now]
    );
    return memberFromRow(row!);
  }

  async updateMember(
    id: string,
    data: Partial<{
      status: string;
      result: string | null;
      delegationId: string;
      startedAt: number;
      completedAt: number;
    }>
  ): Promise<SwarmMember | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    if (data.status !== undefined) {
      updates.push(`status = $${p++}`);
      values.push(data.status);
    }
    if (data.result !== undefined) {
      updates.push(`result = $${p++}`);
      values.push(data.result);
    }
    if (data.delegationId !== undefined) {
      updates.push(`delegation_id = $${p++}`);
      values.push(data.delegationId);
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

    const row = await this.queryOne<SwarmMemberRow>(
      `UPDATE agents.swarm_members SET ${updates.join(', ')} WHERE id = $${p} RETURNING *`,
      values
    );
    return row ? memberFromRow(row) : null;
  }

  async getMembersForRun(swarmRunId: string): Promise<SwarmMember[]> {
    const rows = await this.queryMany<SwarmMemberRow>(
      `SELECT * FROM agents.swarm_members WHERE swarm_run_id = $1 ORDER BY seq_order ASC`,
      [swarmRunId]
    );
    return rows.map(memberFromRow);
  }

  // ── Profile skills ────────────────────────────────────────────

  async getProfileSkills(profileId: string): Promise<CatalogSkill[]> {
    const rows = await this.queryMany<Record<string, unknown>>(
      `SELECT ms.* FROM agents.profile_skills ps
         JOIN marketplace.skills ms ON ms.id = ps.skill_id
        WHERE ps.profile_id = $1
        ORDER BY ps.installed_at ASC`,
      [profileId]
    );
    // Map raw rows to CatalogSkill — mirror MarketplaceStorage.rowToSkill pattern
    return rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      description: (r.description as string) ?? '',
      version: (r.version as string) ?? '1.0.0',
      author: (r.author as string) ?? '',
      authorInfo: r.author_info as CatalogSkill['authorInfo'],
      category: (r.category as string) ?? 'general',
      tags: (r.tags as string[]) ?? [],
      downloadCount: (r.download_count as number) ?? 0,
      rating: (r.rating as number) ?? 0,
      installed: (r.installed as boolean) ?? false,
      installedGlobally: (r.installed_globally as boolean) ?? false,
      source: ((r.source as string) ?? 'published') as CatalogSkill['source'],
      origin: ((r.origin as string) ?? 'marketplace') as CatalogSkill['origin'],
      publishedAt: (r.published_at as number) ?? 0,
      instructions: (r.instructions as string) ?? '',
      triggerPatterns: (r.trigger_patterns as string[]) ?? [],
      useWhen: (r.use_when as string) ?? '',
      doNotUseWhen: (r.do_not_use_when as string) ?? '',
      successCriteria: (r.success_criteria as string) ?? '',
      mcpToolsAllowed: (r.mcp_tools_allowed as string[]) ?? [],
      routing: ((r.routing as string) ?? 'fuzzy') as 'fuzzy' | 'explicit',
      autonomyLevel: ((r.autonomy_level as string) ?? 'L1') as CatalogSkill['autonomyLevel'],
      tools: (r.tools as CatalogSkill['tools']) ?? [],
      createdAt: r.created_at as number,
      updatedAt: r.updated_at as number,
    }));
  }

  async addProfileSkill(profileId: string, skillId: string): Promise<void> {
    await this.query(
      `INSERT INTO agents.profile_skills (profile_id, skill_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [profileId, skillId]
    );
  }

  async removeProfileSkill(profileId: string, skillId: string): Promise<void> {
    await this.execute(
      `DELETE FROM agents.profile_skills WHERE profile_id = $1 AND skill_id = $2`,
      [profileId, skillId]
    );
  }
}
