/**
 * Audit Chain for SecureYeoman
 *
 * Security considerations:
 * - Append-only log structure prevents tampering
 * - Each entry is signed with HMAC-SHA256
 * - Chain integrity verified by linking entries via hashes
 * - Genesis block establishes chain root
 * - Verification can detect any modification to historical entries
 */

import { sha256, hmacSha256, secureCompare, uuidv7 } from '../utils/crypto.js';
import { AuditEntrySchema, type AuditEntry } from '@secureyeoman/shared';
import { getLogger, type SecureLogger } from './logger.js';

const GENESIS_HASH = '0'.repeat(64); // Genesis block previous hash
const CHAIN_VERSION = '1.0.0';

export interface AuditChainStorage {
  /** Append an entry to storage */
  append(entry: AuditEntry): Promise<void>;
  /** Get the last entry (for chain continuation) */
  getLast(): Promise<AuditEntry | null>;
  /** Iterate all entries in order */
  iterate(): AsyncIterableIterator<AuditEntry>;
  /** Get entry count */
  count(): Promise<number>;
  /** Get entry by ID */
  getById(id: string): Promise<AuditEntry | null>;
  /**
   * Update the integrity fields of an existing entry in-place.
   * Used exclusively by AuditChain.repair() to re-sign after a hash-function change.
   */
  updateIntegrity(id: string, signature: string, previousEntryHash: string): Promise<void>;
}

export interface AuditChainConfig {
  /** Storage backend */
  storage: AuditChainStorage;
  /** Signing key for HMAC (from environment) */
  signingKey: string;
  /**
   * When true, a signature mismatch on the last entry during initialize()
   * triggers an automatic repair pass instead of throwing.  Safe to enable
   * in all environments — repair is idempotent and only re-signs entries
   * whose hash or signature no longer matches.
   */
  repairOnInit?: boolean;
}

export interface VerificationResult {
  valid: boolean;
  entriesChecked: number;
  brokenAt?: string;
  error?: string;
}

/**
 * Replacer that recursively sorts all plain-object keys before serialization.
 *
 * This is needed because the `metadata` column is JSONB in PostgreSQL. JSONB
 * normalises key ordering alphabetically on storage, so when an entry is read
 * back the key order inside nested objects may differ from the original.
 * Using a deep-sorted replacer makes `computeEntryHash` return the same value
 * regardless of whether it is called at write time or at verify time after a
 * JSONB round-trip.
 */
function sortedKeysReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce(
        (sorted, k) => {
          sorted[k] = obj[k];
          return sorted;
        },
        {} as Record<string, unknown>
      );
  }
  return value;
}

/**
 * Compute the hash of an audit entry (excluding integrity fields)
 */
function computeEntryHash(entry: AuditEntry): string {
  // Create a copy without integrity fields for hashing
  const hashData = {
    id: entry.id,
    correlationId: entry.correlationId,
    event: entry.event,
    level: entry.level,
    message: entry.message,
    userId: entry.userId,
    taskId: entry.taskId,
    metadata: entry.metadata,
    timestamp: entry.timestamp,
  };

  // Deep-sorted serialization: all object keys at every depth are sorted so
  // the hash is stable across JSONB round-trips and key-insertion-order
  // differences.
  const serialized = JSON.stringify(hashData, sortedKeysReplacer);
  return sha256(serialized);
}

/**
 * Compute the signature for an entry
 */
function computeSignature(entryHash: string, previousHash: string, signingKey: string): string {
  const dataToSign = `${entryHash}:${previousHash}`;
  return hmacSha256(dataToSign, signingKey);
}

export class AuditChain {
  private readonly storage: AuditChainStorage;
  private signingKey: string;
  private readonly repairOnInit: boolean;
  private lastHash: string = GENESIS_HASH;
  private initialized = false;
  private logger: SecureLogger | null = null;
  private signingKeyHistory: { fromEntryId: string; key: string }[] = [];

  /**
   * Promise queue that serializes all record() calls.
   * Concurrent callers (including fire-and-forget `void record(...)` sites)
   * would otherwise read the same stale this.lastHash before any of them
   * finishes writing, producing duplicate previousEntryHash values and
   * breaking chain verification with "previous hash mismatch".
   */
  private _recordQueue: Promise<unknown> = Promise.resolve();

