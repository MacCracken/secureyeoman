/**
 * Resource Exhaustion Tests
 *
 * Tests behavior under memory pressure, concurrent access stress,
 * and resource limits.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';

describe('Resource Exhaustion', () => {
  const dirs: string[] = [];

  function makeTmpDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'friday-resource-'));
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

  it('should handle large number of concurrent readers', async () => {
    const dir = makeTmpDir();
    const dbPath = join(dir, 'test.db');

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');

    for (let i = 0; i < 100; i++) {
      db.exec(`INSERT INTO test VALUES (${i}, 'value_${i}')`);
    }

    // Open many concurrent readers
    const readers: Database.Database[] = [];
    for (let i = 0; i < 20; i++) {
      const reader = new Database(dbPath, { readonly: true });
      readers.push(reader);
    }

    // All should be able to read
    const results = readers.map((r) =>
      (r.prepare('SELECT COUNT(*) as cnt FROM test').get() as any).cnt,
    );

    expect(results.every((c) => c === 100)).toBe(true);

    // Cleanup
    readers.forEach((r) => r.close());
    db.close();
  });

  it('should handle large payloads in database', () => {
    const dir = makeTmpDir();
    const dbPath = join(dir, 'test.db');

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, data TEXT)');

    // Insert a large text payload (1MB)
    const largePayload = 'x'.repeat(1024 * 1024);
    db.prepare('INSERT INTO test VALUES (?, ?)').run(1, largePayload);

    const row = db.prepare('SELECT data FROM test WHERE id = 1').get() as any;
    expect(row.data.length).toBe(1024 * 1024);

    db.close();
  });

  it('should handle many small transactions efficiently', () => {
    const dir = makeTmpDir();
    const dbPath = join(dir, 'test.db');

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value INTEGER)');

    const start = Date.now();
    const insert = db.prepare('INSERT INTO test VALUES (?, ?)');

    // 10000 individual inserts (wrapped in transaction for speed)
    const batch = db.transaction(() => {
      for (let i = 0; i < 10000; i++) {
        insert.run(i, i * 2);
      }
    });
    batch();

    const elapsed = Date.now() - start;
    // Should complete in reasonable time (< 5 seconds)
    expect(elapsed).toBeLessThan(5000);

    const count = (db.prepare('SELECT COUNT(*) as cnt FROM test').get() as any).cnt;
    expect(count).toBe(10000);

    db.close();
  });

  it('should handle Node.js memory pressure gracefully', () => {
    // Test that the application doesn't crash under moderate memory usage
    const arrays: Buffer[] = [];

    // Allocate ~50MB of buffers — should not throw or crash
    for (let i = 0; i < 50; i++) {
      arrays.push(Buffer.alloc(1024 * 1024, 0));
    }

    // Verify we can still perform operations under memory pressure
    const totalAllocated = arrays.reduce((sum, buf) => sum + buf.length, 0);
    expect(totalAllocated).toBe(50 * 1024 * 1024);

    // Clean up
    arrays.length = 0;
  });

  it('should handle rapid database schema operations', () => {
    const dir = makeTmpDir();
    const dbPath = join(dir, 'test.db');

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    // Create and drop tables rapidly
    for (let i = 0; i < 100; i++) {
      db.exec(`CREATE TABLE test_${i} (id INTEGER PRIMARY KEY, value TEXT)`);
      db.exec(`INSERT INTO test_${i} VALUES (1, 'value')`);
    }

    // All tables should exist
    const tables = db.prepare(
      "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name LIKE 'test_%'",
    ).get() as any;
    expect(tables.cnt).toBe(100);

    // Drop them all
    for (let i = 0; i < 100; i++) {
      db.exec(`DROP TABLE test_${i}`);
    }

    const after = db.prepare(
      "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name LIKE 'test_%'",
    ).get() as any;
    expect(after.cnt).toBe(0);

    db.close();
  });
});
