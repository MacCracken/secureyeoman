import { describe, it, expect, beforeEach } from 'vitest';
import { AuditChain, InMemoryAuditStorage } from './audit-chain.js';
import { runWithCorrelationId } from '../utils/correlation-context.js';
import { uuidv7 } from '../utils/crypto.js';

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

  describe('initialize() with repairOnInit', () => {
    it('auto-repairs when the last entry has an invalid signature', async () => {
      await chain.record({ event: 'e1', level: 'info', message: 'First' });

      // Corrupt the only entry's signature directly
      const entries: any[] = [];
      for await (const e of storage.iterate()) entries.push(e);
      entries[0].integrity.signature = 'bad'.padEnd(64, '0');

      const brokenStorage = new InMemoryAuditStorage();
      for (const e of entries) await brokenStorage.append(e);

      const repairChain = new AuditChain({
        storage: brokenStorage,
        signingKey: SIGNING_KEY,
        repairOnInit: true,
      });
      await repairChain.initialize(); // should not throw

      const result = await repairChain.verify();
      expect(result.valid).toBe(true);
    });

    it('auto-repairs a broken link in the middle of the chain even when last entry looks valid', async () => {
      // Build a 3-entry chain
      await chain.record({ event: 'e1', level: 'info', message: 'First' });
      await chain.record({ event: 'e2', level: 'info', message: 'Second' });
      await chain.record({ event: 'e3', level: 'info', message: 'Third' });

      // Break entry[1]'s previousEntryHash but leave entry[2] (last) untouched.
      // The last entry's signature remains valid in isolation, so the OLD
      // single-entry check would not have triggered repair.
      const entries: any[] = [];
      for await (const e of storage.iterate()) entries.push(e);
      entries[1] = {
        ...entries[1],
        integrity: { ...entries[1].integrity, previousEntryHash: '0'.repeat(64) },
      };

      const brokenStorage = new InMemoryAuditStorage();
      for (const e of entries) await brokenStorage.append(e);

      // Without repairOnInit this chain can be initialized (last entry is fine)
      // but verify() would fail.  With repairOnInit the full verify runs and
      // triggers auto-repair so the chain is clean when initialize() returns.
      const repairChain = new AuditChain({
        storage: brokenStorage,
        signingKey: SIGNING_KEY,
        repairOnInit: true,
      });
      await repairChain.initialize();

      const result = await repairChain.verify();
      expect(result.valid).toBe(true);
      expect(result.entriesChecked).toBe(3);
    });

    it('continues the chain correctly after auto-repair on init', async () => {
      await chain.record({ event: 'e1', level: 'info', message: 'First' });

      // Corrupt entry
      const entries: any[] = [];
      for await (const e of storage.iterate()) entries.push(e);
      entries[0].integrity.previousEntryHash = '0'.repeat(63) + '1';

      const brokenStorage = new InMemoryAuditStorage();
      for (const e of entries) await brokenStorage.append(e);

      const repairChain = new AuditChain({
        storage: brokenStorage,
        signingKey: SIGNING_KEY,
        repairOnInit: true,
      });
      await repairChain.initialize();

      // New entries should chain correctly after repair
      await repairChain.record({ event: 'e2', level: 'info', message: 'After repair' });

      const result = await repairChain.verify();
      expect(result.valid).toBe(true);
      expect(result.entriesChecked).toBe(2);
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

  describe('metadata key-order stability (JSONB round-trip)', () => {
    it('verifies correctly when metadata keys are not in alphabetical order', async () => {
      // Simulate a JSONB round-trip: metadata stored with keys in one order,
      // retrieved with keys in alphabetical order.
      await chain.record({
        event: 'e1',
        level: 'info',
        message: 'With metadata',
        // Keys deliberately out of alphabetical order: z before a
        metadata: { userId: 'u1', ip: '1.2.3.4', action: 'login' },
      });

      // Simulate a JSONB round-trip by re-creating the entry with keys in
      // alphabetical order (as PostgreSQL JSONB would return them).
      const entries: any[] = [];
      for await (const e of storage.iterate()) entries.push(e);
      entries[0].metadata = { action: 'login', ip: '1.2.3.4', userId: 'u1' };

      const roundTripStorage = new InMemoryAuditStorage();
      for (const e of entries) await roundTripStorage.append(e);

      const roundTripChain = new AuditChain({ storage: roundTripStorage, signingKey: SIGNING_KEY });
      await roundTripChain.initialize();
      const result = await roundTripChain.verify();
      expect(result.valid).toBe(true);
    });

    it('chain with metadata in non-alphabetical key order remains valid after a simulated JSONB read', async () => {
      // Write entry with keys: { z, a, m } — not alphabetical
      await chain.record({
        event: 'hash_test',
        level: 'info',
        message: 'A',
        metadata: { z: 1, a: 2, m: 3 },
      });

      // Simulate JSONB round-trip: alphabetise the keys (a, m, z)
      const entries: any[] = [];
      for await (const e of storage.iterate()) entries.push(e);
      entries[0].metadata = { a: 2, m: 3, z: 1 };

      const roundTrip = new InMemoryAuditStorage();
      for (const e of entries) await roundTrip.append(e);

      const rtChain = new AuditChain({ storage: roundTrip, signingKey: SIGNING_KEY });
      await rtChain.initialize();
      expect((await rtChain.verify()).valid).toBe(true);
    });
  });

  describe('repair()', () => {
    it('returns zero repairedCount for an already-valid chain', async () => {
      await chain.record({ event: 'e1', level: 'info', message: 'A' });
      await chain.record({ event: 'e2', level: 'info', message: 'B' });

      const result = await chain.repair();
      expect(result.entriesTotal).toBe(2);
      expect(result.repairedCount).toBe(0);
      expect((await chain.verify()).valid).toBe(true);
    });

    it('fixes a chain whose entries have wrong previousEntryHash', async () => {
      await chain.record({ event: 'e1', level: 'info', message: 'First' });
      await chain.record({ event: 'e2', level: 'info', message: 'Second' });

      // Corrupt the second entry's previousEntryHash
      const entries: any[] = [];
      for await (const e of storage.iterate()) entries.push(e);
      entries[1].integrity.previousEntryHash = 'corrupted' + '0'.repeat(57);

      // Chain should now be invalid
      const result1 = await chain.verify();
      expect(result1.valid).toBe(false);

      // Repair should fix it
      const repairResult = await chain.repair();
      expect(repairResult.repairedCount).toBeGreaterThan(0);

      const result2 = await chain.verify();
      expect(result2.valid).toBe(true);
    });

    it('re-signs entries whose metadata keys were in non-sorted order', async () => {
      // Record entry with non-alphabetical metadata key order
      await chain.record({
        event: 'login',
        level: 'info',
        message: 'Logged in',
        metadata: { userId: 'u1', ip: '10.0.0.1' },
      });

      // Simulate JSONB round-trip: replace metadata with alphabetically-sorted version
      const entries: any[] = [];
      for await (const e of storage.iterate()) entries.push(e);
      entries[0].metadata = { ip: '10.0.0.1', userId: 'u1' };

      // This corrupts the signature because the hash was computed with original key order
      // but now the metadata has sorted keys
      const broken = new InMemoryAuditStorage();
      for (const e of entries) await broken.append(e);

      const brokenChain = new AuditChain({ storage: broken, signingKey: SIGNING_KEY });
      await brokenChain.initialize();

      // With deep-sort fix, the chain should already be valid after the round-trip
      // (repair should find 0 entries that need fixing)
      const repairResult = await brokenChain.repair();
      const verifyResult = await brokenChain.verify();
      expect(verifyResult.valid).toBe(true);
      // 0 repairs needed because deep-sort already makes write==verify hash
      expect(repairResult.repairedCount).toBe(0);
    });

    it('chain remains valid after appending entries post-repair', async () => {
      await chain.record({ event: 'e1', level: 'info', message: 'Before repair' });

      // Corrupt and repair
      const entries: any[] = [];
      for await (const e of storage.iterate()) entries.push(e);
      entries[0].integrity.previousEntryHash = '0'.repeat(63) + '1'; // wrong

      await chain.repair();

      // Append new entry — should chain correctly
      await chain.record({ event: 'e2', level: 'info', message: 'After repair' });

      const result = await chain.verify();
      expect(result.valid).toBe(true);
      expect(result.entriesChecked).toBe(2);
    });
  });

  describe('getStats() — error details', () => {
    it('returns chainError and chainBrokenAt when chain is invalid', async () => {
      // Record two entries so we can tamper with the FIRST (not last) entry.
      // repairOnInit is false (default) so initialize() only verifies the last
      // entry — tampering the first entry allows initialization but breaks verify().
      await chain.record({ event: 'e1', level: 'info', message: 'First' });
      await chain.record({ event: 'e2', level: 'info', message: 'Second' });

      // Corrupt the FIRST entry's message
      const entries: any[] = [];
      for await (const e of storage.iterate()) entries.push(e);
      entries[0].message = 'TAMPERED';

      const tampered = new InMemoryAuditStorage();
      for (const e of entries) await tampered.append(e);

      // repairOnInit is false (default) — initialize() fast-path only checks the last
      // entry's signature, so tampering the first entry is undetected at init time.
      const tamperedChain = new AuditChain({ storage: tampered, signingKey: SIGNING_KEY });
      await tamperedChain.initialize();

      const stats = await tamperedChain.getStats();
      expect(stats.chainValid).toBe(false);
      expect(stats.chainError).toBeDefined();
      expect(stats.chainBrokenAt).toBeDefined();
    });

    it('returns undefined chainError and chainBrokenAt for a valid chain', async () => {
      await chain.record({ event: 'e1', level: 'info', message: 'Fine' });
      const stats = await chain.getStats();
      expect(stats.chainValid).toBe(true);
      expect(stats.chainError).toBeUndefined();
      expect(stats.chainBrokenAt).toBeUndefined();
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
    const entry = await chain.record({
      event: 'auto_init',
      level: 'info',
      message: 'No explicit init',
    });
    expect(entry.integrity.previousEntryHash).toBe('0'.repeat(64));
  });

  it('updateSigningKey() rejects short keys', async () => {
    const chain = new AuditChain({ storage, signingKey: SIGNING_KEY });
    await chain.initialize();
    await expect(chain.updateSigningKey('short')).rejects.toThrow(
      'Signing key must be at least 32 characters'
    );
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

    // repairOnInit false (default) — initialize() fast-path accepts the chain because
    // the last entry (entry[2]) is untampered.
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
        throw 'plain string error';

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

describe('AuditChain — repairOnInit when chain is already valid', () => {
  it('does not repair when chain is valid and repairOnInit is true', async () => {
    const storage = new InMemoryAuditStorage();
    const chain = new AuditChain({ storage, signingKey: SIGNING_KEY });
    await chain.initialize();

    await chain.record({ event: 'e1', level: 'info', message: 'First' });
    await chain.record({ event: 'e2', level: 'info', message: 'Second' });

    // Create new chain with repairOnInit on existing valid storage
    const newChain = new AuditChain({
      storage,
      signingKey: SIGNING_KEY,
      repairOnInit: true,
    });
    await newChain.initialize();

    // Chain should be valid without any repair
    const result = await newChain.verify();
    expect(result.valid).toBe(true);
    expect(result.entriesChecked).toBe(2);

    // Should be able to continue appending
    await newChain.record({ event: 'e3', level: 'info', message: 'Third' });
    const result2 = await newChain.verify();
    expect(result2.valid).toBe(true);
    expect(result2.entriesChecked).toBe(3);
  });
});

describe('AuditChain — repair() auto-initializes', () => {
  it('repair() calls initialize() when not yet initialized', async () => {
    const storage = new InMemoryAuditStorage();
    const chain = new AuditChain({ storage, signingKey: SIGNING_KEY });
    // Do NOT call initialize()
    const result = await chain.repair();
    expect(result.entriesTotal).toBe(0);
    expect(result.repairedCount).toBe(0);
  });
});

describe('AuditChain — verify() auto-initializes', () => {
  it('verify() calls initialize() when not yet initialized', async () => {
    const storage = new InMemoryAuditStorage();
    const chain = new AuditChain({ storage, signingKey: SIGNING_KEY });
    // Do NOT call initialize()
    const result = await chain.verify();
    expect(result.valid).toBe(true);
    expect(result.entriesChecked).toBe(0);
  });
});

describe('InMemoryAuditStorage — updateIntegrity edge case', () => {
  it('does nothing when entry ID is not found', async () => {
    const storage = new InMemoryAuditStorage();
    // Should not throw
    await storage.updateIntegrity('nonexistent-id', 'sig', 'hash');
    expect(await storage.count()).toBe(0);
  });

  it('getById returns null for unknown ID', async () => {
    const storage = new InMemoryAuditStorage();
    const result = await storage.getById('no-such-id');
    expect(result).toBeNull();
  });
});

describe('InMemoryAuditStorage — query() limit capping', () => {
  it('caps limit at 1000 even when a larger value is requested', async () => {
    const storage = new InMemoryAuditStorage();
    const chain = new AuditChain({ storage, signingKey: SIGNING_KEY });
    await chain.initialize();
    await chain.record({ event: 'e1', level: 'info', message: 'Test' });

    const result = await storage.query({ limit: 5000 });
    expect(result.limit).toBe(1000);
  });

  it('uses default limit of 50 when not specified', async () => {
    const storage = new InMemoryAuditStorage();
    const chain = new AuditChain({ storage, signingKey: SIGNING_KEY });
    await chain.initialize();
    await chain.record({ event: 'e1', level: 'info', message: 'Test' });

    const result = await storage.query({});
    expect(result.limit).toBe(50);
  });

  it('sorts descending by default (newest first)', async () => {
    const storage = new InMemoryAuditStorage();
    const chain = new AuditChain({ storage, signingKey: SIGNING_KEY });
    await chain.initialize();
    await chain.record({ event: 'first', level: 'info', message: 'First' });
    // Small delay so timestamps differ
    await new Promise((r) => setTimeout(r, 5));
    await chain.record({ event: 'second', level: 'info', message: 'Second' });

    const result = await storage.query({});
    expect(result.entries[0]!.event).toBe('second');
    expect(result.entries[1]!.event).toBe('first');
  });
});

describe('AuditChain — record queue resilience', () => {
  it('a failed record does not prevent subsequent records', async () => {
    const storage = new InMemoryAuditStorage();
    const chain = new AuditChain({ storage, signingKey: SIGNING_KEY });
    await chain.initialize();

    // Override append to fail once, then succeed
    let callCount = 0;
    const originalAppend = storage.append.bind(storage);
    storage.append = async (entry) => {
      callCount++;
      if (callCount === 2) {
        throw new Error('Transient storage error');
      }
      return originalAppend(entry);
    };

    await chain.record({ event: 'e1', level: 'info', message: 'OK 1' });

    // Second record will fail in storage.append
    await expect(chain.record({ event: 'e2', level: 'info', message: 'Fail' })).rejects.toThrow(
      'Transient storage error'
    );

    // Third record should still succeed
    const e3 = await chain.record({ event: 'e3', level: 'info', message: 'OK 3' });
    expect(e3.event).toBe('e3');
  });
});

describe('AuditChain — signing key rotation with verify', () => {
  it('verify detects signature failure when using wrong key', async () => {
    const storage = new InMemoryAuditStorage();
    const chain = new AuditChain({ storage, signingKey: SIGNING_KEY });
    await chain.initialize();

    await chain.record({ event: 'e1', level: 'info', message: 'Signed with original key' });

    // Create a chain with a DIFFERENT signing key trying to verify the same storage
    const wrongKeyChain = new AuditChain({ storage, signingKey: 'w'.repeat(64) });
    // Initialize with repairOnInit=false will fail because last entry has wrong sig
    await expect(wrongKeyChain.initialize()).rejects.toThrow('integrity compromised');
  });
});

describe('AuditChain — correlation ID auto-enrichment', () => {
  it('entry recorded inside runWithCorrelationId scope has correlationId set', async () => {
    const storage = new InMemoryAuditStorage();
    const chain = new AuditChain({ storage, signingKey: SIGNING_KEY });
    await chain.initialize();

    const testId = uuidv7(); // must be a valid UUID to pass AuditEntrySchema
    let entry: Awaited<ReturnType<typeof chain.record>> | undefined;
    await runWithCorrelationId(testId, async () => {
      entry = await chain.record({ event: 'test', level: 'info', message: 'hello' });
    });

    expect(entry?.correlationId).toBe(testId);
  });

  it('entry recorded outside ALS scope has no correlationId in entry', async () => {
    const storage = new InMemoryAuditStorage();
    const chain = new AuditChain({ storage, signingKey: SIGNING_KEY });
    await chain.initialize();

    const entry = await chain.record({ event: 'test', level: 'info', message: 'outside' });
    expect(entry.correlationId).toBeUndefined();
  });
});

// ── Phase 105: Additional branch coverage ────────────────────────────────────

describe('AuditChain — sortedKeysReplacer (Phase 105)', () => {
  it('passes arrays through unchanged during hashing', async () => {
    const storage = new InMemoryAuditStorage();
    const chain = new AuditChain({ storage, signingKey: SIGNING_KEY });
    await chain.initialize();

    // Record entry with array in metadata — exercises sortedKeysReplacer's array branch
    const entry = await chain.record({
      event: 'test_array',
      level: 'info',
      message: 'array metadata',
      metadata: { tags: ['a', 'b', 'c'], nested: { list: [1, 2, 3] } },
    });
    expect(entry.metadata?.tags).toEqual(['a', 'b', 'c']);

    // Verify chain is still valid (hashing with arrays works correctly)
    const verification = await chain.verify();
    expect(verification.valid).toBe(true);
  });
});

describe('AuditChain — repair skip-path (Phase 105)', () => {
  it('repair() skips entries that already have correct signatures', async () => {
    const storage = new InMemoryAuditStorage();
    const chain = new AuditChain({ storage, signingKey: SIGNING_KEY });
    await chain.initialize();

    // Record a few valid entries
    await chain.record({ event: 'e1', level: 'info', message: 'first' });
    await chain.record({ event: 'e2', level: 'info', message: 'second' });
    await chain.record({ event: 'e3', level: 'info', message: 'third' });

    // Repair on an already-valid chain should repair 0 entries
    const result = await chain.repair();
    expect(result.repairedCount).toBe(0);
    expect(result.entriesTotal).toBe(3);
  });
});

describe('AuditChain — repairOnInit triggers repair (Phase 105)', () => {
  it('initialize() with repairOnInit: true triggers repair on broken chain', async () => {
    const storage = new InMemoryAuditStorage();
    const chain1 = new AuditChain({ storage, signingKey: SIGNING_KEY });
    await chain1.initialize();
    await chain1.record({ event: 'e1', level: 'info', message: 'ok' });
    await chain1.record({ event: 'e2', level: 'info', message: 'ok' });

    // Tamper with the first entry's signature
    let i = 0;
    for await (const entry of storage.iterate()) {
      if (i === 0) {
        entry.integrity.signature = 'tampered';
      }
      i++;
    }

    // Create a new chain with repairOnInit that will detect and fix the broken sig
    const chain2 = new AuditChain({ storage, signingKey: SIGNING_KEY, repairOnInit: true });
    await chain2.initialize();

    // Verify the chain is now valid
    const verification = await chain2.verify();
    expect(verification.valid).toBe(true);
  });
});

describe('AuditChain — verify error handling (Phase 105)', () => {
  it('verify() returns error when iteration throws', async () => {
    // Create a storage that throws during iteration
    const errorStorage: InstanceType<typeof InMemoryAuditStorage> = {
      append: async () => {},
      getLast: async () => null,
      count: async () => 0,
      getById: async () => null,
      updateIntegrity: async () => {},
      query: async () => ({ entries: [], total: 0, limit: 50, offset: 0 }),
      async *iterate() {
        throw new Error('storage corruption');
      },
    } as any;

    const chain = new AuditChain({ storage: errorStorage, signingKey: SIGNING_KEY });
    await chain.initialize();

    const result = await chain.verify();
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/storage corruption/);
  });
});

describe('AuditChain — record() schema validation (Phase 105)', () => {
  it('record() schema validation failure throws descriptive error', async () => {
    const storage = new InMemoryAuditStorage();
    const chain = new AuditChain({ storage, signingKey: SIGNING_KEY });
    await chain.initialize();

    // Record with an invalid level to trigger schema validation failure
    // AuditEntrySchema requires level to be one of: info, warn, error, critical, debug
    await expect(
      chain.record({ event: 'test', level: 'INVALID' as any, message: 'bad level' })
    ).rejects.toThrow(/Invalid audit entry/i);
  });
});
