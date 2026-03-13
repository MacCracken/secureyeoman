/**
 * MCP Client Manager — connects to external MCP servers, discovers tools
 */

import type { McpToolDef, McpResourceDef, McpToolManifest } from '@secureyeoman/shared';
import type { SecureLogger } from '../logging/logger.js';
import { McpStorage } from './storage.js';
import type { McpCredentialManager } from './credential-manager.js';
import { SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { getTracer } from '../telemetry/otel.js';
import { SpanStatusCode } from '@opentelemetry/api';

export interface McpClientManagerDeps {
  logger: SecureLogger;
  credentialManager?: McpCredentialManager;
  /** Shared token secret for minting service JWTs when calling back to the MCP server */
  tokenSecret?: string;
}

/** Mint a short-lived service JWT for core → MCP callthrough. */
async function mintCallthruToken(secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({
    sub: 'core-callthru',
    role: 'admin',
    permissions: ['*:*'],
    type: 'access',
    jti: randomUUID(),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
}

export class McpClientManager {
  private storage: McpStorage;
  private logger: SecureLogger;
  private credentialManager?: McpCredentialManager;
  private tokenSecret?: string;
  private discoveredTools = new Map<string, McpToolDef[]>();
  private discoveredResources = new Map<string, McpResourceDef[]>();

  constructor(storage: McpStorage, deps: McpClientManagerDeps) {
    this.storage = storage;
    this.logger = deps.logger;
    this.credentialManager = deps.credentialManager;
    this.tokenSecret = deps.tokenSecret;
  }

  /**
   * Register tools provided by an MCP server during auto-registration.
   * Persists tools to SQLite so they survive toggle cycles.
   */
  async registerTools(
    serverId: string,
    serverName: string,
    tools: McpToolManifest[]
  ): Promise<void> {
    const mcpTools: McpToolDef[] = tools.map((t) => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema ?? {},
      serverId,
      serverName,
    }));
    this.discoveredTools.set(serverId, mcpTools);
    await this.storage.saveTools(serverId, serverName, tools);
    this.logger.info(
      {
        serverId,
        serverName,
        count: mcpTools.length,
      },
      'Registered tools from MCP server'
    );
  }

  async discoverTools(serverId: string): Promise<McpToolDef[]> {
    const server = await this.storage.getServer(serverId);
    if (!server?.enabled) return [];

    // If tools are already in memory, return those
    const existing = this.discoveredTools.get(serverId);
    if (existing && existing.length > 0) {
      return existing;
    }

    // Fall back to persisted tools (survives toggle off/on)
    const persisted = await this.storage.loadTools(serverId);
    if (persisted.length > 0) {
      this.discoveredTools.set(serverId, persisted);
      this.logger.info(
        {
          serverId,
          count: persisted.length,
        },
        'Restored tools from storage for MCP server'
      );
      return persisted;
    }

    this.logger.debug({ serverId }, 'No pre-registered tools for MCP server');
    return [];
  }

  async discoverResources(serverId: string): Promise<McpResourceDef[]> {
    const server = await this.storage.getServer(serverId);
    if (!server?.enabled) return [];

    const resources: McpResourceDef[] = [];
    this.discoveredResources.set(serverId, resources);
    this.logger.debug(
      {
        serverId,
        count: resources.length,
      },
      'Discovered resources from MCP server'
    );
    return resources;
  }

  getAllTools(): McpToolDef[] {
    const allTools: McpToolDef[] = [];
    for (const tools of this.discoveredTools.values()) {
      allTools.push(...tools);
    }
    return allTools;
  }

  getAllResources(): McpResourceDef[] {
    const allResources: McpResourceDef[] = [];
    for (const resources of this.discoveredResources.values()) {
      allResources.push(...resources);
    }
    return allResources;
  }

  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const tracer = getTracer('secureyeoman.mcp');

    return tracer.startActiveSpan(`mcp.tool ${toolName}`, async (span) => {
      span.setAttribute('mcp.tool_name', toolName);
      span.setAttribute('mcp.server_id', serverId);
      const startTime = Date.now();

      try {
        const server = await this.storage.getServer(serverId);
        if (!server?.enabled) {
          throw new Error(`MCP server ${serverId} not found or disabled`);
        }
        if (!server.url) {
          throw new Error(`MCP server '${server.name}' has no URL configured`);
        }
        span.setAttribute('mcp.server_name', server.name);

        if (!this.tokenSecret) {
          throw new Error('McpClientManager: tokenSecret not configured — cannot call MCP tools');
        }

        // Inject credentials into server env if credential manager is available
        if (this.credentialManager) {
          await this.credentialManager.injectCredentials(serverId, server.env);
        }

        const token = await mintCallthruToken(this.tokenSecret);
        const endpoint = `${server.url}/api/v1/internal/tool-call`;

        this.logger.info({ serverId, toolName }, 'Calling MCP tool via internal callthrough');

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ name: toolName, arguments: args }),
          signal: AbortSignal.timeout(60_000),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`MCP tool call failed (${res.status}): ${body}`);
        }

        const contentLength = res.headers.get('content-length');
        if (contentLength && parseInt(contentLength, 10) > 50_000_000) {
          throw new Error('MCP response too large (>50MB)');
        }
        const result = await res.json();
        const elapsed = Date.now() - startTime;
        span.setAttribute('mcp.latency_ms', elapsed);
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        return result;
      } catch (error) {
        const elapsed = Date.now() - startTime;
        span.setAttribute('mcp.latency_ms', elapsed);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'Unknown',
        });
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        span.end();
        throw error;
      }
    });
  }

  async refreshAll(): Promise<void> {
    const { servers } = await this.storage.listServers();
    for (const server of servers) {
      if (server.enabled) {
        await this.discoverTools(server.id);
        await this.discoverResources(server.id);
      }
    }
  }

  /**
   * Restore tools from persistent storage into the in-memory cache.
   * Unlike discoverTools, this skips the server.enabled guard — the caller
   * is responsible for ensuring the server is (about to be) enabled.
   * Used by the toggle route where updateServer(enabled:true) has already run.
   */
  async restoreTools(serverId: string): Promise<McpToolDef[]> {
    const persisted = await this.storage.loadTools(serverId);
    if (persisted.length > 0) {
      this.discoveredTools.set(serverId, persisted);
      this.logger.info(
        {
          serverId,
          count: persisted.length,
        },
        'Restored tools from storage for MCP server'
      );
    }
    return persisted;
  }

  /**
   * Clear in-memory tools for a server (e.g. on disable).
   * Persisted tools are retained so they can be restored on re-enable.
   */
  clearTools(serverId: string): void {
    this.discoveredTools.delete(serverId);
    this.discoveredResources.delete(serverId);
  }

  /**
   * Permanently delete tools for a server (e.g. on server removal).
   * Clears both in-memory cache and persistent storage.
   */
  async deleteTools(serverId: string): Promise<void> {
    this.discoveredTools.delete(serverId);
    this.discoveredResources.delete(serverId);
    await this.storage.deleteTools(serverId);
  }
}
