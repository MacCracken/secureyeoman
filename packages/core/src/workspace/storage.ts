/**
 * Workspace Storage — PostgreSQL persistence for team workspaces
 */

import type { Workspace, WorkspaceCreate, WorkspaceMember } from '@friday/shared';
import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';

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
      [id, data.name, data.description ?? '', JSON.stringify(data.settings ?? {}), now, now],
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
      [id],
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

  async list(): Promise<Workspace[]> {
    const rows = await this.queryMany<Record<string, unknown>>(
      'SELECT * FROM workspace.workspaces ORDER BY created_at DESC',
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
    return workspaces;
  }

  async delete(id: string): Promise<boolean> {
    const changes = await this.execute(
      'DELETE FROM workspace.workspaces WHERE id = $1',
      [id],
    );
    return changes > 0;
  }

  async addMember(workspaceId: string, userId: string, role = 'member'): Promise<WorkspaceMember> {
    const now = Date.now();
    await this.execute(
      `INSERT INTO workspace.members (workspace_id, user_id, role, joined_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(workspace_id, user_id) DO UPDATE SET role = $3, joined_at = $4`,
      [workspaceId, userId, role, now],
    );
    return { userId, role: role as WorkspaceMember['role'], joinedAt: now };
  }

  async removeMember(workspaceId: string, userId: string): Promise<boolean> {
    const changes = await this.execute(
      'DELETE FROM workspace.members WHERE workspace_id = $1 AND user_id = $2',
      [workspaceId, userId],
    );
    return changes > 0;
  }

  private async getMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const rows = await this.queryMany<Record<string, unknown>>(
      'SELECT * FROM workspace.members WHERE workspace_id = $1',
      [workspaceId],
    );
    return rows.map((r) => ({
      userId: r.user_id as string,
      role: r.role as WorkspaceMember['role'],
      joinedAt: r.joined_at as number,
    }));
  }
}
