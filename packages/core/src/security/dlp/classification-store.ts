/**
 * Classification Store — persistence layer for content classifications.
 */

import { PgBaseStorage } from '../../storage/pg-base.js';
import { generateId } from '../../utils/id.js';
import type { ClassificationRecord, ClassificationLevel, ClassificationRule } from './types.js';

export class ClassificationStore extends PgBaseStorage {
  async create(record: Omit<ClassificationRecord, 'id'>): Promise<string> {
    const id = generateId();
    await this.execute(
      `INSERT INTO dlp.classifications (id, content_id, content_type, classification_level, auto_level, manual_override, overridden_by, rules_triggered, classified_at, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        record.contentId,
        record.contentType,
        record.classificationLevel,
        record.autoLevel,
        record.manualOverride,
        record.overriddenBy,
        JSON.stringify(record.rulesTriggered),
        record.classifiedAt,
        record.tenantId,
      ]
    );
    return id;
  }

  async getByContentId(
    contentId: string,
    contentType: string
  ): Promise<ClassificationRecord | null> {
    return this.queryOne<ClassificationRecord>(
      `SELECT id, content_id as "contentId", content_type as "contentType",
              classification_level as "classificationLevel", auto_level as "autoLevel",
              manual_override as "manualOverride", overridden_by as "overriddenBy",
              rules_triggered as "rulesTriggered", classified_at as "classifiedAt",
              tenant_id as "tenantId"
       FROM dlp.classifications WHERE content_id = $1 AND content_type = $2
       ORDER BY classified_at DESC LIMIT 1`,
      [contentId, contentType]
    );
  }

  async override(
    contentId: string,
    contentType: string,
    level: ClassificationLevel,
    overriddenBy: string
  ): Promise<number> {
    return this.execute(
      `UPDATE dlp.classifications SET classification_level = $1, manual_override = true, overridden_by = $2
       WHERE content_id = $3 AND content_type = $4`,
      [level, overriddenBy, contentId, contentType]
    );
  }

  async list(opts: {
    level?: ClassificationLevel;
    contentType?: string;
    tenantId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ records: ClassificationRecord[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (opts.level) {
      conditions.push(`classification_level = $${idx++}`);
      values.push(opts.level);
    }
    if (opts.contentType) {
      conditions.push(`content_type = $${idx++}`);
      values.push(opts.contentType);
    }
    if (opts.tenantId) {
      conditions.push(`tenant_id = $${idx++}`);
      values.push(opts.tenantId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    const countResult = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM dlp.classifications ${where}`,
      values
    );
    const total = parseInt(countResult?.count ?? '0', 10);

    const records = await this.queryMany<ClassificationRecord>(
      `SELECT id, content_id as "contentId", content_type as "contentType",
              classification_level as "classificationLevel", auto_level as "autoLevel",
              manual_override as "manualOverride", overridden_by as "overriddenBy",
              rules_triggered as "rulesTriggered", classified_at as "classifiedAt",
              tenant_id as "tenantId"
       FROM dlp.classifications ${where}
       ORDER BY classified_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, limit, offset]
    );

    return { records, total };
  }
}
