import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkspaceStorage } from './storage.js';
import { WorkspaceManager } from './manager.js';
import { createNoopLogger } from '../logging/logger.js';
import { existsSync, unlinkSync } from 'node:fs';

const TEST_DB = '/tmp/workspace-test.db';

describe('WorkspaceStorage', () => {
  let storage: WorkspaceStorage;
  beforeEach(() => { if (existsSync(TEST_DB)) unlinkSync(TEST_DB); storage = new WorkspaceStorage({ dbPath: TEST_DB }); });
  afterEach(() => { storage.close(); if (existsSync(TEST_DB)) unlinkSync(TEST_DB); });

  it('should create and retrieve workspace', () => {
    const ws = storage.create({ name: 'Team A' });
    expect(ws.id).toBeTruthy();
    expect(storage.get(ws.id)!.name).toBe('Team A');
  });

  it('should manage members', () => {
    const ws = storage.create({ name: 'Team B' });
    storage.addMember(ws.id, 'user1', 'admin');
    const retrieved = storage.get(ws.id)!;
    expect(retrieved.members).toHaveLength(1);
    expect(retrieved.members[0].userId).toBe('user1');
    expect(storage.removeMember(ws.id, 'user1')).toBe(true);
    expect(storage.get(ws.id)!.members).toHaveLength(0);
  });

  it('should list and delete workspaces', () => {
    storage.create({ name: 'W1' });
    storage.create({ name: 'W2' });
    expect(storage.list()).toHaveLength(2);
    const ws = storage.list()[0];
    expect(storage.delete(ws.id)).toBe(true);
    expect(storage.list()).toHaveLength(1);
  });
});

describe('WorkspaceManager', () => {
  let storage: WorkspaceStorage;
  let manager: WorkspaceManager;
  beforeEach(() => { if (existsSync(TEST_DB)) unlinkSync(TEST_DB); storage = new WorkspaceStorage({ dbPath: TEST_DB }); manager = new WorkspaceManager(storage, { logger: createNoopLogger() }); });
  afterEach(() => { storage.close(); if (existsSync(TEST_DB)) unlinkSync(TEST_DB); });

  it('should CRUD workspaces', () => {
    const ws = manager.create({ name: 'Test WS' });
    expect(manager.get(ws.id)).toBeTruthy();
    expect(manager.list()).toHaveLength(1);
    manager.addMember(ws.id, 'u1');
    expect(manager.get(ws.id)!.members).toHaveLength(1);
    expect(manager.delete(ws.id)).toBe(true);
  });
});
