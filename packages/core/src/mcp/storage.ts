/**
 * MCP Storage — SQLite persistence for MCP server configurations
 */

import Database from 'better-sqlite3';
import type { McpServerConfig, McpServerCreate } from '@friday/shared';
import { uuidv7 } from '../utils/crypto.js';

export class McpStorage {
  private db: Database.Database;

  constructor(opts: { dbPath: string }) {
    this.db = new Database(opts.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        transport TEXT DEFAULT 'stdio',
        command TEXT,
        args TEXT DEFAULT '[]',
        url TEXT,
        env TEXT DEFAULT '{}',
        enabled INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  }

  addServer(create: McpServerCreate): McpServerConfig {
    const now = Date.now();
    const id = uuidv7();
    const server: McpServerConfig = {
      id,
      name: create.name,
      description: create.description ?? '',
      transport: create.transport ?? 'stdio',
      command: create.command,
      args: create.args ?? [],
      url: create.url,
      env: create.env ?? {},
      enabled: create.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };

    this.db.prepare(`
      INSERT INTO mcp_servers (id, name, description, transport, command, args, url, env, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      server.id, server.name, server.description, server.transport,
      server.command ?? null, JSON.stringify(server.args), server.url ?? null,
      JSON.stringify(server.env), server.enabled ? 1 : 0, server.createdAt, server.updatedAt,
    );

    return server;
  }

  getServer(id: string): McpServerConfig | null {
    const row = this.db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToConfig(row) : null;
  }

  listServers(): McpServerConfig[] {
    const rows = this.db.prepare('SELECT * FROM mcp_servers ORDER BY created_at DESC').all() as Record<string, unknown>[];
    return rows.map((r) => this.rowToConfig(r));
  }

  updateServer(id: string, update: { enabled?: boolean }): boolean {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (update.enabled !== undefined) {
      fields.push('enabled = ?');
      values.push(update.enabled ? 1 : 0);
    }

    if (fields.length === 0) return false;

    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);

    const result = this.db.prepare(
      `UPDATE mcp_servers SET ${fields.join(', ')} WHERE id = ?`
    ).run(...values);
    return result.changes > 0;
  }

  deleteServer(id: string): boolean {
    const result = this.db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private rowToConfig(row: Record<string, unknown>): McpServerConfig {
    return {
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string) ?? '',
      transport: (row.transport as McpServerConfig['transport']) ?? 'stdio',
      command: row.command as string | undefined,
      args: JSON.parse((row.args as string) || '[]'),
      url: row.url as string | undefined,
      env: JSON.parse((row.env as string) || '{}'),
      enabled: row.enabled === 1,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  close(): void {
    this.db.close();
  }
}
