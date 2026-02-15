/**
 * Rotation Storage — PostgreSQL-backed metadata and previous-value storage
 * for secret rotation grace periods.
 */

import { PgBaseStorage } from '../../storage/pg-base.js';
import type { SecretMetadata } from './types.js';

export class RotationStorage extends PgBaseStorage {
  constructor() {
    super();
  }

  async upsert(meta: SecretMetadata): Promise<void> {
    await this.query(
      `INSERT INTO rotation.secret_metadata
         (name, created_at, expires_at, rotated_at, rotation_interval_days, auto_rotate, source, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (name) DO UPDATE SET
         expires_at = $3,
         rotated_at = $4,
         rotation_interval_days = $5,
         auto_rotate = $6,
         source = $7,
         category = $8`,
      [
        meta.name,
        meta.createdAt,
        meta.expiresAt,
        meta.rotatedAt,
        meta.rotationIntervalDays,
        meta.autoRotate,
        meta.source,
        meta.category,
      ],
    );
  }

  async get(name: string): Promise<SecretMetadata | null> {
    const row = await this.queryOne<Record<string, unknown>>(
      'SELECT * FROM rotation.secret_metadata WHERE name = $1',
      [name],
    );
    return row ? this.rowToMeta(row) : null;
  }

  async getAll(): Promise<SecretMetadata[]> {
    const rows = await this.queryMany<Record<string, unknown>>(
      'SELECT * FROM rotation.secret_metadata ORDER BY name',
    );
    return rows.map((r) => this.rowToMeta(r));
  }

  async updateRotation(name: string, rotatedAt: number, expiresAt: number | null): Promise<void> {
    await this.query(
      'UPDATE rotation.secret_metadata SET rotated_at = $1, expires_at = $2 WHERE name = $3',
      [rotatedAt, expiresAt, name],
    );
  }

  async storePreviousValue(name: string, value: string, gracePeriodMs: number): Promise<void> {
    const now = Date.now();
    await this.query(
      `INSERT INTO rotation.previous_values (name, value, stored_at, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO UPDATE SET
         value = $2,
         stored_at = $3,
         expires_at = $4`,
      [name, value, now, now + gracePeriodMs],
    );
  }

  async getPreviousValue(name: string): Promise<string | null> {
    const row = await this.queryOne<{ value: string; expires_at: number }>(
      'SELECT value, expires_at FROM rotation.previous_values WHERE name = $1',
      [name],
    );

    if (!row) return null;

    // Expired?
    if (row.expires_at < Date.now()) {
      await this.clearPreviousValue(name);
      return null;
    }

    return row.value;
  }

  async clearPreviousValue(name: string): Promise<void> {
    await this.query(
      'DELETE FROM rotation.previous_values WHERE name = $1',
      [name],
    );
  }

  private rowToMeta(row: Record<string, unknown>): SecretMetadata {
    return {
      name: row.name as string,
      createdAt: row.created_at as number,
      expiresAt: (row.expires_at as number) ?? null,
      rotatedAt: (row.rotated_at as number) ?? null,
      rotationIntervalDays: (row.rotation_interval_days as number) ?? null,
      autoRotate: row.auto_rotate as boolean,
      source: row.source as 'internal' | 'external',
      category: row.category as SecretMetadata['category'],
    };
  }
}
