/**
 * Edge Fleet Tools — MCP tools for managing edge/IoT nodes.
 *
 * 5 tools: edge_list, edge_deploy, edge_update, edge_health, edge_decommission
 *
 * ## Configuration
 *   MCP_EXPOSE_EDGE_TOOLS – Set to true to enable (default: false)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';
import {
  wrapToolHandler,
  jsonResponse,
  registerDisabledStub,
  createHttpClient,
} from './tool-utils.js';

const DISABLED_MSG = 'Edge tools are disabled. Set MCP_EXPOSE_EDGE_TOOLS=true to enable.';

function syClient() {
  const url = (process.env.SECUREYEOMAN_API_URL ?? 'http://localhost:3927').replace(/\/$/, '');
  return createHttpClient(url);
}

async function api(
  method: 'get' | 'post' | 'put' | 'delete' | 'patch',
  path: string,
  body?: unknown
): Promise<unknown> {
  const client = syClient();
  const res = await client[method](path, body);
  if (!res.ok) {
    const msg = (res.body as { error?: string })?.error ?? `HTTP ${res.status}`;
    throw new Error(`Edge API error: ${msg}`);
  }
  return res.body;
}

export function registerEdgeTools(
  server: McpServer,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  if (!config.exposeEdgeTools) {
    registerDisabledStub(server, middleware, 'edge_list', DISABLED_MSG);
    return;
  }

  // ── edge_list ─────────────────────────────────────────────────────────────

  server.registerTool(
    'edge_list',
    {
      description:
        'List all registered edge nodes with their status, capabilities, architecture, ' +
        'memory, CPU cores, GPU availability, bandwidth, and latency.',
      inputSchema: {
        status: z
          .string()
          .optional()
          .describe('Filter by status: registered, online, offline, decommissioned'),
        arch: z.string().optional().describe('Filter by architecture: x64, arm64, riscv64, armv7'),
        tags: z
          .string()
          .optional()
          .describe('Comma-separated capability tags to filter by (e.g. "gpu,high-memory")'),
      },
    },
    wrapToolHandler('edge_list', middleware, async ({ status, arch, tags }) => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (arch) params.set('arch', arch);
      if (tags) params.set('tags', tags);
      const qs = params.toString();
      const result = await api('get', `/api/v1/edge/nodes${qs ? '?' + qs : ''}`);
      return jsonResponse(result);
    })
  );

  // ── edge_deploy ───────────────────────────────────────────────────────────

  server.registerTool(
    'edge_deploy',
    {
      description:
        'Deploy a task/workload to an edge node. Supports inference, data collection, ' +
        'monitoring, and custom task types. Can auto-select the best node based on requirements.',
      inputSchema: {
        nodeId: z
          .string()
          .optional()
          .describe(
            'Target edge node ID. If omitted, auto-selects best node based on requirements.'
          ),
        taskType: z.string().describe('Task type: inference, collection, monitoring, or custom'),
        config: z.record(z.unknown()).optional().describe('Task configuration as key-value pairs'),
        requirements: z
          .object({
            minMemoryMb: z.number().optional(),
            minCores: z.number().optional(),
            needsGpu: z.boolean().optional(),
            arch: z.string().optional(),
            tags: z.array(z.string()).optional(),
            maxLatencyMs: z.number().optional(),
          })
          .optional()
          .describe('Hardware requirements for auto-routing (used when nodeId is omitted)'),
      },
    },
    wrapToolHandler(
      'edge_deploy',
      middleware,
      async ({ nodeId, taskType, config, requirements }) => {
        let targetNodeId = nodeId;

        // Auto-route if no nodeId specified
        if (!targetNodeId && requirements) {
          const routed = (await api('post', '/api/v1/edge/route', requirements)) as {
            node?: { id: string };
          };
          if (!routed.node) {
            return jsonResponse({
              error: 'No suitable edge node found for the given requirements',
            });
          }
          targetNodeId = routed.node.id;
        }

        if (!targetNodeId) {
          return jsonResponse({ error: 'Either nodeId or requirements must be provided' });
        }

        const result = await api('post', '/api/v1/edge/deployments', {
          nodeId: targetNodeId,
          taskType,
          configJson: config ?? {},
        });
        return jsonResponse(result);
      }
    )
  );

  // ── edge_update ───────────────────────────────────────────────────────────

  server.registerTool(
    'edge_update',
    {
      description:
        'Trigger an OTA (over-the-air) update for an edge node. Sends a new binary version ' +
        'with optional SHA-256 checksum and Ed25519 signature for verification.',
      inputSchema: {
        nodeId: z.string().describe('Edge node ID to update'),
        toVersion: z.string().describe('Target version to update to'),
        sha256: z.string().optional().describe('SHA-256 checksum of the new binary (hex)'),
        ed25519Signature: z
          .string()
          .optional()
          .describe('Ed25519 signature of the new binary (hex)'),
      },
    },
    wrapToolHandler(
      'edge_update',
      middleware,
      async ({ nodeId, toVersion, sha256, ed25519Signature }) => {
        const result = await api(
          'post',
          `/api/v1/edge/nodes/${encodeURIComponent(nodeId)}/update`,
          {
            toVersion,
            sha256,
            ed25519Signature,
          }
        );
        return jsonResponse(result);
      }
    )
  );

  // ── edge_health ───────────────────────────────────────────────────────────

  server.registerTool(
    'edge_health',
    {
      description:
        'Get detailed health and status information for a specific edge node, including ' +
        'capabilities, bandwidth, latency, WireGuard status, version, and last heartbeat.',
      inputSchema: {
        nodeId: z.string().describe('Edge node ID to check'),
      },
    },
    wrapToolHandler('edge_health', middleware, async ({ nodeId }) => {
      const result = await api('get', `/api/v1/edge/nodes/${encodeURIComponent(nodeId)}`);
      return jsonResponse(result);
    })
  );

  // ── edge_decommission ─────────────────────────────────────────────────────

  server.registerTool(
    'edge_decommission',
    {
      description:
        'Decommission an edge node, marking it as permanently offline. ' +
        'Stops all active deployments and removes the node from task routing.',
      inputSchema: {
        nodeId: z.string().describe('Edge node ID to decommission'),
      },
    },
    wrapToolHandler('edge_decommission', middleware, async ({ nodeId }) => {
      const result = await api(
        'post',
        `/api/v1/edge/nodes/${encodeURIComponent(nodeId)}/decommission`
      );
      return jsonResponse(result);
    })
  );
}
