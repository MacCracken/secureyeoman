/**
 * ScimManager — SCIM 2.0 provisioning logic for automated user/group management
 * from identity providers (Okta, Azure AD, etc.).
 *
 * Implements the SCIM 2.0 resource format and PATCH operations per RFC 7644.
 */

import type { ScimStorage, ScimUserRow, ScimGroupRow } from './scim-storage.js';
import { uuidv7 } from '../utils/crypto.js';

// ── SCIM Schema URNs ─────────────────────────────────────────────────

export const SCIM_SCHEMAS = {
  User: 'urn:ietf:params:scim:schemas:core:2.0:User',
  Group: 'urn:ietf:params:scim:schemas:core:2.0:Group',
  ListResponse: 'urn:ietf:params:scim:api:messages:2.0:ListResponse',
  PatchOp: 'urn:ietf:params:scim:api:messages:2.0:PatchOp',
  Error: 'urn:ietf:params:scim:api:messages:2.0:Error',
} as const;

// ── SCIM Resource Types ──────────────────────────────────────────────

export interface ScimUserResource {
  schemas: string[];
  id: string;
  externalId?: string;
  userName: string;
  displayName?: string;
  emails?: { value: string; primary: boolean }[];
  active: boolean;
  groups?: { value: string; display: string }[];
  roles?: string[];
  meta: {
    resourceType: string;
    created: string;
    lastModified: string;
  };
}

export interface ScimGroupResource {
  schemas: string[];
  id: string;
  externalId?: string;
  displayName: string;
  members: { value: string; display?: string }[];
  meta: {
    resourceType: string;
    created: string;
    lastModified: string;
  };
}

export interface ScimListResponse<T> {
  schemas: string[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: T[];
}

export interface ScimErrorResponse {
  schemas: string[];
  detail: string;
  status: number;
}

export interface ScimPatchOperation {
  op: 'add' | 'remove' | 'replace';
  path?: string;
  value?: unknown;
}

export interface ScimPatchRequest {
  schemas: string[];
  Operations: ScimPatchOperation[];
}

// ── Manager class ────────────────────────────────────────────────────

export class ScimManager {
  constructor(private readonly storage: ScimStorage) {}

  // ── SCIM Error helper ─────────────────────────────────────────────

  static scimError(detail: string, status: number): ScimErrorResponse {
    return {
      schemas: [SCIM_SCHEMAS.Error],
      detail,
      status,
    };
  }

  // ── User operations ───────────────────────────────────────────────

  async createUser(body: Record<string, unknown>): Promise<ScimUserResource> {
    const userName = body.userName as string;
    if (!userName) {
      throw new ScimError('userName is required', 400);
    }

    const existing = await this.storage.getUserByUsername(userName);
    if (existing) {
      throw new ScimError('User already exists', 409);
    }

    const now = Date.now();
    const id = uuidv7();
    const emails = body.emails as { value: string; primary?: boolean }[] | undefined;

    const row = await this.storage.createUser({
      id,
      external_id: (body.externalId as string) ?? null,
      user_name: userName,
      display_name: (body.displayName as string) ?? null,
      email: emails?.[0]?.value ?? null,
      active: body.active !== false,
      roles: (body.roles as string[]) ?? [],
      metadata: {},
      created_at: now,
      updated_at: now,
    });

    return this.toUserResource(row);
  }

  async getUser(id: string): Promise<ScimUserResource> {
    const row = await this.storage.getUser(id);
    if (!row) throw new ScimError('User not found', 404);
    return this.toUserResource(row);
  }

  async listUsers(
    filter?: string,
    startIndex = 1,
    count = 100
  ): Promise<ScimListResponse<ScimUserResource>> {
    const result = await this.storage.listUsers(filter, startIndex, count);
    return {
      schemas: [SCIM_SCHEMAS.ListResponse],
      totalResults: result.totalCount,
      startIndex,
      itemsPerPage: result.rows.length,
      Resources: result.rows.map((r) => this.toUserResource(r)),
    };
  }

