/**
 * MCP Storage — PostgreSQL persistence for MCP server configurations
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import type {
  McpServerConfig,
  McpServerCreate,
  McpToolDef,
  McpServerHealth,
} from '@secureyeoman/shared';
import { uuidv7 } from '../utils/crypto.js';

export interface McpFeatureConfig {
  exposeGit: boolean;
  exposeFilesystem: boolean;
  exposeWeb: boolean;
  exposeWebScraping: boolean;
  exposeWebSearch: boolean;
  exposeBrowser: boolean;
  // Web scraper configuration (Phase 13)
  allowedUrls: string[];
  webRateLimitPerMinute: number;
  proxyEnabled: boolean;
  proxyProviders: string[];
  proxyStrategy: string;
  proxyDefaultCountry: string;
}

const MCP_CONFIG_DEFAULTS: McpFeatureConfig = {
  exposeGit: false,
  exposeFilesystem: false,
  exposeWeb: false,
  exposeWebScraping: true,
  exposeWebSearch: true,
  exposeBrowser: false,
  allowedUrls: [],
  webRateLimitPerMinute: 10,
  proxyEnabled: false,
  proxyProviders: [],
  proxyStrategy: 'round-robin',
  proxyDefaultCountry: '',
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
      ]
    );

    return server;
  }

  async getServer(id: string): Promise<McpServerConfig | null> {
    const row = await this.queryOne<Record<string, unknown>>(
      'SELECT * FROM mcp.servers WHERE id = $1',
      [id]
    );
    return row ? this.rowToConfig(row) : null;
  }

  async findServerByName(name: string): Promise<McpServerConfig | null> {
    const row = await this.queryOne<Record<string, unknown>>(
      'SELECT * FROM mcp.servers WHERE name = $1',
      [name]
    );
    return row ? this.rowToConfig(row) : null;
  }

  async listServers(opts?: {
    limit?: number;
    offset?: number;
  }): Promise<{ servers: McpServerConfig[]; total: number }> {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;

    const countResult = await this.queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM mcp.servers'
    );

    const rows = await this.queryMany<Record<string, unknown>>(
      'SELECT * FROM mcp.servers ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );

    return {
      servers: rows.map((r) => this.rowToConfig(r)),
      total: parseInt(countResult?.count ?? '0', 10),
    };
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
      values
    );
    return rowCount > 0;
  }

  async deleteServer(id: string): Promise<boolean> {
    const rowCount = await this.execute('DELETE FROM mcp.servers WHERE id = $1', [id]);
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
    tools: { name: string; description?: string; inputSchema?: Record<string, unknown> }[]
  ): Promise<void> {
    await this.withTransaction(async (client) => {
      await client.query('DELETE FROM mcp.server_tools WHERE server_id = $1', [serverId]);
      for (const t of tools) {
        await client.query(
          'INSERT INTO mcp.server_tools (server_id, name, description, input_schema) VALUES ($1, $2, $3, $4)',
          [serverId, t.name, t.description ?? '', JSON.stringify(t.inputSchema ?? {})]
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
      [serverId]
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
    await this.execute('DELETE FROM mcp.server_tools WHERE server_id = $1', [serverId]);
  }

  async getConfig(): Promise<McpFeatureConfig> {
    const rows = await this.queryMany<{ key: string; value: string }>(
      'SELECT key, value FROM mcp.config'
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
            [key, JSON.stringify(value)]
          );
        }
      }
    });
    return this.getConfig();
  }

  // ─── Health Monitoring ──────────────────────────────────────

  async saveHealth(health: McpServerHealth): Promise<void> {
    await this.execute(
      `INSERT INTO mcp.server_health
         (server_id, status, latency_ms, consecutive_failures, last_checked_at, last_success_at, last_error)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (server_id) DO UPDATE SET
         status = EXCLUDED.status,
         latency_ms = EXCLUDED.latency_ms,
         consecutive_failures = EXCLUDED.consecutive_failures,
         last_checked_at = EXCLUDED.last_checked_at,
         last_success_at = EXCLUDED.last_success_at,
         last_error = EXCLUDED.last_error`,
      [
        health.serverId,
        health.status,
        health.latencyMs,
        health.consecutiveFailures,
        health.lastCheckedAt,
        health.lastSuccessAt,
        health.lastError,
      ]
    );
  }

  async getHealth(serverId: string): Promise<McpServerHealth | null> {
    const row = await this.queryOne<Record<string, unknown>>(
      'SELECT * FROM mcp.server_health WHERE server_id = $1',
      [serverId]
    );
    return row ? this.rowToHealth(row) : null;
  }

  async getAllHealth(): Promise<McpServerHealth[]> {
    const rows = await this.queryMany<Record<string, unknown>>('SELECT * FROM mcp.server_health');
    return rows.map((r) => this.rowToHealth(r));
  }

  private rowToHealth(row: Record<string, unknown>): McpServerHealth {
    return {
      serverId: row.server_id as string,
      status: (row.status as McpServerHealth['status']) ?? 'unknown',
      latencyMs: row.latency_ms as number | null,
      consecutiveFailures: (row.consecutive_failures as number) ?? 0,
      lastCheckedAt: row.last_checked_at as number | null,
      lastSuccessAt: row.last_success_at as number | null,
      lastError: row.last_error as string | null,
    };
  }

  // ─── Credential Storage ─────────────────────────────────────

  async saveCredential(serverId: string, key: string, encryptedValue: string): Promise<void> {
    const now = Date.now();
    await this.execute(
      `INSERT INTO mcp.server_credentials (server_id, key, encrypted_value, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (server_id, key) DO UPDATE SET
         encrypted_value = EXCLUDED.encrypted_value,
         updated_at = EXCLUDED.updated_at`,
      [serverId, key, encryptedValue, now, now]
    );
  }

  async getCredential(serverId: string, key: string): Promise<string | null> {
    const row = await this.queryOne<{ encrypted_value: string }>(
      'SELECT encrypted_value FROM mcp.server_credentials WHERE server_id = $1 AND key = $2',
      [serverId, key]
    );
    return row?.encrypted_value ?? null;
  }

  async listCredentialKeys(serverId: string): Promise<string[]> {
    const rows = await this.queryMany<{ key: string }>(
      'SELECT key FROM mcp.server_credentials WHERE server_id = $1 ORDER BY key',
      [serverId]
    );
    return rows.map((r) => r.key);
  }

  async deleteCredential(serverId: string, key: string): Promise<boolean> {
    const rowCount = await this.execute(
      'DELETE FROM mcp.server_credentials WHERE server_id = $1 AND key = $2',
      [serverId, key]
    );
    return rowCount > 0;
  }
}
