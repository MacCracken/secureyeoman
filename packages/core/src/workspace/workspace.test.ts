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
    expect(await storage.list()).toHaveLength(2);
    const list = await storage.list();
    const ws = list[0];
    expect(await storage.delete(ws.id)).toBe(true);
    expect(await storage.list()).toHaveLength(1);
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
    expect(await manager.list()).toHaveLength(1);
    await manager.addMember(ws.id, 'u1');
    expect((await manager.get(ws.id))!.members).toHaveLength(1);
    expect(await manager.delete(ws.id)).toBe(true);
  });
});
