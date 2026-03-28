/**
 * Audit Chain — TypeScript wrapper for the Rust NAPI bindings.
 *
 * Provides an in-memory HMAC-SHA256 linked audit chain for tamper-evident logging.
 * Falls back to a pure JS implementation when native module is unavailable.
 */

import { native } from './index.js';
import { sha256, hmacSha256, secureCompare } from '../utils/crypto.js';
import { randomUUID } from 'node:crypto';

// ── Types ──────────────────────────────────────────────────────────────────

export interface NativeAuditEntry {
  id: string;
  correlation_id: string;
  event: string;
  level: string;
  message: string;
  user_id?: string;
  task_id?: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
  integrity: {
    version: string;
    signature: string;
    previous_entry_hash: string;
  };
}

export interface AuditVerifyResult {
  valid: boolean;
  error?: string;
}

// ── Native-backed functions ────────────────────────────────────────────────

export function auditChainCreate(chainId: string, signingKey: string): void {
  if (native?.auditChainCreate) {
    native.auditChainCreate(chainId, signingKey);
    return;
  }
  createChainJS(chainId, signingKey);
}

export function auditChainRecord(
  chainId: string,
  event: string,
  level: string,
  message: string,
  userId?: string,
  taskId?: string,
  metadata?: Record<string, unknown>
): NativeAuditEntry {
  if (native?.auditChainRecord) {
    const json = native.auditChainRecord(
      chainId,
      event,
      level,
      message,
      userId ?? null,
      taskId ?? null,
      metadata ? JSON.stringify(metadata) : null
    );
    return JSON.parse(json) as NativeAuditEntry;
  }
  return recordJS(chainId, event, level, message, userId, taskId, metadata);
}

export function auditChainVerify(chainId: string): AuditVerifyResult {
  if (native?.auditChainVerify) {
    return JSON.parse(native.auditChainVerify(chainId)) as AuditVerifyResult;
  }
  return verifyJS(chainId);
}

export function auditChainCount(chainId: string): number {
  if (native?.auditChainCount) {
    return native.auditChainCount(chainId);
  }
  return countJS(chainId);
}

export function auditChainLastHash(chainId: string): string {
  if (native?.auditChainLastHash) {
    return native.auditChainLastHash(chainId);
  }
  return lastHashJS(chainId);
}

export function auditChainRotateKey(chainId: string, newKey: string): void {
  if (native?.auditChainRotateKey) {
    native.auditChainRotateKey(chainId, newKey);
    return;
  }
  rotateKeyJS(chainId, newKey);
}

export function auditChainDestroy(chainId: string): boolean {
  if (native?.auditChainDestroy) {
    return native.auditChainDestroy(chainId);
  }
  return destroyJS(chainId);
}

// ── JS Fallback ────────────────────────────────────────────────────────────

const GENESIS_HASH = '0'.repeat(64);

interface JSChain {
  signingKey: string;
  lastHash: string;
  entries: NativeAuditEntry[];
}

const jsChains = new Map<string, JSChain>();

function getChain(chainId: string): JSChain {
  const chain = jsChains.get(chainId);
  if (!chain) throw new Error(`Chain not found: ${chainId}`);
  return chain;
}

function computeEntryHash(entry: NativeAuditEntry): string {
  const data: Record<string, unknown> = {
    correlationId: entry.correlation_id,
    event: entry.event,
    id: entry.id,
    level: entry.level,
    message: entry.message,
    timestamp: entry.timestamp,
  };
  if (entry.user_id !== undefined) data.userId = entry.user_id;
  if (entry.task_id !== undefined) data.taskId = entry.task_id;
  if (entry.metadata !== undefined) data.metadata = entry.metadata;
  return sha256(JSON.stringify(data));
}

function createChainJS(chainId: string, signingKey: string): void {
  jsChains.set(chainId, { signingKey, lastHash: GENESIS_HASH, entries: [] });
}

function recordJS(
  chainId: string,
  event: string,
  level: string,
  message: string,
  userId?: string,
  taskId?: string,
  metadata?: Record<string, unknown>
): NativeAuditEntry {
  const chain = getChain(chainId);
  const entry: NativeAuditEntry = {
    id: randomUUID().replace(/-/g, ''),
    correlation_id: randomUUID().replace(/-/g, ''),
    event,
    level,
    message,
    user_id: userId,
    task_id: taskId,
    metadata,
    timestamp: Date.now(),
    integrity: { version: '1.0.0', signature: '', previous_entry_hash: chain.lastHash },
  };

  const entryHash = computeEntryHash(entry);
  entry.integrity.signature = hmacSha256(`${entryHash}:${chain.lastHash}`, chain.signingKey);
  chain.lastHash = entryHash;
  chain.entries.push(entry);
  return entry;
}

function verifyJS(chainId: string): AuditVerifyResult {
  const chain = getChain(chainId);
  let prevHash = GENESIS_HASH;

  for (let i = 0; i < chain.entries.length; i++) {
    const entry = chain.entries[i]!;
    if (entry.integrity.previous_entry_hash !== prevHash) {
      return { valid: false, error: `Entry ${i} (${entry.id}): previous hash mismatch` };
    }
    const entryHash = computeEntryHash(entry);
    const expectedSig = hmacSha256(`${entryHash}:${prevHash}`, chain.signingKey);
    if (!secureCompare(entry.integrity.signature, expectedSig)) {
      return { valid: false, error: `Entry ${i} (${entry.id}): signature verification failed` };
    }
    prevHash = entryHash;
  }
  return { valid: true };
}

function countJS(chainId: string): number {
  return getChain(chainId).entries.length;
}

function lastHashJS(chainId: string): string {
  return getChain(chainId).lastHash;
}

function rotateKeyJS(chainId: string, newKey: string): void {
  const chain = getChain(chainId);
  recordJS(chainId, 'signing_key_rotation', 'info', 'Audit chain signing key rotated');
  chain.signingKey = newKey;
}

function destroyJS(chainId: string): boolean {
  return jsChains.delete(chainId);
}
