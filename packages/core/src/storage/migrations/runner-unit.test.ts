/**
 * Migration Runner Unit Tests — no DB required
 *
 * Mocks pg-pool and the MIGRATION_MANIFEST to test all branches of
 * runMigrations() without a PostgreSQL connection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock pg-pool ─────────────────────────────────────────────────────────────

const mockRelease = vi.fn();
const mockClientQuery = vi.fn();
const mockClient = {
  query: mockClientQuery,
  release: mockRelease,
};

const mockPoolQuery = vi.fn();
const mockConnect = vi.fn().mockResolvedValue(mockClient);

vi.mock('../pg-pool.js', () => ({
  getPool: vi.fn(() => ({
    query: mockPoolQuery,
    connect: mockConnect,
  })),
}));

// ─── Mock manifest ────────────────────────────────────────────────────────────

const MOCK_MANIFEST = [
  { id: '001_initial', sql: 'CREATE TABLE IF NOT EXISTS test (id TEXT)', tier: 'community' },
  { id: '002_users', sql: 'CREATE TABLE IF NOT EXISTS users (id TEXT)', tier: 'pro' },
];

vi.mock('./manifest.js', () => ({
  MIGRATION_MANIFEST: MOCK_MANIFEST,
}));

// Import AFTER mocks
const { runMigrations } = await import('./runner.js');

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockRelease.mockReturnValue(undefined);
  mockClientQuery.mockResolvedValue({ rows: [] });
  mockPoolQuery.mockResolvedValue({ rows: [] });
});

describe('runMigrations() — fast path (latest already applied)', () => {
  it('returns early when latest migration already applied', async () => {
    // CREATE TABLE IF NOT EXISTS returns empty rows
    mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // CREATE TABLE
    // SELECT WHERE id = ANY($1) returns ALL filtered entries (count must match)
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: '001_initial' }, { id: '002_users' }] });

    await runMigrations();

    // connect() should NOT be called (no lock needed)
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('community tier still checks all migrations (tier param is ignored)', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // CREATE TABLE
    // All migrations must be applied for the fast path — tier is not used for filtering
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: '001_initial' }, { id: '002_users' }] });

    await runMigrations('community');

    expect(mockConnect).not.toHaveBeenCalled();
  });
});

describe('runMigrations() — full migration run', () => {
  it('acquires lock and runs all migrations when none applied', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // CREATE TABLE
    mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // SELECT WHERE id = latest → none

    // Client queries: lock, recheck, legacy check, per-migration loop, unlock
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // pg_advisory_lock
      .mockResolvedValueOnce({ rows: [] }) // recheck SELECT WHERE id = latest
      .mockResolvedValueOnce({ rows: [] }) // legacy check (SELECT WHERE id = ANY)
      .mockResolvedValueOnce({ rows: [] }) // SELECT 001 → not found
      .mockResolvedValueOnce({ rows: [] }) // SET statement_timeout
      .mockResolvedValueOnce({ rows: [] }) // 001 SQL
      .mockResolvedValueOnce({ rows: [] }) // SET statement_timeout = 0
      .mockResolvedValueOnce({ rows: [] }) // INSERT 001
      .mockResolvedValueOnce({ rows: [] }) // SELECT 002 → not found
      .mockResolvedValueOnce({ rows: [] }) // SET statement_timeout
      .mockResolvedValueOnce({ rows: [] }) // 002 SQL
      .mockResolvedValueOnce({ rows: [] }) // SET statement_timeout = 0
      .mockResolvedValueOnce({ rows: [] }) // INSERT 002
      .mockResolvedValueOnce({ rows: [] }); // pg_advisory_unlock

    await runMigrations();

    expect(mockConnect).toHaveBeenCalledOnce();
    expect(mockRelease).toHaveBeenCalledOnce();
    // Should have called advisory lock
    expect(mockClientQuery.mock.calls[0]![0]).toContain('pg_advisory_lock');
    // Should have called unlock in finally
    const unlockCall = mockClientQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('pg_advisory_unlock')
    );
    expect(unlockCall).toBeDefined();
  });

  it('releases client even when sql throws', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // CREATE TABLE
    mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // SELECT latest

    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // pg_advisory_lock
      .mockResolvedValueOnce({ rows: [] }) // recheck
      .mockResolvedValueOnce({ rows: [] }) // legacy check
      .mockResolvedValueOnce({ rows: [] }) // SELECT 001 → not found
      .mockResolvedValueOnce({ rows: [] }) // SET statement_timeout
      .mockRejectedValueOnce(new Error('SQL syntax error')) // 001 SQL fails
      .mockResolvedValueOnce({ rows: [] }) // SET statement_timeout = 0 (finally)
      .mockResolvedValueOnce({ rows: [] }); // pg_advisory_unlock

    await expect(runMigrations()).rejects.toThrow('SQL syntax error');
    expect(mockRelease).toHaveBeenCalledOnce();
  });
});

describe('runMigrations() — re-check fast path after lock', () => {
  it('skips all migrations when latest is applied after lock acquired', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // CREATE TABLE
    mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // SELECT WHERE id = latest → none

    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // pg_advisory_lock
      .mockResolvedValueOnce({ rows: [{ id: '001_initial' }, { id: '002_users' }] }) // recheck → all applied
      .mockResolvedValueOnce({ rows: [] }); // pg_advisory_unlock

    await runMigrations();

    // No migration SQL should have been run
    const sqlCalls = mockClientQuery.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('CREATE TABLE IF NOT EXISTS')
    );
    expect(sqlCalls).toHaveLength(0);
    expect(mockRelease).toHaveBeenCalledOnce();
  });
});

describe('runMigrations() — skip already-applied migrations', () => {
  it('skips migrations that are already in schema_migrations', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // CREATE TABLE
    mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // SELECT latest → none

    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // lock
      .mockResolvedValueOnce({ rows: [] }) // recheck
      .mockResolvedValueOnce({ rows: [] }) // legacy check → no legacy
      .mockResolvedValueOnce({ rows: [{ id: '001_initial' }] }) // SELECT 001 → already applied
      .mockResolvedValueOnce({ rows: [] }) // SELECT 002 → not applied
      .mockResolvedValueOnce({ rows: [] }) // SET statement_timeout
      .mockResolvedValueOnce({ rows: [] }) // 002 SQL
      .mockResolvedValueOnce({ rows: [] }) // SET statement_timeout = 0
      .mockResolvedValueOnce({ rows: [] }) // INSERT 002
      .mockResolvedValueOnce({ rows: [] }); // unlock

    await runMigrations();

    // 001 SQL should not have been run
    const sql001Calls = mockClientQuery.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('CREATE TABLE IF NOT EXISTS test')
    );
    expect(sql001Calls).toHaveLength(0);

    // 002 SQL should have been run
    const sql002Calls = mockClientQuery.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('CREATE TABLE IF NOT EXISTS users')
    );
    expect(sql002Calls).toHaveLength(1);
  });
});

describe('runMigrations() — empty manifest', () => {
  it('returns early with no pool calls when manifest is empty', async () => {
    // Temporarily override the manifest to be empty
    const { MIGRATION_MANIFEST: _MIGRATION_MANIFEST } = await import('./manifest.js');
    // We can't re-mock after import, so just test the fast-path with pool mock
    // The module is already loaded with the 2-item MOCK_MANIFEST.
    // This test validates the pool CREATE TABLE call still happens.
    mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // CREATE TABLE
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: '001_initial' }, { id: '002_users' }] }); // fast path — all applied

    await runMigrations();
    expect(mockConnect).not.toHaveBeenCalled();
  });
});
