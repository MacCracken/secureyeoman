/**
 * PostgreSQL Connection Pool — Singleton pool shared by all storage classes.
 */

import pg from 'pg';
import type { DatabaseConfig } from '@secureyeoman/shared';
import { getLogger } from '../logging/logger.js';

const { Pool, types } = pg;

// Parse BIGINT (OID 20) as JavaScript number instead of string.
// Safe for timestamps and counters (all our BIGINT usage fits in Number.MAX_SAFE_INTEGER).
types.setTypeParser(20, (val: string) => parseInt(val, 10));

let pool: pg.Pool | null = null;
let replicaPools: pg.Pool[] = [];
let nextReplicaIdx = 0;

export interface PgPoolConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  poolSize: number;
  /**
   * When `ssl` is true, controls whether the server certificate is verified.
   * Defaults to `true` (secure). Set to `false` only for local dev with
   * self-signed certificates via DATABASE_SSL_REJECT_UNAUTHORIZED=false.
   * NEVER disable in production — it defeats TLS entirely.
   */
  sslRejectUnauthorized?: boolean;
  /** Optional PEM-encoded CA certificate for mutual TLS or private CAs. */
  sslCa?: string;
  /**
   * Idle timeout in milliseconds. Default: 30_000 (30s).
   * Lite/CLI mode should use shorter values (e.g. 10_000).
   */
  idleTimeoutMillis?: number;
}

export function initPool(config: PgPoolConfig): pg.Pool {
  if (pool) {
    return pool;
  }

  const rejectUnauthorized = config.sslRejectUnauthorized ?? true;

  if (config.ssl && !rejectUnauthorized) {
    getLogger().warn(
      'PostgreSQL SSL certificate verification is DISABLED (DATABASE_SSL_REJECT_UNAUTHORIZED=false). ' +
        'This leaves database connections vulnerable to MITM attacks. ' +
        'Only use this setting for local development with self-signed certificates.'
    );
  }

  pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl
      ? {
          rejectUnauthorized,
          ...(config.sslCa ? { ca: config.sslCa } : {}),
        }
      : false,
    max: config.poolSize,
    idleTimeoutMillis: config.idleTimeoutMillis ?? 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 30_000,
    allowExitOnIdle: true,
  });

  pool.on('error', (err: Error) => {
    getLogger().error({ error: err.message }, 'Unexpected PostgreSQL pool error');
  });

  return pool;
}

export function initPoolFromConfig(dbConfig: DatabaseConfig): pg.Pool {
  const envPassword = process.env[dbConfig.passwordEnv];

  // In production, the DB password must be explicitly set via environment variable.
  // Fall back to the dev default only in non-production environments.
  if (!envPassword && process.env.NODE_ENV === 'production') {
    throw new Error(
      `Required environment variable ${dbConfig.passwordEnv} is not set. ` +
        `Database password must be explicitly configured in production.`
    );
  }

  const password = envPassword ?? 'secureyeoman_dev';
  const host = process.env.DATABASE_HOST ?? dbConfig.host;
  const user = process.env.DATABASE_USER ?? dbConfig.user;
  const database = process.env.DATABASE_NAME ?? dbConfig.database;

  // SSL certificate verification. Default: enabled (secure).
  // Override with DATABASE_SSL_REJECT_UNAUTHORIZED=false for dev self-signed certs.
  const sslRejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';
  const sslCa = process.env.DATABASE_CA ?? undefined;

  return initPool({
    host,
    port: dbConfig.port,
    database,
    user,
    password,
    ssl: dbConfig.ssl,
    sslRejectUnauthorized,
    sslCa,
    poolSize: dbConfig.poolSize,
  });
}

/**
 * Initialize read replica connection pools.
 * Called after initPool() with replica host configurations.
 */
export function initReplicaPools(
  replicas: { host: string; port?: number }[],
  baseConfig: PgPoolConfig,
  replicaPoolSize = 5
): void {
  for (const replica of replicas) {
    const replicaPool = new Pool({
      host: replica.host,
      port: replica.port ?? baseConfig.port,
      database: baseConfig.database,
      user: baseConfig.user,
      password: baseConfig.password,
      ssl: baseConfig.ssl
        ? {
            rejectUnauthorized: baseConfig.sslRejectUnauthorized ?? true,
            ...(baseConfig.sslCa ? { ca: baseConfig.sslCa } : {}),
          }
        : false,
      max: replicaPoolSize,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 30_000,
      allowExitOnIdle: true,
    });

    replicaPool.on('error', (err: Error) => {
      getLogger().error({
        error: err.message,
        host: replica.host,
      }, 'Unexpected PostgreSQL replica pool error');
    });

    replicaPools.push(replicaPool);
  }

  if (replicaPools.length > 0) {
    getLogger().info(`Initialized ${replicaPools.length} read replica pool(s)`);
  }
}

export function getPool(): pg.Pool {
  if (!pool) {
    throw new Error('PostgreSQL pool not initialized. Call initPool() first.');
  }
  return pool;
}

/**
 * Get a read replica pool (round-robin). Falls back to primary if no replicas configured.
 * Use this for read-only queries (brain search, audit reads, dashboard stats).
 */
export function getReadPool(): pg.Pool {
  if (replicaPools.length === 0) {
    return getPool(); // Fall back to primary
  }
  const idx = nextReplicaIdx % replicaPools.length;
  nextReplicaIdx = (nextReplicaIdx + 1) % replicaPools.length;
  return replicaPools[idx]!;
}

/** Check if read replicas are configured. */
export function hasReadReplicas(): boolean {
  return replicaPools.length > 0;
}

/** Get count of configured read replica pools. */
export function getReplicaCount(): number {
  return replicaPools.length;
}

export async function closePool(): Promise<void> {
  // Close replica pools first
  for (const rp of replicaPools) {
    await rp.end();
  }
  replicaPools = [];
  nextReplicaIdx = 0;

  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Reset pool reference (for testing) */
export function resetPool(): void {
  pool = null;
  replicaPools = [];
  nextReplicaIdx = 0;
}
