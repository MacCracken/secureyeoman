/**
 * Twingate Remote MCP Access Tools — Phase 45
 *
 * Two groups (both gated by global exposeTwingateTools AND per-personality exposeTwingate):
 *   Tenant management (9 tools) — GraphQL API calls to Twingate tenant
 *   Remote MCP proxy  (4 tools) — Streamable HTTP bridge to private MCP servers via tunnel
 *
 * Credentials: TWINGATE_API_KEY + TWINGATE_NETWORK (env vars / McpServiceConfig)
 * Service key storage: PUT /api/v1/secrets/TWINGATE_SVC_KEY_{accountId} via CoreApiClient
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler, jsonResponse } from './tool-utils.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const DISABLED_MSG =
  'Twingate tools are disabled. Enable allowTwingate in Security Settings first.';
const GRAPHQL_TIMEOUT_MS = 15_000;
const MCP_PROXY_TIMEOUT_MS = 30_000;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min idle

// ─── In-memory MCP proxy session store ───────────────────────────────────────

interface ProxySession {
  resourceAddress: string;
  port: number;
  lastActivity: number;
}

const mcpSessions = new Map<string, ProxySession>();

function pruneProxySessions(): void {
  const now = Date.now();
  for (const [id, sess] of mcpSessions) {
    if (now - sess.lastActivity > SESSION_TTL_MS) {
      mcpSessions.delete(id);
    }
  }
}

// Prune idle sessions every 5 minutes
const _pruneInterval = setInterval(pruneProxySessions, 5 * 60 * 1000);
_pruneInterval.unref();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function textResponse(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorResponse(msg: string) {
  return {
    content: [{ type: 'text' as const, text: msg }],
    isError: true as const,
  };
}

async function twingateQuery(
  network: string,
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<unknown> {
  const url = `https://${network}.twingate.com/api/graphql/`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(GRAPHQL_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Twingate API error ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as { data?: unknown; errors?: { message: string }[] };
  if (json.errors && json.errors.length > 0) {
    throw new Error(`Twingate GraphQL error: ${json.errors.map((e) => e.message).join('; ')}`);
  }
  return json.data;
}

async function mcpJsonRpc(
  addr: string,
  port: number,
  method: string,
  params?: unknown
): Promise<unknown> {
  const url = `http://${addr}:${port}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params: params ?? {}, id: randomUUID() }),
    signal: AbortSignal.timeout(MCP_PROXY_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`MCP server HTTP error ${res.status}`);
  }

  const json = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (json.error) {
    throw new Error(`MCP server error: ${json.error.message}`);
  }
  return json.result;
}

function requireCredentials(config: McpServiceConfig): { network: string; apiKey: string } | null {
  const network = config.twingateNetwork;
  const apiKey = config.twingateApiKey;
  if (!network || !apiKey) return null;
  return { network, apiKey };
}

// ─── Stub tool names ──────────────────────────────────────────────────────────

const STUB_TOOLS = [
  'twingate_resources_list',
  'twingate_resource_get',
  'twingate_groups_list',
  'twingate_service_accounts_list',
  'twingate_service_account_create',
  'twingate_service_key_create',
  'twingate_service_key_revoke',
  'twingate_connectors_list',
  'twingate_remote_networks_list',
  'twingate_mcp_connect',
  'twingate_mcp_list_tools',
  'twingate_mcp_call_tool',
  'twingate_mcp_disconnect',
];

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerTwingateTools(
  server: McpServer,
  client: CoreApiClient,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  if (!config.exposeTwingateTools) {
    for (const name of STUB_TOOLS) {
      server.registerTool(
        name,
        { description: `Twingate tool (disabled). ${DISABLED_MSG}`, inputSchema: {} },
        wrapToolHandler(name, middleware, async () => errorResponse(DISABLED_MSG))
      );
    }
    return;
  }

  // ── Twingate management tools ─────────────────────────────────────────────

  server.registerTool(
    'twingate_resources_list',
    {
      description:
        'List all Twingate Resources; returns id, name, address, group access, protocol rules',
      inputSchema: {},
    },
    wrapToolHandler('twingate_resources_list', middleware, async () => {
      const creds = requireCredentials(config);
      if (!creds)
        return errorResponse(
          'Twingate credentials not configured. Set TWINGATE_API_KEY and TWINGATE_NETWORK.'
        );

      const data = (await twingateQuery(
        creds.network,
        creds.apiKey,
        `query {
          resources {
            edges {
              node {
                id
                name
                address { value }
                protocols { allowIcmp tcp { policy ports { start end } } udp { policy ports { start end } } }
                groups { edges { node { id name } } }
              }
            }
          }
        }`
      )) as { resources: { edges: { node: unknown }[] } };

      const resources = data.resources.edges.map((e) => e.node);
      return textResponse({ resources, count: resources.length });
    })
  );

  server.registerTool(
    'twingate_resource_get',
    {
      description:
        'Fetch a single Twingate Resource by id with full protocol policy and group assignments',
      inputSchema: {
        id: z.string().describe('Twingate Resource ID'),
      },
    },
    wrapToolHandler('twingate_resource_get', middleware, async (args) => {
      const { id } = args as { id: string };
      const creds = requireCredentials(config);
      if (!creds)
        return errorResponse(
          'Twingate credentials not configured. Set TWINGATE_API_KEY and TWINGATE_NETWORK.'
        );

      const data = (await twingateQuery(
        creds.network,
        creds.apiKey,
        `query($id: ID!) {
          resource(id: $id) {
            id
            name
            address { value }
            protocols { allowIcmp tcp { policy ports { start end } } udp { policy ports { start end } } }
            groups { edges { node { id name type } } }
            serviceAccounts { edges { node { id name } } }
          }
        }`,
        { id }
      )) as { resource: unknown };

      return textResponse(data.resource);
    })
  );

  server.registerTool(
    'twingate_groups_list',
    {
      description:
        'List Twingate access groups and which identities/service accounts can reach which resources',
      inputSchema: {},
    },
    wrapToolHandler('twingate_groups_list', middleware, async () => {
      const creds = requireCredentials(config);
      if (!creds)
        return errorResponse(
          'Twingate credentials not configured. Set TWINGATE_API_KEY and TWINGATE_NETWORK.'
        );

      const data = (await twingateQuery(
        creds.network,
        creds.apiKey,
        `query {
          groups {
            edges {
              node {
                id
                name
                type
                resources { edges { node { id name } } }
              }
            }
          }
        }`
      )) as { groups: { edges: { node: unknown }[] } };

      const groups = data.groups.edges.map((e) => e.node);
      return textResponse({ groups, count: groups.length });
    })
  );

  server.registerTool(
    'twingate_service_accounts_list',
    {
      description:
        'List Twingate service accounts (non-human principals for agent-to-resource access)',
      inputSchema: {},
    },
    wrapToolHandler('twingate_service_accounts_list', middleware, async () => {
      const creds = requireCredentials(config);
      if (!creds)
        return errorResponse(
          'Twingate credentials not configured. Set TWINGATE_API_KEY and TWINGATE_NETWORK.'
        );

      const data = (await twingateQuery(
        creds.network,
        creds.apiKey,
        `query {
          serviceAccounts {
            edges {
              node {
                id
                name
                resources { edges { node { id name } } }
                keys { edges { node { id name status expiresAt } } }
              }
            }
          }
        }`
      )) as { serviceAccounts: { edges: { node: unknown }[] } };

      const accounts = data.serviceAccounts.edges.map((e) => e.node);
      return textResponse({ serviceAccounts: accounts, count: accounts.length });
    })
  );

  server.registerTool(
    'twingate_service_account_create',
    {
      description:
        'Create a Twingate service account scoped to specific resources; returns account id for key generation',
      inputSchema: {
        name: z.string().describe('Name for the new service account'),
        resourceIds: z.array(z.string()).optional().describe('Resource IDs to grant access'),
      },
    },
    wrapToolHandler('twingate_service_account_create', middleware, async (args) => {
      const { name, resourceIds } = args as { name: string; resourceIds?: string[] };
      const creds = requireCredentials(config);
      if (!creds)
        return errorResponse(
          'Twingate credentials not configured. Set TWINGATE_API_KEY and TWINGATE_NETWORK.'
        );

      const data = (await twingateQuery(
        creds.network,
        creds.apiKey,
        `mutation($name: String!, $resourceIds: [ID!]) {
          serviceAccountCreate(name: $name, resourceIds: $resourceIds) {
            entity {
              id
              name
              resources { edges { node { id name } } }
            }
          }
        }`,
        { name, resourceIds }
      )) as { serviceAccountCreate: { entity: { id: string; name: string } } };

      return textResponse(data.serviceAccountCreate.entity);
    })
  );

  server.registerTool(
    'twingate_service_key_create',
    {
      description:
        'Generate a service key for a service account; stores it in SecretsManager — returned once',
      inputSchema: {
        serviceAccountId: z.string().describe('Service account ID to generate a key for'),
        name: z.string().optional().describe('Optional display name for the key'),
      },
    },
    wrapToolHandler('twingate_service_key_create', middleware, async (args) => {
      const { serviceAccountId, name } = args as { serviceAccountId: string; name?: string };
      const creds = requireCredentials(config);
      if (!creds)
        return errorResponse(
          'Twingate credentials not configured. Set TWINGATE_API_KEY and TWINGATE_NETWORK.'
        );

      const data = (await twingateQuery(
        creds.network,
        creds.apiKey,
        `mutation($serviceAccountId: ID!, $name: String) {
          serviceAccountKeyCreate(serviceAccountId: $serviceAccountId, name: $name) {
            entity {
              id
              name
              token
            }
          }
        }`,
        { serviceAccountId, name }
      )) as { serviceAccountKeyCreate: { entity: { id: string; name: string; token: string } } };

      const { id: keyId, name: keyName, token } = data.serviceAccountKeyCreate.entity;
      const secretName = `TWINGATE_SVC_KEY_${serviceAccountId}`;

      // Store via SecretsManager — token is not included in tool response
      await client.put(`/api/v1/secrets/${secretName}`, { value: token });

      // Emit supplemental audit event for key lifecycle
      await client.post('/api/v1/audit', {
        event: 'twingate_key_create',
        level: 'warning',
        message: `Twingate service key created for account ${serviceAccountId}`,
        metadata: { keyId, keyName, serviceAccountId, secretName },
      });

      return textResponse({
        keyId,
        keyName,
        serviceAccountId,
        secretName,
        stored: true,
        message: `Service key stored as secret "${secretName}". The raw token has been saved and is not displayed here.`,
      });
    })
  );

  server.registerTool(
    'twingate_service_key_revoke',
    {
      description: 'Revoke a Twingate service key by id; emits twingate_key_revoked audit event',
      inputSchema: {
        id: z.string().describe('Service key ID to revoke'),
      },
    },
    wrapToolHandler('twingate_service_key_revoke', middleware, async (args) => {
      const { id } = args as { id: string };
      const creds = requireCredentials(config);
      if (!creds)
        return errorResponse(
          'Twingate credentials not configured. Set TWINGATE_API_KEY and TWINGATE_NETWORK.'
        );

      await twingateQuery(
        creds.network,
        creds.apiKey,
        `mutation($id: ID!) {
          serviceAccountKeyRevoke(id: $id) {
            ok
          }
        }`,
        { id }
      );

      await client.post('/api/v1/audit', {
        event: 'twingate_key_revoke',
        level: 'warning',
        message: `Twingate service key revoked: ${id}`,
        metadata: { keyId: id },
      });

      return textResponse({ revoked: true, keyId: id });
    })
  );

  server.registerTool(
    'twingate_connectors_list',
    {
      description:
        'List Twingate Connectors with online/offline status, remote network, and last heartbeat',
      inputSchema: {},
    },
    wrapToolHandler('twingate_connectors_list', middleware, async () => {
      const creds = requireCredentials(config);
      if (!creds)
        return errorResponse(
          'Twingate credentials not configured. Set TWINGATE_API_KEY and TWINGATE_NETWORK.'
        );

      const data = (await twingateQuery(
        creds.network,
        creds.apiKey,
        `query {
          connectors {
            edges {
              node {
                id
                name
                state
                lastHeartbeatAt
                remoteNetwork { id name }
              }
            }
          }
        }`
      )) as { connectors: { edges: { node: unknown }[] } };

      const connectors = data.connectors.edges.map((e) => e.node);
      return textResponse({ connectors, count: connectors.length });
    })
  );

  server.registerTool(
    'twingate_remote_networks_list',
    {
      description: 'List Twingate Remote Networks (private network segments behind Connectors)',
      inputSchema: {},
    },
    wrapToolHandler('twingate_remote_networks_list', middleware, async () => {
      const creds = requireCredentials(config);
      if (!creds)
        return errorResponse(
          'Twingate credentials not configured. Set TWINGATE_API_KEY and TWINGATE_NETWORK.'
        );

      const data = (await twingateQuery(
        creds.network,
        creds.apiKey,
        `query {
          remoteNetworks {
            edges {
              node {
                id
                name
                location
                connectors { edges { node { id name state } } }
                resources { edges { node { id name } } }
              }
            }
          }
        }`
      )) as { remoteNetworks: { edges: { node: unknown }[] } };

      const remoteNetworks = data.remoteNetworks.edges.map((e) => e.node);
      return textResponse({ remoteNetworks, count: remoteNetworks.length });
    })
  );

  // ── Remote MCP proxy tools ────────────────────────────────────────────────

  server.registerTool(
    'twingate_mcp_connect',
    {
      description:
        'Open a proxy session to a private MCP server reachable via the Twingate Client tunnel; returns sessionId',
      inputSchema: {
        resourceAddress: z
          .string()
          .describe(
            'Hostname or IP of the private MCP server (must be reachable via Twingate tunnel)'
          ),
        port: z
          .number()
          .int()
          .min(1)
          .max(65535)
          .default(3001)
          .describe('MCP server port (default 3001)'),
      },
    },
    wrapToolHandler('twingate_mcp_connect', middleware, async (args) => {
      const { resourceAddress, port } = args as { resourceAddress: string; port: number };
      pruneProxySessions();

      const sessionId = randomUUID();
      mcpSessions.set(sessionId, {
        resourceAddress,
        port: port ?? 3001,
        lastActivity: Date.now(),
      });

      return textResponse({
        sessionId,
        resourceAddress,
        port: port ?? 3001,
        message: `MCP proxy session opened. Use sessionId "${sessionId}" with twingate_mcp_list_tools and twingate_mcp_call_tool.`,
      });
    })
  );

  server.registerTool(
    'twingate_mcp_list_tools',
    {
      description: 'List tools exposed by a private MCP server connected via twingate_mcp_connect',
      inputSchema: {
        sessionId: z.string().describe('Session ID from twingate_mcp_connect'),
      },
    },
    wrapToolHandler('twingate_mcp_list_tools', middleware, async (args) => {
      const { sessionId } = args as { sessionId: string };
      const sess = mcpSessions.get(sessionId);
      if (!sess) {
        return errorResponse(
          `Session "${sessionId}" not found or expired. Use twingate_mcp_connect first.`
        );
      }
      sess.lastActivity = Date.now();

      const result = await mcpJsonRpc(sess.resourceAddress, sess.port, 'tools/list');
      return textResponse(result);
    })
  );

  server.registerTool(
    'twingate_mcp_call_tool',
    {
      description:
        'Invoke a tool on a connected private MCP server; returns result; emits twingate_mcp_tool_call audit event',
      inputSchema: {
        sessionId: z.string().describe('Session ID from twingate_mcp_connect'),
        toolName: z.string().describe('Name of the tool to invoke on the remote MCP server'),
        args: z.record(z.unknown()).optional().describe('Arguments to pass to the tool'),
      },
    },
    wrapToolHandler('twingate_mcp_call_tool', middleware, async (args) => {
      const {
        sessionId,
        toolName,
        args: toolArgs,
      } = args as {
        sessionId: string;
        toolName: string;
        args?: Record<string, unknown>;
      };
      const sess = mcpSessions.get(sessionId);
      if (!sess) {
        return errorResponse(
          `Session "${sessionId}" not found or expired. Use twingate_mcp_connect first.`
        );
      }
      sess.lastActivity = Date.now();

      const result = await mcpJsonRpc(sess.resourceAddress, sess.port, 'tools/call', {
        name: toolName,
        arguments: toolArgs ?? {},
      });

      await client.post('/api/v1/audit', {
        event: 'twingate_mcp_tool_call',
        level: 'info',
        message: `Remote MCP tool call via Twingate: ${toolName}`,
        metadata: { sessionId, toolName, resourceAddress: sess.resourceAddress, port: sess.port },
      });

      return textResponse(result);
    })
  );

  server.registerTool(
    'twingate_mcp_disconnect',
    {
      description: 'Close a Twingate MCP proxy session',
      inputSchema: {
        sessionId: z.string().describe('Session ID from twingate_mcp_connect'),
      },
    },
    wrapToolHandler('twingate_mcp_disconnect', middleware, async (args) => {
      const { sessionId } = args as { sessionId: string };
      const existed = mcpSessions.delete(sessionId);
      if (!existed) {
        return errorResponse(`Session "${sessionId}" not found.`);
      }
      return textResponse({ disconnected: true, sessionId });
    })
  );
}
