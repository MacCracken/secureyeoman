/**
 * Lite Bootstrap — Minimal boot path for cold-start CLI commands.
 *
 * Loads only config + logger + DB pool. No gateway, no modules, no cron.
 * Callers can then instantiate only the specific storage/manager they need.
 *
 * Target: <1s cold start (vs ~5s full init).
 */

import { loadConfig, type LoadConfigOptions } from '../config/loader.js';
import { initializeLogger, createNoopLogger, type SecureLogger } from '../logging/logger.js';
import { initPoolFromConfig, closePool, getPool } from '../storage/pg-pool.js';
import { runMigrations } from '../storage/migrations/runner.js';
import type { Config } from '@secureyeoman/shared';
import type pg from 'pg';

export interface LiteContext {
  config: Config;
  logger: SecureLogger;
  pool: pg.Pool;
  cleanup: () => Promise<void>;
}

/**
 * Boot the minimal infrastructure needed for direct DB access.
 * Does NOT initialize any domain modules, gateway, or background workers.
 *
 * Usage:
 * ```ts
 * const ctx = await liteBootstrap();
 * try {
 *   const storage = new SomeStorage(ctx.pool);
 *   const result = await storage.query(...);
 * } finally {
 *   await ctx.cleanup();
 * }
 * ```
 */
export async function liteBootstrap(opts?: {
  configOptions?: LoadConfigOptions;
  skipMigrations?: boolean;
  poolSize?: number;
}): Promise<LiteContext> {
  const config = loadConfig(opts?.configOptions);

  let logger: SecureLogger;
  try {
    logger = initializeLogger(config.logging);
  } catch {
    logger = createNoopLogger();
  }

  // Override pool size for lite mode — default to 2 connections
  const dbConfig = { ...config.core.database };
  if (opts?.poolSize !== undefined) {
    dbConfig.poolSize = opts.poolSize;
  } else if (dbConfig.poolSize > 3) {
    dbConfig.poolSize = 2; // Lite mode: minimal connections
  }

  initPoolFromConfig(dbConfig);
  const pool = getPool();

  if (!opts?.skipMigrations) {
    await runMigrations();
  }

  return {
    config,
    logger,
    pool,
    cleanup: async () => {
      await closePool();
    },
  };
}
