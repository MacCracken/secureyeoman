/**
 * PgBaseStorage — Base class for all PostgreSQL-backed storage classes.
 *
 * Provides query helpers and transaction support using the shared pool.
 */

import pg from 'pg';
import { getPool } from './pg-pool.js';

export class PgBaseStorage {
  protected getPool(): pg.Pool {
    return getPool();
  }

  protected async query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<T>> {
    return this.getPool().query<T>(text, values);
  }

  protected async queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<T | null> {
    const result = await this.getPool().query<T>(text, values);
    return result.rows[0] ?? null;
  }

  protected async queryMany<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<T[]> {
    const result = await this.getPool().query<T>(text, values);
    return result.rows;
  }

  protected async execute(
    text: string,
    values?: unknown[],
  ): Promise<number> {
    const result = await this.getPool().query(text, values);
    return result.rowCount ?? 0;
  }

  protected async withTransaction<T>(
    fn: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
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

  /** No-op — pool lifecycle is managed globally via closePool(). */
  close(): void {
    // intentionally empty
  }
}
