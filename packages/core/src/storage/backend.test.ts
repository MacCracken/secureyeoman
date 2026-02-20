import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveBackend } from './backend.js';

describe('resolveBackend', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env['DATABASE_URL'];
    delete process.env['POSTGRES_URL'];
  });

  afterEach(() => {
    Object.assign(process.env, originalEnv);
    if (!originalEnv['DATABASE_URL']) delete process.env['DATABASE_URL'];
    if (!originalEnv['POSTGRES_URL']) delete process.env['POSTGRES_URL'];
  });

  it('returns pg when explicitly configured', () => {
    const result = resolveBackend('pg');
    expect(result.backend).toBe('pg');
    expect(result.reason).toBe('explicitly configured');
  });

  it('returns sqlite when explicitly configured', () => {
    const result = resolveBackend('sqlite');
    expect(result.backend).toBe('sqlite');
    expect(result.reason).toBe('explicitly configured');
  });

  it('returns pg in auto mode when DATABASE_URL is set', () => {
    process.env['DATABASE_URL'] = 'postgres://localhost/test';
    const result = resolveBackend('auto');
    expect(result.backend).toBe('pg');
    expect(result.reason).toBe('DATABASE_URL detected');
  });

  it('returns pg in auto mode when POSTGRES_URL is set', () => {
    process.env['POSTGRES_URL'] = 'postgres://localhost/test';
    const result = resolveBackend('auto');
    expect(result.backend).toBe('pg');
    expect(result.reason).toBe('DATABASE_URL detected');
  });

  it('returns sqlite in auto mode when no DATABASE_URL is set', () => {
    const result = resolveBackend('auto');
    expect(result.backend).toBe('sqlite');
    expect(result.reason).toContain('SQLite');
  });

  it('defaults to auto when no argument is passed', () => {
    const result = resolveBackend();
    expect(['pg', 'sqlite']).toContain(result.backend);
  });
});
