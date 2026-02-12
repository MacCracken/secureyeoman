import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DashboardStorage } from './storage.js';
import { DashboardManager } from './manager.js';
import { createNoopLogger } from '../logging/logger.js';
import { existsSync, unlinkSync } from 'node:fs';

const TEST_DB = '/tmp/dashboard-test.db';

describe('DashboardStorage', () => {
  let storage: DashboardStorage;
  beforeEach(() => { if (existsSync(TEST_DB)) unlinkSync(TEST_DB); storage = new DashboardStorage({ dbPath: TEST_DB }); });
  afterEach(() => { storage.close(); if (existsSync(TEST_DB)) unlinkSync(TEST_DB); });

  it('should create and retrieve a dashboard', () => {
    const d = storage.create({ name: 'My Dashboard' });
    expect(d.id).toBeTruthy();
    expect(storage.get(d.id)!.name).toBe('My Dashboard');
  });

  it('should list dashboards', () => {
    storage.create({ name: 'D1' });
    storage.create({ name: 'D2' });
    expect(storage.list()).toHaveLength(2);
  });

  it('should update a dashboard', () => {
    const d = storage.create({ name: 'Original' });
    const updated = storage.update(d.id, { name: 'Updated' });
    expect(updated!.name).toBe('Updated');
  });

  it('should delete a dashboard', () => {
    const d = storage.create({ name: 'ToDelete' });
    expect(storage.delete(d.id)).toBe(true);
    expect(storage.get(d.id)).toBeNull();
  });
});

describe('DashboardManager', () => {
  let storage: DashboardStorage;
  let manager: DashboardManager;
  beforeEach(() => { if (existsSync(TEST_DB)) unlinkSync(TEST_DB); storage = new DashboardStorage({ dbPath: TEST_DB }); manager = new DashboardManager(storage, { logger: createNoopLogger() }); });
  afterEach(() => { storage.close(); if (existsSync(TEST_DB)) unlinkSync(TEST_DB); });

  it('should CRUD dashboards', () => {
    const d = manager.create({ name: 'Test' });
    expect(manager.get(d.id)).toBeTruthy();
    expect(manager.list()).toHaveLength(1);
    expect(manager.update(d.id, { name: 'New' })!.name).toBe('New');
    expect(manager.delete(d.id)).toBe(true);
    expect(manager.list()).toHaveLength(0);
  });
});
