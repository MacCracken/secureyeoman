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
import { toErrorMessage, sendError } from '../utils/errors.js';
import { parsePagination } from '../utils/pagination.js';
import { toolMatchesProfile, AgnosBridgeProfileSchema } from '@secureyeoman/shared';

export interface McpRoutesOptions {
  mcpStorage: McpStorage;
  mcpClient: McpClientManager;
  mcpServer: McpServer;
  healthMonitor?: McpHealthMonitor;
  credentialManager?: McpCredentialManager;
  /** Returns whether NetBox write (and access) is permitted per the security policy. */
  getNetBoxWriteAllowed?: () => boolean;
}

const LOCAL_MCP_NAME = 'YEOMAN MCP';
const GIT_TOOL_PREFIXES = ['git_', 'github_'];
const FS_TOOL_PREFIXES = ['fs_'];
const WEB_TOOL_PREFIXES = ['web_'];
const WEB_SCRAPING_TOOLS = [
  'web_scrape_markdown',
  'web_scrape_html',
  'web_scrape_batch',
  'web_extract_structured',
];
const WEB_SEARCH_TOOLS = ['web_search', 'web_search_batch'];
const BROWSER_TOOL_PREFIXES = ['browser_'];
const DESKTOP_TOOL_PREFIXES = ['desktop_'];
const NETWORK_TOOL_PREFIXES = ['network_', 'netbox_', 'nvd_', 'subnet_', 'wildcard_', 'pcap_'];
const NETBOX_TOOL_PREFIXES = ['netbox_'];
const TWINGATE_TOOL_PREFIXES = ['twingate_'];
const GMAIL_TOOL_PREFIXES = ['gmail_'];
const TWITTER_TOOL_PREFIXES = ['twitter_'];
const INTENT_TOOL_PREFIXES = ['intent_'];
const KB_TOOL_PREFIXES = ['kb_'];
const DOCKER_TOOL_PREFIXES = ['docker_'];
const GHA_TOOL_PREFIXES = ['gha_'];
const JENKINS_TOOL_PREFIXES = ['jenkins_'];
const GITLAB_TOOL_PREFIXES = ['gitlab_'];
const NORTHFLANK_TOOL_PREFIXES = ['northflank_'];
const AGNOSTIC_TOOL_PREFIXES = ['agnostic_'];
const AGNOS_TOOL_PREFIXES = ['agnos_'];
const BULLSHIFT_TOOL_PREFIXES = ['bullshift_', 'trading_', 'market_'];
const PHOTISNADI_TOOL_PREFIXES = ['photisnadi_'];
const SYNAPSE_TOOL_PREFIXES = ['synapse_'];
const DELTA_TOOL_PREFIXES = ['delta_'];
const EDGE_TOOL_PREFIXES = ['edge_'];
const VOICE_TOOL_PREFIXES = ['voice_'];
const SHRUTI_TOOL_PREFIXES = ['shruti_'];
const MNEME_TOOL_PREFIXES = ['mneme_'];
const SECURITY_TOOL_PREFIXES = ['sec_'];

