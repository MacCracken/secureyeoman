import { describe, it, expect, vi } from 'vitest';
import { WorkspaceManager } from './manager.js';

const makeLogger = () => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn().mockReturnThis(),
  level: 'info',
});

const WORKSPACE = {
  id: 'ws-1',
  name: 'My Workspace',
  description: 'Test',
  createdAt: 1000,
  updatedAt: 1000,
};
const MEMBER = { workspaceId: 'ws-1', userId: 'user-1', role: 'member', joinedAt: 1000 };

function makeStorage(overrides: any = {}) {
  return {
    create: vi.fn().mockResolvedValue(WORKSPACE),
    get: vi.fn().mockResolvedValue(WORKSPACE),
    list: vi.fn().mockResolvedValue({ workspaces: [WORKSPACE], total: 1 }),
    delete: vi.fn().mockResolvedValue(true),
    update: vi.fn().mockResolvedValue(WORKSPACE),
    addMember: vi.fn().mockResolvedValue(MEMBER),
    removeMember: vi.fn().mockResolvedValue(true),
    updateMemberRole: vi.fn().mockResolvedValue({ ...MEMBER, role: 'admin' }),
    listMembers: vi.fn().mockResolvedValue({ members: [MEMBER], total: 1 }),
    getMember: vi.fn().mockResolvedValue(MEMBER),
    ...overrides,
  };
}

function makeManager(storageOverrides: any = {}) {
  const storage = makeStorage(storageOverrides);
  const logger = makeLogger();
  const manager = new WorkspaceManager(storage as any, { logger: logger as any });
  return { manager, storage, logger };
}

describe('WorkspaceManager', () => {
  describe('create', () => {
    it('creates workspace and logs', async () => {
      const { manager, logger } = makeManager();
      const ws = await manager.create({ name: 'New WS', description: '', settings: {} });
      expect(ws.id).toBe('ws-1');
      expect(logger.info).toHaveBeenCalledWith('Workspace created', { id: 'ws-1' });
    });
  });

  describe('get', () => {
    it('returns workspace', async () => {
      const { manager } = makeManager();
      const ws = await manager.get('ws-1');
      expect(ws?.id).toBe('ws-1');
    });

    it('returns null when not found', async () => {
      const { manager } = makeManager({ get: vi.fn().mockResolvedValue(null) });
      expect(await manager.get('missing')).toBeNull();
    });
  });

  describe('list', () => {
    it('returns workspaces with total', async () => {
      const { manager } = makeManager();
      const result = await manager.list();
      expect(result.workspaces).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('delete', () => {
    it('deletes and logs', async () => {
      const { manager, logger } = makeManager();
      const ok = await manager.delete('ws-1');
      expect(ok).toBe(true);
      expect(logger.info).toHaveBeenCalledWith('Workspace deleted', { id: 'ws-1' });
    });

    it('returns false without logging when not found', async () => {
      const { manager, logger } = makeManager({ delete: vi.fn().mockResolvedValue(false) });
      const ok = await manager.delete('missing');
      expect(ok).toBe(false);
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates workspace and logs', async () => {
      const { manager, logger } = makeManager();
      const ws = await manager.update('ws-1', { name: 'Updated' });
      expect(ws?.id).toBe('ws-1');
      expect(logger.info).toHaveBeenCalledWith('Workspace updated', { id: 'ws-1' });
    });

    it('does not log when workspace not found', async () => {
      const { manager, logger } = makeManager({ update: vi.fn().mockResolvedValue(null) });
      await manager.update('missing', { name: 'X' });
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('addMember', () => {
    it('adds member and logs', async () => {
      const { manager, logger } = makeManager();
      const member = await manager.addMember('ws-1', 'user-1', 'member');
      expect(member.role).toBe('member');
      expect(logger.info).toHaveBeenCalledWith('Member added to workspace', {
        workspaceId: 'ws-1',
        userId: 'user-1',
      });
    });
  });

  describe('removeMember', () => {
    it('removes member and logs', async () => {
      const { manager, logger } = makeManager();
      const ok = await manager.removeMember('ws-1', 'user-1');
      expect(ok).toBe(true);
      expect(logger.info).toHaveBeenCalledWith('Member removed from workspace', {
        workspaceId: 'ws-1',
        userId: 'user-1',
      });
    });
  });

  describe('updateMemberRole', () => {
    it('updates member role and logs', async () => {
      const { manager, logger } = makeManager();
      const member = await manager.updateMemberRole('ws-1', 'user-1', 'admin');
      expect(member?.role).toBe('admin');
      expect(logger.info).toHaveBeenCalledWith('Member role updated', {
        workspaceId: 'ws-1',
        userId: 'user-1',
        role: 'admin',
      });
    });
  });

  describe('listMembers', () => {
    it('returns members list', async () => {
      const { manager } = makeManager();
      const result = await manager.listMembers('ws-1');
      expect(result.members).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('getMember', () => {
    it('returns a specific member', async () => {
      const { manager } = makeManager();
      const member = await manager.getMember('ws-1', 'user-1');
      expect(member?.userId).toBe('user-1');
    });
  });

  describe('ensureDefaultWorkspace', () => {
    it('does nothing when workspaces exist', async () => {
      const { manager, storage } = makeManager({
        list: vi.fn().mockResolvedValue({ workspaces: [WORKSPACE], total: 1 }),
      });
      await manager.ensureDefaultWorkspace();
      expect(storage.create).not.toHaveBeenCalled();
    });

    it('creates default workspace when none exist', async () => {
      const { manager, storage, logger } = makeManager({
        list: vi.fn().mockResolvedValue({ workspaces: [], total: 0 }),
      });
      await manager.ensureDefaultWorkspace();
      expect(storage.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Default' }));
      expect(storage.addMember).toHaveBeenCalledWith('ws-1', 'admin', 'owner');
      expect(logger.info).toHaveBeenCalledWith('Default workspace created', { id: 'ws-1' });
    });
  });
});
