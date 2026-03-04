/**
 * PgBaseStorage — Base class for all PostgreSQL-backed storage classes.
 *
 * Provides query helpers and transaction support using the shared pool.
 */

import pg from 'pg';
import { getPool } from './pg-pool.js';
import { getLogger, createNoopLogger } from '../logging/logger.js';

export class PgBaseStorage {
  protected getPool(): pg.Pool {
    return getPool();
  }

  protected async query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<pg.QueryResult<T>> {
    return this.getPool().query<T>(text, values);
  }

  protected async queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<T | null> {
    const result = await this.getPool().query<T>(text, values);
    return result.rows[0] ?? null;
  }

  protected async queryMany<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<T[]> {
    const result = await this.getPool().query<T>(text, values);
    return result.rows;
  }

  protected async execute(text: string, values?: unknown[]): Promise<number> {
    const result = await this.getPool().query(text, values);
    return result.rowCount ?? 0;
  }

  protected async withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getPool().connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a function inside a transaction with tenant RLS context.
   * Sets app.current_tenant GUC (transaction-scoped) before running fn.
   */
  protected async withTenantContext<T>(
    tenantId: string,
    fn: (client: import('pg').PoolClient) => Promise<T>
  ): Promise<T> {
    return this.withTransaction(async (client) => {
      await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
      return fn(client);
    });
  }

  /**
   * Execute a function inside a transaction with row-level security bypassed.
   * Used for admin operations that must see all tenants' data.
   * Every invocation is audit-logged at warn level.
   */
  protected async bypassRls<T>(fn: (client: import('pg').PoolClient) => Promise<T>): Promise<T> {
    // Capture caller info for audit trail
    const stack = new Error().stack ?? '';
    const callerLine = stack.split('\n').slice(2, 3).join('').trim();
    let logger;
    try { logger = getLogger(); } catch { logger = createNoopLogger(); }
    logger.warn({ caller: callerLine, class: this.constructor.name }, 'RLS bypass executed');

    return this.withTransaction(async (client) => {
      await client.query('SET LOCAL row_security = off');
      return fn(client);
    });
  }

  /** No-op — pool lifecycle is managed globally via closePool(). */
  close(): void {
    // intentionally empty
  }
}
