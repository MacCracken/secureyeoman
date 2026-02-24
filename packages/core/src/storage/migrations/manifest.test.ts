/**
 * Migration Manifest unit tests
 *
 * Validates the MIGRATION_MANIFEST structure without requiring a database.
 * The manifest eagerly reads all SQL files via readFileSync at module load
 * time — these tests verify correctness of the manifest array itself.
 */
import { describe, it, expect } from 'vitest';
import { MIGRATION_MANIFEST } from './manifest.js';

describe('MIGRATION_MANIFEST', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(MIGRATION_MANIFEST)).toBe(true);
    expect(MIGRATION_MANIFEST.length).toBeGreaterThan(0);
  });

  it('every entry has a string id and non-empty sql', () => {
    for (const entry of MIGRATION_MANIFEST) {
      expect(typeof entry.id).toBe('string');
      expect(entry.id.length).toBeGreaterThan(0);
      expect(typeof entry.sql).toBe('string');
      expect(entry.sql.trim().length).toBeGreaterThan(0);
    }
  });

  it('ids are sorted in ascending lexicographic order', () => {
    const ids = MIGRATION_MANIFEST.map((m) => m.id);
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });

  it('has no duplicate ids', () => {
    const ids = MIGRATION_MANIFEST.map((m) => m.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('ids follow the NNN_description pattern', () => {
    for (const entry of MIGRATION_MANIFEST) {
      expect(entry.id).toMatch(/^\d{3}_\w+$/);
    }
  });

  it('starts with 001_initial_schema', () => {
    expect(MIGRATION_MANIFEST[0]?.id).toBe('001_initial_schema');
  });
});
