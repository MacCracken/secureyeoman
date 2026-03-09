/**
 * WatermarkStore — persistence layer for watermark records.
 */

import { PgBaseStorage } from '../../storage/pg-base.js';
import { buildWhere, parseCount } from '../../storage/query-helpers.js';
import { uuidv7 as generateId } from '../../utils/id.js';
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
    const { where, values, nextIdx } = buildWhere([
      { column: 'tenant_id', value: filters?.tenantId },
      { column: 'algorithm', value: filters?.algorithm },
      { column: 'created_at', value: filters?.fromTime, op: '>=' },
      { column: 'created_at', value: filters?.toTime, op: '<=' },
    ]);

    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    const countResult = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM dlp.watermarks ${where}`,
      values
    );
    const total = parseCount(countResult);

    const records = await this.queryMany<WatermarkRecord>(
      `SELECT id, content_id as "contentId", content_type as "contentType",
              watermark_data as "watermarkData", algorithm,
              created_at as "createdAt", tenant_id as "tenantId"
       FROM dlp.watermarks ${where}
       ORDER BY created_at DESC
       LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
      [...values, limit, offset]
    );

    return { records, total };
  }
}
