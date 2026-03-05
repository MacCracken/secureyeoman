/**
 * DLP Policy Store — persistence layer for DLP policies.
 */

import { PgBaseStorage } from '../../storage/pg-base.js';
import { uuidv7 as generateId } from '../../utils/id.js';
import type { DlpPolicy, DlpPolicyRule, ClassificationLevel } from './types.js';

export interface DlpPolicyFilters {
  active?: boolean;
  appliesTo?: string;
  tenantId?: string;
  limit?: number;
  offset?: number;
}

export class DlpPolicyStore extends PgBaseStorage {
  async create(
    policy: Omit<DlpPolicy, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
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
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filters?.active !== undefined) {
      conditions.push(`enabled = $${idx++}`);
      values.push(filters.active);
    }
    if (filters?.appliesTo) {
      conditions.push(`$${idx++} = ANY(applies_to)`);
      values.push(filters.appliesTo);
    }
    if (filters?.tenantId) {
      conditions.push(`tenant_id = $${idx++}`);
      values.push(filters.tenantId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    const countResult = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM dlp.policies ${where}`,
      values
    );
    const total = parseInt(countResult?.count ?? '0', 10);

    const policies = await this.queryMany<DlpPolicy>(
      `SELECT id, name, description, enabled, rules, action,
              classification_levels as "classificationLevels",
              applies_to as "appliesTo",
              created_at as "createdAt", updated_at as "updatedAt",
              tenant_id as "tenantId"
       FROM dlp.policies ${where}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, limit, offset]
    );

    return { policies, total };
  }

  async update(
    id: string,
    changes: Partial<Pick<DlpPolicy, 'name' | 'description' | 'enabled' | 'rules' | 'action' | 'classificationLevels' | 'appliesTo'>>
  ): Promise<number> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (changes.name !== undefined) {
      sets.push(`name = $${idx++}`);
      values.push(changes.name);
    }
    if (changes.description !== undefined) {
      sets.push(`description = $${idx++}`);
      values.push(changes.description);
    }
    if (changes.enabled !== undefined) {
      sets.push(`enabled = $${idx++}`);
      values.push(changes.enabled);
    }
    if (changes.rules !== undefined) {
      sets.push(`rules = $${idx++}`);
      values.push(JSON.stringify(changes.rules));
    }
    if (changes.action !== undefined) {
      sets.push(`action = $${idx++}`);
      values.push(changes.action);
    }
    if (changes.classificationLevels !== undefined) {
      sets.push(`classification_levels = $${idx++}`);
      values.push(changes.classificationLevels);
    }
    if (changes.appliesTo !== undefined) {
      sets.push(`applies_to = $${idx++}`);
      values.push(changes.appliesTo);
    }

    if (sets.length === 0) return 0;

    sets.push(`updated_at = $${idx++}`);
    values.push(Date.now());

    values.push(id);
    return this.execute(
      `UPDATE dlp.policies SET ${sets.join(', ')} WHERE id = $${idx}`,
      values
    );
  }

  async delete(id: string): Promise<number> {
    return this.execute(
      `UPDATE dlp.policies SET enabled = false, updated_at = $1 WHERE id = $2`,
      [Date.now(), id]
    );
  }
}