  async replaceUser(id: string, body: Record<string, unknown>): Promise<ScimUserResource> {
    const existing = await this.storage.getUser(id);
    if (!existing) throw new ScimError('User not found', 404);

    const emails = body.emails as { value: string; primary?: boolean }[] | undefined;

    const updated = await this.storage.updateUser(id, {
      external_id: (body.externalId as string) ?? existing.external_id,
      user_name: (body.userName as string) ?? existing.user_name,
      display_name: (body.displayName as string) ?? existing.display_name,
      email: emails?.[0]?.value ?? existing.email,
      active: body.active !== undefined ? body.active !== false : existing.active,
      roles: (body.roles as string[]) ?? existing.roles,
    });

    if (!updated) throw new ScimError('User not found', 404);
    return this.toUserResource(updated);
  }

  async patchUser(id: string, patch: ScimPatchRequest): Promise<ScimUserResource> {
    const existing = await this.storage.getUser(id);
    if (!existing) throw new ScimError('User not found', 404);

    const updates: Partial<ScimUserRow> = {};

    for (const op of patch.Operations) {
      this.applyUserPatchOp(existing, updates, op);
    }

    if (Object.keys(updates).length > 0) {
      const updated = await this.storage.updateUser(id, updates);
      if (!updated) throw new ScimError('User not found', 404);
      return this.toUserResource(updated);
    }

    return this.toUserResource(existing);
  }

  async deleteUser(id: string): Promise<void> {
    const ok = await this.storage.deleteUser(id);
    if (!ok) throw new ScimError('User not found', 404);
  }

  // ── Group operations ──────────────────────────────────────────────

  async createGroup(body: Record<string, unknown>): Promise<ScimGroupResource> {
    const displayName = body.displayName as string;
    if (!displayName) {
      throw new ScimError('displayName is required', 400);
    }

    const existing = await this.storage.getGroupByDisplayName(displayName);
    if (existing) {
      throw new ScimError('Group already exists', 409);
    }

    const now = Date.now();
    const id = uuidv7();
    const members = body.members as { value: string }[] | undefined;

    const row = await this.storage.createGroup({
      id,
      external_id: (body.externalId as string) ?? null,
      display_name: displayName,
      members: members?.map((m) => m.value) ?? [],
      metadata: {},
      created_at: now,
      updated_at: now,
    });

    return this.toGroupResource(row);
  }

  async getGroup(id: string): Promise<ScimGroupResource> {
    const row = await this.storage.getGroup(id);
    if (!row) throw new ScimError('Group not found', 404);
    return this.toGroupResource(row);
  }

  async listGroups(
    filter?: string,
    startIndex = 1,
    count = 100
  ): Promise<ScimListResponse<ScimGroupResource>> {
    const result = await this.storage.listGroups(filter, startIndex, count);
    return {
      schemas: [SCIM_SCHEMAS.ListResponse],
      totalResults: result.totalCount,
      startIndex,
      itemsPerPage: result.rows.length,
      Resources: result.rows.map((r) => this.toGroupResource(r)),
    };
  }

  async replaceGroup(id: string, body: Record<string, unknown>): Promise<ScimGroupResource> {
    const existing = await this.storage.getGroup(id);
    if (!existing) throw new ScimError('Group not found', 404);

    const members = body.members as { value: string }[] | undefined;

    const updated = await this.storage.updateGroup(id, {
      external_id: (body.externalId as string) ?? existing.external_id,
      display_name: (body.displayName as string) ?? existing.display_name,
      members: members?.map((m) => m.value) ?? existing.members,
    });

    if (!updated) throw new ScimError('Group not found', 404);
    return this.toGroupResource(updated);
  }

  async patchGroup(id: string, patch: ScimPatchRequest): Promise<ScimGroupResource> {
    const existing = await this.storage.getGroup(id);
    if (!existing) throw new ScimError('Group not found', 404);

    for (const op of patch.Operations) {
      await this.applyGroupPatchOp(id, existing, op);
    }

    // Re-fetch after all ops
    const updated = await this.storage.getGroup(id);
    if (!updated) throw new ScimError('Group not found', 404);
    return this.toGroupResource(updated);
  }

  async deleteGroup(id: string): Promise<void> {
    const ok = await this.storage.deleteGroup(id);
    if (!ok) throw new ScimError('Group not found', 404);
  }

  // ── Resource conversion helpers ───────────────────────────────────

