/**
 * Dashboard Storage — PostgreSQL persistence for custom dashboard layouts
 */

import type { CustomDashboard, CustomDashboardCreate } from '@secureyeoman/shared';
import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';

export class DashboardStorage extends PgBaseStorage {
  constructor() {
    super();
  }

  async create(data: CustomDashboardCreate): Promise<CustomDashboard> {
    const now = Date.now();
    const id = uuidv7();
    const dashboard: CustomDashboard = {
      id,
      name: data.name,
      description: data.description ?? '',
      widgets: data.widgets ?? [],
      isDefault: data.isDefault ?? false,
      createdAt: now,
      updatedAt: now,
    };

    await this.execute(
      `INSERT INTO dashboard.custom_dashboards
        (id, name, description, widgets, is_default, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        dashboard.name,
        dashboard.description,
        JSON.stringify(dashboard.widgets),
        dashboard.isDefault,
        now,
        now,
      ]
    );

    return dashboard;
  }

  async get(id: string): Promise<CustomDashboard | null> {
    const row = await this.queryOne<Record<string, unknown>>(
      'SELECT * FROM dashboard.custom_dashboards WHERE id = $1',
      [id]
    );
    return row ? this.rowToDashboard(row) : null;
  }

  async list(opts?: {
    limit?: number;
    offset?: number;
  }): Promise<{ dashboards: CustomDashboard[]; total: number }> {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;

    const countResult = await this.queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM dashboard.custom_dashboards'
    );

    const rows = await this.queryMany<Record<string, unknown>>(
      'SELECT * FROM dashboard.custom_dashboards ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );

    return {
      dashboards: rows.map((r) => this.rowToDashboard(r)),
      total: parseInt(countResult?.count ?? '0', 10),
    };
  }

  async update(id: string, data: Partial<CustomDashboardCreate>): Promise<CustomDashboard | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    const updated = { ...existing, ...data, updatedAt: Date.now() };
    await this.execute(
      `UPDATE dashboard.custom_dashboards
       SET name = $1, description = $2, widgets = $3, is_default = $4, updated_at = $5
       WHERE id = $6`,
      [
        updated.name,
        updated.description,
        JSON.stringify(updated.widgets),
        updated.isDefault,
        updated.updatedAt,
        id,
      ]
    );

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const changes = await this.execute('DELETE FROM dashboard.custom_dashboards WHERE id = $1', [
      id,
    ]);
    return changes > 0;
  }

  private rowToDashboard(row: Record<string, unknown>): CustomDashboard {
    return {
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string) ?? '',
      widgets: row.widgets as CustomDashboard['widgets'],
      isDefault: row.is_default as boolean,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }
}
