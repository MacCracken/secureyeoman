import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { DashboardStorage } from './storage.js';
import { DashboardManager } from './manager.js';
import { createNoopLogger } from '../logging/logger.js';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../test-setup.js';

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('DashboardStorage', () => {
  let storage: DashboardStorage;

  beforeEach(async () => {
    await truncateAllTables();
    storage = new DashboardStorage();
  });

  it('should create and retrieve a dashboard', async () => {
    const d = await storage.create({ name: 'My Dashboard' });
    expect(d.id).toBeTruthy();
    expect((await storage.get(d.id))!.name).toBe('My Dashboard');
  });

  it('should list dashboards', async () => {
    await storage.create({ name: 'D1' });
    await storage.create({ name: 'D2' });
    expect(await storage.list()).toHaveLength(2);
  });

  it('should update a dashboard', async () => {
    const d = await storage.create({ name: 'Original' });
    const updated = await storage.update(d.id, { name: 'Updated' });
    expect(updated!.name).toBe('Updated');
  });

  it('should delete a dashboard', async () => {
    const d = await storage.create({ name: 'ToDelete' });
    expect(await storage.delete(d.id)).toBe(true);
    expect(await storage.get(d.id)).toBeNull();
  });
});

describe('DashboardManager', () => {
  let storage: DashboardStorage;
  let manager: DashboardManager;

  beforeEach(async () => {
    await truncateAllTables();
    storage = new DashboardStorage();
    manager = new DashboardManager(storage, { logger: createNoopLogger() });
  });

  it('should CRUD dashboards', async () => {
    const d = await manager.create({ name: 'Test' });
    expect(await manager.get(d.id)).toBeTruthy();
    expect(await manager.list()).toHaveLength(1);
    expect((await manager.update(d.id, { name: 'New' }))!.name).toBe('New');
    expect(await manager.delete(d.id)).toBe(true);
    expect(await manager.list()).toHaveLength(0);
  });
});