  private toUserResource(row: ScimUserRow): ScimUserResource {
    const resource: ScimUserResource = {
      schemas: [SCIM_SCHEMAS.User],
      id: row.id,
      userName: row.user_name,
      active: row.active,
      meta: {
        resourceType: 'User',
        created: new Date(row.created_at).toISOString(),
        lastModified: new Date(row.updated_at).toISOString(),
      },
    };

    if (row.external_id) resource.externalId = row.external_id;
    if (row.display_name) resource.displayName = row.display_name;
    if (row.email) {
      resource.emails = [{ value: row.email, primary: true }];
    }
    if (row.roles && row.roles.length > 0) {
      resource.roles = row.roles;
    }

    return resource;
  }

  private toGroupResource(row: ScimGroupRow): ScimGroupResource {
    const resource: ScimGroupResource = {
      schemas: [SCIM_SCHEMAS.Group],
      id: row.id,
      displayName: row.display_name,
      members: row.members.map((m) => ({ value: m })),
      meta: {
        resourceType: 'Group',
        created: new Date(row.created_at).toISOString(),
        lastModified: new Date(row.updated_at).toISOString(),
      },
    };

    if (row.external_id) resource.externalId = row.external_id;

    return resource;
  }

  // ── PATCH helpers ─────────────────────────────────────────────────

  private applyUserPatchOp(
    existing: ScimUserRow,
    updates: Partial<ScimUserRow>,
    op: ScimPatchOperation
  ): void {
    const { op: operation, path, value } = op;

    if (operation === 'replace' || operation === 'add') {
      if (!path) {
        // Value is an object of attributes to set
        const attrs = value as Record<string, unknown>;
        if (attrs.userName) updates.user_name = attrs.userName as string;
        if (attrs.displayName) updates.display_name = attrs.displayName as string;
        if (attrs.active !== undefined) updates.active = attrs.active as boolean;
        if (attrs.externalId) updates.external_id = attrs.externalId as string;
        if (attrs.emails) {
          const emails = attrs.emails as { value: string }[];
          updates.email = emails[0]?.value ?? existing.email;
        }
        return;
      }

      switch (path) {
        case 'userName':
          updates.user_name = value as string;
          break;
        case 'displayName':
          updates.display_name = value as string;
          break;
        case 'active':
          updates.active = value as boolean;
          break;
        case 'externalId':
          updates.external_id = value as string;
          break;
        case 'emails':
          {
            const emails = value as { value: string }[];
            updates.email = emails[0]?.value ?? existing.email;
          }
          break;
      }
    } else if (operation === 'remove') {
      switch (path) {
        case 'displayName':
          updates.display_name = null;
          break;
        case 'externalId':
          updates.external_id = null;
          break;
        case 'emails':
          updates.email = null;
          break;
      }
    }
  }

  private async applyGroupPatchOp(
    groupId: string,
    _existing: ScimGroupRow,
    op: ScimPatchOperation
  ): Promise<void> {
    const { op: operation, path, value } = op;

    if (path === 'members' || !path) {
      if (operation === 'add') {
        const members = Array.isArray(value) ? value : [value];
        for (const member of members) {
          const memberId = (member as { value: string }).value;
          if (memberId) await this.storage.addGroupMember(groupId, memberId);
        }
      } else if (operation === 'remove') {
        const members = Array.isArray(value) ? value : [value];
        for (const member of members) {
          const memberId = (member as { value: string }).value;
          if (memberId) await this.storage.removeGroupMember(groupId, memberId);
        }
      } else if (operation === 'replace') {
        if (path === 'displayName') {
          await this.storage.updateGroup(groupId, { display_name: value as string });
        } else if (path === 'members' || !path) {
          const members = Array.isArray(value) ? value : [];
          await this.storage.updateGroup(groupId, {
            members: members.map((m: { value: string }) => m.value),
          });
        }
      }
    } else if (path === 'displayName') {
      if (operation === 'replace' || operation === 'add') {
        await this.storage.updateGroup(groupId, { display_name: value as string });
      }
    } else if (path === 'externalId') {
      if (operation === 'replace' || operation === 'add') {
        await this.storage.updateGroup(groupId, { external_id: value as string });
      } else if (operation === 'remove') {
        await this.storage.updateGroup(groupId, { external_id: null });
      }
    }
  }
}

// ── Error class ─────────────────────────────────────────────────────

export class ScimError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'ScimError';
  }
}
