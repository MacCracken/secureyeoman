/**
 * MCP Routes — REST API for MCP server management
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { McpClientManager } from './client.js';
import type { McpStorage } from './storage.js';
import type { McpServer } from './server.js';
import type { McpToolManifest } from '@secureyeoman/shared';
import type { McpHealthMonitor } from './health-monitor.js';
import type { McpCredentialManager } from './credential-manager.js';

export interface McpRoutesOptions {
  mcpStorage: McpStorage;
  mcpClient: McpClientManager;
  mcpServer: McpServer;
  healthMonitor?: McpHealthMonitor;
  credentialManager?: McpCredentialManager;
}


function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

export function registerMcpRoutes(app: FastifyInstance, opts: McpRoutesOptions): void {
  const { mcpStorage, mcpClient, mcpServer, healthMonitor, credentialManager } = opts;

  // List configured MCP servers
  app.get('/api/v1/mcp/servers', async () => {
    const servers = await mcpStorage.listServers();
    return { servers, total: servers.length };
  });

  // Add (or upsert) an MCP server with optional tool manifest.
  // If a server with the same name already exists, update its tools and
  // connection details instead of creating a duplicate entry.
  app.post(
    '/api/v1/mcp/servers',
    async (
      request: FastifyRequest<{
        Body: {
          name: string;
          description?: string;
          transport?: string;
          command?: string;
          args?: string[];
          url?: string;
          env?: Record<string, string>;
          enabled?: boolean;
          tools?: McpToolManifest[];
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { tools, ...serverData } = request.body;

        // Upsert: if a server with the same name exists, reuse it
        const existing = await mcpStorage.findServerByName(serverData.name);
        let server: typeof existing & {};
        let statusCode = 201;

        if (existing) {
          server = existing;
          statusCode = 200;
        } else {
          server = await mcpStorage.addServer(serverData as any);
        }

        // Register/update tools if provided in the request
        if (tools && Array.isArray(tools) && tools.length > 0) {
          await mcpClient.registerTools(server.id, server.name, tools);
        } else if (server.enabled) {
          // Attempt protocol-based discovery for servers that didn't provide tools
          await mcpClient.discoverTools(server.id);
        }

        return reply.code(statusCode).send({ server });
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  // Toggle MCP server enabled/disabled
  app.patch(
    '/api/v1/mcp/servers/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { enabled: boolean };
      }>,
      reply: FastifyReply
    ) => {
      const server = await mcpStorage.getServer(request.params.id);
      if (!server) {
        return reply.code(404).send({ error: 'MCP server not found' });
      }

      const updated = await mcpStorage.updateServer(request.params.id, {
        enabled: request.body.enabled,
      });
      if (!updated) {
        return reply.code(500).send({ error: 'Failed to update server' });
      }

      if (!request.body.enabled) {
        // Disabling: clear in-memory tools (DB retained for re-enable)
        mcpClient.clearTools(request.params.id);
      } else {
        // Enabling: restore tools directly from DB (bypasses enabled guard)
        await mcpClient.restoreTools(request.params.id);
      }

      const serverAfter = await mcpStorage.getServer(request.params.id);
      const tools = request.body.enabled
        ? mcpClient.getAllTools().filter((t) => t.serverId === request.params.id)
        : [];
      return { server: serverAfter, tools };
    }
  );

  // Delete an MCP server
  app.delete(
    '/api/v1/mcp/servers/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply
    ) => {
      const deleted = await mcpStorage.deleteServer(request.params.id);
      if (!deleted) {
        return reply.code(404).send({ error: 'MCP server not found' });
      }
      await mcpClient.deleteTools(request.params.id);
      return { message: 'Server removed' };
    }
  );

  // List all discovered tools (from external MCP servers only)
  app.get('/api/v1/mcp/tools', async () => {
    const tools = mcpClient.getAllTools();
    return { tools, total: tools.length };
  });

  // Call a tool on an MCP server
  app.post(
    '/api/v1/mcp/tools/call',
    async (
      request: FastifyRequest<{
        Body: { serverId: string; toolName: string; args?: Record<string, unknown> };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { serverId, toolName, args } = request.body;
        const result =
          serverId === 'secureyeoman-local'
            ? await mcpServer.handleToolCall(toolName, args ?? {})
            : await mcpClient.callTool(serverId, toolName, args ?? {});
        return { result };
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  // List exposed resources
  app.get('/api/v1/mcp/resources', async () => {
    const external = mcpClient.getAllResources();
    const exposed = mcpServer.getExposedResources();
    return { resources: [...external, ...exposed] };
  });

  // Get MCP feature config (persisted in SQLite)
  app.get('/api/v1/mcp/config', async () => {
    return await mcpStorage.getConfig();
  });

  // Update MCP feature config (persisted in SQLite)
  app.patch(
    '/api/v1/mcp/config',
    async (
      request: FastifyRequest<{
        Body: {
          exposeGit?: boolean;
          exposeFilesystem?: boolean;
          exposeWeb?: boolean;
          exposeWebScraping?: boolean;
          exposeWebSearch?: boolean;
          exposeBrowser?: boolean;
          allowedUrls?: string[];
          webRateLimitPerMinute?: number;
          proxyEnabled?: boolean;
          proxyProviders?: string[];
          proxyStrategy?: string;
          proxyDefaultCountry?: string;
        };
      }>
    ) => {
      return await mcpStorage.setConfig(request.body);
    }
  );

  // ─── Health Monitoring ──────────────────────────────────────

  // Get all server health statuses
  app.get('/api/v1/mcp/health', async () => {
    const health = await mcpStorage.getAllHealth();
    return { health };
  });

  // Get single server health
  app.get(
    '/api/v1/mcp/servers/:id/health',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const health = await mcpStorage.getHealth(request.params.id);
      if (!health) {
        return reply.code(404).send({ error: 'No health data for this server' });
      }
      return health;
    }
  );

  // Trigger immediate health check
  app.post(
    '/api/v1/mcp/servers/:id/health/check',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!healthMonitor) {
        return reply.code(503).send({ error: 'Health monitor not available' });
      }
      try {
        const health = await healthMonitor.checkServer(request.params.id);
        return health;
      } catch (err) {
        return reply.code(500).send({ error: errorMessage(err) });
      }
    }
  );

  // ─── Credential Management ────────────────────────────────

  // List credential keys for a server (never returns values)
  app.get(
    '/api/v1/mcp/servers/:id/credentials',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const server = await mcpStorage.getServer(request.params.id);
      if (!server) {
        return reply.code(404).send({ error: 'MCP server not found' });
      }
      const keys = await mcpStorage.listCredentialKeys(request.params.id);
      return { keys };
    }
  );

  // Store/update a credential
  app.put(
    '/api/v1/mcp/servers/:id/credentials/:key',
    async (
      request: FastifyRequest<{
        Params: { id: string; key: string };
        Body: { value: string };
      }>,
      reply: FastifyReply
    ) => {
      if (!credentialManager) {
        return reply.code(503).send({ error: 'Credential manager not available' });
      }
      const server = await mcpStorage.getServer(request.params.id);
      if (!server) {
        return reply.code(404).send({ error: 'MCP server not found' });
      }
      try {
        await credentialManager.storeCredential(
          request.params.id,
          request.params.key,
          request.body.value
        );
        return { message: 'Credential stored' };
      } catch (err) {
        return reply.code(500).send({ error: errorMessage(err) });
      }
    }
  );

  // Delete a credential
  app.delete(
    '/api/v1/mcp/servers/:id/credentials/:key',
    async (
      request: FastifyRequest<{
        Params: { id: string; key: string };
      }>,
      reply: FastifyReply
    ) => {
      const deleted = await mcpStorage.deleteCredential(request.params.id, request.params.key);
      if (!deleted) {
        return reply.code(404).send({ error: 'Credential not found' });
      }
      return { message: 'Credential deleted' };
    }
  );
}
