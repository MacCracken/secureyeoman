/**
 * PostgreSQL Connection Pool — Singleton pool shared by all storage classes.
 */

import pg from 'pg';
import type { DatabaseConfig } from '@friday/shared';

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
}

export function initPool(config: PgPoolConfig): pg.Pool {
  if (pool) {
    return pool;
  }

  pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    max: config.poolSize,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on('error', (err: Error) => {
    console.error('Unexpected PostgreSQL pool error', err);
  });

  return pool;
}

export function initPoolFromConfig(dbConfig: DatabaseConfig): pg.Pool {
  const password = process.env[dbConfig.passwordEnv] ?? 'friday_dev';
  const host = process.env.DATABASE_HOST ?? dbConfig.host;
  return initPool({
    host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password,
    ssl: dbConfig.ssl,
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
