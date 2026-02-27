import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TenantManager } from './tenant-manager.js';
import type { TenantRecord } from './tenant-storage.js';

function makeStorage() {
  const records = new Map<string, TenantRecord>();
  const slugs = new Map<string, TenantRecord>();

  const defaultRecord: TenantRecord = {
    id: 'default', name: 'Default', slug: 'default', plan: 'enterprise',
    metadata: {}, createdAt: 0, updatedAt: 0,
  };
  records.set('default', defaultRecord);
  slugs.set('default', defaultRecord);

  return {
    create: vi.fn(async (data: any) => {
      const rec = { ...data, metadata: {}, createdAt: Date.now(), updatedAt: Date.now() };
      records.set(data.id, rec);
      slugs.set(data.slug, rec);
      return rec;
    }),
    list: vi.fn(async () => ({ records: Array.from(records.values()), total: records.size })),
    getById: vi.fn(async (id: string) => records.get(id) ?? null),
    getBySlug: vi.fn(async (slug: string) => slugs.get(slug) ?? null),
    update: vi.fn(async (id: string, patch: any) => {
      const rec = records.get(id);
      if (!rec) return null;
      Object.assign(rec, patch, { updatedAt: Date.now() });
      return rec;
    }),
    delete: vi.fn(async (id: string) => {
      const rec = records.get(id);
      if (!rec) return false;
      records.delete(id);
      slugs.delete(rec.slug);
      return true;
    }),
  };
}

describe('TenantManager', () => {
  let storage: ReturnType<typeof makeStorage>;
  let manager: TenantManager;

  beforeEach(() => {
    storage = makeStorage();
    manager = new TenantManager(storage as any);
  });

  it('creates a valid tenant', async () => {
    const rec = await manager.create({ name: 'Acme', slug: 'acme' });
    expect(rec.name).toBe('Acme');
    expect(rec.slug).toBe('acme');
  });

  it('rejects invalid slug (uppercase)', async () => {
    await expect(manager.create({ name: 'Bad', slug: 'BadSlug' })).rejects.toThrow('Invalid slug');
  });

  it('rejects invalid slug (leading hyphen)', async () => {
    await expect(manager.create({ name: 'Bad', slug: '-bad' })).rejects.toThrow('Invalid slug');
  });

  it('rejects duplicate slug', async () => {
    await manager.create({ name: 'First', slug: 'first-slug' });
    await expect(manager.create({ name: 'Second', slug: 'first-slug' })).rejects.toThrow('Slug already exists');
  });

  it('delete throws for default tenant', async () => {
    await expect(manager.delete('default')).rejects.toThrow('Cannot delete the default tenant');
  });

  it('delete throws for nonexistent tenant', async () => {
    await expect(manager.delete('nonexistent-id')).rejects.toThrow('Tenant not found');
  });

  it('delete works for non-default tenant', async () => {
    await manager.create({ name: 'ToDelete', slug: 'to-delete' });
    const rec = storage.create.mock.results[0].value;
    await expect(manager.delete((await rec).id)).resolves.toBeUndefined();
  });
});
