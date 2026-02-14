/**
 * MCP Client Manager — connects to external MCP servers, discovers tools
 */

import type { McpServerConfig, McpToolDef, McpResourceDef, McpToolManifest } from '@friday/shared';
import type { SecureLogger } from '../logging/logger.js';
import { McpStorage } from './storage.js';

export interface McpClientManagerDeps {
  logger: SecureLogger;
}

export class McpClientManager {
  private storage: McpStorage;
  private logger: SecureLogger;
  private discoveredTools = new Map<string, McpToolDef[]>();
  private discoveredResources = new Map<string, McpResourceDef[]>();

  constructor(storage: McpStorage, deps: McpClientManagerDeps) {
    this.storage = storage;
    this.logger = deps.logger;
  }

  /**
   * Register tools provided by an MCP server during auto-registration.
   * This avoids the need for core to speak the MCP protocol.
   */
  registerTools(serverId: string, serverName: string, tools: McpToolManifest[]): void {
    const mcpTools: McpToolDef[] = tools.map((t) => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema ?? {},
      serverId,
      serverName,
    }));
    this.discoveredTools.set(serverId, mcpTools);
    this.logger.info('Registered tools from MCP server', { serverId, serverName, count: mcpTools.length });
  }

  async discoverTools(serverId: string): Promise<McpToolDef[]> {
    const server = this.storage.getServer(serverId);
    if (!server || !server.enabled) return [];

    // If tools were already registered (e.g. via auto-registration), return those
    const existing = this.discoveredTools.get(serverId);
    if (existing && existing.length > 0) {
      return existing;
    }

    // For servers that didn't provide tools upfront, return empty
    // Full MCP protocol discovery would require the MCP SDK client
    this.logger.debug('No pre-registered tools for MCP server', { serverId });
    return [];
  }

  async discoverResources(serverId: string): Promise<McpResourceDef[]> {
    const server = this.storage.getServer(serverId);
    if (!server || !server.enabled) return [];

    const resources: McpResourceDef[] = [];
    this.discoveredResources.set(serverId, resources);
    this.logger.debug('Discovered resources from MCP server', { serverId, count: resources.length });
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

  async callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const server = this.storage.getServer(serverId);
    if (!server || !server.enabled) {
      throw new Error(`MCP server ${serverId} not found or disabled`);
    }

    this.logger.info('Calling MCP tool', { serverId, toolName });
    // In production, this would route through the MCP transport
    return { result: `Tool ${toolName} called with args`, args };
  }

  async refreshAll(): Promise<void> {
    const servers = this.storage.listServers();
    for (const server of servers) {
      if (server.enabled) {
        await this.discoverTools(server.id);
        await this.discoverResources(server.id);
      }
    }
  }

  /**
   * Clear tools for a server (e.g. on deregistration).
   */
  clearTools(serverId: string): void {
    this.discoveredTools.delete(serverId);
    this.discoveredResources.delete(serverId);
  }
}
