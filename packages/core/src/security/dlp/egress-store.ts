/**
 * Egress Store — persistence layer for DLP egress log entries.
 */

import { PgBaseStorage } from '../../storage/pg-base.js';
import { buildWhere, parseCount } from '../../storage/query-helpers.js';
import { uuidv7 as generateId } from '../../utils/id.js';
import type { EgressEvent, DlpFinding } from './types.js';

export interface EgressQueryFilters {
  destinationType?: string;
  actionTaken?: 'allowed' | 'blocked' | 'warned';
  fromTime?: number;
  toTime?: number;
  tenantId?: string;
  limit?: number;
  offset?: number;
}

export class EgressStore extends PgBaseStorage {
  async record(event: Omit<EgressEvent, 'id' | 'createdAt'>): Promise<string> {
    const id = generateId();
    const now = Date.now();
    await this.execute(
      `INSERT INTO dlp.egress_log (id, destination_type, destination_id, content_hash, classification_level, bytes_sent, policy_id, action_taken, scan_findings, user_id, personality_id, created_at, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id,
        event.destinationType,
        event.destinationId,
        event.contentHash,
        event.classificationLevel,
        event.bytesSent,
        event.policyId,
        event.actionTaken,
        JSON.stringify(event.scanFindings),
        event.userId,
        event.personalityId,
        now,
        event.tenantId,
      ]
    );
    return id;
  }

  async queryEgress(
    filters?: EgressQueryFilters
  ): Promise<{ events: EgressEvent[]; total: number }> {
    const { where, values, nextIdx } = buildWhere([
      { column: 'destination_type', value: filters?.destinationType },
      { column: 'action_taken', value: filters?.actionTaken },
      { column: 'created_at', value: filters?.fromTime, op: '>=' },
      { column: 'created_at', value: filters?.toTime, op: '<=' },
      { column: 'tenant_id', value: filters?.tenantId },
    ]);

    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    const countResult = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM dlp.egress_log ${where}`,
      values
    );
    const total = parseCount(countResult);

    const events = await this.queryMany<EgressEvent>(
      `SELECT id, destination_type as "destinationType", destination_id as "destinationId",
              content_hash as "contentHash", classification_level as "classificationLevel",
              bytes_sent as "bytesSent", policy_id as "policyId",
              action_taken as "actionTaken", scan_findings as "scanFindings",
              user_id as "userId", personality_id as "personalityId",
              created_at as "createdAt", tenant_id as "tenantId"
       FROM dlp.egress_log ${where}
       ORDER BY created_at DESC
       LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
      [...values, limit, offset]
    );

    return { events, total };
  }
}
