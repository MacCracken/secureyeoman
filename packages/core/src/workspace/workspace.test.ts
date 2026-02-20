import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { WorkspaceStorage } from './storage.js';
import { WorkspaceManager } from './manager.js';
import { createNoopLogger } from '../logging/logger.js';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../test-setup.js';

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('WorkspaceStorage', () => {
  let storage: WorkspaceStorage;

  beforeEach(async () => {
    await truncateAllTables();
    storage = new WorkspaceStorage();
  });

  it('should create and retrieve workspace', async () => {
    const ws = await storage.create({ name: 'Team A' });
    expect(ws.id).toBeTruthy();
    expect((await storage.get(ws.id))!.name).toBe('Team A');
  });

  it('should manage members', async () => {
    const ws = await storage.create({ name: 'Team B' });
    await storage.addMember(ws.id, 'user1', 'admin');
    const retrieved = (await storage.get(ws.id))!;
    expect(retrieved.members).toHaveLength(1);
    expect(retrieved.members[0].userId).toBe('user1');
    expect(await storage.removeMember(ws.id, 'user1')).toBe(true);
    expect((await storage.get(ws.id))!.members).toHaveLength(0);
  });

  it('should list and delete workspaces', async () => {
    await storage.create({ name: 'W1' });
    await storage.create({ name: 'W2' });
    expect((await storage.list()).workspaces).toHaveLength(2);
    const list = await storage.list();
    const ws = list.workspaces[0];
    expect(await storage.delete(ws.id)).toBe(true);
    expect((await storage.list()).workspaces).toHaveLength(1);
  });

  it('removeMember returns false when member does not exist', async () => {
    const ws = await storage.create({ name: 'Empty WS' });
    expect(await storage.removeMember(ws.id, 'nonexistent')).toBe(false);
  });

  it('addMember upserts on duplicate (workspace_id, user_id)', async () => {
    const ws = await storage.create({ name: 'Upsert WS' });
    await storage.addMember(ws.id, 'u1', 'member');
    await storage.addMember(ws.id, 'u1', 'admin');
    const { members } = await storage.listMembers(ws.id);
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe('admin');
  });

  it('updateMemberRole returns null when member does not exist', async () => {
    const ws = await storage.create({ name: 'WS' });
    const result = await storage.updateMemberRole(ws.id, 'ghost', 'viewer');
    expect(result).toBeNull();
  });

  it('updateMemberRole returns the actual joinedAt, not the current timestamp', async () => {
    const ws = await storage.create({ name: 'JoinedAt WS' });
    const added = await storage.addMember(ws.id, 'u1', 'member');
    const originalJoinedAt = added.joinedAt;

    // Wait a tick to ensure Date.now() would differ
    await new Promise((r) => setTimeout(r, 5));

    const updated = await storage.updateMemberRole(ws.id, 'u1', 'admin');
    expect(updated).not.toBeNull();
    expect(updated!.joinedAt).toBe(originalJoinedAt);
    expect(updated!.role).toBe('admin');
  });

  it('getMember returns null for unknown member', async () => {
    const ws = await storage.create({ name: 'WS' });
    expect(await storage.getMember(ws.id, 'nobody')).toBeNull();
  });

  it('listMembers supports pagination', async () => {
    const ws = await storage.create({ name: 'Paginated WS' });
    await storage.addMember(ws.id, 'u1', 'member');
    await storage.addMember(ws.id, 'u2', 'viewer');
    await storage.addMember(ws.id, 'u3', 'admin');

    const page1 = await storage.listMembers(ws.id, { limit: 2, offset: 0 });
    expect(page1.total).toBe(3);
    expect(page1.members).toHaveLength(2);

    const page2 = await storage.listMembers(ws.id, { limit: 2, offset: 2 });
    expect(page2.members).toHaveLength(1);
  });

  it('get returns null for unknown workspace', async () => {
    expect(await storage.get('does-not-exist')).toBeNull();
  });

  it('update returns workspace with new values', async () => {
    const ws = await storage.create({ name: 'Original' });
    const updated = await storage.update(ws.id, { name: 'Renamed', description: 'New desc' });
    expect(updated!.name).toBe('Renamed');
    expect(updated!.description).toBe('New desc');
  });

  it('update with no fields returns current workspace', async () => {
    const ws = await storage.create({ name: 'Same' });
    const result = await storage.update(ws.id, {});
    expect(result!.name).toBe('Same');
  });

  it('addMember defaults role to member', async () => {
    const ws = await storage.create({ name: 'Default Role WS' });
    const m = await storage.addMember(ws.id, 'u1');
    expect(m.role).toBe('member');
  });
});

describe('WorkspaceManager', () => {
  let storage: WorkspaceStorage;
  let manager: WorkspaceManager;

  beforeEach(async () => {
    await truncateAllTables();
    storage = new WorkspaceStorage();
    manager = new WorkspaceManager(storage, { logger: createNoopLogger() });
  });

  it('should CRUD workspaces', async () => {
    const ws = await manager.create({ name: 'Test WS' });
    expect(await manager.get(ws.id)).toBeTruthy();
    expect((await manager.list()).workspaces).toHaveLength(1);
    await manager.addMember(ws.id, 'u1');
    expect((await manager.get(ws.id))!.members).toHaveLength(1);
    expect(await manager.delete(ws.id)).toBe(true);
  });

  it('ensureDefaultWorkspace creates Default workspace on first boot', async () => {
    await manager.ensureDefaultWorkspace();
    const { workspaces, total } = await manager.list();
    expect(total).toBe(1);
    expect(workspaces[0].name).toBe('Default');
    expect(workspaces[0].members).toHaveLength(1);
    expect(workspaces[0].members[0].userId).toBe('admin');
    expect(workspaces[0].members[0].role).toBe('owner');
  });

  it('ensureDefaultWorkspace is idempotent when workspaces already exist', async () => {
    await manager.create({ name: 'Existing' });
    await manager.ensureDefaultWorkspace();
    expect((await manager.list()).total).toBe(1);
  });

  it('updateMemberRole returns null when member not found', async () => {
    const ws = await manager.create({ name: 'WS' });
    expect(await manager.updateMemberRole(ws.id, 'ghost', 'viewer')).toBeNull();
  });

  it('getMember returns null when member not found', async () => {
    const ws = await manager.create({ name: 'WS' });
    expect(await manager.getMember(ws.id, 'nobody')).toBeNull();
  });

  it('removeMember returns false when member not found', async () => {
    const ws = await manager.create({ name: 'WS' });
    expect(await manager.removeMember(ws.id, 'nobody')).toBe(false);
  });
});
