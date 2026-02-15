/**
 * MCP Storage — PostgreSQL persistence for MCP server configurations
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import type { McpServerConfig, McpServerCreate, McpToolDef } from '@friday/shared';
import { uuidv7 } from '../utils/crypto.js';

export interface McpFeatureConfig {
  exposeGit: boolean;
  exposeFilesystem: boolean;
}

const MCP_CONFIG_DEFAULTS: McpFeatureConfig = {
  exposeGit: false,
  exposeFilesystem: false,
};

export class McpStorage extends PgBaseStorage {
  constructor() {
    super();
  }

  async addServer(create: McpServerCreate): Promise<McpServerConfig> {
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

    await this.query(
      `INSERT INTO mcp.servers
         (id, name, description, transport, command, args, url, env, enabled, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        server.id,
        server.name,
        server.description,
        server.transport,
        server.command ?? null,
        JSON.stringify(server.args),
        server.url ?? null,
        JSON.stringify(server.env),
        server.enabled,
        server.createdAt,
        server.updatedAt,
      ],
    );

    return server;
  }

  async getServer(id: string): Promise<McpServerConfig | null> {
    const row = await this.queryOne<Record<string, unknown>>(
      'SELECT * FROM mcp.servers WHERE id = $1',
      [id],
    );
    return row ? this.rowToConfig(row) : null;
  }

  async findServerByName(name: string): Promise<McpServerConfig | null> {
    const row = await this.queryOne<Record<string, unknown>>(
      'SELECT * FROM mcp.servers WHERE name = $1',
      [name],
    );
    return row ? this.rowToConfig(row) : null;
  }

  async listServers(): Promise<McpServerConfig[]> {
    const rows = await this.queryMany<Record<string, unknown>>(
      'SELECT * FROM mcp.servers ORDER BY created_at DESC',
    );
    return rows.map((r) => this.rowToConfig(r));
  }

  async updateServer(id: string, update: { enabled?: boolean }): Promise<boolean> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let counter = 1;

    if (update.enabled !== undefined) {
      fields.push(`enabled = $${counter++}`);
      values.push(update.enabled);
    }

    if (fields.length === 0) return false;

    fields.push(`updated_at = $${counter++}`);
    values.push(Date.now());

    values.push(id);
    const rowCount = await this.execute(
      `UPDATE mcp.servers SET ${fields.join(', ')} WHERE id = $${counter}`,
      values,
    );
    return rowCount > 0;
  }

  async deleteServer(id: string): Promise<boolean> {
    const rowCount = await this.execute(
      'DELETE FROM mcp.servers WHERE id = $1',
      [id],
    );
    return rowCount > 0;
  }

  private rowToConfig(row: Record<string, unknown>): McpServerConfig {
    return {
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string) ?? '',
      transport: (row.transport as McpServerConfig['transport']) ?? 'stdio',
      command: row.command as string | undefined,
      args: (row.args as string[]) ?? [],
      url: row.url as string | undefined,
      env: (row.env as Record<string, string>) ?? {},
      enabled: row.enabled as boolean,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  /**
   * Persist tool manifests for a server. Replaces any existing tools.
   */
  async saveTools(
    serverId: string,
    serverName: string,
    tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>,
  ): Promise<void> {
    await this.withTransaction(async (client) => {
      await client.query('DELETE FROM mcp.server_tools WHERE server_id = $1', [serverId]);
      for (const t of tools) {
        await client.query(
          'INSERT INTO mcp.server_tools (server_id, name, description, input_schema) VALUES ($1, $2, $3, $4)',
          [serverId, t.name, t.description ?? '', JSON.stringify(t.inputSchema ?? {})],
        );
      }
    });
  }

  /**
   * Load persisted tools for a server.
   */
  async loadTools(serverId: string): Promise<McpToolDef[]> {
    const server = await this.getServer(serverId);
    if (!server) return [];
    const rows = await this.queryMany<Record<string, unknown>>(
      'SELECT * FROM mcp.server_tools WHERE server_id = $1',
      [serverId],
    );
    return rows.map((row) => ({
      name: row.name as string,
      description: (row.description as string) ?? '',
      inputSchema: (row.input_schema as Record<string, unknown>) ?? {},
      serverId,
      serverName: server.name,
    }));
  }

  /**
   * Delete persisted tools for a server.
   */
  async deleteTools(serverId: string): Promise<void> {
    await this.execute(
      'DELETE FROM mcp.server_tools WHERE server_id = $1',
      [serverId],
    );
  }

  async getConfig(): Promise<McpFeatureConfig> {
    const rows = await this.queryMany<{ key: string; value: string }>(
      'SELECT key, value FROM mcp.config',
    );
    const config = { ...MCP_CONFIG_DEFAULTS };
    for (const row of rows) {
      if (row.key in config) {
        (config as Record<string, unknown>)[row.key] = JSON.parse(row.value);
      }
    }
    return config;
  }

  async setConfig(partial: Partial<McpFeatureConfig>): Promise<McpFeatureConfig> {
    await this.withTransaction(async (client) => {
      for (const [key, value] of Object.entries(partial)) {
        if (value !== undefined) {
          await client.query(
            `INSERT INTO mcp.config (key, value) VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
            [key, JSON.stringify(value)],
          );
        }
      }
    });
    return this.getConfig();
  }
}
