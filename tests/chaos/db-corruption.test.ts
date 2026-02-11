/**
 * Database Corruption / Recovery Tests
 *
 * Tests SQLite WAL recovery after simulated corruption,
 * and data integrity after unexpected scenarios.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';

describe('Database Corruption Recovery', () => {
  const dirs: string[] = [];

  function makeTmpDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'friday-chaos-'));
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

  it('should recover from corrupted WAL file', () => {
    const dir = makeTmpDir();
    const dbPath = join(dir, 'test.db');

    // Create a valid database with WAL mode
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
    db.exec("INSERT INTO test VALUES (1, 'hello')");
    db.close();

    // Corrupt the WAL file
    const walPath = `${dbPath}-wal`;
    if (existsSync(walPath)) {
      writeFileSync(walPath, 'CORRUPTED DATA');
    }

    // SQLite should recover by ignoring the corrupted WAL
    const db2 = new Database(dbPath);
    db2.pragma('journal_mode = WAL');

    // Data from before WAL corruption should be available
    const row = db2.prepare('SELECT * FROM test WHERE id = 1').get() as any;
    expect(row).toBeDefined();
    expect(row.value).toBe('hello');
    db2.close();
  });

  it('should handle missing SHM file', () => {
    const dir = makeTmpDir();
    const dbPath = join(dir, 'test.db');

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
    db.exec("INSERT INTO test VALUES (1, 'data')");
    db.close();

    // Remove SHM file
    const shmPath = `${dbPath}-shm`;
    if (existsSync(shmPath)) {
      rmSync(shmPath);
    }

    // Should still open and work
    const db2 = new Database(dbPath);
    const row = db2.prepare('SELECT * FROM test WHERE id = 1').get() as any;
    expect(row.value).toBe('data');
    db2.close();
  });

  it('should handle concurrent database access', () => {
    const dir = makeTmpDir();
    const dbPath = join(dir, 'test.db');

    const db1 = new Database(dbPath);
    db1.pragma('journal_mode = WAL');
    db1.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');

    const db2 = new Database(dbPath);

    // Both should be able to read/write
    db1.exec("INSERT INTO test VALUES (1, 'from db1')");
    const row = db2.prepare('SELECT * FROM test WHERE id = 1').get() as any;
    expect(row.value).toBe('from db1');

    db2.exec("INSERT INTO test VALUES (2, 'from db2')");
    const row2 = db1.prepare('SELECT * FROM test WHERE id = 2').get() as any;
    expect(row2.value).toBe('from db2');

    db1.close();
    db2.close();
  });

  it('should maintain data integrity after rapid writes', () => {
    const dir = makeTmpDir();
    const dbPath = join(dir, 'test.db');

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');

    const insert = db.prepare('INSERT INTO test VALUES (?, ?)');
    const count = 1000;

    const insertMany = db.transaction(() => {
      for (let i = 0; i < count; i++) {
        insert.run(i, `value_${i}`);
      }
    });
    insertMany();

    const result = db.prepare('SELECT COUNT(*) as cnt FROM test').get() as any;
    expect(result.cnt).toBe(count);

    db.close();

    // Reopen and verify
    const db2 = new Database(dbPath);
    const result2 = db2.prepare('SELECT COUNT(*) as cnt FROM test').get() as any;
    expect(result2.cnt).toBe(count);
    db2.close();
  });
});
