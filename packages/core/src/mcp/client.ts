/**
 * MCP Client Manager — connects to external MCP servers, discovers tools
 */

import type { McpServerConfig, McpToolDef, McpResourceDef } from '@friday/shared';
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

  async discoverTools(serverId: string): Promise<McpToolDef[]> {
    const server = this.storage.getServer(serverId);
    if (!server || !server.enabled) return [];

    // Simulate tool discovery from MCP server
    // In production, this would establish transport and call tools/list
    const tools: McpToolDef[] = [];
    this.discoveredTools.set(serverId, tools);
    this.logger.debug('Discovered tools from MCP server', { serverId, count: tools.length });
    return tools;
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
}
