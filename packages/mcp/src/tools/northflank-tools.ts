/**
 * Northflank Tools — trigger builds and deployments on the Northflank PaaS.
 *
 * Requires exposeNorthflank=true and a configured northflankApiKey.
 * Auth: Authorization: Bearer <northflankApiKey>.
 *
 * Phase 90: CI/CD Integration
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler, jsonResponse, errorResponse } from './tool-utils.js';

const NORTHFLANK_BASE = 'https://api.northflank.com/v1';

// ─── Helpers ────────────────────────────────────────────────────────────────

function northflankHeaders(config: McpServiceConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.northflankApiKey) headers.Authorization = `Bearer ${config.northflankApiKey}`;
  return headers;
}

async function northflankFetch(
  config: McpServiceConfig,
  path: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = path.startsWith('http') ? path : `${NORTHFLANK_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...northflankHeaders(config),
      ...(options.headers as Record<string, string> | undefined),
    },
  });
  let body: unknown;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    body = await res.json();
  } else {
    body = await res.text();
  }
  return { ok: res.ok, status: res.status, body };
}

const NORTHFLANK_DISABLED_MSG =
  'Northflank tools are disabled. Set exposeNorthflank=true and configure northflankApiKey in MCP config.';

function disabled() {
  return errorResponse(NORTHFLANK_DISABLED_MSG);
}

// ─── Tool Registration ───────────────────────────────────────────────────────

export function registerNorthflankTools(
  server: McpServer,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  // ── northflank_list_services ──────────────────────────────────────────────
  server.tool(
    'northflank_list_services',
    'List all services in a Northflank project',
    {
      projectId: z.string().min(1).describe('Northflank project ID'),
    },
    wrapToolHandler('northflank_list_services', middleware, async ({ projectId }) => {
      if (!config.exposeNorthflank) return disabled();
      const { ok, status, body } = await northflankFetch(config, `/projects/${projectId}/services`);
      if (!ok) {
        return errorResponse(`Northflank API error ${status}: ${JSON.stringify(body)}`);
      }
      return jsonResponse(body);
    })
  );

  // ── northflank_trigger_build ──────────────────────────────────────────────
  server.tool(
    'northflank_trigger_build',
    'Trigger a build for a Northflank combined/build service',
    {
      projectId: z.string().min(1).describe('Northflank project ID'),
      serviceId: z.string().min(1).describe('Service ID to build'),
      branch: z.string().default('').describe('Branch to build (empty = service default)'),
      sha: z.string().default('').describe('Commit SHA to build (empty = branch HEAD)'),
    },
    wrapToolHandler(
      'northflank_trigger_build',
      middleware,
      async ({ projectId, serviceId, branch, sha }) => {
        if (!config.exposeNorthflank) return disabled();
        const payload: Record<string, string> = {};
        if (branch) payload.branch = branch;
        if (sha) payload.sha = sha;
        const { ok, status, body } = await northflankFetch(
          config,
          `/projects/${projectId}/services/${serviceId}/builds`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
          }
        );
        if (!ok) {
          return errorResponse(`Northflank API error ${status}: ${JSON.stringify(body)}`);
        }
        return jsonResponse(body);
      }
    )
  );

  // ── northflank_get_build ──────────────────────────────────────────────────
  server.tool(
    'northflank_get_build',
    'Get details and status of a specific Northflank build',
    {
      projectId: z.string().min(1).describe('Northflank project ID'),
      serviceId: z.string().min(1).describe('Service ID'),
      buildId: z.string().min(1).describe('Build ID'),
    },
    wrapToolHandler(
      'northflank_get_build',
      middleware,
      async ({ projectId, serviceId, buildId }) => {
        if (!config.exposeNorthflank) return disabled();
        const { ok, status, body } = await northflankFetch(
          config,
          `/projects/${projectId}/services/${serviceId}/builds/${buildId}`
        );
        if (!ok) {
          return errorResponse(`Northflank API error ${status}: ${JSON.stringify(body)}`);
        }
        return jsonResponse(body);
      }
    )
  );

  // ── northflank_list_deployments ───────────────────────────────────────────
  server.tool(
    'northflank_list_deployments',
    'List all deployments in a Northflank project',
    {
      projectId: z.string().min(1).describe('Northflank project ID'),
    },
    wrapToolHandler('northflank_list_deployments', middleware, async ({ projectId }) => {
      if (!config.exposeNorthflank) return disabled();
      const { ok, status, body } = await northflankFetch(
        config,
        `/projects/${projectId}/deployments`
      );
      if (!ok) {
        return errorResponse(`Northflank API error ${status}: ${JSON.stringify(body)}`);
      }
      return jsonResponse(body);
    })
  );

  // ── northflank_trigger_deployment ─────────────────────────────────────────
  server.tool(
    'northflank_trigger_deployment',
    'Trigger a redeployment for a Northflank deployment service',
    {
      projectId: z.string().min(1).describe('Northflank project ID'),
      deploymentId: z.string().min(1).describe('Deployment service ID'),
      imageTag: z.string().default('').describe('Optional specific image tag to deploy'),
    },
    wrapToolHandler(
      'northflank_trigger_deployment',
      middleware,
      async ({ projectId, deploymentId, imageTag }) => {
        if (!config.exposeNorthflank) return disabled();
        const payload: Record<string, string> = {};
        if (imageTag) payload.imageTag = imageTag;
        const { ok, status, body } = await northflankFetch(
          config,
          `/projects/${projectId}/deployments/${deploymentId}/deploy`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
          }
        );
        if (!ok) {
          return errorResponse(`Northflank API error ${status}: ${JSON.stringify(body)}`);
        }
        return jsonResponse(body);
      }
    )
  );
}
