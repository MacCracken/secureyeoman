/**
 * Dashboard Storage — SQLite persistence for custom dashboard layouts
 */

import Database from 'better-sqlite3';
import type { CustomDashboard, CustomDashboardCreate } from '@friday/shared';
import { uuidv7 } from '../utils/crypto.js';

export class DashboardStorage {
  private db: Database.Database;

  constructor(opts: { dbPath: string }) {
    this.db = new Database(opts.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS custom_dashboards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        widgets TEXT DEFAULT '[]',
        is_default INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  }

  create(data: CustomDashboardCreate): CustomDashboard {
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

    this.db.prepare(`
      INSERT INTO custom_dashboards (id, name, description, widgets, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, dashboard.name, dashboard.description, JSON.stringify(dashboard.widgets), dashboard.isDefault ? 1 : 0, now, now);

    return dashboard;
  }

  get(id: string): CustomDashboard | null {
    const row = this.db.prepare('SELECT * FROM custom_dashboards WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToDashboard(row) : null;
  }

  list(): CustomDashboard[] {
    const rows = this.db.prepare('SELECT * FROM custom_dashboards ORDER BY created_at DESC').all() as Record<string, unknown>[];
    return rows.map(r => this.rowToDashboard(r));
  }

  update(id: string, data: Partial<CustomDashboardCreate>): CustomDashboard | null {
    const existing = this.get(id);
    if (!existing) return null;

    const updated = { ...existing, ...data, updatedAt: Date.now() };
    this.db.prepare(`
      UPDATE custom_dashboards SET name = ?, description = ?, widgets = ?, is_default = ?, updated_at = ? WHERE id = ?
    `).run(updated.name, updated.description, JSON.stringify(updated.widgets), updated.isDefault ? 1 : 0, updated.updatedAt, id);

    return updated;
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM custom_dashboards WHERE id = ?').run(id).changes > 0;
  }

  private rowToDashboard(row: Record<string, unknown>): CustomDashboard {
    return {
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string) ?? '',
      widgets: JSON.parse((row.widgets as string) || '[]'),
      isDefault: row.is_default === 1,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  close(): void {
    this.db.close();
  }
}
