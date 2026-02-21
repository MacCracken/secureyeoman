import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceStorage } from './storage.js';

// ─── Mock pg-pool ─────────────────────────────────────────────

let mockQuery: ReturnType<typeof vi.fn>;

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: (...args: any[]) => mockQuery(...args) }),
}));

// ─── Test Data ────────────────────────────────────────────────

const workspaceRow = {
  id: 'ws-1',
  name: 'My Workspace',
  description: 'A workspace',
  settings: { theme: 'dark' },
  created_at: 1000,
  updated_at: 2000,
};

const memberRow = {
  user_id: 'user-1',
  role: 'admin',
  joined_at: 1500,
};

// ─── Tests ────────────────────────────────────────────────────

describe('WorkspaceStorage', () => {
  let storage: WorkspaceStorage;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    storage = new WorkspaceStorage();
  });

  describe('create', () => {
    it('inserts and returns workspace object', async () => {
      const result = await storage.create({ name: 'My Workspace' });

      expect(result.id).toBeDefined();
      expect(result.name).toBe('My Workspace');
      expect(result.description).toBe('');
      expect(result.members).toEqual([]);
      expect(result.settings).toEqual({});
      expect(typeof result.createdAt).toBe('number');
    });

    it('uses provided optional fields', async () => {
      const result = await storage.create({
        name: 'Team WS',
        description: 'Our team workspace',
        settings: { theme: 'dark' },
      });

      expect(result.description).toBe('Our team workspace');
      expect(result.settings).toEqual({ theme: 'dark' });
    });

    it('passes correct params to INSERT', async () => {
      await storage.create({ name: 'Test' });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[1]).toBe('Test');
      expect(params[2]).toBe('');
    });
  });

  describe('get', () => {
    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.get('nonexistent');
      expect(result).toBeNull();
    });

    it('returns workspace with members when found', async () => {
      // get workspace row, then getMembers
      mockQuery
        .mockResolvedValueOnce({ rows: [workspaceRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [memberRow], rowCount: 1 });

      const result = await storage.get('ws-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('ws-1');
      expect(result!.name).toBe('My Workspace');
      expect(result!.members).toHaveLength(1);
      expect(result!.members[0].userId).toBe('user-1');
      expect(result!.members[0].role).toBe('admin');
    });

    it('returns empty members array when none', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [workspaceRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await storage.get('ws-1');
      expect(result!.members).toEqual([]);
    });
  });

  describe('list', () => {
    it('returns workspaces with members and total', async () => {
      // COUNT, SELECT rows, getMembers for each
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [workspaceRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [memberRow], rowCount: 1 }); // members for ws-1

      const result = await storage.list();
      expect(result.total).toBe(2);
      expect(result.workspaces).toHaveLength(1);
      expect(result.workspaces[0].members).toHaveLength(1);
    });

    it('uses default limit and offset', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await storage.list();
      const params = mockQuery.mock.calls[1][1] as unknown[];
      expect(params[0]).toBe(50);
      expect(params[1]).toBe(0);
    });

    it('uses custom limit and offset', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await storage.list({ limit: 5, offset: 10 });
      const params = mockQuery.mock.calls[1][1] as unknown[];
      expect(params[0]).toBe(5);
      expect(params[1]).toBe(10);
    });
  });

  describe('update', () => {
    it('returns existing workspace when no fields provided', async () => {
      // update calls get() twice: once inside update (no-op path), once returned
      mockQuery
        .mockResolvedValueOnce({ rows: [workspaceRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // getMembers

      const result = await storage.update('ws-1', {});
      expect(result).not.toBeNull();
      expect(result!.id).toBe('ws-1');
      expect(mockQuery).toHaveBeenCalledTimes(2); // get + getMembers, no UPDATE
    });

    it('updates name', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // execute UPDATE
        .mockResolvedValueOnce({ rows: [workspaceRow], rowCount: 1 }) // get after update
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // getMembers

      const result = await storage.update('ws-1', { name: 'New Name' });
      const updateSql = mockQuery.mock.calls[0][0] as string;
      expect(updateSql).toContain('name =');
      expect(result!.id).toBe('ws-1');
    });

    it('updates multiple fields', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [workspaceRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await storage.update('ws-1', {
        name: 'New',
        description: 'Updated',
        settings: { theme: 'light' },
      });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('name =');
      expect(sql).toContain('description =');
      expect(sql).toContain('settings =');
    });
  });

  describe('delete', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await storage.delete('ws-1');
      expect(result).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.delete('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('addMember', () => {
    it('upserts member and returns member object', async () => {
      const result = await storage.addMember('ws-1', 'user-1', 'admin');
      expect(result.userId).toBe('user-1');
      expect(result.role).toBe('admin');
      expect(typeof result.joinedAt).toBe('number');

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO workspace.members');
      expect(sql).toContain('ON CONFLICT');
    });

    it('uses default role "member"', async () => {
      const result = await storage.addMember('ws-1', 'user-2');
      expect(result.role).toBe('member');
    });
  });

  describe('removeMember', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await storage.removeMember('ws-1', 'user-1');
      expect(result).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.removeMember('ws-1', 'nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('updateMemberRole', () => {
    it('returns null when member not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // execute returns 0
      const result = await storage.updateMemberRole('ws-1', 'nonexistent', 'viewer');
      expect(result).toBeNull();
    });

    it('returns updated member on success', async () => {
      // execute UPDATE, then getMember
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [memberRow], rowCount: 1 });

      const result = await storage.updateMemberRole('ws-1', 'user-1', 'viewer');
      expect(result).not.toBeNull();
      expect(result!.userId).toBe('user-1');
    });
  });

  describe('listMembers', () => {
    it('returns members and total', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [memberRow], rowCount: 1 });

      const result = await storage.listMembers('ws-1');
      expect(result.total).toBe(3);
      expect(result.members).toHaveLength(1);
      expect(result.members[0].userId).toBe('user-1');
      expect(result.members[0].joinedAt).toBe(1500);
    });

    it('uses default limit and offset', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await storage.listMembers('ws-1');
      const params = mockQuery.mock.calls[1][1] as unknown[];
      expect(params[1]).toBe(50);
      expect(params[2]).toBe(0);
    });
  });

  describe('getMember', () => {
    it('returns member when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [memberRow], rowCount: 1 });
      const result = await storage.getMember('ws-1', 'user-1');
      expect(result).not.toBeNull();
      expect(result!.userId).toBe('user-1');
      expect(result!.role).toBe('admin');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getMember('ws-1', 'nonexistent');
      expect(result).toBeNull();
    });
  });
});
