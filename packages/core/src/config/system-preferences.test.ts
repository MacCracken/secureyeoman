/**
 * SystemPreferencesStorage — integration tests
 *
 * Requires a live PostgreSQL test database.
 * Run: npx vitest run packages/core/src/config/system-preferences.test.ts
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { SystemPreferencesStorage } from './system-preferences-storage.js';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../test-setup.js';

describe('SystemPreferencesStorage', () => {
  let storage: SystemPreferencesStorage;

  beforeAll(async () => {
    await setupTestDb();
    storage = new SystemPreferencesStorage();
    await storage.init();
  });

  beforeEach(async () => {
    await truncateAllTables();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  // ── get / set ────────────────────────────────────────────────────

  it('sets and gets a value', async () => {
    await storage.set('foo', 'bar');
    const val = await storage.get('foo');
    expect(val).toBe('bar');
  });

  it('returns null for a missing key', async () => {
    const val = await storage.get('nonexistent');
    expect(val).toBeNull();
  });

  it('overwrites an existing key (upsert)', async () => {
    await storage.set('key', 'first');
    await storage.set('key', 'second');
    const val = await storage.get('key');
    expect(val).toBe('second');
  });

  // ── delete ───────────────────────────────────────────────────────

  it('deletes a key', async () => {
    await storage.set('to-delete', 'value');
    await storage.delete('to-delete');
    const val = await storage.get('to-delete');
    expect(val).toBeNull();
  });

  it('delete is a no-op for non-existent key', async () => {
    await expect(storage.delete('nope')).resolves.not.toThrow();
  });

  // ── list ─────────────────────────────────────────────────────────

  it('lists all preferences', async () => {
    await storage.set('a', '1');
    await storage.set('b', '2');
    const rows = await storage.list();
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const keys = rows.map((r) => r.key);
    expect(keys).toContain('a');
    expect(keys).toContain('b');
  });

  it('returns empty list when no preferences exist', async () => {
    const rows = await storage.list();
    expect(rows).toHaveLength(0);
  });

  it('list rows include key, value, and updatedAt', async () => {
    const before = Date.now();
    await storage.set('mykey', 'myval');
    const rows = await storage.list();
    const row = rows.find((r) => r.key === 'mykey');
    expect(row).toBeDefined();
    expect(row!.value).toBe('myval');
    expect(row!.updatedAt).toBeGreaterThanOrEqual(before);
  });

  // ── model default keys ───────────────────────────────────────────

  it('round-trips model.provider and model.model', async () => {
    await storage.set('model.provider', 'openai');
    await storage.set('model.model', 'gpt-4o');
    expect(await storage.get('model.provider')).toBe('openai');
    expect(await storage.get('model.model')).toBe('gpt-4o');
  });

  it('clears model defaults independently', async () => {
    await storage.set('model.provider', 'anthropic');
    await storage.set('model.model', 'claude-sonnet-4-6');
    await storage.delete('model.provider');
    expect(await storage.get('model.provider')).toBeNull();
    expect(await storage.get('model.model')).toBe('claude-sonnet-4-6');
  });
});
