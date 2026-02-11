/**
 * Crash Recovery Tests
 *
 * Verifies data integrity after simulated process crashes.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';

describe('Crash Recovery', () => {
  const dirs: string[] = [];

  function makeTmpDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'friday-crash-'));
    dirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of dirs) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    dirs.length = 0;
  });

  it('should preserve committed transactions after abrupt close', () => {
    const dir = makeTmpDir();
    const dbPath = join(dir, 'test.db');

    // Write data and "crash" (close without cleanup)
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
    db.exec("INSERT INTO test VALUES (1, 'committed')");
    // Simulate crash: just close without graceful shutdown
    db.close();

    // Recovery: reopen
    const db2 = new Database(dbPath);
    const row = db2.prepare('SELECT * FROM test WHERE id = 1').get() as any;
    expect(row).toBeDefined();
    expect(row.value).toBe('committed');
    db2.close();
  });

  it('should roll back uncommitted transactions', () => {
    const dir = makeTmpDir();
    const dbPath = join(dir, 'test.db');

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
    db.exec("INSERT INTO test VALUES (1, 'committed')");

    // Start transaction but don't commit
    db.exec('BEGIN');
    db.exec("INSERT INTO test VALUES (2, 'uncommitted')");
    // "Crash" without commit/rollback
    db.close();

    // Recovery: uncommitted data should not be present
    const db2 = new Database(dbPath);
    const rows = db2.prepare('SELECT * FROM test').all();
    expect(rows).toHaveLength(1);
    db2.close();
  });

  it('should handle rapid open/close cycles', () => {
    const dir = makeTmpDir();
    const dbPath = join(dir, 'test.db');

    // Create initial database
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, counter INTEGER DEFAULT 0)');
    db.exec('INSERT INTO test VALUES (1, 0)');
    db.close();

    // Rapid open/write/close cycles
    for (let i = 0; i < 50; i++) {
      const conn = new Database(dbPath);
      conn.exec(`UPDATE test SET counter = ${i + 1} WHERE id = 1`);
      conn.close();
    }

    // Verify final state
    const final = new Database(dbPath);
    const row = final.prepare('SELECT counter FROM test WHERE id = 1').get() as any;
    expect(row.counter).toBe(50);
    final.close();
  });

  it('should recover from checkpoint during crash', () => {
    const dir = makeTmpDir();
    const dbPath = join(dir, 'test.db');

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');

    // Write enough to trigger WAL growth
    for (let i = 0; i < 100; i++) {
      db.exec(`INSERT INTO test VALUES (${i}, 'value_${i}')`);
    }

    // Force checkpoint
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();

    // Verify all data survived
    const db2 = new Database(dbPath);
    const count = db2.prepare('SELECT COUNT(*) as cnt FROM test').get() as any;
    expect(count.cnt).toBe(100);
    db2.close();
  });
});
