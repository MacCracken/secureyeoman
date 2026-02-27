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
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on('error', (err: Error) => {
    getLogger().error('Unexpected PostgreSQL pool error', { error: err.message });
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

export function getPool(): pg.Pool {
  if (!pool) {
    throw new Error('PostgreSQL pool not initialized. Call initPool() first.');
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Reset pool reference (for testing) */
export function resetPool(): void {
  pool = null;
}
