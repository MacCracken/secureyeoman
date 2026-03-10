/**
 * Delta Tools — self-hosted Git forge integration for MCP.
 *
 * Wraps Delta's REST API as MCP tools so any MCP client can manage
 * repositories, pull requests, and CI/CD pipelines through natural language.
 *
 * ## Configuration
 *   DELTA_URL       – Base URL of the Delta instance (default: http://localhost:3000)
 *   DELTA_API_TOKEN – API token for authenticating with Delta
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

const DISABLED_MSG = 'Delta tools are disabled. Set MCP_EXPOSE_DELTA_TOOLS=true to enable.';

function getDeltaUrl(config: McpServiceConfig): string {
  return (
    (config as Record<string, unknown>).deltaUrl ??
    process.env.DELTA_URL ??
    'http://localhost:3000'
  )
    .toString()
    .replace(/\/$/, '');
}

function getDeltaToken(): string | undefined {
  return process.env.DELTA_API_TOKEN;
}

/** Thin wrapper around createHttpClient that injects the auth token and throws on non-ok responses. */
async function delta(
  config: McpServiceConfig,
  method: 'get' | 'post' | 'put' | 'delete',
  path: string,
  body?: unknown
): Promise<unknown> {
  const token = (config as Record<string, unknown>).deltaApiToken ?? getDeltaToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `token ${token}`;

  const client = createHttpClient(getDeltaUrl(config), headers);
  const res = await client[method](path, body);
  if (!res.ok) {
    const msg = (res.body as { message?: string })?.message ?? `HTTP ${res.status}`;
    throw new Error(`Delta API error: ${msg}`);
  }
  return res.body;
}

