/**
 * GitLab CI Tools — list, trigger, and monitor GitLab CI/CD pipelines.
 *
 * Requires exposeGitlabCi=true and a configured gitlabToken (Personal Access Token).
 * Auth: PRIVATE-TOKEN header.
 *
 * Phase 90: CI/CD Integration
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler, jsonResponse, errorResponse } from './tool-utils.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function gitlabHeaders(config: McpServiceConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.gitlabToken) headers['PRIVATE-TOKEN'] = config.gitlabToken;
  return headers;
}

async function gitlabFetch(
  config: McpServiceConfig,
  path: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const base = (config.gitlabUrl ?? 'https://gitlab.com').replace(/\/$/, '');
  const url = path.startsWith('http') ? path : `${base}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...gitlabHeaders(config),
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

const GITLAB_DISABLED_MSG =
  'GitLab CI tools are disabled. Set exposeGitlabCi=true and configure gitlabToken in MCP config.';

// ─── Tool Registration ───────────────────────────────────────────────────────

export function registerGitlabCiTools(
  server: McpServer,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  // ── gitlab_list_pipelines ─────────────────────────────────────────────────
  server.tool(
    'gitlab_list_pipelines',
    'List recent CI/CD pipelines for a GitLab project',
    {
      projectId: z
        .string()
        .min(1)
        .describe('GitLab project ID (numeric) or URL-encoded path (e.g. group%2Frepo)'),
      ref: z.string().default('').describe('Filter by branch or tag (empty = all)'),
      status: z
        .enum([
          'created',
          'waiting_for_resource',
          'preparing',
          'pending',
          'running',
          'success',
          'failed',
          'canceled',
          'skipped',
          'manual',
          'scheduled',
          '',
        ])
        .default('')
        .describe('Filter by pipeline status (empty = all)'),
      perPage: z.number().int().min(1).max(100).default(20).describe('Pipelines to return'),
    },
    wrapToolHandler(
      'gitlab_list_pipelines',
      middleware,
      async ({ projectId, ref, status, perPage }) => {
        if (!config.exposeGitlabCi) return errorResponse(GITLAB_DISABLED_MSG);
        const params = new URLSearchParams({ per_page: String(perPage) });
        if (ref) params.set('ref', ref);
        if (status) params.set('status', status);
        const {
          ok,
          status: s,
          body,
        } = await gitlabFetch(config, `/api/v4/projects/${projectId}/pipelines?${params}`);
        if (!ok) {
          return {
            content: [{ type: 'text', text: `GitLab API error ${s}: ${JSON.stringify(body)}` }],
            isError: true,
          };
        }
        return jsonResponse(body);
      }
    )
  );

  // ── gitlab_trigger_pipeline ───────────────────────────────────────────────
  server.tool(
    'gitlab_trigger_pipeline',
    'Trigger a new GitLab CI/CD pipeline on a specified ref',
    {
      projectId: z.string().min(1).describe('GitLab project ID or URL-encoded path'),
      ref: z.string().min(1).describe('Branch, tag, or commit SHA to run the pipeline on'),
      variables: z
        .array(z.object({ key: z.string(), value: z.string() }))
        .default([])
        .describe('Pipeline variables as [{key, value}] pairs'),
    },
    wrapToolHandler(
      'gitlab_trigger_pipeline',
      middleware,
      async ({ projectId, ref, variables }) => {
        if (!config.exposeGitlabCi) return errorResponse(GITLAB_DISABLED_MSG);
        const { ok, status, body } = await gitlabFetch(
          config,
          `/api/v4/projects/${projectId}/pipeline`,
          {
            method: 'POST',
            body: JSON.stringify({ ref, variables }),
          }
        );
        if (!ok) {
          return {
            content: [
              { type: 'text', text: `GitLab API error ${status}: ${JSON.stringify(body)}` },
            ],
            isError: true,
          };
        }
        return jsonResponse(body);
      }
    )
  );

  // ── gitlab_get_pipeline ───────────────────────────────────────────────────
  server.tool(
    'gitlab_get_pipeline',
    'Get details and status of a specific GitLab CI/CD pipeline',
    {
      projectId: z.string().min(1).describe('GitLab project ID or URL-encoded path'),
      pipelineId: z.number().int().positive().describe('Pipeline ID'),
    },
    wrapToolHandler('gitlab_get_pipeline', middleware, async ({ projectId, pipelineId }) => {
      if (!config.exposeGitlabCi) return errorResponse(GITLAB_DISABLED_MSG);
      const { ok, status, body } = await gitlabFetch(
        config,
        `/api/v4/projects/${projectId}/pipelines/${pipelineId}`
      );
      if (!ok) {
        return {
          content: [{ type: 'text', text: `GitLab API error ${status}: ${JSON.stringify(body)}` }],
          isError: true,
        };
      }
      return jsonResponse(body);
    })
  );

  // ── gitlab_get_job_log ────────────────────────────────────────────────────
  server.tool(
    'gitlab_get_job_log',
    'Get the log (trace) output for a specific GitLab CI job',
    {
      projectId: z.string().min(1).describe('GitLab project ID or URL-encoded path'),
      jobId: z.number().int().positive().describe('Job ID'),
    },
    wrapToolHandler('gitlab_get_job_log', middleware, async ({ projectId, jobId }) => {
      if (!config.exposeGitlabCi) return errorResponse(GITLAB_DISABLED_MSG);
      const { ok, status, body } = await gitlabFetch(
        config,
        `/api/v4/projects/${projectId}/jobs/${jobId}/trace`
      );
      if (!ok) {
        return {
          content: [{ type: 'text', text: `GitLab API error ${status}: ${JSON.stringify(body)}` }],
          isError: true,
        };
      }
      return { content: [{ type: 'text', text: String(body) }] };
    })
  );

  // ── gitlab_cancel_pipeline ────────────────────────────────────────────────
  server.tool(
    'gitlab_cancel_pipeline',
    'Cancel a running GitLab CI/CD pipeline',
    {
      projectId: z.string().min(1).describe('GitLab project ID or URL-encoded path'),
      pipelineId: z.number().int().positive().describe('Pipeline ID to cancel'),
    },
    wrapToolHandler('gitlab_cancel_pipeline', middleware, async ({ projectId, pipelineId }) => {
      if (!config.exposeGitlabCi) return errorResponse(GITLAB_DISABLED_MSG);
      const { ok, status, body } = await gitlabFetch(
        config,
        `/api/v4/projects/${projectId}/pipelines/${pipelineId}/cancel`,
        { method: 'POST' }
      );
      if (!ok) {
        return {
          content: [{ type: 'text', text: `GitLab API error ${status}: ${JSON.stringify(body)}` }],
          isError: true,
        };
      }
      return jsonResponse(body);
    })
  );
}
