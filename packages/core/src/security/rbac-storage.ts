/**
 * RBAC Storage — PostgreSQL-backed persistent storage for role assignments.
 *
 * Prior to this module, all RBAC user-to-role mappings were held exclusively
 * in memory and lost on process restart.  This storage layer persists
 * assignments to PostgreSQL following the same conventions used by
 * AuthStorage and SoulStorage:
 *
 *   - PgBaseStorage base class with shared connection pool.
 *   - Parameterised statements for all queries to avoid SQL injection.
 *   - No-op close() for graceful shutdown integration.
 *
 * The storage manages two tables:
 *
 *   1. **rbac.role_definitions** — Custom role definitions that augment or
 *      override the hard-coded defaults in rbac.ts.  This allows operators
 *      to persist roles created via the API so they survive restarts.
 *
 *   2. **rbac.user_role_assignments** — Maps a userId to a roleId.  A user
 *      may have exactly one active assignment at a time (UNIQUE on user_id
 *      WHERE revoked_at IS NULL).  Revoking an assignment soft-deletes the
 *      row by setting revoked_at.
 *
 * Security considerations:
 *   - All queries use parameterised statements (never string interpolation).
 *   - The revoked_at column enables auditability — we never hard-delete.
 *   - Role definitions are validated at the application layer (Zod) before
 *     being persisted; the storage layer trusts its callers.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import type { RoleDefinition, Permission } from '@friday/shared';

// ── Row types ────────────────────────────────────────────────────────────

/**
 * Represents a persisted custom role definition as stored in PostgreSQL.
 * Permissions and inheritFrom are stored as JSONB columns.
 */
export interface RoleDefinitionRow {
  /** Role ID (e.g. "role_custom_ops"). Primary key. */
  id: string;
  /** Human-readable role name. */
  name: string;
  /** Optional description of the role's purpose. */
  description: string | null;
  /** JSONB Permission[] array. */
  permissions_json: unknown;
  /** JSONB string[] of parent role IDs (nullable). */
  inherit_from_json: unknown | null;
  /** Unix timestamp (ms) when the role was created. */
  created_at: number;
  /** Unix timestamp (ms) when the role was last modified (nullable). */
  updated_at: number | null;
}

/**
 * Represents a user-to-role assignment row in PostgreSQL.
 *
 * The UNIQUE partial index on (user_id) WHERE revoked_at IS NULL ensures
 * only one active (non-revoked) assignment per user.
 */
export interface UserRoleAssignmentRow {
  /** SERIAL primary key. */
  id: number;
  /** The user being assigned a role. */
  user_id: string;
  /** The role being assigned (references role_definitions or built-in IDs). */
  role_id: string;
  /** Who performed the assignment (admin userId or "system"). */
  assigned_by: string;
  /** Unix timestamp (ms) when the assignment was created. */
  assigned_at: number;
  /** Unix timestamp (ms) when the assignment was revoked (null = active). */
  revoked_at: number | null;
}

// ── Storage class ────────────────────────────────────────────────────────

export class RBACStorage extends PgBaseStorage {
  constructor() {
    super();
  }

  // ── Role definitions ─────────────────────────────────────────────────

  /**
   * Persist a custom role definition.
   *
   * Uses INSERT ... ON CONFLICT DO UPDATE so that calling this with an
   * existing role ID performs an upsert.  The updated_at column is set
   * on replacements to distinguish creates from updates.
   *
   * @param role — A validated RoleDefinition from the application layer.
   */
  async saveRoleDefinition(role: RoleDefinition): Promise<void> {
    const now = Date.now();

    // Check if the role already exists to decide created_at vs updated_at.
    const existing = await this.queryOne<{ created_at: number }>(
      'SELECT created_at FROM rbac.role_definitions WHERE id = $1',
      [role.id],
    );

    await this.execute(
      `INSERT INTO rbac.role_definitions
         (id, name, description, permissions_json, inherit_from_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT(id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         permissions_json = EXCLUDED.permissions_json,
         inherit_from_json = EXCLUDED.inherit_from_json,
         updated_at = EXCLUDED.updated_at`,
      [
        role.id,
        role.name,
        role.description ?? null,
        JSON.stringify(role.permissions),
        role.inheritFrom ? JSON.stringify(role.inheritFrom) : null,
        existing?.created_at ?? now,
        existing ? now : null,
      ],
    );
  }

  /**
   * Delete a custom role definition by ID.
   *
   * @returns true if a row was actually deleted, false if the ID didn't exist.
   */
  async deleteRoleDefinition(roleId: string): Promise<boolean> {
    const changes = await this.execute(
      'DELETE FROM rbac.role_definitions WHERE id = $1',
      [roleId],
    );
    return changes > 0;
  }

  /**
   * Retrieve a single custom role definition by ID.
   *
   * @returns The RoleDefinition or null if not found.
   */
  async getRoleDefinition(roleId: string): Promise<RoleDefinition | null> {
    const row = await this.queryOne<RoleDefinitionRow>(
      'SELECT * FROM rbac.role_definitions WHERE id = $1',
      [roleId],
    );

    return row ? this.rowToRoleDefinition(row) : null;
  }

