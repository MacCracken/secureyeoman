/**
 * SystemPreferencesStorage — PostgreSQL-backed key-value store for system-level settings.
 *
 * Uses the `system_preferences` table (migration 016).
 * Initial use: persisting the AI model default (model.provider, model.model).
 */

import { PgBaseStorage } from '../storage/pg-base.js';

interface PreferenceRow {
  key: string;
  value: string;
  updated_at: string; // BIGINT comes back as string from pg driver
}

export class SystemPreferencesStorage extends PgBaseStorage {
  async init(): Promise<void> {
    await this.execute(`
      CREATE TABLE IF NOT EXISTS system_preferences (
        key        TEXT    PRIMARY KEY,
        value      TEXT    NOT NULL,
        updated_at BIGINT  NOT NULL
      )
    `);
  }

  async get(key: string): Promise<string | null> {
    const row = await this.queryOne<PreferenceRow>(
      `SELECT key, value, updated_at FROM system_preferences WHERE key = $1`,
      [key]
    );
    return row?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.execute(
      `INSERT INTO system_preferences (key, value, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = $3`,
      [key, value, Date.now()]
    );
  }

  async delete(key: string): Promise<void> {
    await this.execute(`DELETE FROM system_preferences WHERE key = $1`, [key]);
  }

  async list(): Promise<{ key: string; value: string; updatedAt: number }[]> {
    const rows = await this.queryMany<PreferenceRow>(
      `SELECT key, value, updated_at FROM system_preferences ORDER BY key ASC`
    );
    return rows.map((row) => ({
      key: row.key,
      value: row.value,
      updatedAt: Number(row.updated_at),
    }));
  }
}
