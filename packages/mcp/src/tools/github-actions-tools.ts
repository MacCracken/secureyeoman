/**
 * GitHub Actions Tools — trigger and monitor GitHub Actions workflows.
 *
 * Requires MCP_EXPOSE_GITHUB_ACTIONS=true (exposeGithubActions) to enable.
 * Reuses the existing GitHub OAuth token from config.githubToken or the
 * GITHUB_TOKEN environment variable.
 *
 * Phase 90: CI/CD Integration
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler, jsonResponse, errorResponse, checkHttpOk } from './tool-utils.js';

const GHA_BASE = 'https://api.github.com';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getToken(_config: McpServiceConfig): string | undefined {
  return process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? undefined;
}

function ghaHeaders(config: McpServiceConfig): Record<string, string> {
  const token = getToken(config);
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function ghaFetch(
  config: McpServiceConfig,
  path: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = path.startsWith('http') ? path : `${GHA_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { ...ghaHeaders(config), ...(options.headers as Record<string, string> | undefined) },
    signal: AbortSignal.timeout(30_000),
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

const GHA_DISABLED_MSG =
  'GitHub Actions tools are disabled. Set exposeGithubActions=true in MCP config to enable.';

// ─── Tool Registration ───────────────────────────────────────────────────────

export function registerGithubActionsTools(
  server: McpServer,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  // ── gha_list_workflows ────────────────────────────────────────────────────
  server.tool(
    'gha_list_workflows',
    'List all GitHub Actions workflows in a repository',
    {
      owner: z.string().min(1).describe('Repository owner (user or org)'),
      repo: z.string().min(1).describe('Repository name'),
    },
    wrapToolHandler('gha_list_workflows', middleware, async ({ owner, repo }) => {
      if (!config.exposeGithubActions) return errorResponse(GHA_DISABLED_MSG);
      const result = await ghaFetch(config, `/repos/${owner}/${repo}/actions/workflows`);
      return checkHttpOk(result, 'GitHub API error') ?? jsonResponse(result.body);
    })
  );

  // ── gha_dispatch_workflow ─────────────────────────────────────────────────
  server.tool(
    'gha_dispatch_workflow',
    'Trigger a workflow dispatch event for a GitHub Actions workflow',
    {
      owner: z.string().min(1).describe('Repository owner'),
      repo: z.string().min(1).describe('Repository name'),
      workflowId: z
        .string()
        .min(1)
        .describe('Workflow file name (e.g. ci.yml) or numeric workflow ID'),
      ref: z.string().default('main').describe('Branch or tag to run the workflow on'),
      inputs: z
        .record(z.string())
        .default({})
        .describe('Workflow dispatch inputs as key/value string pairs'),
    },
    wrapToolHandler(
      'gha_dispatch_workflow',
      middleware,
      async ({ owner, repo, workflowId, ref, inputs }) => {
        if (!config.exposeGithubActions) return errorResponse(GHA_DISABLED_MSG);
        const result = await ghaFetch(
          config,
          `/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ref, inputs }),
          }
        );
        const err = checkHttpOk(result, 'GitHub API error');
        if (err) return err;
        // 204 No Content on success
        return jsonResponse({ dispatched: true, owner, repo, workflowId, ref, inputs });
      }
    )
  );

  // ── gha_list_runs ─────────────────────────────────────────────────────────
  server.tool(
    'gha_list_runs',
    'List workflow runs for a GitHub repository, optionally filtered by branch and status',
    {
      owner: z.string().min(1).describe('Repository owner'),
      repo: z.string().min(1).describe('Repository name'),
      branch: z.string().default('').describe('Filter by branch name (empty = all branches)'),
      status: z
        .enum(['queued', 'in_progress', 'completed', 'waiting', 'requested', 'pending', ''])
        .default('')
        .describe('Filter by run status (empty = all)'),
      perPage: z.number().int().min(1).max(100).default(20).describe('Number of runs to return'),
    },
    wrapToolHandler(
      'gha_list_runs',
      middleware,
      async ({ owner, repo, branch, status, perPage }) => {
        if (!config.exposeGithubActions) return errorResponse(GHA_DISABLED_MSG);
        const params = new URLSearchParams({ per_page: String(perPage) });
        if (branch) params.set('branch', branch);
        if (status) params.set('status', status);
        const result = await ghaFetch(config, `/repos/${owner}/${repo}/actions/runs?${params}`);
        return checkHttpOk(result, 'GitHub API error') ?? jsonResponse(result.body);
      }
    )
  );

  // ── gha_get_run ───────────────────────────────────────────────────────────
  server.tool(
    'gha_get_run',
    'Get details and status of a specific GitHub Actions workflow run',
    {
      owner: z.string().min(1).describe('Repository owner'),
      repo: z.string().min(1).describe('Repository name'),
      runId: z.number().int().positive().describe('Workflow run ID'),
    },
    wrapToolHandler('gha_get_run', middleware, async ({ owner, repo, runId }) => {
      if (!config.exposeGithubActions) return errorResponse(GHA_DISABLED_MSG);
      const result = await ghaFetch(config, `/repos/${owner}/${repo}/actions/runs/${runId}`);
      return checkHttpOk(result, 'GitHub API error') ?? jsonResponse(result.body);
    })
  );

  // ── gha_cancel_run ────────────────────────────────────────────────────────
  server.tool(
    'gha_cancel_run',
    'Cancel a running or queued GitHub Actions workflow run',
    {
      owner: z.string().min(1).describe('Repository owner'),
      repo: z.string().min(1).describe('Repository name'),
      runId: z.number().int().positive().describe('Workflow run ID to cancel'),
    },
    wrapToolHandler('gha_cancel_run', middleware, async ({ owner, repo, runId }) => {
      if (!config.exposeGithubActions) return errorResponse(GHA_DISABLED_MSG);
      const result = await ghaFetch(
        config,
        `/repos/${owner}/${repo}/actions/runs/${runId}/cancel`,
        { method: 'POST' }
      );
      const err = checkHttpOk(result, 'GitHub API error');
      if (err) return err;
      return jsonResponse({ cancelled: true, owner, repo, runId });
    })
  );

  // ── gha_get_run_logs ──────────────────────────────────────────────────────
  server.tool(
    'gha_get_run_logs',
    'Get the download URL for logs of a completed GitHub Actions workflow run',
    {
      owner: z.string().min(1).describe('Repository owner'),
      repo: z.string().min(1).describe('Repository name'),
      runId: z.number().int().positive().describe('Workflow run ID'),
    },
    wrapToolHandler('gha_get_run_logs', middleware, async ({ owner, repo, runId }) => {
      if (!config.exposeGithubActions) return errorResponse(GHA_DISABLED_MSG);
      // GitHub returns a 302 redirect to a signed S3 URL; we capture it without following
      const _token = getToken(config);
      const url = `${GHA_BASE}/repos/${owner}/${repo}/actions/runs/${runId}/logs`;
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        headers: ghaHeaders(config),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 302) {
        const logsUrl = res.headers.get('location') ?? '';
        return jsonResponse({ logsUrl, runId, owner, repo });
      }
      const body = await res.text();
      return {
        content: [{ type: 'text', text: `GitHub API response ${res.status}: ${body}` }],
        isError: res.status >= 400,
      };
    })
  );
}
