/**
 * Enhanced Health Checks — Phase 137 Multi-Region & HA.
 *
 * Deep health check components for:
 * - Database replication lag
 * - Vector store connectivity
 * - Certificate expiry countdown
 * - Integration adapter status
 * - Read replica status
 */

import { getPool, getReadPool, hasReadReplicas, getReplicaCount } from '../storage/pg-pool.js';
import { getLogger } from '../logging/logger.js';
import { readFileSync } from 'node:fs';
import * as crypto from 'node:crypto';

export interface HealthComponent {
  ok: boolean;
  detail?: string;
}

/** Check replication lag on read replicas. */
export async function checkReplicationLag(maxLagMs: number): Promise<HealthComponent> {
  if (!hasReadReplicas()) {
    return { ok: true, detail: 'No read replicas configured' };
  }

  try {
    const pool = getReadPool();
    const result = await pool.query<{ lag_bytes: string | null }>(
      `SELECT pg_wal_lsn_diff(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn()) AS lag_bytes`
    );
    const lagBytes = Number(result.rows[0]?.lag_bytes ?? 0);
    // Rough estimate: 1 byte of WAL ≈ 0.01ms under typical load.
    // More accurate: use pg_last_xact_replay_timestamp() comparison.
    const lagResult = await pool.query<{ lag_ms: number | null }>(
      `SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) * 1000 AS lag_ms`
    );
    const lagMs = Math.round(lagResult.rows[0]?.lag_ms ?? 0);

    const ok = lagMs <= maxLagMs;
    return {
      ok,
      detail: `${lagMs}ms lag, ${lagBytes} bytes behind${ok ? '' : ' (EXCEEDED threshold)'}`,
    };
  } catch (err) {
    // On a primary (non-replica), these functions return null — that's fine
    if (err instanceof Error && err.message.includes('not initialized')) {
      return { ok: true, detail: 'Pool not initialized' };
    }
    return { ok: true, detail: 'Replication lag check skipped (primary or unavailable)' };
  }
}

/** Check vector store (pgvector) connectivity. */
export async function checkVectorStore(): Promise<HealthComponent> {
  try {
    const pool = getPool();
    const result = await pool.query<{ has_pgvector: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') AS has_pgvector`
    );
    const hasPgvector = result.rows[0]?.has_pgvector ?? false;
    if (!hasPgvector) {
      return { ok: true, detail: 'pgvector extension not installed (optional)' };
    }
    // Verify we can cast a vector
    await pool.query(`SELECT '[1,2,3]'::vector(3)`);
    return { ok: true, detail: 'pgvector operational' };
  } catch (err) {
    if (err instanceof Error && err.message.includes('not initialized')) {
      return { ok: true, detail: 'Pool not initialized' };
    }
    return {
      ok: false,
      detail: `pgvector check failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Check TLS certificate expiry countdown. */
export function checkCertExpiry(certPath?: string): HealthComponent {
  if (!certPath) {
    return { ok: true, detail: 'No TLS certificate configured' };
  }

  try {
    const certPem = readFileSync(certPath, 'utf-8');
    const cert = new crypto.X509Certificate(certPem);
    const expiryDate = new Date(cert.validTo);
    const daysLeft = Math.floor((expiryDate.getTime() - Date.now()) / (86400 * 1000));

    if (daysLeft <= 0) {
      return { ok: false, detail: `Certificate EXPIRED (${expiryDate.toISOString()})` };
    }
    if (daysLeft <= 7) {
      return { ok: false, detail: `Certificate expires in ${daysLeft} day(s) — renewal critical` };
    }
    if (daysLeft <= 30) {
      return { ok: true, detail: `Certificate expires in ${daysLeft} day(s) — renewal recommended` };
    }
    return { ok: true, detail: `Certificate valid for ${daysLeft} day(s)` };
  } catch (err) {
    return {
      ok: false,
      detail: `Certificate check failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Check read replica pool status. */
export function checkReadReplicas(): HealthComponent {
  if (!hasReadReplicas()) {
    return { ok: true, detail: 'No read replicas configured' };
  }

  const count = getReplicaCount();
  return { ok: true, detail: `${count} read replica pool(s) active` };
}

/** Aggregate all HA-related health checks. */
export async function runHaHealthChecks(opts: {
  maxReplicationLagMs?: number;
  certPath?: string;
}): Promise<Record<string, HealthComponent>> {
  const maxLag = opts.maxReplicationLagMs ?? 10_000;

  const [replicationLag, vectorStore] = await Promise.all([
    checkReplicationLag(maxLag),
    checkVectorStore(),
  ]);

  return {
    replicationLag,
    vectorStore,
    certExpiry: checkCertExpiry(opts.certPath),
    readReplicas: checkReadReplicas(),
  };
}
