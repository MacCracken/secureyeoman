/**
 * Unit tests for ScimManager — SCIM 2.0 provisioning logic.
 * Storage is fully mocked; no DB required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScimManager, ScimError, SCIM_SCHEMAS } from './scim.js';
import type { ScimStorage, ScimUserRow, ScimGroupRow } from './scim-storage.js';

// ── Mock helpers ────────────────────────────────────────────────────

vi.mock('../utils/crypto.js', () => ({
  uuidv7: vi.fn(() => 'test-uuid-001'),
}));

function _makeRow<T>(overrides: Partial<T>): T {
  return overrides as T;
}

function makeMockStorage(): ScimStorage {
  return {
    createUser: vi.fn(),
    getUser: vi.fn(),
    getUserByUsername: vi.fn(),
    listUsers: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
    createGroup: vi.fn(),
    getGroup: vi.fn(),
    getGroupByDisplayName: vi.fn(),
    listGroups: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
    addGroupMember: vi.fn(),
    removeGroupMember: vi.fn(),
  } as unknown as ScimStorage;
}

const SAMPLE_USER_ROW: ScimUserRow = {
  id: 'u-001',
  external_id: 'ext-001',
  user_name: 'jdoe',
  display_name: 'John Doe',
  email: 'jdoe@example.com',
  active: true,
  roles: ['admin'],
  metadata: {},
  created_at: 1700000000000,
  updated_at: 1700000000000,
};

const SAMPLE_GROUP_ROW: ScimGroupRow = {
  id: 'g-001',
  external_id: 'ext-g-001',
  display_name: 'Engineers',
  members: ['u-001', 'u-002'],
  metadata: {},
  created_at: 1700000000000,
  updated_at: 1700000000000,
};

// ── Tests ───────────────────────────────────────────────────────────

describe('ScimManager', () => {
  let storage: ReturnType<typeof makeMockStorage>;
  let manager: ScimManager;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = makeMockStorage();
    manager = new ScimManager(storage);
  });

  // ── User CRUD ─────────────────────────────────────────────────────

  describe('createUser', () => {
    it('creates a user and returns SCIM resource', async () => {
      (storage.getUserByUsername as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (storage.createUser as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_USER_ROW);

      const result = await manager.createUser({
        userName: 'jdoe',
        displayName: 'John Doe',
        emails: [{ value: 'jdoe@example.com', primary: true }],
      });

      expect(result.schemas).toEqual([SCIM_SCHEMAS.User]);
      expect(result.userName).toBe('jdoe');
      expect(result.displayName).toBe('John Doe');
      expect(result.emails).toEqual([{ value: 'jdoe@example.com', primary: true }]);
      expect(result.active).toBe(true);
      expect(result.meta.resourceType).toBe('User');
      expect(storage.createUser).toHaveBeenCalledOnce();
    });

    it('throws 400 if userName is missing', async () => {
      await expect(manager.createUser({})).rejects.toThrow(ScimError);
      await expect(manager.createUser({})).rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws 409 if user already exists', async () => {
      (storage.getUserByUsername as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_USER_ROW);

      await expect(manager.createUser({ userName: 'jdoe' })).rejects.toThrow(ScimError);
      await expect(manager.createUser({ userName: 'jdoe' })).rejects.toMatchObject({
        statusCode: 409,
      });
    });
  });

  describe('getUser', () => {
    it('returns SCIM user resource', async () => {
      (storage.getUser as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_USER_ROW);

      const result = await manager.getUser('u-001');

      expect(result.id).toBe('u-001');
      expect(result.schemas).toEqual([SCIM_SCHEMAS.User]);
    });

    it('throws 404 when user not found', async () => {
      (storage.getUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(manager.getUser('nonexistent')).rejects.toThrow(ScimError);
      await expect(manager.getUser('nonexistent')).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('listUsers', () => {
    it('returns SCIM list response format', async () => {
      (storage.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [SAMPLE_USER_ROW],
        totalCount: 1,
      });

      const result = await manager.listUsers(undefined, 1, 100);

      expect(result.schemas).toEqual([SCIM_SCHEMAS.ListResponse]);
      expect(result.totalResults).toBe(1);
      expect(result.startIndex).toBe(1);
      expect(result.itemsPerPage).toBe(1);
      expect(result.Resources).toHaveLength(1);
      expect(result.Resources[0].userName).toBe('jdoe');
    });

    it('passes filter through to storage', async () => {
      (storage.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
        totalCount: 0,
      });

      await manager.listUsers('userName eq "jdoe"', 1, 50);

      expect(storage.listUsers).toHaveBeenCalledWith('userName eq "jdoe"', 1, 50);
    });
  });

  describe('replaceUser', () => {
    it('replaces user attributes', async () => {
      (storage.getUser as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_USER_ROW);
      const updatedRow = { ...SAMPLE_USER_ROW, display_name: 'Jane Doe' };
      (storage.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(updatedRow);

      const result = await manager.replaceUser('u-001', {
        userName: 'jdoe',
        displayName: 'Jane Doe',
      });

      expect(result.displayName).toBe('Jane Doe');
      expect(storage.updateUser).toHaveBeenCalledOnce();
    });

    it('throws 404 for nonexistent user', async () => {
      (storage.getUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(manager.replaceUser('nonexistent', { userName: 'jdoe' })).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('patchUser', () => {
    it('applies replace operation on a specific path', async () => {
      (storage.getUser as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_USER_ROW);
      const updatedRow = { ...SAMPLE_USER_ROW, active: false };
      (storage.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(updatedRow);

      const result = await manager.patchUser('u-001', {
        schemas: [SCIM_SCHEMAS.PatchOp],
        Operations: [{ op: 'replace', path: 'active', value: false }],
      });

      expect(result.active).toBe(false);
      expect(storage.updateUser).toHaveBeenCalledWith(
        'u-001',
        expect.objectContaining({ active: false })
      );
    });

    it('applies replace operation without path (object value)', async () => {
      (storage.getUser as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_USER_ROW);
      const updatedRow = { ...SAMPLE_USER_ROW, display_name: 'Updated Name' };
      (storage.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(updatedRow);

      const result = await manager.patchUser('u-001', {
        schemas: [SCIM_SCHEMAS.PatchOp],
        Operations: [{ op: 'replace', value: { displayName: 'Updated Name' } }],
      });

      expect(result.displayName).toBe('Updated Name');
    });

    it('applies remove operation', async () => {
      (storage.getUser as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_USER_ROW);
      const updatedRow = { ...SAMPLE_USER_ROW, display_name: null };
      (storage.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(updatedRow);

      await manager.patchUser('u-001', {
        schemas: [SCIM_SCHEMAS.PatchOp],
        Operations: [{ op: 'remove', path: 'displayName' }],
      });

      expect(storage.updateUser).toHaveBeenCalledWith(
        'u-001',
        expect.objectContaining({ display_name: null })
      );
    });

    it('returns existing user when no ops produce changes', async () => {
      (storage.getUser as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_USER_ROW);

      const result = await manager.patchUser('u-001', {
        schemas: [SCIM_SCHEMAS.PatchOp],
        Operations: [],
      });

      expect(result.id).toBe('u-001');
      expect(storage.updateUser).not.toHaveBeenCalled();
    });
  });

  describe('deleteUser', () => {
    it('soft-deletes user (sets active=false)', async () => {
      (storage.deleteUser as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      await expect(manager.deleteUser('u-001')).resolves.toBeUndefined();
      expect(storage.deleteUser).toHaveBeenCalledWith('u-001');
    });

    it('throws 404 for nonexistent user', async () => {
      (storage.deleteUser as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      await expect(manager.deleteUser('nonexistent')).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  // ── Group CRUD ────────────────────────────────────────────────────

  describe('createGroup', () => {
    it('creates a group and returns SCIM resource', async () => {
      (storage.getGroupByDisplayName as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (storage.createGroup as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_GROUP_ROW);

      const result = await manager.createGroup({
        displayName: 'Engineers',
        members: [{ value: 'u-001' }, { value: 'u-002' }],
      });

      expect(result.schemas).toEqual([SCIM_SCHEMAS.Group]);
      expect(result.displayName).toBe('Engineers');
      expect(result.members).toHaveLength(2);
      expect(result.meta.resourceType).toBe('Group');
    });

    it('throws 400 if displayName is missing', async () => {
      await expect(manager.createGroup({})).rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws 409 if group already exists', async () => {
      (storage.getGroupByDisplayName as ReturnType<typeof vi.fn>).mockResolvedValue(
        SAMPLE_GROUP_ROW
      );

      await expect(manager.createGroup({ displayName: 'Engineers' })).rejects.toMatchObject({
        statusCode: 409,
      });
    });
  });

  describe('getGroup', () => {
    it('returns SCIM group resource', async () => {
      (storage.getGroup as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_GROUP_ROW);

      const result = await manager.getGroup('g-001');

      expect(result.id).toBe('g-001');
      expect(result.schemas).toEqual([SCIM_SCHEMAS.Group]);
      expect(result.externalId).toBe('ext-g-001');
    });

    it('throws 404 when group not found', async () => {
      (storage.getGroup as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(manager.getGroup('nonexistent')).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('listGroups', () => {
    it('returns SCIM list response format', async () => {
      (storage.listGroups as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [SAMPLE_GROUP_ROW],
        totalCount: 1,
      });

      const result = await manager.listGroups(undefined, 1, 100);

      expect(result.schemas).toEqual([SCIM_SCHEMAS.ListResponse]);
      expect(result.totalResults).toBe(1);
      expect(result.Resources).toHaveLength(1);
      expect(result.Resources[0].displayName).toBe('Engineers');
    });
  });

  describe('patchGroup', () => {
    it('adds members via patch', async () => {
      (storage.getGroup as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_GROUP_ROW);
      (storage.addGroupMember as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      await manager.patchGroup('g-001', {
        schemas: [SCIM_SCHEMAS.PatchOp],
        Operations: [{ op: 'add', path: 'members', value: [{ value: 'u-003' }] }],
      });

      expect(storage.addGroupMember).toHaveBeenCalledWith('g-001', 'u-003');
    });

    it('removes members via patch', async () => {
      (storage.getGroup as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_GROUP_ROW);
      (storage.removeGroupMember as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      await manager.patchGroup('g-001', {
        schemas: [SCIM_SCHEMAS.PatchOp],
        Operations: [{ op: 'remove', path: 'members', value: [{ value: 'u-001' }] }],
      });

      expect(storage.removeGroupMember).toHaveBeenCalledWith('g-001', 'u-001');
    });

    it('replaces displayName via patch', async () => {
      (storage.getGroup as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_GROUP_ROW);
      (storage.updateGroup as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...SAMPLE_GROUP_ROW,
        display_name: 'Designers',
      });

      await manager.patchGroup('g-001', {
        schemas: [SCIM_SCHEMAS.PatchOp],
        Operations: [{ op: 'replace', path: 'displayName', value: 'Designers' }],
      });

      expect(storage.updateGroup).toHaveBeenCalledWith('g-001', { display_name: 'Designers' });
    });
  });

  describe('deleteGroup', () => {
    it('hard-deletes group', async () => {
      (storage.deleteGroup as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      await expect(manager.deleteGroup('g-001')).resolves.toBeUndefined();
      expect(storage.deleteGroup).toHaveBeenCalledWith('g-001');
    });

    it('throws 404 for nonexistent group', async () => {
      (storage.deleteGroup as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      await expect(manager.deleteGroup('nonexistent')).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  // ── Static helpers ────────────────────────────────────────────────

  describe('scimError', () => {
    it('returns properly formatted SCIM error', () => {
      const err = ScimManager.scimError('Not Found', 404);

      expect(err.schemas).toEqual([SCIM_SCHEMAS.Error]);
      expect(err.detail).toBe('Not Found');
      expect(err.status).toBe(404);
    });
  });
});
