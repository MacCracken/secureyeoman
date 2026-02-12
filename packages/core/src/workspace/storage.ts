/**
 * Workspace Storage — SQLite persistence for team workspaces
 */

import Database from 'better-sqlite3';
import type { Workspace, WorkspaceCreate, WorkspaceMember } from '@friday/shared';
import { uuidv7 } from '../utils/crypto.js';

export class WorkspaceStorage {
  private db: Database.Database;

  constructor(opts: { dbPath: string }) {
    this.db = new Database(opts.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        settings TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workspace_members (
        workspace_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT DEFAULT 'member',
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (workspace_id, user_id),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      )
    `);
  }

  create(data: WorkspaceCreate): Workspace {
    const now = Date.now();
    const id = uuidv7();
    this.db.prepare('INSERT INTO workspaces (id, name, description, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      id, data.name, data.description ?? '', JSON.stringify(data.settings ?? {}), now, now
    );
    return { id, name: data.name, description: data.description ?? '', members: [], settings: data.settings ?? {}, createdAt: now, updatedAt: now };
  }

  get(id: string): Workspace | null {
    const row = this.db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    const members = this.getMembers(id);
    return { id: row.id as string, name: row.name as string, description: (row.description as string) ?? '', members, settings: JSON.parse((row.settings as string) || '{}'), createdAt: row.created_at as number, updatedAt: row.updated_at as number };
  }

  list(): Workspace[] {
    const rows = this.db.prepare('SELECT * FROM workspaces ORDER BY created_at DESC').all() as Record<string, unknown>[];
    return rows.map(r => {
      const members = this.getMembers(r.id as string);
      return { id: r.id as string, name: r.name as string, description: (r.description as string) ?? '', members, settings: JSON.parse((r.settings as string) || '{}'), createdAt: r.created_at as number, updatedAt: r.updated_at as number };
    });
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM workspaces WHERE id = ?').run(id).changes > 0;
  }

  addMember(workspaceId: string, userId: string, role = 'member'): WorkspaceMember {
    const now = Date.now();
    this.db.prepare('INSERT OR REPLACE INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(workspaceId, userId, role, now);
    return { userId, role: role as WorkspaceMember['role'], joinedAt: now };
  }

  removeMember(workspaceId: string, userId: string): boolean {
    return this.db.prepare('DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?').run(workspaceId, userId).changes > 0;
  }

  private getMembers(workspaceId: string): WorkspaceMember[] {
    const rows = this.db.prepare('SELECT * FROM workspace_members WHERE workspace_id = ?').all(workspaceId) as Record<string, unknown>[];
    return rows.map(r => ({ userId: r.user_id as string, role: r.role as WorkspaceMember['role'], joinedAt: r.joined_at as number }));
  }

  close(): void {
    this.db.close();
  }
}
