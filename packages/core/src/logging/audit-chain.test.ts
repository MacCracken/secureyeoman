import { describe, it, expect, beforeEach } from 'vitest';
import { AuditChain, InMemoryAuditStorage } from './audit-chain.js';

const SIGNING_KEY = 'a'.repeat(64); // 64 chars, well above 32 minimum

describe('AuditChain', () => {
  let storage: InMemoryAuditStorage;
  let chain: AuditChain;

  beforeEach(async () => {
    storage = new InMemoryAuditStorage();
    chain = new AuditChain({ storage, signingKey: SIGNING_KEY });
    await chain.initialize();
  });

  describe('constructor', () => {
    it('should reject signing keys shorter than 32 characters', () => {
      expect(() => new AuditChain({ storage, signingKey: 'short' })).toThrow(
        'Signing key must be at least 32 characters'
      );
    });

    it('should accept signing keys of exactly 32 characters', () => {
      expect(() => new AuditChain({ storage, signingKey: 'x'.repeat(32) })).not.toThrow();
    });
  });

  describe('genesis block', () => {
    it('should set previousHash to all zeros for first entry', async () => {
      const entry = await chain.record({
        event: 'test_event',
        level: 'info',
        message: 'Genesis entry',
      });

      expect(entry.integrity.previousEntryHash).toBe('0'.repeat(64));
    });
  });

  describe('chain linking', () => {
    it('should link entries via previousEntryHash', async () => {
      const first = await chain.record({
        event: 'event_1',
        level: 'info',
        message: 'First',
      });

      const second = await chain.record({
        event: 'event_2',
        level: 'info',
        message: 'Second',
      });

      // Second entry's previousHash should NOT be the genesis hash
      expect(second.integrity.previousEntryHash).not.toBe('0'.repeat(64));
      // The hash should be deterministic and non-empty
      expect(second.integrity.previousEntryHash).toHaveLength(64);
    });

    it('should produce unique signatures per entry', async () => {
      const first = await chain.record({
        event: 'event_1',
        level: 'info',
        message: 'First',
      });

      const second = await chain.record({
        event: 'event_2',
        level: 'info',
        message: 'Second',
      });

      expect(first.integrity.signature).not.toBe(second.integrity.signature);
    });
  });

  describe('verify()', () => {
    it('should return valid for empty chain', async () => {
      const result = await chain.verify();
      expect(result.valid).toBe(true);
      expect(result.entriesChecked).toBe(0);
    });

    it('should return valid for a correct chain', async () => {
      await chain.record({ event: 'e1', level: 'info', message: 'First' });
      await chain.record({ event: 'e2', level: 'warn', message: 'Second' });
      await chain.record({ event: 'e3', level: 'error', message: 'Third' });

      const result = await chain.verify();
      expect(result.valid).toBe(true);
      expect(result.entriesChecked).toBe(3);
    });

    it('should detect tampered entry', async () => {
      await chain.record({ event: 'e1', level: 'info', message: 'First' });
      await chain.record({ event: 'e2', level: 'info', message: 'Second' });

      // Tamper with the first entry by modifying message directly in storage
      const entries: any[] = [];
      for await (const e of storage.iterate()) {
        entries.push(e);
      }
      // Modify the first entry's message
      entries[0].message = 'TAMPERED';

      // Create a new storage with tampered data
      const tamperedStorage = new InMemoryAuditStorage();
      for (const e of entries) {
        await tamperedStorage.append(e);
      }

      const tamperedChain = new AuditChain({ storage: tamperedStorage, signingKey: SIGNING_KEY });
      await tamperedChain.initialize();
      const result = await tamperedChain.verify();
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getStats()', () => {
    it('should return correct counts', async () => {
      await chain.record({ event: 'e1', level: 'info', message: 'First' });
      await chain.record({ event: 'e2', level: 'info', message: 'Second' });

      const stats = await chain.getStats();
      expect(stats.entriesCount).toBe(2);
      expect(stats.chainValid).toBe(true);
      expect(stats.lastVerification).toBeDefined();
      expect(typeof stats.lastVerification).toBe('number');
    });

    it('should return zero for empty chain', async () => {
      const stats = await chain.getStats();
      expect(stats.entriesCount).toBe(0);
      expect(stats.chainValid).toBe(true);
    });
  });

  describe('createSnapshot()', () => {
    it('should return expected shape for empty chain', async () => {
      const snapshot = await chain.createSnapshot();
      expect(snapshot.timestamp).toBeTypeOf('number');
      expect(snapshot.entriesCount).toBe(0);
      expect(snapshot.lastHash).toBe('0'.repeat(64));
      expect(snapshot.lastEntryId).toBeNull();
    });

    it('should return expected shape after entries', async () => {
      const entry = await chain.record({ event: 'e1', level: 'info', message: 'First' });
      const snapshot = await chain.createSnapshot();
      expect(snapshot.entriesCount).toBe(1);
      expect(snapshot.lastEntryId).toBe(entry.id);
      expect(snapshot.lastHash).toHaveLength(64);
      expect(snapshot.lastHash).not.toBe('0'.repeat(64));
    });
  });

  describe('initialize() with existing chain', () => {
    it('should load and verify last entry on init', async () => {
      await chain.record({ event: 'e1', level: 'info', message: 'First' });
      await chain.record({ event: 'e2', level: 'info', message: 'Second' });

      // Create a new chain using the same storage
      const newChain = new AuditChain({ storage, signingKey: SIGNING_KEY });
      await newChain.initialize();

      // Should be able to continue the chain
      const third = await newChain.record({ event: 'e3', level: 'info', message: 'Third' });
      expect(third.integrity.previousEntryHash).not.toBe('0'.repeat(64));

      // Full verify should pass
      const result = await newChain.verify();
      expect(result.valid).toBe(true);
      expect(result.entriesChecked).toBe(3);
    });

    it('should throw if last entry signature is invalid', async () => {
      await chain.record({ event: 'e1', level: 'info', message: 'First' });

      // Create a new chain with a different signing key
      const badChain = new AuditChain({ storage, signingKey: 'b'.repeat(64) });
      await expect(badChain.initialize()).rejects.toThrow('integrity compromised');
    });
  });

  describe('record() concurrency', () => {
    it('produces a valid chain when many records are fired concurrently', async () => {
      // Simulate the fire-and-forget pattern used throughout the codebase
      // (void auditChain.record(...)).  Without the promise queue these would
      // all read the same stale this.lastHash and corrupt the chain.
      const N = 20;
      await Promise.all(
        Array.from({ length: N }, (_, i) =>
          chain.record({ event: `concurrent_${i}`, level: 'info', message: `entry ${i}` })
        )
      );

      expect(await storage.count()).toBe(N);
      const result = await chain.verify();
      expect(result.valid).toBe(true);
      expect(result.entriesChecked).toBe(N);
    });

    it('each entry has a unique previousEntryHash when fired concurrently', async () => {
      await Promise.all([
        chain.record({ event: 'a', level: 'info', message: 'A' }),
        chain.record({ event: 'b', level: 'info', message: 'B' }),
        chain.record({ event: 'c', level: 'info', message: 'C' }),
      ]);

      const hashes: string[] = [];
      for await (const entry of storage.iterate()) {
        hashes.push(entry.integrity.previousEntryHash);
      }
      // Each entry must have a different previousEntryHash — they form a chain,
      // not a fan (which is what the race condition produces).
      const unique = new Set(hashes);
      expect(unique.size).toBe(hashes.length);
    });
  });

  describe('record() validation', () => {
    it('should set id, timestamp, and integrity fields automatically', async () => {
      const entry = await chain.record({
        event: 'test',
        level: 'info',
        message: 'Auto fields',
      });

      expect(entry.id).toBeDefined();
      expect(entry.timestamp).toBeTypeOf('number');
      expect(entry.integrity.version).toBe('1.0.0');
      expect(entry.integrity.signature).toHaveLength(64);
    });

    it('should include optional fields when provided', async () => {
      const taskId = '00000000-0000-0000-0000-000000000002';
      const correlationId = '00000000-0000-0000-0000-000000000003';
      const entry = await chain.record({
        event: 'test',
        level: 'info',
        message: 'With extras',
        userId: 'user-1',
        taskId,
        correlationId,
        metadata: { key: 'value' },
      });

      expect(entry.userId).toBe('user-1');
      expect(entry.taskId).toBe(taskId);
      expect(entry.correlationId).toBe(correlationId);
      expect(entry.metadata).toEqual({ key: 'value' });
    });
  });
});

describe('InMemoryAuditStorage', () => {
  let storage: InMemoryAuditStorage;

  beforeEach(() => {
    storage = new InMemoryAuditStorage();
  });

  describe('query()', () => {
    it('should return empty result for empty storage', async () => {
      const result = await storage.query();
      expect(result.entries).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should filter by time range', async () => {
      const chain = new AuditChain({ storage, signingKey: SIGNING_KEY });
      await chain.initialize();
      await chain.record({ event: 'e1', level: 'info', message: 'Old' });

      const entries: any[] = [];
      for await (const e of storage.iterate()) entries.push(e);
      const ts = entries[0].timestamp;

      const result = await storage.query({ from: ts, to: ts });
      expect(result.total).toBe(1);
    });

    it('should respect limit and offset', async () => {
      const chain = new AuditChain({ storage, signingKey: SIGNING_KEY });
      await chain.initialize();
      for (let i = 0; i < 5; i++) {
        await chain.record({ event: `e${i}`, level: 'info', message: `Entry ${i}` });
      }

      const result = await storage.query({ limit: 2, offset: 1 });
      expect(result.entries).toHaveLength(2);
      expect(result.limit).toBe(2);
      expect(result.offset).toBe(1);
      expect(result.total).toBe(5);
    });

    it('should filter by level', async () => {
      const chain = new AuditChain({ storage, signingKey: SIGNING_KEY });
      await chain.initialize();
      await chain.record({ event: 'e1', level: 'info', message: 'Info entry' });
      await chain.record({ event: 'e2', level: 'warn', message: 'Warn entry' });
      await chain.record({ event: 'e3', level: 'error', message: 'Error entry' });

      const result = await storage.query({ level: ['warn', 'error'] });
      expect(result.total).toBe(2);
      expect(result.entries.every((e) => e.level !== 'info')).toBe(true);
    });

    it('should filter by event', async () => {
      const chain = new AuditChain({ storage, signingKey: SIGNING_KEY });
      await chain.initialize();
      await chain.record({ event: 'login', level: 'info', message: 'Login' });
      await chain.record({ event: 'logout', level: 'info', message: 'Logout' });
      await chain.record({ event: 'login', level: 'info', message: 'Login again' });

      const result = await storage.query({ event: ['login'] });
      expect(result.total).toBe(2);
      expect(result.entries.every((e) => e.event === 'login')).toBe(true);
    });

    it('should filter by userId', async () => {
      const chain = new AuditChain({ storage, signingKey: SIGNING_KEY });
      await chain.initialize();
      await chain.record({ event: 'e1', level: 'info', message: 'User A', userId: 'user-a' });
      await chain.record({ event: 'e2', level: 'info', message: 'User B', userId: 'user-b' });

      const result = await storage.query({ userId: 'user-a' });
      expect(result.total).toBe(1);
      expect(result.entries[0]!.userId).toBe('user-a');
    });

    it('should filter by taskId', async () => {
      const taskId = '00000000-0000-0000-0000-000000000099';
      const chain = new AuditChain({ storage, signingKey: SIGNING_KEY });
      await chain.initialize();
      await chain.record({ event: 'e1', level: 'info', message: 'Task 1', taskId });
      await chain.record({ event: 'e2', level: 'info', message: 'No task' });

      const result = await storage.query({ taskId });
      expect(result.total).toBe(1);
      expect(result.entries[0]!.taskId).toBe(taskId);
    });

    it('should sort ascending when order=asc', async () => {
      const chain = new AuditChain({ storage, signingKey: SIGNING_KEY });
      await chain.initialize();
      await chain.record({ event: 'e1', level: 'info', message: 'First' });
      await chain.record({ event: 'e2', level: 'info', message: 'Second' });

      const result = await storage.query({ order: 'asc' });
      expect(result.entries[0]!.event).toBe('e1');
      expect(result.entries[1]!.event).toBe('e2');
    });
  });
});

describe('AuditChain additional branches', () => {
  let storage: InMemoryAuditStorage;

  beforeEach(() => {
    storage = new InMemoryAuditStorage();
  });

  it('initialize() is idempotent — calling twice does not reinitialize', async () => {
    const chain = new AuditChain({ storage, signingKey: SIGNING_KEY });
    await chain.initialize();
    await chain.initialize(); // Second call should return early
    // Should still work correctly
    const entry = await chain.record({ event: 'e1', level: 'info', message: 'after double init' });
    expect(entry).toBeDefined();
  });

  it('record() auto-initializes when initialize() was not called explicitly', async () => {
    const chain = new AuditChain({ storage, signingKey: SIGNING_KEY });
    // Do NOT call initialize() — record() should call it internally
    const entry = await chain.record({ event: 'auto_init', level: 'info', message: 'No explicit init' });
    expect(entry.integrity.previousEntryHash).toBe('0'.repeat(64));
  });

  it('updateSigningKey() rejects short keys', async () => {
    const chain = new AuditChain({ storage, signingKey: SIGNING_KEY });
    await chain.initialize();
    await expect(chain.updateSigningKey('short')).rejects.toThrow('Signing key must be at least 32 characters');
  });

  it('updateSigningKey() records rotation entry and uses new key', async () => {
    const chain = new AuditChain({ storage, signingKey: SIGNING_KEY });
    await chain.initialize();

    await chain.record({ event: 'before', level: 'info', message: 'Before rotation' });
    const newKey = 'z'.repeat(64);
    await chain.updateSigningKey(newKey);
    await chain.record({ event: 'after', level: 'info', message: 'After rotation' });

    // Chain should still verify correctly
    const result = await chain.verify();
    expect(result.valid).toBe(true);
    expect(result.entriesChecked).toBe(3); // before + rotation_event + after
  });

  it('verify() returns error when chain link is broken (previous hash mismatch)', async () => {
    const chain = new AuditChain({ storage, signingKey: SIGNING_KEY });
    await chain.initialize();
    await chain.record({ event: 'e1', level: 'info', message: 'First' });
    await chain.record({ event: 'e2', level: 'info', message: 'Second' });
    await chain.record({ event: 'e3', level: 'info', message: 'Third' });

    // Collect all 3 entries and tamper ONLY the MIDDLE entry's previousEntryHash.
    // The LAST entry stays valid so initialize() can succeed.
    const entries: any[] = [];
    for await (const e of storage.iterate()) entries.push(e);
    // Tamper entry[1] (middle), leave entry[2] (last) untouched
    entries[1] = {
      ...entries[1],
      integrity: { ...entries[1].integrity, previousEntryHash: '0'.repeat(64) },
    };

    const tamperedStorage = new InMemoryAuditStorage();
    for (const e of entries) await tamperedStorage.append(e);

    // Initialize succeeds — the last entry (entry[2]) is untampered
    const verifyChain = new AuditChain({ storage: tamperedStorage, signingKey: SIGNING_KEY });
    await verifyChain.initialize();

    // verify() will encounter the mismatch on entry[1]
    const result = await verifyChain.verify();
    expect(result.valid).toBe(false);
    expect(result.error).toContain('previous hash mismatch');
  });

  it('verify() returns error when storage.iterate() throws', async () => {
    // Use explicit mock that implements AuditChainStorage but throws in iterate()
    const throwingStorage = {
      append: async () => {},
      getLast: async () => null,
      count: async () => 0,
      getById: async () => null,
      async *iterate(): AsyncIterableIterator<never> {
        throw new Error('Storage failure');
        // eslint-disable-next-line no-unreachable
        yield undefined as never;
      },
    };
    const chain = new AuditChain({ storage: throwingStorage as any, signingKey: SIGNING_KEY });
    await chain.initialize(); // Empty storage — succeeds

    const result = await chain.verify();
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Storage failure');
  });

  it('verify() returns non-Error exception message as "Unknown error"', async () => {
    const throwingStorage = {
      append: async () => {},
      getLast: async () => null,
      count: async () => 0,
      getById: async () => null,
      async *iterate(): AsyncIterableIterator<never> {
        // eslint-disable-next-line no-throw-literal
        throw 'plain string error';
        // eslint-disable-next-line no-unreachable
        yield undefined as never;
      },
    };
    const chain = new AuditChain({ storage: throwingStorage as any, signingKey: SIGNING_KEY });
    await chain.initialize(); // Empty storage — succeeds

    const result = await chain.verify();
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Unknown error');
  });
});