export function registerMcpRoutes(app: FastifyInstance, opts: McpRoutesOptions): void {
  const {
    mcpStorage,
    mcpClient,
    mcpServer,
    healthMonitor,
    credentialManager,
    getNetBoxWriteAllowed,
  } = opts;

  // List configured MCP servers
  app.get(
    '/api/v1/mcp/servers',
    async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>) => {
      const { limit, offset } = parsePagination(request.query);
      return mcpStorage.listServers({ limit, offset });
    }
  );

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

        // Upsert: if a server with the same name exists, update its URL + transport; else create
        const existing = await mcpStorage.findServerByName(serverData.name);
        let server: typeof existing & {};
        let statusCode = 201;

        if (existing) {
          // Update mutable fields (url, transport) so address changes survive restarts
          if (serverData.url && serverData.url !== existing.url) {
            await mcpStorage.updateServerUrl(existing.id, serverData.url);
          }
          server = { ...existing, url: serverData.url ?? existing.url };
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
        return sendError(reply, 400, toErrorMessage(err));
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
        return sendError(reply, 404, 'MCP server not found');
      }

      const updated = await mcpStorage.updateServer(request.params.id, {
        enabled: request.body.enabled,
      });
      if (!updated) {
        return sendError(reply, 500, 'Failed to update server');
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
        return sendError(reply, 404, 'MCP server not found');
      }
      await mcpClient.deleteTools(request.params.id);
      return reply.code(204).send();
    }
  );

  // List discovered tools. External tools are always included. YEOMAN's own tools
  // (serverName === LOCAL_MCP_NAME) are filtered by the global feature config so the
  // Discovered Tools view reflects exactly what is currently exposed to the system.
  app.get(
    '/api/v1/mcp/tools',
    async (request: FastifyRequest<{ Querystring: { profile?: string } }>) => {
      const allTools = mcpClient.getAllTools();
      const config = await mcpStorage.getConfig();

      const tools = allTools.filter((tool) => {
        if (tool.serverName !== LOCAL_MCP_NAME) return true; // external tools always pass
        if (!config.exposeGit && GIT_TOOL_PREFIXES.some((p) => tool.name.startsWith(p)))
          return false;
        if (!config.exposeFilesystem && FS_TOOL_PREFIXES.some((p) => tool.name.startsWith(p)))
          return false;
        if (!config.exposeWeb && WEB_TOOL_PREFIXES.some((p) => tool.name.startsWith(p)))
          return false;
        if (config.exposeWeb) {
          if (!config.exposeWebScraping && WEB_SCRAPING_TOOLS.includes(tool.name)) return false;
          if (!config.exposeWebSearch && WEB_SEARCH_TOOLS.includes(tool.name)) return false;
        }
        if (!config.exposeBrowser && BROWSER_TOOL_PREFIXES.some((p) => tool.name.startsWith(p)))
          return false;
        if (
          !config.exposeDesktopControl &&
          DESKTOP_TOOL_PREFIXES.some((p) => tool.name.startsWith(p))
        )
          return false;
        if (
          !config.exposeNetworkTools &&
          NETWORK_TOOL_PREFIXES.some((p) => tool.name.startsWith(p))
        )
          return false;
        if (
          getNetBoxWriteAllowed &&
          !getNetBoxWriteAllowed() &&
          NETBOX_TOOL_PREFIXES.some((p) => tool.name.startsWith(p))
        )
          return false;
        if (
          !config.exposeTwingateTools &&
          TWINGATE_TOOL_PREFIXES.some((p) => tool.name.startsWith(p))
        )
          return false;
        if (!config.exposeGmail && GMAIL_TOOL_PREFIXES.some((p) => tool.name.startsWith(p)))
          return false;
        if (!config.exposeTwitter && TWITTER_TOOL_PREFIXES.some((p) => tool.name.startsWith(p)))
          return false;
        if (
          !config.exposeOrgIntentTools &&
          INTENT_TOOL_PREFIXES.some((p) => tool.name.startsWith(p))
        )
          return false;
        if (!config.exposeKnowledgeBase && KB_TOOL_PREFIXES.some((p) => tool.name.startsWith(p)))
          return false;
        if (!config.exposeDockerTools && DOCKER_TOOL_PREFIXES.some((p) => tool.name.startsWith(p)))
          return false;
        if (!config.exposeGithubActions && GHA_TOOL_PREFIXES.some((p) => tool.name.startsWith(p)))
          return false;
        if (!config.exposeJenkins && JENKINS_TOOL_PREFIXES.some((p) => tool.name.startsWith(p)))
          return false;
        if (!config.exposeGitlabCi && GITLAB_TOOL_PREFIXES.some((p) => tool.name.startsWith(p)))
          return false;
        if (
          !config.exposeNorthflank &&
          NORTHFLANK_TOOL_PREFIXES.some((p) => tool.name.startsWith(p))
        )
          return false;
        if (
          !config.exposeAgnosticTools &&
          AGNOSTIC_TOOL_PREFIXES.some((p) => tool.name.startsWith(p))
        )
          return false;
        if (!config.exposeAgnosTools && AGNOS_TOOL_PREFIXES.some((p) => tool.name.startsWith(p)))
          return false;
        if (
          !config.exposeBullshiftTools &&
          BULLSHIFT_TOOL_PREFIXES.some((p) => tool.name.startsWith(p))
        )
          return false;
        if (
          !config.exposePhotisnadiTools &&
          PHOTISNADI_TOOL_PREFIXES.some((p) => tool.name.startsWith(p))
        )
          return false;
        if (
          !config.exposeSynapseTools &&
          SYNAPSE_TOOL_PREFIXES.some((p) => tool.name.startsWith(p))
        )
          return false;
        if (!config.exposeDeltaTools && DELTA_TOOL_PREFIXES.some((p) => tool.name.startsWith(p)))
          return false;
        if (!config.exposeEdgeTools && EDGE_TOOL_PREFIXES.some((p) => tool.name.startsWith(p)))
          return false;
        if (!config.exposeVoiceTools && VOICE_TOOL_PREFIXES.some((p) => tool.name.startsWith(p)))
          return false;
        if (!config.exposeShrutiTools && SHRUTI_TOOL_PREFIXES.some((p) => tool.name.startsWith(p)))
          return false;
        if (
          !config.exposeSecurityTools &&
          SECURITY_TOOL_PREFIXES.some((p) => tool.name.startsWith(p))
        )
          return false;
        return true;
      });

      // Optional AGNOS bridge profile filtering
      const profile = request.query.profile;
      if (profile) {
        const parsed = AgnosBridgeProfileSchema.safeParse(profile);
        if (parsed.success) {
          const profileFiltered = tools.filter((t) => toolMatchesProfile(t.name, parsed.data));
          return { tools: profileFiltered, total: profileFiltered.length, profile: parsed.data };
        }
      }

      return { tools, total: tools.length };
    }
  );

  // Full tool catalog for AGNOS reverse registration — returns complete definitions
  // including inputSchema and outputSchema for all enabled tools.
  app.get('/api/v1/mcp/tools/list', async () => {
    const allTools = mcpClient.getAllTools();
    return {
      tools: allTools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        outputSchema: (t as Record<string, unknown>).outputSchema ?? undefined,
        serverId: t.serverId,
        serverName: t.serverName,
      })),
      total: allTools.length,
    };
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
      const { serverId, toolName, args } = request.body ?? {};
      if (!serverId || !toolName) {
        return sendError(reply, 400, 'Missing required fields: serverId, toolName');
      }

      try {
        if (serverId === 'secureyeoman-local') {
          const result = await mcpServer.handleToolCall(toolName, args ?? {});
          // handleToolCall returns { error: "Unknown tool: ..." } for unrecognized tools
          if (
            result &&
            typeof result === 'object' &&
            'error' in result &&
            typeof (result as Record<string, unknown>).error === 'string' &&
            ((result as Record<string, unknown>).error as string).startsWith('Unknown tool:')
          ) {
            return sendError(reply, 404, (result as Record<string, unknown>).error as string);
          }
          return { result };
        }

        const result = await mcpClient.callTool(serverId, toolName, args ?? {});
        return { result };
      } catch (err) {
        const msg = toErrorMessage(err);
        // Server not found or disabled
        if (msg.includes('not found or disabled')) {
          return sendError(reply, 404, `MCP server not found or disabled: ${serverId}`);
        }
        // Server has no URL configured
        if (msg.includes('has no URL configured')) {
          return sendError(reply, 503, `MCP server has no URL configured: ${serverId}`);
        }
        // Token/auth not configured
        if (msg.includes('tokenSecret not configured')) {
          return sendError(reply, 503, 'MCP authentication not configured');
        }
        // Response too large
        if (msg.includes('response too large')) {
          return sendError(reply, 502, 'MCP server response too large (>50MB)');
        }
        // MCP server unreachable (fetch errors, connection refused, timeout)
        if (
          msg.includes('fetch failed') ||
          msg.includes('ECONNREFUSED') ||
          msg.includes('ENOTFOUND') ||
          msg.includes('ETIMEDOUT') ||
          msg.includes('UND_ERR') ||
          msg.includes('network') ||
          msg.includes('TimeoutError') ||
          msg.includes('abort') ||
          msg.includes('The operation was aborted')
        ) {
          return sendError(reply, 502, `MCP server unreachable: ${serverId}`);
        }
        // Tool execution error from remote server (MCP tool call failed with HTTP status)
        if (msg.includes('MCP tool call failed')) {
          return sendError(reply, 502, `MCP tool call failed: ${msg}`);
        }
        // Fallback: unknown errors remain 400
        return sendError(reply, 400, msg);
      }
    }
  );

  // List exposed resources
  app.get('/api/v1/mcp/resources', async () => {
    const external = mcpClient.getAllResources();
    const exposed = mcpServer.getExposedResources();
    const resources = [...external, ...exposed];
    return { resources, total: resources.length };
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
          exposeDesktopControl?: boolean;
          exposeNetworkTools?: boolean;
          exposeTwingateTools?: boolean;
          allowedUrls?: string[];
          webRateLimitPerMinute?: number;
          proxyEnabled?: boolean;
          proxyProviders?: string[];
          proxyStrategy?: string;
          proxyDefaultCountry?: string;
          respectContentSignal?: boolean;
          exposeGmail?: boolean;
          exposeTwitter?: boolean;
          exposeGithub?: boolean;
          alwaysSendFullSchemas?: boolean;
          exposeOrgIntentTools?: boolean;
          exposeKnowledgeBase?: boolean;
          exposeDockerTools?: boolean;
          // CI/CD tools (Phase 90)
          exposeGithubActions?: boolean;
          exposeJenkins?: boolean;
          jenkinsUrl?: string;
          jenkinsUsername?: string;
          jenkinsApiToken?: string;
          exposeGitlabCi?: boolean;
          gitlabUrl?: string;
          gitlabToken?: string;
          exposeNorthflank?: boolean;
          northflankApiKey?: string;
          exposeSynapseTools?: boolean;
          exposeDeltaTools?: boolean;
          exposeEdgeTools?: boolean;
          exposeVoiceTools?: boolean;
          exposeAequiTools?: boolean;
          exposeShrutiTools?: boolean;
          exposeAgnosTools?: boolean;
          agnosBridgeProfile?: string;
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
        return sendError(reply, 404, 'No health data for this server');
      }
      return health;
    }
  );

  // Trigger immediate health check
  app.post(
    '/api/v1/mcp/servers/:id/health/check',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!healthMonitor) {
        return sendError(reply, 503, 'Health monitor not available');
      }
      try {
        const health = await healthMonitor.checkServer(request.params.id);
        return health;
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
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
        return sendError(reply, 404, 'MCP server not found');
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
        return sendError(reply, 503, 'Credential manager not available');
      }
      const server = await mcpStorage.getServer(request.params.id);
      if (!server) {
        return sendError(reply, 404, 'MCP server not found');
      }
      try {
        await credentialManager.storeCredential(
          request.params.id,
          request.params.key,
          request.body.value
        );
        return { message: 'Credential stored' };
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
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
        return sendError(reply, 404, 'Credential not found');
      }
      return reply.code(204).send();
    }
  );
}
