/**
 * Strategy Storage — DB integration tests.
 *
 * Requires `secureyeoman_test` PostgreSQL database.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { StrategyStorage } from './strategy-storage.js';
import { initPool, getPool, closePool } from '../storage/pg-pool.js';
import { MIGRATION_MANIFEST } from '../storage/migrations/manifest.js';

let storage: StrategyStorage;

beforeAll(async () => {
  initPool({
    connectionString:
      process.env.TEST_DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/secureyeoman_test',
    max: 2,
  });

  // Run migrations
  const pool = getPool();
  for (const m of MIGRATION_MANIFEST) {
    await pool.query(m.sql);
  }

  storage = new StrategyStorage();
});

afterAll(async () => {
  await closePool();
});

beforeEach(async () => {
  const pool = getPool();
  await pool.query('DELETE FROM soul.reasoning_strategies');
});

// ── seedBuiltinStrategies ─────────────────────────────────────────────────────

describe('seedBuiltinStrategies', () => {
  it('seeds 8 built-in strategies', async () => {
    await storage.seedBuiltinStrategies();
    const { items, total } = await storage.listStrategies();
    expect(total).toBe(8);
    expect(items.every((s) => s.isBuiltin)).toBe(true);
  });

  it('is idempotent — re-seeding does not duplicate', async () => {
    await storage.seedBuiltinStrategies();
    await storage.seedBuiltinStrategies();
    const { total } = await storage.listStrategies();
    expect(total).toBe(8);
  });

  it('seeds standard strategy with empty promptPrefix', async () => {
    await storage.seedBuiltinStrategies();
    const std = await storage.getStrategyBySlug('standard');
    expect(std).not.toBeNull();
    expect(std!.promptPrefix).toBe('');
    expect(std!.category).toBe('standard');
  });

  it('seeds chain-of-thought with meaningful promptPrefix', async () => {
    await storage.seedBuiltinStrategies();
    const cot = await storage.getStrategyBySlug('chain-of-thought');
    expect(cot).not.toBeNull();
    expect(cot!.promptPrefix).toContain('step by step');
    expect(cot!.category).toBe('chain_of_thought');
  });
});

// ── CRUD ──────────────────────────────────────────────────────────────────────

describe('createStrategy', () => {
  it('creates a custom strategy', async () => {
    const s = await storage.createStrategy({
      name: 'My Custom',
      slug: 'my-custom',
      description: 'Test desc',
      promptPrefix: 'Do X then Y.',
      category: 'reflexion',
    });
    expect(s.id).toBeDefined();
    expect(s.name).toBe('My Custom');
    expect(s.slug).toBe('my-custom');
    expect(s.isBuiltin).toBe(false);
    expect(s.category).toBe('reflexion');
  });

  it('creates a built-in strategy when opts.isBuiltin is true', async () => {
    const s = await storage.createStrategy(
      { name: 'BI', slug: 'bi-test', promptPrefix: 'Do it.', category: 'standard' },
      { isBuiltin: true }
    );
    expect(s.isBuiltin).toBe(true);
  });

  it('rejects duplicate slugs', async () => {
    await storage.createStrategy({
      name: 'A',
      slug: 'dup-slug',
      promptPrefix: 'X',
      category: 'standard',
    });
    await expect(
      storage.createStrategy({
        name: 'B',
        slug: 'dup-slug',
        promptPrefix: 'Y',
        category: 'standard',
      })
    ).rejects.toThrow();
  });
});

describe('getStrategy / getStrategyBySlug', () => {
  it('returns strategy by ID', async () => {
    const created = await storage.createStrategy({
      name: 'Test',
      slug: 'get-test',
      promptPrefix: 'Test.',
      category: 'standard',
    });
    const found = await storage.getStrategy(created.id);
    expect(found).not.toBeNull();
    expect(found!.slug).toBe('get-test');
  });

  it('returns null for missing ID', async () => {
    const found = await storage.getStrategy('nonexistent-id');
    expect(found).toBeNull();
  });

  it('returns strategy by slug', async () => {
    await storage.createStrategy({
      name: 'Slug Test',
      slug: 'slug-lookup',
      promptPrefix: 'Slug.',
      category: 'chain_of_thought',
    });
    const found = await storage.getStrategyBySlug('slug-lookup');
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Slug Test');
  });

  it('returns null for missing slug', async () => {
    const found = await storage.getStrategyBySlug('nope');
    expect(found).toBeNull();
  });
});

describe('listStrategies', () => {
  it('lists with category filter', async () => {
    await storage.seedBuiltinStrategies();
    const { items } = await storage.listStrategies({ category: 'chain_of_thought' });
    expect(items.length).toBe(1);
    expect(items[0].category).toBe('chain_of_thought');
  });

  it('paginates with limit and offset', async () => {
    await storage.seedBuiltinStrategies();
    const page1 = await storage.listStrategies({ limit: 3, offset: 0 });
    const page2 = await storage.listStrategies({ limit: 3, offset: 3 });
    expect(page1.items.length).toBe(3);
    expect(page2.items.length).toBe(3);
    expect(page1.total).toBe(8);
    expect(page1.items[0].id).not.toBe(page2.items[0].id);
  });
});

describe('updateStrategy', () => {
  it('updates a custom strategy', async () => {
    const created = await storage.createStrategy({
      name: 'Old Name',
      slug: 'update-test',
      promptPrefix: 'Old.',
      category: 'standard',
    });
    const updated = await storage.updateStrategy(created.id, { name: 'New Name' });
    expect(updated!.name).toBe('New Name');
    expect(updated!.slug).toBe('update-test');
  });

  it('rejects update of built-in strategies', async () => {
    await storage.seedBuiltinStrategies();
    const cot = await storage.getStrategyBySlug('chain-of-thought');
    await expect(storage.updateStrategy(cot!.id, { name: 'Hacked' })).rejects.toThrow('built-in');
  });

  it('returns null for missing ID', async () => {
    const result = await storage.updateStrategy('nonexistent', { name: 'X' });
    expect(result).toBeNull();
  });
});

describe('deleteStrategy', () => {
  it('deletes a custom strategy', async () => {
    const created = await storage.createStrategy({
      name: 'Doomed',
      slug: 'delete-test',
      promptPrefix: 'Bye.',
      category: 'standard',
    });
    const deleted = await storage.deleteStrategy(created.id);
    expect(deleted).toBe(true);
    const found = await storage.getStrategy(created.id);
    expect(found).toBeNull();
  });

  it('rejects deletion of built-in strategies', async () => {
    await storage.seedBuiltinStrategies();
    const std = await storage.getStrategyBySlug('standard');
    await expect(storage.deleteStrategy(std!.id)).rejects.toThrow('built-in');
  });

  it('returns false for missing ID', async () => {
    const deleted = await storage.deleteStrategy('nonexistent');
    expect(deleted).toBe(false);
  });
});
