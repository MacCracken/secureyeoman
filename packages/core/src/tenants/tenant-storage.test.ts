import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb } from '../test-setup.js';
import { TenantStorage } from './tenant-storage.js';

describe('TenantStorage', () => {
  let storage: TenantStorage;

  beforeAll(async () => {
    await setupTestDb();
    storage = new TenantStorage();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('creates a tenant record', async () => {
    const rec = await storage.create({
      id: 'tenant-001',
      name: 'Acme Corp',
      slug: 'acme',
      plan: 'pro',
    });
    expect(rec.id).toBe('tenant-001');
    expect(rec.slug).toBe('acme');
    expect(rec.plan).toBe('pro');
  });

  it('handles ON CONFLICT for default tenant', async () => {
    // default tenant should already exist from migration
    const existing = await storage.getById('default');
    expect(existing?.id).toBe('default');
  });

  it('lists tenants', async () => {
    const result = await storage.list(10, 0);
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.records.length).toBeGreaterThanOrEqual(1);
  });

  it('gets tenant by slug', async () => {
    const rec = await storage.getBySlug('default');
    expect(rec?.id).toBe('default');
  });

  it('returns null for missing slug', async () => {
    const rec = await storage.getBySlug('nonexistent-slug-xyz');
    expect(rec).toBeNull();
  });

  it('updates a tenant', async () => {
    await storage.create({ id: 'tenant-upd', name: 'Old Name', slug: 'upd-slug' });
    const updated = await storage.update('tenant-upd', { name: 'New Name', plan: 'enterprise' });
    expect(updated?.name).toBe('New Name');
    expect(updated?.plan).toBe('enterprise');
  });

  it('deletes a tenant', async () => {
    await storage.create({ id: 'tenant-del', name: 'Del', slug: 'del-slug' });
    const deleted = await storage.delete('tenant-del');
    expect(deleted).toBe(true);
    const rec = await storage.getById('tenant-del');
    expect(rec).toBeNull();
  });
});
