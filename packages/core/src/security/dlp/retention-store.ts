/**
 * Retention Store — persistence layer for data retention policies.
 *
 * Also provides purge/count methods that operate on dlp.classifications
 * based on retention policy criteria.
 */

import { PgBaseStorage } from '../../storage/pg-base.js';
import { uuidv7 } from '../../utils/crypto.js';
import type { RetentionPolicy, ClassificationLevel } from './types.js';

export class RetentionStore extends PgBaseStorage {
  async create(
    policy: Omit<RetentionPolicy, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const id = uuidv7();
    const now = Date.now();
    await this.execute(
      `INSERT INTO dlp.retention_policies
         (id, content_type, retention_days, classification_level, enabled, last_purge_at, created_at, updated_at, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        policy.contentType,
        policy.retentionDays,
        policy.classificationLevel,
        policy.enabled,
        policy.lastPurgeAt,
        now,
        now,
        policy.tenantId,
      ]
    );
    return id;
  }

  async getByContentType(
    contentType: string,
    level?: ClassificationLevel
  ): Promise<RetentionPolicy | null> {
    const conditions = ['content_type = $1', 'enabled = true'];
    const values: unknown[] = [contentType];

    if (level) {
      conditions.push(`(classification_level = $${values.length + 1} OR classification_level IS NULL)`);
      values.push(level);
    }

    return this.queryOne<RetentionPolicy>(
      `SELECT id, content_type as "contentType", retention_days as "retentionDays",
              classification_level as "classificationLevel", enabled,
              last_purge_at as "lastPurgeAt", created_at as "createdAt",
              updated_at as "updatedAt", tenant_id as "tenantId"
       FROM dlp.retention_policies
       WHERE ${conditions.join(' AND ')}
       ORDER BY classification_level IS NOT NULL DESC, created_at DESC
       LIMIT 1`,
      values
    );
  }

  async list(): Promise<RetentionPolicy[]> {
    return this.queryMany<RetentionPolicy>(
      `SELECT id, content_type as "contentType", retention_days as "retentionDays",
              classification_level as "classificationLevel", enabled,
              last_purge_at as "lastPurgeAt", created_at as "createdAt",
              updated_at as "updatedAt", tenant_id as "tenantId"
       FROM dlp.retention_policies
       ORDER BY created_at DESC`
    );
  }

  async update(
    id: string,
    changes: Partial<Pick<RetentionPolicy, 'retentionDays' | 'enabled' | 'classificationLevel'>>
  ): Promise<number> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (changes.retentionDays !== undefined) {
      setClauses.push(`retention_days = $${idx++}`);
      values.push(changes.retentionDays);
    }
    if (changes.enabled !== undefined) {
      setClauses.push(`enabled = $${idx++}`);
      values.push(changes.enabled);
    }
    if (changes.classificationLevel !== undefined) {
      setClauses.push(`classification_level = $${idx++}`);
      values.push(changes.classificationLevel);
    }

    if (setClauses.length === 0) return 0;

    setClauses.push(`updated_at = $${idx++}`);
    values.push(Date.now());
    values.push(id);

    return this.execute(
      `UPDATE dlp.retention_policies SET ${setClauses.join(', ')} WHERE id = $${idx}`,
      values
    );
  }

  async delete(id: string): Promise<number> {
    return this.execute('DELETE FROM dlp.retention_policies WHERE id = $1', [id]);
  }

  async updateLastPurge(id: string, timestamp: number): Promise<void> {
    await this.execute(
      'UPDATE dlp.retention_policies SET last_purge_at = $1, updated_at = $2 WHERE id = $3',
      [timestamp, Date.now(), id]
    );
  }

  // ── Purge helpers (operate on dlp.classifications) ───────────────────

  /**
   * Delete classifications matching the policy criteria that are older
   * than the given cutoff timestamp.
   */
  async purgeClassifications(
    contentType: string,
    cutoff: number,
    classificationLevel?: ClassificationLevel | null,
  ): Promise<number> {
    const { conditions, values } = this.buildCriteria(contentType, cutoff, classificationLevel);
    return this.execute(
      `DELETE FROM dlp.classifications WHERE ${conditions.join(' AND ')}`,
      values
    );
  }

  /**
   * Count classifications that would be purged for the given criteria.
   */
  async countEligible(
    contentType: string,
    cutoff: number,
    classificationLevel?: ClassificationLevel | null,
  ): Promise<number> {
    const { conditions, values } = this.buildCriteria(contentType, cutoff, classificationLevel);
    const row = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM dlp.classifications WHERE ${conditions.join(' AND ')}`,
      values
    );
    return parseInt(row?.count ?? '0', 10);
  }

  private buildCriteria(
    contentType: string,
    cutoff: number,
    classificationLevel?: ClassificationLevel | null,
  ) {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    conditions.push(`content_type = $${idx++}`);
    values.push(contentType);

    conditions.push(`classified_at < $${idx++}`);
    values.push(cutoff);

    if (classificationLevel) {
      conditions.push(`classification_level = $${idx++}`);
      values.push(classificationLevel);
    }

    return { conditions, values };
  }
}