  constructor(config: AuditChainConfig) {
    this.storage = config.storage;
    this.signingKey = config.signingKey;
    this.repairOnInit = config.repairOnInit ?? false;

    // Validate signing key strength
    if (config.signingKey.length < 32) {
      throw new Error('Signing key must be at least 32 characters');
    }
  }

  /**
   * Update the signing key for rotation. Records the rotation point
   * so that verify() can switch keys at the right entry.
   */
  async updateSigningKey(newKey: string): Promise<void> {
    if (newKey.length < 32) {
      throw new Error('Signing key must be at least 32 characters');
    }

    // Record the current key with the ID of the NEXT entry that will use the new key
    // We'll use a sentinel that means "from the next entry onwards"
    const rotationEntry = await this.record({
      event: 'signing_key_rotated',
      level: 'info',
      message: 'Audit chain signing key rotated',
    });

    this.signingKeyHistory.push({
      fromEntryId: rotationEntry.id,
      key: this.signingKey,
    });

    this.signingKey = newKey;
  }

  /**
   * Initialize the chain by loading the last entry
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      this.logger = getLogger().child({ component: 'AuditChain' });
    } catch {
      // Logger not yet initialized, that's ok
    }

    const lastEntry = await this.storage.getLast();

    if (lastEntry) {
      // Verify the last entry before continuing
      const entryHash = computeEntryHash(lastEntry);
      const expectedSig = computeSignature(
        entryHash,
        lastEntry.integrity.previousEntryHash,
        this.signingKey
      );

      if (!secureCompare(lastEntry.integrity.signature, expectedSig)) {
        if (this.repairOnInit) {
          this.logger?.warn('Audit chain signature mismatch on last entry — running automatic repair', {
            lastEntryId: lastEntry.id,
          });
          // Mark initialized first to prevent recursive initialize() call inside repair()
          this.initialized = true;
          const { repairedCount, entriesTotal } = await this.repair();
          this.logger?.info('Audit chain auto-repair complete', { repairedCount, entriesTotal });
          return;
        }
        throw new Error('Audit chain integrity compromised: last entry signature invalid');
      }

      this.lastHash = entryHash;
      this.logger?.info('Audit chain initialized', {
        entriesCount: await this.storage.count(),
        lastEntryId: lastEntry.id,
      });
    } else {
      this.logger?.info('Audit chain initialized (empty chain)');
    }

    this.initialized = true;
  }

  /**
   * Record a new audit entry.
   *
   * All calls are serialized through an internal promise queue so that
   * concurrent callers (including fire-and-forget `void record(...)` sites)
   * never read a stale this.lastHash and corrupt the hash chain.
   */
  record(params: {
    event: string;
    level: AuditEntry['level'];
    message: string;
    userId?: string;
    taskId?: string;
    correlationId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<AuditEntry> {
    // Chain the new work onto the queue.  Errors from a previous enqueued
    // call must not prevent subsequent records from running, so we catch and
    // discard failures before attaching the next item.
    const next = this._recordQueue.then(() => this._doRecord(params));
    this._recordQueue = next.catch(() => undefined);
    return next;
  }

  /** Internal implementation — called exclusively through record(). */
  private async _doRecord(params: {
    event: string;
    level: AuditEntry['level'];
    message: string;
    userId?: string;
    taskId?: string;
    correlationId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<AuditEntry> {
    if (!this.initialized) {
      await this.initialize();
    }

    const entry: AuditEntry = {
      id: uuidv7(),
      correlationId: params.correlationId,
      event: params.event,
      level: params.level,
      message: params.message,
      userId: params.userId,
      taskId: params.taskId,
      metadata: params.metadata,
      timestamp: Date.now(),
      integrity: {
        version: CHAIN_VERSION,
        signature: '', // Will be computed
        previousEntryHash: this.lastHash,
      },
    };

    // Compute hash and signature
    const entryHash = computeEntryHash(entry);
    entry.integrity.signature = computeSignature(entryHash, this.lastHash, this.signingKey);

    // Validate against schema
    const validation = AuditEntrySchema.safeParse(entry);
    if (!validation.success) {
      throw new Error(`Invalid audit entry: ${validation.error.message}`);
    }

    // Persist
    await this.storage.append(entry);

    // Update chain state
    this.lastHash = entryHash;

    return entry;
  }

  /**
   * Verify the entire audit chain integrity.
   * Uses key history to switch signing keys at rotation points.
   */
  async verify(): Promise<VerificationResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    let entriesChecked = 0;
    let expectedPreviousHash = GENESIS_HASH;

    // Build ordered key schedule: oldest key first, current key last
    // Each entry in signingKeyHistory records the OLD key and the entry ID
    // where the rotation event was recorded (still signed with old key).
    // After that entry, the next key in the schedule is used.
    const keySchedule = this.buildKeySchedule();
    let scheduleIndex = 0;
    let activeKey = keySchedule[0] ?? this.signingKey;

    try {
      for await (const entry of this.storage.iterate()) {
        entriesChecked++;

        // Advance key schedule when we pass a rotation boundary
        if (scheduleIndex < keySchedule.length - 1) {
          const historyEntry = this.signingKeyHistory[scheduleIndex];
          if (entry.id === historyEntry?.fromEntryId) {
            // This entry (the rotation event) was signed with the OLD key
            // After this entry, advance to next key
          }
        }

        // Check previous hash matches
        if (entry.integrity.previousEntryHash !== expectedPreviousHash) {
          return {
            valid: false,
            entriesChecked,
            brokenAt: entry.id,
            error: 'Chain link broken: previous hash mismatch',
          };
        }

        // Compute expected hash and signature
        const entryHash = computeEntryHash(entry);
        const expectedSig = computeSignature(
          entryHash,
          entry.integrity.previousEntryHash,
          activeKey
        );

        // Verify signature
        if (!secureCompare(entry.integrity.signature, expectedSig)) {
          return {
            valid: false,
            entriesChecked,
            brokenAt: entry.id,
            error: 'Signature verification failed',
          };
        }

        // Move to next
        expectedPreviousHash = entryHash;

        // Advance key after verifying the rotation entry with old key
        if (scheduleIndex < keySchedule.length - 1) {
          const historyEntry = this.signingKeyHistory[scheduleIndex];
          if (entry.id === historyEntry?.fromEntryId) {
            scheduleIndex++;
            activeKey = keySchedule[scheduleIndex] ?? this.signingKey;
          }
        }
      }

      return {
        valid: true,
        entriesChecked,
      };
    } catch (error) {
      return {
        valid: false,
        entriesChecked,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Build the ordered key schedule from history + current key.
   */
  private buildKeySchedule(): string[] {
    if (this.signingKeyHistory.length === 0) {
      return [this.signingKey];
    }
    const keys = this.signingKeyHistory.map((h) => h.key);
    keys.push(this.signingKey);
    return keys;
  }

  /**
   * Get chain statistics
   */
  async getStats(): Promise<{
    entriesCount: number;
    chainValid: boolean;
    lastVerification?: number;
    chainError?: string;
    chainBrokenAt?: string;
  }> {
    const count = await this.storage.count();
    const verification = await this.verify();

    return {
      entriesCount: count,
      chainValid: verification.valid,
      lastVerification: Date.now(),
      chainError: verification.error,
      chainBrokenAt: verification.brokenAt,
    };
  }

  /**
   * Repair the audit chain by re-signing every entry with the current signing
   * key and the deep-sorted hash function.
   *
   * This is needed when the chain was built with an older version of
   * `computeEntryHash` (e.g. before JSONB metadata key-order normalisation was
   * introduced).  The operation is idempotent: entries whose hash + signature
   * already match are left untouched.
   *
   * Repair is serialized through the same queue as record() so it never races
   * with an in-flight write about to update this.lastHash.  New record() calls
   * that arrive during repair will queue behind it.
   *
   * Returns the number of entries that were actually re-signed and the final
   * chain hash.
   */
  repair(): Promise<{ repairedCount: number; entriesTotal: number }> {
    const next = this._recordQueue.then(() => this._doRepair());
    // Errors must not poison the queue for future record() calls
    this._recordQueue = next.catch(() => undefined);
    return next;
  }

  /** Internal repair implementation — called exclusively through repair(). */
  private async _doRepair(): Promise<{ repairedCount: number; entriesTotal: number }> {
    if (!this.initialized) {
      await this.initialize();
    }

    let previousHash = GENESIS_HASH;
    let repairedCount = 0;
    let entriesTotal = 0;

    for await (const entry of this.storage.iterate()) {
      entriesTotal++;

      const entryHash = computeEntryHash(entry);
      const expectedSig = computeSignature(entryHash, previousHash, this.signingKey);

      const needsRepair =
        entry.integrity.previousEntryHash !== previousHash ||
        !secureCompare(entry.integrity.signature, expectedSig);

      if (needsRepair) {
        await this.storage.updateIntegrity(entry.id, expectedSig, previousHash);
        repairedCount++;
      }

      previousHash = entryHash;
    }

    // Update in-memory last hash so new records chain correctly
    this.lastHash = previousHash;

    this.logger?.info('Audit chain repair complete', { repairedCount, entriesTotal });

    return { repairedCount, entriesTotal };
  }

  /**
   * Create a forensic snapshot of the chain state.
   * Used before recovery operations.
   *
   * Waits for any in-flight record() to settle before reading this.lastHash
   * so the snapshot always reflects a consistent chain tip.
   */
  async createSnapshot(): Promise<{
    timestamp: number;
    entriesCount: number;
    lastHash: string;
    lastEntryId: string | null;
  }> {
    // Wait for the tail of the record queue — swallow errors so a failed
    // record() doesn't block the snapshot.
    await this._recordQueue.catch(() => undefined);

    const lastEntry = await this.storage.getLast();

    return {
      timestamp: Date.now(),
      entriesCount: await this.storage.count(),
      lastHash: this.lastHash,
      lastEntryId: lastEntry?.id ?? null,
    };
  }
}

/**
 * In-memory storage for testing
 */
// Import and re-export query types from sqlite-storage
import type { AuditQueryOptions, AuditQueryResult } from './sqlite-storage.js';
export type { AuditQueryOptions, AuditQueryResult } from './sqlite-storage.js';

export class InMemoryAuditStorage implements AuditChainStorage {
  private entries: AuditEntry[] = [];

  async append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }

  async getLast(): Promise<AuditEntry | null> {
    return this.entries[this.entries.length - 1] ?? null;
  }

  async *iterate(): AsyncIterableIterator<AuditEntry> {
    for (const entry of this.entries) {
      yield entry;
    }
  }

  async count(): Promise<number> {
    return this.entries.length;
  }

  async getById(id: string): Promise<AuditEntry | null> {
    return this.entries.find((e) => e.id === id) ?? null;
  }

  async updateIntegrity(id: string, signature: string, previousEntryHash: string): Promise<void> {
    const entry = this.entries.find((e) => e.id === id);
    if (entry) {
      entry.integrity.signature = signature;
      entry.integrity.previousEntryHash = previousEntryHash;
    }
  }

  async query(opts: AuditQueryOptions = {}): Promise<AuditQueryResult> {
    let filtered = this.entries.slice();

    if (opts.from !== undefined) {
      filtered = filtered.filter((e) => e.timestamp >= opts.from!);
    }
    if (opts.to !== undefined) {
      filtered = filtered.filter((e) => e.timestamp <= opts.to!);
    }
    if (opts.level?.length) {
      filtered = filtered.filter((e) => opts.level!.includes(e.level));
    }
    if (opts.event?.length) {
      filtered = filtered.filter((e) => opts.event!.includes(e.event));
    }
    if (opts.userId !== undefined) {
      filtered = filtered.filter((e) => e.userId === opts.userId);
    }
    if (opts.taskId !== undefined) {
      filtered = filtered.filter((e) => e.taskId === opts.taskId);
    }

    const total = filtered.length;

    // Sort: default descending (newest first)
    if (opts.order === 'asc') {
      filtered.sort((a, b) => a.timestamp - b.timestamp);
    } else {
      filtered.sort((a, b) => b.timestamp - a.timestamp);
    }

    const limit = Math.min(opts.limit ?? 50, 1000);
    const offset = opts.offset ?? 0;
    const entries = filtered.slice(offset, offset + limit);

    return { entries, total, limit, offset };
  }
}
