/**
 * AlertStorage (Phase 83 — Observability)
 *
 * PostgreSQL-backed CRUD for alert rules in telemetry.alert_rules.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';

export interface AlertChannel {
  type: 'slack' | 'pagerduty' | 'opsgenie' | 'webhook' | 'ntfy';
  url?: string;
  routingKey?: string;
}

export interface AlertRule {
  id: string;
  name: string;
  description?: string;
  metricPath: string;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  threshold: number;
  channels: AlertChannel[];
  enabled: boolean;
  cooldownSeconds: number;
  lastFiredAt?: number;
  createdAt: number;
  updatedAt: number;
}

export type CreateAlertRuleData = Omit<AlertRule, 'id' | 'lastFiredAt' | 'createdAt' | 'updatedAt'>;

interface AlertRuleRow {
  id: string;
  name: string;
  description: string | null;
  metric_path: string;
  operator: string;
  threshold: number;
  channels: AlertChannel[] | string;
  enabled: boolean;
  cooldown_seconds: number;
  last_fired_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRule(row: AlertRuleRow): AlertRule {
  const channels =
    typeof row.channels === 'string' ? JSON.parse(row.channels) : (row.channels ?? []);
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    metricPath: row.metric_path,
    operator: row.operator as AlertRule['operator'],
    threshold: row.threshold,
    channels,
    enabled: row.enabled,
    cooldownSeconds: row.cooldown_seconds,
    lastFiredAt: row.last_fired_at ? Number(row.last_fired_at) : undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export class AlertStorage extends PgBaseStorage {
  async createRule(data: CreateAlertRuleData): Promise<AlertRule> {
    const id = uuidv7();
    const now = Date.now();
    const row = await this.queryOne<AlertRuleRow>(
      `INSERT INTO telemetry.alert_rules
         (id, name, description, metric_path, operator, threshold, channels,
          enabled, cooldown_seconds, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        id,
        data.name,
        data.description ?? null,
        data.metricPath,
        data.operator,
        data.threshold,
        JSON.stringify(data.channels ?? []),
        data.enabled,
        data.cooldownSeconds ?? 300,
        now,
        now,
      ]
    );
    if (!row) throw new Error('Failed to create alert rule');
    return rowToRule(row);
  }

  async getRule(id: string): Promise<AlertRule | null> {
    const row = await this.queryOne<AlertRuleRow>(
      'SELECT * FROM telemetry.alert_rules WHERE id = $1',
      [id]
    );
    return row ? rowToRule(row) : null;
  }

  async updateRule(id: string, patch: Partial<AlertRule>): Promise<AlertRule | null> {
    const existing = await this.getRule(id);
    if (!existing) return null;

    const merged = {
      name: patch.name ?? existing.name,
      description: patch.description !== undefined ? patch.description : existing.description,
      metricPath: patch.metricPath ?? existing.metricPath,
      operator: patch.operator ?? existing.operator,
      threshold: patch.threshold !== undefined ? patch.threshold : existing.threshold,
      channels: patch.channels ?? existing.channels,
      enabled: patch.enabled !== undefined ? patch.enabled : existing.enabled,
      cooldownSeconds: patch.cooldownSeconds ?? existing.cooldownSeconds,
    };

    const now = Date.now();
    const row = await this.queryOne<AlertRuleRow>(
      `UPDATE telemetry.alert_rules SET
         name=$2, description=$3, metric_path=$4, operator=$5,
         threshold=$6, channels=$7, enabled=$8, cooldown_seconds=$9, updated_at=$10
       WHERE id=$1 RETURNING *`,
      [
        id,
        merged.name,
        merged.description ?? null,
        merged.metricPath,
        merged.operator,
        merged.threshold,
        JSON.stringify(merged.channels),
        merged.enabled,
        merged.cooldownSeconds,
        now,
      ]
    );
    return row ? rowToRule(row) : null;
  }

  async deleteRule(id: string): Promise<boolean> {
    const count = await this.execute('DELETE FROM telemetry.alert_rules WHERE id = $1', [id]);
    return count > 0;
  }

  async listRules(onlyEnabled?: boolean): Promise<AlertRule[]> {
    const sql = onlyEnabled
      ? 'SELECT * FROM telemetry.alert_rules WHERE enabled = TRUE ORDER BY created_at ASC'
      : 'SELECT * FROM telemetry.alert_rules ORDER BY created_at ASC';
    const rows = await this.queryMany<AlertRuleRow>(sql);
    return rows.map(rowToRule);
  }

  async markFired(id: string, firedAt: number): Promise<void> {
    await this.execute('UPDATE telemetry.alert_rules SET last_fired_at=$2 WHERE id=$1', [
      id,
      firedAt,
    ]);
  }
}
