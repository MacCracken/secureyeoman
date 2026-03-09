import { describe, it, expect } from 'vitest';
import { buildWhere, buildSet, parseCount, toTs } from './query-helpers.js';

describe('buildWhere', () => {
  it('returns empty WHERE when no filters match', () => {
    const result = buildWhere([
      { column: 'status', value: undefined },
      { column: 'name', value: null },
    ]);
    expect(result.where).toBe('');
    expect(result.values).toEqual([]);
    expect(result.nextIdx).toBe(1);
  });

  it('returns empty WHERE for empty filter array', () => {
    const result = buildWhere([]);
    expect(result.where).toBe('');
    expect(result.values).toEqual([]);
    expect(result.nextIdx).toBe(1);
  });

  it('builds WHERE clause from truthy filters', () => {
    const result = buildWhere([
      { column: 'status', value: 'active' },
      { column: 'tool', value: undefined },
      { column: 'category', value: 'security' },
    ]);
    expect(result.where).toBe('WHERE status = $1 AND category = $2');
    expect(result.values).toEqual(['active', 'security']);
    expect(result.nextIdx).toBe(3);
  });

  it('supports custom operators', () => {
    const result = buildWhere([
      { column: 'name', value: '%test%', op: 'ILIKE' },
      { column: 'tags', value: 'security', op: '?' },
    ]);
    expect(result.where).toBe('WHERE name ILIKE $1 AND tags ? $2');
    expect(result.values).toEqual(['%test%', 'security']);
  });

  it('respects custom startIdx', () => {
    const result = buildWhere([{ column: 'status', value: 'draft' }], 3);
    expect(result.where).toBe('WHERE status = $3');
    expect(result.values).toEqual(['draft']);
    expect(result.nextIdx).toBe(4);
  });

  it('includes falsy but defined values like 0 and empty string', () => {
    const result = buildWhere([
      { column: 'count', value: 0 },
      { column: 'name', value: '' },
      { column: 'flag', value: false },
    ]);
    expect(result.where).toBe('WHERE count = $1 AND name = $2 AND flag = $3');
    expect(result.values).toEqual([0, '', false]);
  });
});

describe('buildSet', () => {
  it('returns empty when no fields have values', () => {
    const result = buildSet([
      { column: 'status', value: undefined },
      { column: 'name', value: undefined },
    ]);
    expect(result.setClause).toBe('');
    expect(result.values).toEqual([]);
    expect(result.hasUpdates).toBe(false);
    expect(result.nextIdx).toBe(1);
  });

  it('builds SET clause from defined fields', () => {
    const result = buildSet([
      { column: 'status', value: 'running' },
      { column: 'name', value: undefined },
      { column: 'completed_at', value: 12345 },
    ]);
    expect(result.setClause).toBe('status = $1, completed_at = $2');
    expect(result.values).toEqual(['running', 12345]);
    expect(result.hasUpdates).toBe(true);
    expect(result.nextIdx).toBe(3);
  });

  it('JSON-stringifies values when json flag is set', () => {
    const members = [{ role: 'admin' }];
    const result = buildSet([{ column: 'members', value: members, json: true }]);
    expect(result.values).toEqual([JSON.stringify(members)]);
  });

  it('respects custom startIdx', () => {
    const result = buildSet([{ column: 'status', value: 'done' }], 5);
    expect(result.setClause).toBe('status = $5');
    expect(result.nextIdx).toBe(6);
  });
});

describe('parseCount', () => {
  it('parses string count', () => {
    expect(parseCount({ count: '42' })).toBe(42);
  });

  it('returns 0 for null/undefined', () => {
    expect(parseCount(null)).toBe(0);
    expect(parseCount(undefined)).toBe(0);
  });

  it('returns NaN for empty count string', () => {
    expect(parseCount({ count: '' })).toBeNaN();
  });
});

describe('toTs', () => {
  it('returns null for null/undefined', () => {
    expect(toTs(null)).toBeNull();
    expect(toTs(undefined)).toBeNull();
  });

  it('passes through numbers', () => {
    expect(toTs(1234567890)).toBe(1234567890);
  });

  it('converts ISO string to epoch ms', () => {
    const iso = '2025-01-15T12:00:00.000Z';
    expect(toTs(iso)).toBe(new Date(iso).getTime());
  });
});
