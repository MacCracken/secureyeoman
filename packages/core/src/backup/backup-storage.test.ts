import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb } from '../test-setup.js';
import { BackupStorage } from './backup-storage.js';

describe('BackupStorage', () => {
  let storage: BackupStorage;

  beforeAll(async () => {
    await setupTestDb();
    storage = new BackupStorage();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    // Clean up backups table
    try {
      const { getPool } = await import('../storage/pg-pool.js');
      await getPool().query('DELETE FROM admin.backups');
    } catch {
      // table may not exist in test DB — skip
    }
  });

  it('creates a backup record', async () => {
    const record = await storage.create({
      id: 'test-id-001',
      label: 'test backup',
      status: 'running',
      createdBy: 'admin',
      createdAt: Date.now(),
    });
    expect(record.id).toBe('test-id-001');
    expect(record.status).toBe('running');
    expect(record.label).toBe('test backup');
  });

  it('updates a backup record', async () => {
    await storage.create({ id: 'test-id-002', label: '', status: 'running', createdBy: null, createdAt: 1000 });
    const updated = await storage.update('test-id-002', { status: 'completed', sizeBytes: 12345, completedAt: 2000 });
    expect(updated?.status).toBe('completed');
    expect(updated?.sizeBytes).toBe(12345);
    expect(updated?.completedAt).toBe(2000);
  });

  it('lists backup records with pagination', async () => {
    await storage.create({ id: 'list-001', label: 'a', status: 'completed', createdBy: null, createdAt: 1000 });
    await storage.create({ id: 'list-002', label: 'b', status: 'failed', createdBy: null, createdAt: 2000 });
    const result = await storage.list(10, 0);
    expect(result.total).toBeGreaterThanOrEqual(2);
    expect(result.records.length).toBeGreaterThanOrEqual(2);
  });

  it('gets a backup by id', async () => {
    await storage.create({ id: 'get-001', label: 'x', status: 'completed', createdBy: 'u', createdAt: 3000 });
    const rec = await storage.getById('get-001');
    expect(rec?.id).toBe('get-001');
    expect(rec?.createdBy).toBe('u');
  });

  it('returns null for missing id', async () => {
    const rec = await storage.getById('nonexistent');
    expect(rec).toBeNull();
  });

  it('deletes a backup record', async () => {
    await storage.create({ id: 'del-001', label: '', status: 'completed', createdBy: null, createdAt: 4000 });
    const deleted = await storage.delete('del-001');
    expect(deleted).toBe(true);
    const rec = await storage.getById('del-001');
    expect(rec).toBeNull();
  });
});
