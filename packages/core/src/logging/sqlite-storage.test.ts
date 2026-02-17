import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { SQLiteAuditStorage } from './sqlite-storage.js';
import type { AuditEntry } from '@friday/shared';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../test-setup.js';

function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    correlationId: overrides.correlationId,
    event: overrides.event ?? 'test_event',
    level: overrides.level ?? 'info',
    message: overrides.message ?? 'Test message',
    userId: overrides.userId,
    taskId: overrides.taskId,
    metadata: overrides.metadata,
    timestamp: overrides.timestamp ?? Date.now(),
    integrity: overrides.integrity ?? {
      version: '1.0.0',
      signature: 'a'.repeat(64),
      previousEntryHash: '0'.repeat(64),
    },
  };
}

describe('SQLiteAuditStorage', () => {
  let storage: SQLiteAuditStorage;

  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateAllTables();
    storage = new SQLiteAuditStorage();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe('append and getLast', () => {
    it('should return null when empty', async () => {
      expect(await storage.getLast()).toBeNull();
    });

    it('should append and retrieve the last entry', async () => {
      const entry = makeEntry();
      await storage.append(entry);
      const last = await storage.getLast();
      expect(last).not.toBeNull();
      expect(last!.id).toBe(entry.id);
      expect(last!.event).toBe(entry.event);
    });

    it('should return the most recently appended entry', async () => {
      const e1 = makeEntry({ id: crypto.randomUUID(), message: 'first' });
      const e2 = makeEntry({ id: crypto.randomUUID(), message: 'second' });
      await storage.append(e1);
      await storage.append(e2);
      const last = await storage.getLast();
      expect(last!.id).toBe(e2.id);
      expect(last!.message).toBe('second');
    });
  });

  describe('count', () => {
    it('should return 0 for empty storage', async () => {
      expect(await storage.count()).toBe(0);
    });

    it('should return correct count', async () => {
      await storage.append(makeEntry());
      await storage.append(makeEntry());
      await storage.append(makeEntry());
      expect(await storage.count()).toBe(3);
    });
  });

  describe('getById', () => {
    it('should return null for non-existent id', async () => {
      expect(await storage.getById('nonexistent')).toBeNull();
    });

    it('should return entry by id', async () => {
      const entry = makeEntry();
      await storage.append(entry);
      const found = await storage.getById(entry.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(entry.id);
    });
  });

  describe('iterate', () => {
    it('should iterate entries in insertion order', async () => {
      const entries = [
        makeEntry({ message: 'a' }),
        makeEntry({ message: 'b' }),
        makeEntry({ message: 'c' }),
      ];
      for (const e of entries) await storage.append(e);

      const collected: AuditEntry[] = [];
      for await (const e of storage.iterate()) {
        collected.push(e);
      }
      expect(collected).toHaveLength(3);
      expect(collected[0].message).toBe('a');
      expect(collected[1].message).toBe('b');
      expect(collected[2].message).toBe('c');
    });

    it('should yield nothing for empty storage', async () => {
      const collected: AuditEntry[] = [];
      for await (const e of storage.iterate()) {
        collected.push(e);
      }
      expect(collected).toHaveLength(0);
    });
  });

  describe('metadata serialization', () => {
    it('should round-trip metadata as JSON', async () => {
      const entry = makeEntry({
        metadata: { key: 'value', nested: { a: 1 } },
      });
      await storage.append(entry);
      const found = await storage.getById(entry.id);
      expect(found!.metadata).toEqual({ key: 'value', nested: { a: 1 } });
    });

    it('should handle entries without metadata', async () => {
      const entry = makeEntry({ metadata: undefined });
      await storage.append(entry);
      const found = await storage.getById(entry.id);
      expect(found!.metadata).toBeUndefined();
    });
  });

  describe('optional fields', () => {
    it('should handle entries without optional fields', async () => {
      const entry = makeEntry({
        correlationId: undefined,
        userId: undefined,
        taskId: undefined,
      });
      await storage.append(entry);
      const found = await storage.getById(entry.id);
      expect(found!.correlationId).toBeUndefined();
      expect(found!.userId).toBeUndefined();
      expect(found!.taskId).toBeUndefined();
    });

    it('should store and retrieve optional fields', async () => {
      const entry = makeEntry({
        correlationId: crypto.randomUUID(),
        userId: 'user-123',
        taskId: crypto.randomUUID(),
      });
      await storage.append(entry);
      const found = await storage.getById(entry.id);
      expect(found!.correlationId).toBe(entry.correlationId);
      expect(found!.userId).toBe(entry.userId);
      expect(found!.taskId).toBe(entry.taskId);
    });
  });

  describe('queryEntries', () => {
    beforeEach(async () => {
      const now = 1000000;
      await storage.append(
        makeEntry({
          event: 'login',
          level: 'info',
          timestamp: now,
          userId: 'alice',
          taskId: crypto.randomUUID(),
        })
      );
      await storage.append(
        makeEntry({ event: 'error', level: 'error', timestamp: now + 100, userId: 'bob' })
      );
      await storage.append(
        makeEntry({ event: 'login', level: 'info', timestamp: now + 200, userId: 'alice' })
      );
      await storage.append(
        makeEntry({ event: 'logout', level: 'info', timestamp: now + 300, userId: 'bob' })
      );
      await storage.append(
        makeEntry({ event: 'error', level: 'security', timestamp: now + 400, userId: 'alice' })
      );
    });

    it('should return all entries with default options', async () => {
      const result = await storage.queryEntries();
      expect(result.total).toBe(5);
      expect(result.entries).toHaveLength(5);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('should filter by time range', async () => {
      const result = await storage.queryEntries({ from: 1000100, to: 1000300 });
      expect(result.total).toBe(3);
      expect(result.entries).toHaveLength(3);
    });

    it('should filter by level', async () => {
      const result = await storage.queryEntries({ level: ['error', 'security'] });
      expect(result.total).toBe(2);
    });

    it('should filter by event', async () => {
      const result = await storage.queryEntries({ event: ['login'] });
      expect(result.total).toBe(2);
    });

    it('should filter by userId', async () => {
      const result = await storage.queryEntries({ userId: 'alice' });
      expect(result.total).toBe(3);
    });

    it('should support pagination', async () => {
      const page1 = await storage.queryEntries({ limit: 2, offset: 0, order: 'asc' });
      const page2 = await storage.queryEntries({ limit: 2, offset: 2, order: 'asc' });
      expect(page1.entries).toHaveLength(2);
      expect(page2.entries).toHaveLength(2);
      expect(page1.entries[0].id).not.toBe(page2.entries[0].id);
      expect(page1.total).toBe(5);
    });

    it('should order descending by default', async () => {
      const result = await storage.queryEntries();
      expect(result.entries[0].timestamp).toBeGreaterThanOrEqual(
        result.entries[result.entries.length - 1].timestamp
      );
    });

    it('should cap limit at 1000', async () => {
      const result = await storage.queryEntries({ limit: 5000 });
      expect(result.limit).toBe(1000);
    });
  });

  describe('getByTaskId', () => {
    it('should return entries for a task', async () => {
      const taskId = crypto.randomUUID();
      await storage.append(makeEntry({ taskId }));
      await storage.append(makeEntry({ taskId }));
      await storage.append(makeEntry({ taskId: crypto.randomUUID() }));

      const results = await storage.getByTaskId(taskId);
      expect(results).toHaveLength(2);
      expect(results[0].taskId).toBe(taskId);
    });
  });

  describe('getByCorrelationId', () => {
    it('should return correlated entries', async () => {
      const corrId = crypto.randomUUID();
      await storage.append(makeEntry({ correlationId: corrId }));
      await storage.append(makeEntry({ correlationId: corrId }));
      await storage.append(makeEntry());

      const results = await storage.getByCorrelationId(corrId);
      expect(results).toHaveLength(2);
      expect(results[0].correlationId).toBe(corrId);
    });
  });

  describe('persistence (shared pool)', () => {
    it('should preserve data across multiple storage instances', async () => {
      const entry = makeEntry({ message: 'persisted' });
      await storage.append(entry);

      // Create a second instance — shares the same pool
      const s2 = new SQLiteAuditStorage();
      expect(await s2.count()).toBe(1);
      const last = await s2.getLast();
      expect(last!.message).toBe('persisted');
      expect(last!.id).toBe(entry.id);
    });

    it('should return correct getLast for chain continuation across instances', async () => {
      const e1 = makeEntry({ message: 'first' });
      const e2 = makeEntry({
        message: 'second',
        integrity: {
          version: '1.0.0',
          signature: 'b'.repeat(64),
          previousEntryHash: 'c'.repeat(64),
        },
      });
      await storage.append(e1);
      await storage.append(e2);

      const s2 = new SQLiteAuditStorage();
      const last = await s2.getLast();
      expect(last!.id).toBe(e2.id);
      expect(last!.integrity.previousEntryHash).toBe('c'.repeat(64));
    });
  });

  describe('enforceRetention', () => {
    it('should purge entries older than maxAgeDays', async () => {
      const now = Date.now();
      // Insert entries: 2 old (100 days ago), 1 recent
      await storage.append(makeEntry({ id: 'old-1', timestamp: now - 100 * 86_400_000 }));
      await storage.append(makeEntry({ id: 'old-2', timestamp: now - 95 * 86_400_000 }));
      await storage.append(makeEntry({ id: 'recent', timestamp: now }));

      const deleted = await storage.enforceRetention({ maxAgeDays: 90 });
      expect(deleted).toBe(2);
      expect(await storage.count()).toBe(1);
      const last = await storage.getLast();
      expect(last!.id).toBe('recent');
    });

    it('should respect maxEntries limit', async () => {
      for (let i = 0; i < 10; i++) {
        await storage.append(makeEntry({ id: `entry-${i}`, timestamp: Date.now() + i }));
      }

      const deleted = await storage.enforceRetention({ maxAgeDays: 9999, maxEntries: 5 });
      expect(deleted).toBe(5);
      expect(await storage.count()).toBe(5);
    });

    it('should record no deletions when within limits', async () => {
      await storage.append(makeEntry({ timestamp: Date.now() }));
      await storage.append(makeEntry({ timestamp: Date.now() }));

      const deleted = await storage.enforceRetention({ maxAgeDays: 90, maxEntries: 1_000_000 });
      expect(deleted).toBe(0);
      expect(await storage.count()).toBe(2);
    });

    it('should handle both age and count limits together', async () => {
      const now = Date.now();
      // 3 old entries + 8 recent = 11 total
      for (let i = 0; i < 3; i++) {
        await storage.append(makeEntry({ id: `old-${i}`, timestamp: now - 100 * 86_400_000 + i }));
      }
      for (let i = 0; i < 8; i++) {
        await storage.append(makeEntry({ id: `new-${i}`, timestamp: now + i }));
      }

      // maxAgeDays=90 removes 3 old, then maxEntries=5 removes 3 more
      const deleted = await storage.enforceRetention({ maxAgeDays: 90, maxEntries: 5 });
      expect(deleted).toBe(6);
      expect(await storage.count()).toBe(5);
    });
  });
});
