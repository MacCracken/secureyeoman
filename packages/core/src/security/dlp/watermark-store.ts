/**
 * WatermarkStore — persistence layer for watermark records.
 */

import { PgBaseStorage } from '../../storage/pg-base.js';
import { generateId } from '../../utils/id.js';
import type { WatermarkRecord } from './types.js';

export class WatermarkStore extends PgBaseStorage {
  async record(watermark: Omit<WatermarkRecord, 'id'>): Promise<string> {
    const id = generateId();
    await this.execute(
      `INSERT INTO dlp.watermarks (id, content_id, content_type, watermark_data, algorithm, created_at, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        watermark.contentId,
        watermark.contentType,
        watermark.watermarkData,
        watermark.algorithm,
        watermark.createdAt,
        watermark.tenantId,
      ]
    );
    return id;
  }

  async getByContentId(contentId: string): Promise<WatermarkRecord | null> {
    return this.queryOne<WatermarkRecord>(
      `SELECT id, content_id as "contentId", content_type as "contentType",
              watermark_data as "watermarkData", algorithm,
              created_at as "createdAt", tenant_id as "tenantId"
       FROM dlp.watermarks WHERE content_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [contentId]
    );
  }

  async list(filters?: {
    tenantId?: string;
    algorithm?: string;
    fromTime?: number;
    toTime?: number;
    limit?: number;
    offset?: number;
  }): Promise<{ records: WatermarkRecord[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filters?.tenantId) {
      conditions.push(`tenant_id = $${idx++}`);
      values.push(filters.tenantId);
    }
    if (filters?.algorithm) {
      conditions.push(`algorithm = $${idx++}`);
      values.push(filters.algorithm);
    }
    if (filters?.fromTime != null) {
      conditions.push(`created_at >= $${idx++}`);
      values.push(filters.fromTime);
    }
    if (filters?.toTime != null) {
      conditions.push(`created_at <= $${idx++}`);
      values.push(filters.toTime);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    const countResult = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM dlp.watermarks ${where}`,
      values
    );
    const total = parseInt(countResult?.count ?? '0', 10);

    const records = await this.queryMany<WatermarkRecord>(
      `SELECT id, content_id as "contentId", content_type as "contentType",
              watermark_data as "watermarkData", algorithm,
              created_at as "createdAt", tenant_id as "tenantId"
       FROM dlp.watermarks ${where}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, limit, offset]
    );

    return { records, total };
  }
}
