/**
 * ScimStorage — PostgreSQL-backed storage for SCIM 2.0 user and group provisioning.
 *
 * Uses the scim schema created by 015_scim.sql.
 */

import { PgBaseStorage } from '../storage/pg-base.js';

// ── Row types ────────────────────────────────────────────────────────

export interface ScimUserRow {
  id: string;
  external_id: string | null;
  user_name: string;
  display_name: string | null;
  email: string | null;
  active: boolean;
  roles: string[];
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface ScimGroupRow {
  id: string;
  external_id: string | null;
  display_name: string;
  members: string[];
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface ScimListResult<T> {
  rows: T[];
  totalCount: number;
}

// ── Storage class ────────────────────────────────────────────────────

export class ScimStorage extends PgBaseStorage {
  // ── Users ───────────────────────────────────────────────────────────

  async createUser(user: ScimUserRow): Promise<ScimUserRow> {
    return (await this.queryOne<ScimUserRow>(
      `INSERT INTO scim.users (id, external_id, user_name, display_name, email, active, roles, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        user.id,
        user.external_id,
        user.user_name,
        user.display_name,
        user.email,
        user.active,
        user.roles,
        JSON.stringify(user.metadata),
        user.created_at,
        user.updated_at,
      ]
    ))!;
  }

  async getUser(id: string): Promise<ScimUserRow | null> {
    return this.queryOne<ScimUserRow>(`SELECT * FROM scim.users WHERE id = $1`, [id]);
  }

  async getUserByUsername(userName: string): Promise<ScimUserRow | null> {
    return this.queryOne<ScimUserRow>(`SELECT * FROM scim.users WHERE user_name = $1`, [userName]);
  }

  async listUsers(
    filter?: string,
    startIndex: number = 1,
    count: number = 100
  ): Promise<ScimListResult<ScimUserRow>> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (filter) {
      const parsed = parseScimFilter(filter);
      if (parsed) {
        conditions.push(`${parsed.column} = $${paramIdx}`);
        values.push(parsed.value);
        paramIdx++;
      }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM scim.users ${where}`,
      values
    );
    const totalCount = parseInt(countResult?.count ?? '0', 10);

    const offset = Math.max(0, startIndex - 1);
    const rows = await this.queryMany<ScimUserRow>(
      `SELECT * FROM scim.users ${where} ORDER BY created_at ASC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...values, count, offset]
    );

    return { rows, totalCount };
  }

  async updateUser(id: string, updates: Partial<ScimUserRow>): Promise<ScimUserRow | null> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    const allowed: (keyof ScimUserRow)[] = [
      'external_id',
      'user_name',
      'display_name',
      'email',
      'active',
      'roles',
      'metadata',
    ];

    for (const key of allowed) {
      if (key in updates) {
        const val = key === 'metadata' ? JSON.stringify(updates[key]) : updates[key];
        setClauses.push(`${key} = $${paramIdx}`);
        values.push(val);
        paramIdx++;
      }
    }

    if (setClauses.length === 0) return this.getUser(id);

    setClauses.push(`updated_at = $${paramIdx}`);
    values.push(Date.now());
    paramIdx++;

    values.push(id);

    return this.queryOne<ScimUserRow>(
      `UPDATE scim.users SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values
    );
  }

  async deleteUser(id: string): Promise<boolean> {
    // Soft-delete: set active=false
    const count = await this.execute(
      `UPDATE scim.users SET active = false, updated_at = $1 WHERE id = $2`,
      [Date.now(), id]
    );
    return count > 0;
  }

  // ── Groups ──────────────────────────────────────────────────────────

  async createGroup(group: ScimGroupRow): Promise<ScimGroupRow> {
    return (await this.queryOne<ScimGroupRow>(
      `INSERT INTO scim.groups (id, external_id, display_name, members, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        group.id,
        group.external_id,
        group.display_name,
        group.members,
        JSON.stringify(group.metadata),
        group.created_at,
        group.updated_at,
      ]
    ))!;
  }

  async getGroup(id: string): Promise<ScimGroupRow | null> {
    return this.queryOne<ScimGroupRow>(`SELECT * FROM scim.groups WHERE id = $1`, [id]);
  }

  async getGroupByDisplayName(displayName: string): Promise<ScimGroupRow | null> {
    return this.queryOne<ScimGroupRow>(`SELECT * FROM scim.groups WHERE display_name = $1`, [
      displayName,
    ]);
  }

  async listGroups(
    filter?: string,
    startIndex: number = 1,
    count: number = 100
  ): Promise<ScimListResult<ScimGroupRow>> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (filter) {
      const parsed = parseScimFilter(filter);
      if (parsed) {
        conditions.push(`${parsed.column} = $${paramIdx}`);
        values.push(parsed.value);
        paramIdx++;
      }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM scim.groups ${where}`,
      values
    );
    const totalCount = parseInt(countResult?.count ?? '0', 10);

    const offset = Math.max(0, startIndex - 1);
    const rows = await this.queryMany<ScimGroupRow>(
      `SELECT * FROM scim.groups ${where} ORDER BY created_at ASC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...values, count, offset]
    );

    return { rows, totalCount };
  }

  async updateGroup(id: string, updates: Partial<ScimGroupRow>): Promise<ScimGroupRow | null> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    const allowed: (keyof ScimGroupRow)[] = ['external_id', 'display_name', 'members', 'metadata'];

    for (const key of allowed) {
      if (key in updates) {
        const val = key === 'metadata' ? JSON.stringify(updates[key]) : updates[key];
        setClauses.push(`${key} = $${paramIdx}`);
        values.push(val);
        paramIdx++;
      }
    }

    if (setClauses.length === 0) return this.getGroup(id);

    setClauses.push(`updated_at = $${paramIdx}`);
    values.push(Date.now());
    paramIdx++;

    values.push(id);

    return this.queryOne<ScimGroupRow>(
      `UPDATE scim.groups SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values
    );
  }

  async deleteGroup(id: string): Promise<boolean> {
    // Hard delete for groups
    const count = await this.execute(`DELETE FROM scim.groups WHERE id = $1`, [id]);
    return count > 0;
  }

  // ── Group membership ────────────────────────────────────────────────

  async addGroupMember(groupId: string, memberId: string): Promise<boolean> {
    const count = await this.execute(
      `UPDATE scim.groups SET members = array_append(members, $1), updated_at = $2
       WHERE id = $3 AND NOT ($1 = ANY(members))`,
      [memberId, Date.now(), groupId]
    );
    return count > 0;
  }

  async removeGroupMember(groupId: string, memberId: string): Promise<boolean> {
    const count = await this.execute(
      `UPDATE scim.groups SET members = array_remove(members, $1), updated_at = $2
       WHERE id = $3`,
      [memberId, Date.now(), groupId]
    );
    return count > 0;
  }
}

// ── SCIM filter parser (simple eq support) ─────────────────────────

const SCIM_FILTER_COLUMN_MAP: Record<string, string> = {
  userName: 'user_name',
  displayName: 'display_name',
  externalId: 'external_id',
  email: 'email',
  active: 'active',
};

function parseScimFilter(filter: string): { column: string; value: string } | null {
  // Supports: attributeName eq "value"
  const match = filter.match(/^(\w+)\s+eq\s+"([^"]+)"$/i);
  if (!match) return null;
  const attr = match[1];
  const value = match[2];
  if (!attr || !value) return null;
  const column = SCIM_FILTER_COLUMN_MAP[attr];
  if (!column) return null;
  return { column, value };
}