export function registerDeltaTools(
  server: McpServer,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  if (!(config as Record<string, unknown>).exposeDeltaTools) {
    registerDisabledStub(server, middleware, 'delta_status', DISABLED_MSG);
    return;
  }

  // ── List Repositories ────────────────────────────────────────────────────

  server.registerTool(
    'delta_list_repos',
    {
      description:
        'List repositories on the Delta instance. Returns an array of repos with ' +
        'name, owner, description, stars, forks, and visibility.',
      inputSchema: {},
    },
    wrapToolHandler('delta_list_repos', middleware, async () => {
      const result = await delta(config, 'get', '/api/v1/repos/search');
      return jsonResponse(result);
    })
  );

  // ── Get Repository ───────────────────────────────────────────────────────

  server.registerTool(
    'delta_get_repo',
    {
      description:
        'Get detailed information about a specific Delta repository, including ' +
        'description, default branch, clone URLs, permissions, and statistics.',
      inputSchema: {
        owner: z.string().min(1).describe('Repository owner username or organization'),
        name: z.string().min(1).describe('Repository name'),
      },
    },
    wrapToolHandler('delta_get_repo', middleware, async (args) => {
      const result = await delta(
        config,
        'get',
        `/api/v1/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.name)}`
      );
      return jsonResponse(result);
    })
  );

  // ── List Pull Requests ───────────────────────────────────────────────────

  server.registerTool(
    'delta_list_pulls',
    {
      description:
        'List pull requests for a Delta repository. Filterable by state ' +
        '(open, closed, all). Returns title, author, labels, and review status.',
      inputSchema: {
        owner: z.string().min(1).describe('Repository owner'),
        name: z.string().min(1).describe('Repository name'),
        state: z
          .enum(['open', 'closed', 'all'])
          .optional()
          .describe('Filter by PR state (default: open)'),
      },
    },
    wrapToolHandler('delta_list_pulls', middleware, async (args) => {
      const qs = args.state ? `?state=${args.state}` : '';
      const result = await delta(
        config,
        'get',
        `/api/v1/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.name)}/pulls${qs}`
      );
      return jsonResponse(result);
    })
  );

  // ── Get Pull Request ─────────────────────────────────────────────────────

  server.registerTool(
    'delta_get_pull',
    {
      description:
        'Get detailed information about a specific pull request, including diff stats, ' +
        'review comments, merge status, and CI check results.',
      inputSchema: {
        owner: z.string().min(1).describe('Repository owner'),
        name: z.string().min(1).describe('Repository name'),
        number: z.number().int().positive().describe('Pull request number'),
      },
    },
    wrapToolHandler('delta_get_pull', middleware, async (args) => {
      const result = await delta(
        config,
        'get',
        `/api/v1/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.name)}/pulls/${args.number}`
      );
      return jsonResponse(result);
    })
  );

  // ── Merge Pull Request ───────────────────────────────────────────────────

  server.registerTool(
    'delta_merge_pull',
    {
      description:
        'Merge a pull request. Supports merge, rebase, and squash strategies. ' +
        'IMPORTANT: This modifies the target branch — confirm intent before calling.',
      inputSchema: {
        owner: z.string().min(1).describe('Repository owner'),
        name: z.string().min(1).describe('Repository name'),
        number: z.number().int().positive().describe('Pull request number'),
        strategy: z
          .enum(['merge', 'rebase', 'squash'])
          .optional()
          .describe('Merge strategy (default: merge)'),
      },
    },
    wrapToolHandler('delta_merge_pull', middleware, async (args) => {
      const result = await delta(
        config,
        'post',
        `/api/v1/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.name)}/pulls/${args.number}/merge`,
        { Do: args.strategy ?? 'merge' }
      );
      return jsonResponse(result);
    })
  );

  // ── List Pipelines ───────────────────────────────────────────────────────

  server.registerTool(
    'delta_list_pipelines',
    {
      description:
        'List CI/CD pipeline (Actions) runs for a Delta repository. ' +
        'Filterable by status (success, failure, running, pending).',
      inputSchema: {
        owner: z.string().min(1).describe('Repository owner'),
        name: z.string().min(1).describe('Repository name'),
        status: z
          .enum(['success', 'failure', 'running', 'pending'])
          .optional()
          .describe('Filter by pipeline status'),
      },
    },
    wrapToolHandler('delta_list_pipelines', middleware, async (args) => {
      const qs = args.status ? `?status=${args.status}` : '';
      const result = await delta(
        config,
        'get',
        `/api/v1/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.name)}/actions/runs${qs}`
      );
      return jsonResponse(result);
    })
  );

  // ── Trigger Pipeline ─────────────────────────────────────────────────────

  server.registerTool(
    'delta_trigger_pipeline',
    {
      description:
        'Trigger a CI/CD pipeline run on a Delta repository. Optionally specify a ' +
        'git ref (branch or tag) to run against.',
      inputSchema: {
        owner: z.string().min(1).describe('Repository owner'),
        name: z.string().min(1).describe('Repository name'),
        ref: z
          .string()
          .optional()
          .describe('Git ref (branch or tag) to run against (default: default branch)'),
      },
    },
    wrapToolHandler('delta_trigger_pipeline', middleware, async (args) => {
      const result = await delta(
        config,
        'post',
        `/api/v1/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.name)}/actions/dispatch`,
        { ref: args.ref }
      );
      return jsonResponse(result);
    })
  );

  // ── Cancel Pipeline ──────────────────────────────────────────────────────

  server.registerTool(
    'delta_cancel_pipeline',
    {
      description: 'Cancel a running CI/CD pipeline by its run ID.',
      inputSchema: {
        owner: z.string().min(1).describe('Repository owner'),
        name: z.string().min(1).describe('Repository name'),
        pipeline_id: z.number().int().positive().describe('Pipeline run ID to cancel'),
      },
    },
    wrapToolHandler('delta_cancel_pipeline', middleware, async (args) => {
      const result = await delta(
        config,
        'post',
        `/api/v1/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.name)}/actions/runs/${args.pipeline_id}/cancel`
      );
      return jsonResponse(result);
    })
  );

  // ── Job Logs ─────────────────────────────────────────────────────────────

  server.registerTool(
    'delta_job_logs',
    {
      description:
        'Get logs for a specific job within a CI/CD pipeline run. Returns the raw log output.',
      inputSchema: {
        owner: z.string().min(1).describe('Repository owner'),
        name: z.string().min(1).describe('Repository name'),
        pipeline_id: z.number().int().positive().describe('Pipeline run ID'),
        job_id: z.number().int().positive().describe('Job ID within the pipeline run'),
      },
    },
    wrapToolHandler('delta_job_logs', middleware, async (args) => {
      const result = await delta(
        config,
        'get',
        `/api/v1/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.name)}/actions/runs/${args.pipeline_id}/jobs/${args.job_id}/logs`
      );
      return jsonResponse(result);
    })
  );

  // ── Create Commit Status ─────────────────────────────────────────────────

  server.registerTool(
    'delta_create_status',
    {
      description:
        'Create a commit status check on a specific commit SHA. Used to report CI results, ' +
        'code quality checks, or deployment status back to the Delta UI.',
      inputSchema: {
        owner: z.string().min(1).describe('Repository owner'),
        name: z.string().min(1).describe('Repository name'),
        sha: z.string().min(7).max(64).describe('Full or abbreviated commit SHA'),
        context: z.string().min(1).max(255).describe('Status context name, e.g. "ci/build"'),
        state: z.enum(['pending', 'success', 'error', 'failure']).describe('Status state'),
        description: z.string().max(1000).optional().describe('Human-readable status description'),
        target_url: z
          .string()
          .url()
          .optional()
          .describe('URL to link to for more details (e.g. CI build page)'),
      },
    },
    wrapToolHandler('delta_create_status', middleware, async (args) => {
      const result = await delta(
        config,
        'post',
        `/api/v1/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.name)}/statuses/${encodeURIComponent(args.sha)}`,
        {
          context: args.context,
          state: args.state,
          description: args.description ?? '',
          target_url: args.target_url ?? '',
        }
      );
      return jsonResponse(result);
    })
  );
}
