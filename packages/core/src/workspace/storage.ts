/**
 * Workspace Storage — PostgreSQL persistence for team workspaces
 */

import type { Workspace, WorkspaceCreate, WorkspaceMember } from '@secureyeoman/shared';
import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';

export interface WorkspaceUpdate {
  name?: string;
  description?: string;
  settings?: Record<string, unknown>;
}

export class WorkspaceStorage extends PgBaseStorage {
  constructor() {
    super();
  }

  async create(data: WorkspaceCreate): Promise<Workspace> {
    const now = Date.now();
    const id = uuidv7();
    await this.execute(
      `INSERT INTO workspace.workspaces
        (id, name, description, settings, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, data.name, data.description ?? '', JSON.stringify(data.settings ?? {}), now, now]
    );
    return {
      id,
      name: data.name,
      description: data.description ?? '',
      members: [],
      settings: data.settings ?? {},
      createdAt: now,
      updatedAt: now,
    };
  }

  async get(id: string): Promise<Workspace | null> {
    const row = await this.queryOne<Record<string, unknown>>(
      'SELECT * FROM workspace.workspaces WHERE id = $1',
      [id]
    );
    if (!row) return null;
    const members = await this.getMembers(id);
    return {
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string) ?? '',
      members,
      settings: row.settings as Record<string, unknown>,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  async list(opts?: { limit?: number; offset?: number }): Promise<{ workspaces: Workspace[]; total: number }> {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;

    const countResult = await this.queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM workspace.workspaces'
    );

    const rows = await this.queryMany<Record<string, unknown>>(
      'SELECT * FROM workspace.workspaces ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );

    const workspaces: Workspace[] = [];
    for (const r of rows) {
      const members = await this.getMembers(r.id as string);
      workspaces.push({
        id: r.id as string,
        name: r.name as string,
        description: (r.description as string) ?? '',
        members,
        settings: r.settings as Record<string, unknown>,
        createdAt: r.created_at as number,
        updatedAt: r.updated_at as number,
      });
    }

    return {
      workspaces,
      total: parseInt(countResult?.count ?? '0', 10),
    };
  }

  async update(id: string, data: WorkspaceUpdate): Promise<Workspace | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) { updates.push(`name = $${idx++}`); values.push(data.name); }
    if (data.description !== undefined) { updates.push(`description = $${idx++}`); values.push(data.description); }
    if (data.settings !== undefined) { updates.push(`settings = $${idx++}`); values.push(JSON.stringify(data.settings)); }

    if (updates.length === 0) return this.get(id);

    updates.push(`updated_at = $${idx++}`);
    values.push(Date.now());
    values.push(id);

    await this.execute(
      `UPDATE workspace.workspaces SET ${updates.join(', ')} WHERE id = $${idx}`,
      values
    );
    return this.get(id);
  }

  async delete(id: string): Promise<boolean> {
    const changes = await this.execute('DELETE FROM workspace.workspaces WHERE id = $1', [id]);
    return changes > 0;
  }

  async addMember(workspaceId: string, userId: string, role = 'member'): Promise<WorkspaceMember> {
    const now = Date.now();
    await this.execute(
      `INSERT INTO workspace.members (workspace_id, user_id, role, joined_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(workspace_id, user_id) DO UPDATE SET role = $3, joined_at = $4`,
      [workspaceId, userId, role, now]
    );
    return { userId, role: role as WorkspaceMember['role'], joinedAt: now };
  }

  async removeMember(workspaceId: string, userId: string): Promise<boolean> {
    const changes = await this.execute(
      'DELETE FROM workspace.members WHERE workspace_id = $1 AND user_id = $2',
      [workspaceId, userId]
    );
    return changes > 0;
  }

  async updateMemberRole(workspaceId: string, userId: string, role: string): Promise<WorkspaceMember | null> {
    const now = Date.now();
    const count = await this.execute(
      'UPDATE workspace.members SET role = $1 WHERE workspace_id = $2 AND user_id = $3',
      [role, workspaceId, userId]
    );
    if (count === 0) return null;
    return { userId, role: role as WorkspaceMember['role'], joinedAt: now };
  }

  async listMembers(workspaceId: string, opts?: { limit?: number; offset?: number }): Promise<{ members: WorkspaceMember[]; total: number }> {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;

    const countResult = await this.queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM workspace.members WHERE workspace_id = $1',
      [workspaceId]
    );

    const rows = await this.queryMany<Record<string, unknown>>(
      'SELECT * FROM workspace.members WHERE workspace_id = $1 LIMIT $2 OFFSET $3',
      [workspaceId, limit, offset]
    );

    const members = rows.map((r) => ({
      userId: r.user_id as string,
      role: r.role as WorkspaceMember['role'],
      joinedAt: r.joined_at as number,
    }));

    return {
      members,
      total: parseInt(countResult?.count ?? '0', 10),
    };
  }

  async getMember(workspaceId: string, userId: string): Promise<WorkspaceMember | null> {
    const row = await this.queryOne<Record<string, unknown>>(
      'SELECT * FROM workspace.members WHERE workspace_id = $1 AND user_id = $2',
      [workspaceId, userId]
    );
    if (!row) return null;
    return {
      userId: row.user_id as string,
      role: row.role as WorkspaceMember['role'],
      joinedAt: row.joined_at as number,
    };
  }

  private async getMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const rows = await this.queryMany<Record<string, unknown>>(
      'SELECT * FROM workspace.members WHERE workspace_id = $1',
      [workspaceId]
    );
    return rows.map((r) => ({
      userId: r.user_id as string,
      role: r.role as WorkspaceMember['role'],
      joinedAt: r.joined_at as number,
    }));
  }
}
