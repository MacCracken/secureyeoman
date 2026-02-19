/**
 * SubAgentStorage — PostgreSQL-backed storage for agent profiles and delegations.
 *
 * Extends PgBaseStorage for query helpers and transaction support.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';
import { BUILTIN_PROFILES } from './profiles.js';
import type {
  AgentProfile,
  AgentProfileCreate,
  AgentProfileUpdate,
  DelegationStatus,
} from '@secureyeoman/shared';

// ─── Row types ──────────────────────────────────────────────────────

interface ProfileRow {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  max_token_budget: number;
  allowed_tools: string[];
  default_model: string | null;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
  // Phase 21 fields
  type: string;
  command: string | null;
  command_args: string[] | null;
  command_env: Record<string, string> | null;
  mcp_tool: string | null;
  mcp_tool_input: string | null;
}

interface DelegationRow {
  id: string;
  parent_delegation_id: string | null;
  profile_id: string;
  task: string;
  context: string | null;
  status: DelegationStatus;
  result: string | null;
  error: string | null;
  depth: number;
  max_depth: number;
  token_budget: number;
  tokens_used_prompt: number;
  tokens_used_completion: number;
  timeout_ms: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  initiated_by: string | null;
  correlation_id: string | null;
}

interface DelegationMessageRow {
  id: string;
  delegation_id: string;
  role: string;
  content: string | null;
  tool_calls: unknown;
  tool_result: unknown;
  token_count: number;
  created_at: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

function profileFromRow(row: ProfileRow): AgentProfile {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    systemPrompt: row.system_prompt,
    maxTokenBudget: row.max_token_budget,
    allowedTools: row.allowed_tools ?? [],
    defaultModel: row.default_model,
    isBuiltin: row.is_builtin,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    type: (row.type ?? 'llm') as 'llm' | 'binary' | 'mcp-bridge',
    command: row.command ?? undefined,
    commandArgs: row.command_args ?? undefined,
    commandEnv: row.command_env ?? undefined,
    mcpTool: row.mcp_tool ?? undefined,
    mcpToolInput: row.mcp_tool_input ?? undefined,
  };
}

export interface DelegationRecord {
  id: string;
  parentDelegationId: string | null;
  profileId: string;
  task: string;
  context: string | null;
  status: DelegationStatus;
  result: string | null;
  error: string | null;
  depth: number;
  maxDepth: number;
  tokenBudget: number;
  tokensUsedPrompt: number;
  tokensUsedCompletion: number;
  timeoutMs: number;
  startedAt: number | null;
  completedAt: number | null;
  createdAt: number;
  initiatedBy: string | null;
  correlationId: string | null;
}

function delegationFromRow(row: DelegationRow): DelegationRecord {
  return {
    id: row.id,
    parentDelegationId: row.parent_delegation_id,
    profileId: row.profile_id,
    task: row.task,
    context: row.context,
    status: row.status,
    result: row.result,
    error: row.error,
    depth: row.depth,
    maxDepth: row.max_depth,
    tokenBudget: row.token_budget,
    tokensUsedPrompt: row.tokens_used_prompt,
    tokensUsedCompletion: row.tokens_used_completion,
    timeoutMs: row.timeout_ms,
    startedAt: row.started_at ? new Date(row.started_at).getTime() : null,
    completedAt: row.completed_at ? new Date(row.completed_at).getTime() : null,
    createdAt: new Date(row.created_at).getTime(),
    initiatedBy: row.initiated_by,
    correlationId: row.correlation_id,
  };
}

export interface DelegationMessageRecord {
  id: string;
  delegationId: string;
  role: string;
  content: string | null;
  toolCalls: unknown;
  toolResult: unknown;
  tokenCount: number;
  createdAt: number;
}

function messageFromRow(row: DelegationMessageRow): DelegationMessageRecord {
  return {
    id: row.id,
    delegationId: row.delegation_id,
    role: row.role,
    content: row.content,
    toolCalls: row.tool_calls,
    toolResult: row.tool_result,
    tokenCount: row.token_count,
    createdAt: new Date(row.created_at).getTime(),
  };
}

// ─── Storage ────────────────────────────────────────────────────────

export class SubAgentStorage extends PgBaseStorage {
  // ── Profile operations ────────────────────────────────────────

  async seedBuiltinProfiles(): Promise<void> {
    for (const profile of BUILTIN_PROFILES) {
      await this.query(
        `INSERT INTO agents.profiles (id, name, description, system_prompt, max_token_budget, allowed_tools, default_model, is_builtin)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, true)
         ON CONFLICT (id) DO UPDATE SET
           description = EXCLUDED.description,
           system_prompt = EXCLUDED.system_prompt,
           max_token_budget = EXCLUDED.max_token_budget,
           allowed_tools = EXCLUDED.allowed_tools,
           default_model = EXCLUDED.default_model,
           updated_at = now()`,
        [
          profile.id,
          profile.name,
          profile.description,
          profile.systemPrompt,
          profile.maxTokenBudget,
          JSON.stringify(profile.allowedTools),
          profile.defaultModel,
        ]
      );
    }
  }

  async getProfile(id: string): Promise<AgentProfile | null> {
    const row = await this.queryOne<ProfileRow>(`SELECT * FROM agents.profiles WHERE id = $1`, [
      id,
    ]);
    return row ? profileFromRow(row) : null;
  }

  async getProfileByName(name: string): Promise<AgentProfile | null> {
    const row = await this.queryOne<ProfileRow>(`SELECT * FROM agents.profiles WHERE name = $1`, [
      name,
    ]);
    return row ? profileFromRow(row) : null;
  }

  async listProfiles(): Promise<AgentProfile[]> {
    const rows = await this.queryMany<ProfileRow>(
      `SELECT * FROM agents.profiles ORDER BY is_builtin DESC, name ASC`
    );
    return rows.map(profileFromRow);
  }

  async createProfile(data: AgentProfileCreate): Promise<AgentProfile> {
    const id = uuidv7();
    const row = await this.queryOne<ProfileRow>(
      `INSERT INTO agents.profiles
         (id, name, description, system_prompt, max_token_budget, allowed_tools, default_model, is_builtin,
          type, command, command_args, command_env, mcp_tool, mcp_tool_input)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, false, $8, $9, $10::jsonb, $11::jsonb, $12, $13)
       RETURNING *`,
      [
        id,
        data.name,
        data.description ?? '',
        data.systemPrompt,
        data.maxTokenBudget ?? 50000,
        JSON.stringify(data.allowedTools ?? []),
        data.defaultModel ?? null,
        (data as any).type ?? 'llm',
        (data as any).command ?? null,
        (data as any).commandArgs ? JSON.stringify((data as any).commandArgs) : null,
        (data as any).commandEnv ? JSON.stringify((data as any).commandEnv) : null,
        (data as any).mcpTool ?? null,
        (data as any).mcpToolInput ?? null,
      ]
    );
    return profileFromRow(row!);
  }

  async updateProfile(id: string, data: AgentProfileUpdate): Promise<AgentProfile | null> {
    const existing = await this.getProfile(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIdx++}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIdx++}`);
      values.push(data.description);
    }
    if (data.systemPrompt !== undefined) {
      updates.push(`system_prompt = $${paramIdx++}`);
      values.push(data.systemPrompt);
    }
    if (data.maxTokenBudget !== undefined) {
      updates.push(`max_token_budget = $${paramIdx++}`);
      values.push(data.maxTokenBudget);
    }
    if (data.allowedTools !== undefined) {
      updates.push(`allowed_tools = $${paramIdx++}::jsonb`);
      values.push(JSON.stringify(data.allowedTools));
    }
    if (data.defaultModel !== undefined) {
      updates.push(`default_model = $${paramIdx++}`);
      values.push(data.defaultModel);
    }
    const d = data as any;
    if (d.type !== undefined) { updates.push(`type = $${paramIdx++}`); values.push(d.type); }
    if (d.command !== undefined) { updates.push(`command = $${paramIdx++}`); values.push(d.command); }
    if (d.commandArgs !== undefined) { updates.push(`command_args = $${paramIdx++}::jsonb`); values.push(JSON.stringify(d.commandArgs)); }
    if (d.commandEnv !== undefined) { updates.push(`command_env = $${paramIdx++}::jsonb`); values.push(JSON.stringify(d.commandEnv)); }
    if (d.mcpTool !== undefined) { updates.push(`mcp_tool = $${paramIdx++}`); values.push(d.mcpTool); }
    if (d.mcpToolInput !== undefined) { updates.push(`mcp_tool_input = $${paramIdx++}`); values.push(d.mcpToolInput); }

    if (updates.length === 0) return existing;

    updates.push('updated_at = now()');
    values.push(id);

    const row = await this.queryOne<ProfileRow>(
      `UPDATE agents.profiles SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values
    );
    return row ? profileFromRow(row) : null;
  }

  async deleteProfile(id: string): Promise<boolean> {
    const count = await this.execute(
      `DELETE FROM agents.profiles WHERE id = $1 AND is_builtin = false`,
      [id]
    );
    return count > 0;
  }

  // ── Delegation operations ─────────────────────────────────────

  async createDelegation(data: {
    id: string;
    parentDelegationId?: string;
    profileId: string;
    task: string;
    context?: string;
    status: DelegationStatus;
    depth: number;
    maxDepth: number;
    tokenBudget: number;
    timeoutMs: number;
    initiatedBy?: string;
    correlationId?: string;
  }): Promise<DelegationRecord> {
    const row = await this.queryOne<DelegationRow>(
      `INSERT INTO agents.delegations (id, parent_delegation_id, profile_id, task, context, status, depth, max_depth, token_budget, timeout_ms, initiated_by, correlation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        data.id,
        data.parentDelegationId ?? null,
        data.profileId,
        data.task,
        data.context ?? null,
        data.status,
        data.depth,
        data.maxDepth,
        data.tokenBudget,
        data.timeoutMs,
        data.initiatedBy ?? null,
        data.correlationId ?? null,
      ]
    );
    return delegationFromRow(row!);
  }

  async updateDelegation(
    id: string,
    data: Partial<{
      status: DelegationStatus;
      result: string | null;
      error: string | null;
      tokensUsedPrompt: number;
      tokensUsedCompletion: number;
      startedAt: number;
      completedAt: number;
    }>
  ): Promise<DelegationRecord | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (data.status !== undefined) {
      updates.push(`status = $${paramIdx++}`);
      values.push(data.status);
    }
    if (data.result !== undefined) {
      updates.push(`result = $${paramIdx++}`);
      values.push(data.result);
    }
    if (data.error !== undefined) {
      updates.push(`error = $${paramIdx++}`);
      values.push(data.error);
    }
    if (data.tokensUsedPrompt !== undefined) {
      updates.push(`tokens_used_prompt = $${paramIdx++}`);
      values.push(data.tokensUsedPrompt);
    }
    if (data.tokensUsedCompletion !== undefined) {
      updates.push(`tokens_used_completion = $${paramIdx++}`);
      values.push(data.tokensUsedCompletion);
    }
    if (data.startedAt !== undefined) {
      updates.push(`started_at = to_timestamp($${paramIdx++} / 1000.0)`);
      values.push(data.startedAt);
    }
    if (data.completedAt !== undefined) {
      updates.push(`completed_at = to_timestamp($${paramIdx++} / 1000.0)`);
      values.push(data.completedAt);
    }

    if (updates.length === 0) return null;

    values.push(id);
    const row = await this.queryOne<DelegationRow>(
      `UPDATE agents.delegations SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values
    );
    return row ? delegationFromRow(row) : null;
  }

  async getDelegation(id: string): Promise<DelegationRecord | null> {
    const row = await this.queryOne<DelegationRow>(
      `SELECT * FROM agents.delegations WHERE id = $1`,
      [id]
    );
    return row ? delegationFromRow(row) : null;
  }

  async listDelegations(filter?: {
    status?: DelegationStatus;
    profileId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ delegations: DelegationRecord[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (filter?.status) {
      conditions.push(`status = $${paramIdx++}`);
      values.push(filter.status);
    }
    if (filter?.profileId) {
      conditions.push(`profile_id = $${paramIdx++}`);
      values.push(filter.profileId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;

    const countResult = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM agents.delegations ${where}`,
      values
    );

    const rows = await this.queryMany<DelegationRow>(
      `SELECT * FROM agents.delegations ${where} ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...values, limit, offset]
    );

    return {
      delegations: rows.map(delegationFromRow),
      total: parseInt(countResult?.count ?? '0', 10),
    };
  }

  async getActiveDelegations(): Promise<DelegationRecord[]> {
    const rows = await this.queryMany<DelegationRow>(
      `SELECT * FROM agents.delegations WHERE status IN ('pending', 'running') ORDER BY created_at ASC`
    );
    return rows.map(delegationFromRow);
  }

  async getDelegationTree(rootId: string): Promise<DelegationRecord[]> {
    const rows = await this.queryMany<DelegationRow>(
      `WITH RECURSIVE tree AS (
         SELECT * FROM agents.delegations WHERE id = $1
         UNION ALL
         SELECT d.* FROM agents.delegations d
         INNER JOIN tree t ON d.parent_delegation_id = t.id
       )
       SELECT * FROM tree ORDER BY depth ASC, created_at ASC`,
      [rootId]
    );
    return rows.map(delegationFromRow);
  }

  // ── Message operations ────────────────────────────────────────

  async storeDelegationMessage(data: {
    delegationId: string;
    role: string;
    content?: string;
    toolCalls?: unknown;
    toolResult?: unknown;
    tokenCount?: number;
  }): Promise<DelegationMessageRecord> {
    const id = uuidv7();
    const row = await this.queryOne<DelegationMessageRow>(
      `INSERT INTO agents.delegation_messages (id, delegation_id, role, content, tool_calls, tool_result, token_count)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
       RETURNING *`,
      [
        id,
        data.delegationId,
        data.role,
        data.content ?? null,
        data.toolCalls ? JSON.stringify(data.toolCalls) : null,
        data.toolResult ? JSON.stringify(data.toolResult) : null,
        data.tokenCount ?? 0,
      ]
    );
    return messageFromRow(row!);
  }

  async getDelegationMessages(delegationId: string): Promise<DelegationMessageRecord[]> {
    const rows = await this.queryMany<DelegationMessageRow>(
      `SELECT * FROM agents.delegation_messages WHERE delegation_id = $1 ORDER BY created_at ASC`,
      [delegationId]
    );
    return rows.map(messageFromRow);
  }
}
