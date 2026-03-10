/**
 * DLP Policy Store — persistence layer for DLP policies.
 */

import { PgBaseStorage } from '../../storage/pg-base.js';
import { buildSet, buildWhere, parseCount } from '../../storage/query-helpers.js';
import { uuidv7 as generateId } from '../../utils/id.js';
import type { DlpPolicy } from './types.js';

export interface DlpPolicyFilters {
  active?: boolean;
  appliesTo?: string;
  tenantId?: string;
  limit?: number;
  offset?: number;
}

export class DlpPolicyStore extends PgBaseStorage {
  async create(policy: Omit<DlpPolicy, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const id = generateId();
    const now = Date.now();
    await this.execute(
      `INSERT INTO dlp.policies (id, name, description, enabled, rules, action, classification_levels, applies_to, created_at, updated_at, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        policy.name,
        policy.description,
        policy.enabled,
        JSON.stringify(policy.rules),
        policy.action,
        policy.classificationLevels,
        policy.appliesTo,
        now,
        now,
        policy.tenantId,
      ]
    );
    return id;
  }

  async getById(id: string): Promise<DlpPolicy | null> {
    return this.queryOne<DlpPolicy>(
      `SELECT id, name, description, enabled, rules, action,
              classification_levels as "classificationLevels",
              applies_to as "appliesTo",
              created_at as "createdAt", updated_at as "updatedAt",
              tenant_id as "tenantId"
       FROM dlp.policies WHERE id = $1`,
      [id]
    );
  }

  async list(filters?: DlpPolicyFilters): Promise<{ policies: DlpPolicy[]; total: number }> {
    // Note: appliesTo uses "$N = ANY(column)" which inverts the normal column/param order,
    // so we handle it separately after the standard filters.
    const result = buildWhere([
      { column: 'enabled', value: filters?.active },
      { column: 'tenant_id', value: filters?.tenantId },
    ]);
    let { where } = result;
    const { values } = result;
    let nextIdx = result.nextIdx;

    if (filters?.appliesTo) {
      const clause = `$${nextIdx++} = ANY(applies_to)`;
      where = where ? `${where} AND ${clause}` : `WHERE ${clause}`;
      values.push(filters.appliesTo);
    }

    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    const countResult = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM dlp.policies ${where}`,
      values
    );
    const total = parseCount(countResult);

    const policies = await this.queryMany<DlpPolicy>(
      `SELECT id, name, description, enabled, rules, action,
              classification_levels as "classificationLevels",
              applies_to as "appliesTo",
              created_at as "createdAt", updated_at as "updatedAt",
              tenant_id as "tenantId"
       FROM dlp.policies ${where}
       ORDER BY created_at DESC
       LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
      [...values, limit, offset]
    );

    return { policies, total };
  }

  async update(
    id: string,
    changes: Partial<
      Pick<
        DlpPolicy,
        | 'name'
        | 'description'
        | 'enabled'
        | 'rules'
        | 'action'
        | 'classificationLevels'
        | 'appliesTo'
      >
    >
  ): Promise<number> {
    const { setClause, values, nextIdx, hasUpdates } = buildSet([
      { column: 'name', value: changes.name },
      { column: 'description', value: changes.description },
      { column: 'enabled', value: changes.enabled },
      { column: 'rules', value: changes.rules, json: true },
      { column: 'action', value: changes.action },
      { column: 'classification_levels', value: changes.classificationLevels },
      { column: 'applies_to', value: changes.appliesTo },
    ]);

    if (!hasUpdates) return 0;

    // Always update the timestamp when there are real changes
    values.push(Date.now());
    const fullSet = `${setClause}, updated_at = $${nextIdx}`;
    const whereIdx = nextIdx + 1;

    values.push(id);
    return this.execute(`UPDATE dlp.policies SET ${fullSet} WHERE id = $${whereIdx}`, values);
  }

  async delete(id: string): Promise<number> {
    return this.execute(`UPDATE dlp.policies SET enabled = false, updated_at = $1 WHERE id = $2`, [
      Date.now(),
      id,
    ]);
  }
}
