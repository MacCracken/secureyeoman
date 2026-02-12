/**
 * MCP Routes — REST API for MCP server management
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { McpClientManager } from './client.js';
import type { McpStorage } from './storage.js';
import type { McpServer } from './server.js';

export interface McpRoutesOptions {
  mcpStorage: McpStorage;
  mcpClient: McpClientManager;
  mcpServer: McpServer;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

export function registerMcpRoutes(app: FastifyInstance, opts: McpRoutesOptions): void {
  const { mcpStorage, mcpClient, mcpServer } = opts;

  // List configured MCP servers
  app.get('/api/v1/mcp/servers', async () => {
    const servers = mcpStorage.listServers();
    return { servers, total: servers.length };
  });

  // Add a new MCP server
  app.post('/api/v1/mcp/servers', async (request: FastifyRequest<{
    Body: { name: string; description?: string; transport?: string; command?: string; args?: string[]; url?: string; env?: Record<string, string>; enabled?: boolean }
  }>, reply: FastifyReply) => {
    try {
      const server = mcpStorage.addServer(request.body as any);
      if (server.enabled) {
        await mcpClient.discoverTools(server.id);
      }
      return reply.code(201).send({ server });
    } catch (err) {
      return reply.code(400).send({ error: errorMessage(err) });
    }
  });

  // Delete an MCP server
  app.delete('/api/v1/mcp/servers/:id', async (request: FastifyRequest<{
    Params: { id: string }
  }>, reply: FastifyReply) => {
    const deleted = mcpStorage.deleteServer(request.params.id);
    if (!deleted) {
      return reply.code(404).send({ error: 'MCP server not found' });
    }
    return { message: 'Server removed' };
  });

  // List all discovered tools (from external servers)
  app.get('/api/v1/mcp/tools', async () => {
    const external = mcpClient.getAllTools();
    const exposed = mcpServer.getExposedTools();
    return { tools: [...external, ...exposed], total: external.length + exposed.length };
  });

  // Call a tool on an MCP server
  app.post('/api/v1/mcp/tools/call', async (request: FastifyRequest<{
    Body: { serverId: string; toolName: string; args?: Record<string, unknown> }
  }>, reply: FastifyReply) => {
    try {
      const { serverId, toolName, args } = request.body;
      const result = serverId === 'friday-local'
        ? await mcpServer.handleToolCall(toolName, args ?? {})
        : await mcpClient.callTool(serverId, toolName, args ?? {});
      return { result };
    } catch (err) {
      return reply.code(400).send({ error: errorMessage(err) });
    }
  });

  // List exposed resources
  app.get('/api/v1/mcp/resources', async () => {
    const external = mcpClient.getAllResources();
    const exposed = mcpServer.getExposedResources();
    return { resources: [...external, ...exposed] };
  });
}