  /**
   * Retrieve all persisted custom role definitions.
   *
   * These are merged with the hard-coded defaults at RBAC initialisation
   * time, with persisted roles taking precedence in case of ID collisions.
   *
   * @returns An array of RoleDefinition objects, ordered by creation time.
   */
  async getAllRoleDefinitions(): Promise<RoleDefinition[]> {
    const rows = await this.queryMany<RoleDefinitionRow>(
      'SELECT * FROM rbac.role_definitions ORDER BY created_at ASC',
    );

    return rows.map((row) => this.rowToRoleDefinition(row));
  }

  // ── User-role assignments ────────────────────────────────────────────

  /**
   * Assign a role to a user.
   *
   * If the user already has an active assignment it is automatically
   * revoked before the new one is created.  This preserves a complete
   * audit trail of role changes.
   *
   * @param userId     — The user receiving the role.
   * @param roleId     — The role to assign (must be a known role ID).
   * @param assignedBy — The admin or system identity performing the action.
   */
  async assignRole(userId: string, roleId: string, assignedBy: string): Promise<void> {
    const now = Date.now();

    // Wrap in a transaction so the revoke + insert is atomic.  This
    // prevents a window where a user has zero active roles.
    await this.withTransaction(async (client) => {
      // Revoke any existing active assignment for this user.
      await client.query(
        `UPDATE rbac.user_role_assignments
           SET revoked_at = $1
         WHERE user_id = $2 AND revoked_at IS NULL`,
        [now, userId],
      );

      // Insert the new assignment (id is SERIAL, auto-generated).
      await client.query(
        `INSERT INTO rbac.user_role_assignments
           (user_id, role_id, assigned_by, assigned_at, revoked_at)
         VALUES ($1, $2, $3, $4, NULL)`,
        [userId, roleId, assignedBy, now],
      );
    });
  }

  /**
   * Revoke the active role assignment for a user.
   *
   * Soft-deletes by setting revoked_at.  The row remains in the table
   * for audit purposes.
   *
   * @returns true if an active assignment was found and revoked.
   */
  async revokeRole(userId: string): Promise<boolean> {
    const changes = await this.execute(
      `UPDATE rbac.user_role_assignments
         SET revoked_at = $1
       WHERE user_id = $2 AND revoked_at IS NULL`,
      [Date.now(), userId],
    );

    return changes > 0;
  }

  /**
   * Get the currently active role assignment for a user.
   *
   * @returns The role ID string, or null if the user has no active role.
   */
  async getActiveRole(userId: string): Promise<string | null> {
    const row = await this.queryOne<{ role_id: string }>(
      `SELECT role_id FROM rbac.user_role_assignments
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );

    return row?.role_id ?? null;
  }

  /**
   * List all active user-role assignments.
   *
   * Useful for admin dashboards and for rehydrating an in-memory role
   * cache at startup.
   *
   * @returns An array of {userId, roleId} pairs for all active assignments.
   */
  async listActiveAssignments(): Promise<Array<{ userId: string; roleId: string; assignedAt: number }>> {
    const rows = await this.queryMany<{ user_id: string; role_id: string; assigned_at: number }>(
      `SELECT user_id, role_id, assigned_at
       FROM rbac.user_role_assignments
       WHERE revoked_at IS NULL
       ORDER BY assigned_at ASC`,
    );

    return rows.map((r) => ({
      userId: r.user_id,
      roleId: r.role_id,
      assignedAt: r.assigned_at,
    }));
  }

  /**
   * Get the full assignment history for a user, including revoked entries.
   *
   * @returns All assignment rows ordered by assigned_at descending (newest first).
   */
  async getAssignmentHistory(userId: string): Promise<UserRoleAssignmentRow[]> {
    return this.queryMany<UserRoleAssignmentRow>(
      `SELECT * FROM rbac.user_role_assignments
       WHERE user_id = $1
       ORDER BY assigned_at DESC`,
      [userId],
    );
  }

  /**
   * List all users currently assigned a specific role.
   *
   * @returns An array of user IDs with that active role.
   */
  async getUsersByRole(roleId: string): Promise<string[]> {
    const rows = await this.queryMany<{ user_id: string }>(
      `SELECT user_id FROM rbac.user_role_assignments
       WHERE role_id = $1 AND revoked_at IS NULL
       ORDER BY assigned_at ASC`,
      [roleId],
    );

    return rows.map((r) => r.user_id);
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  override close(): void {
    // no-op — pool lifecycle is managed globally
  }

  // ── Private helpers ──────────────────────────────────────────────────

  /**
   * Convert a RoleDefinitionRow from PostgreSQL into the application-layer
   * RoleDefinition type by deserialising the JSONB columns.
   */
  private rowToRoleDefinition(row: RoleDefinitionRow): RoleDefinition {
    const permissions = typeof row.permissions_json === 'string'
      ? JSON.parse(row.permissions_json) as Permission[]
      : row.permissions_json as Permission[];

    const inheritFrom = row.inherit_from_json
      ? (typeof row.inherit_from_json === 'string'
        ? JSON.parse(row.inherit_from_json) as string[]
        : row.inherit_from_json as string[])
      : undefined;

    return {
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      permissions,
      inheritFrom,
    };
  }
}
