/**
 * Jenkins Tools — trigger and monitor Jenkins CI jobs.
 *
 * Requires exposeJenkins=true and a configured jenkinsUrl + credentials.
 * Auth: HTTP Basic with username:apiToken.
 *
 * Phase 90: CI/CD Integration
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';
import {
  wrapToolHandler,
  jsonResponse,
  errorResponse,
  checkHttpOk,
  textResponse,
} from './tool-utils.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function basicAuth(config: McpServiceConfig): string | undefined {
  if (!config.jenkinsUsername || !config.jenkinsApiToken) return undefined;
  return `Basic ${Buffer.from(`${config.jenkinsUsername}:${config.jenkinsApiToken}`).toString('base64')}`;
}

function jenkinsHeaders(config: McpServiceConfig): Record<string, string> {
  const headers: Record<string, string> = {};
  const auth = basicAuth(config);
  if (auth) headers.Authorization = auth;
  return headers;
}

async function jenkinsFetch(
  config: McpServiceConfig,
  path: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const base = (config.jenkinsUrl ?? '').replace(/\/$/, '');
  const url = path.startsWith('http') ? path : `${base}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...jenkinsHeaders(config),
      ...(options.headers as Record<string, string> | undefined),
    },
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

const JENKINS_DISABLED_MSG =
  'Jenkins tools are disabled. Set exposeJenkins=true and configure jenkinsUrl, jenkinsUsername, jenkinsApiToken in MCP config.';

// ─── Tool Registration ───────────────────────────────────────────────────────

export function registerJenkinsTools(
  server: McpServer,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  // ── jenkins_list_jobs ─────────────────────────────────────────────────────
  server.tool(
    'jenkins_list_jobs',
    'List all jobs on the Jenkins server with their name, URL, and build color/status',
    {},
    wrapToolHandler('jenkins_list_jobs', middleware, async () => {
      if (!config.exposeJenkins) return errorResponse(JENKINS_DISABLED_MSG);
      const result = await jenkinsFetch(config, '/api/json?tree=jobs[name,url,color]');
      return checkHttpOk(result, 'Jenkins API error') ?? jsonResponse(result.body);
    })
  );

  // ── jenkins_trigger_build ─────────────────────────────────────────────────
  server.tool(
    'jenkins_trigger_build',
    'Trigger a Jenkins job build, optionally with parameters',
    {
      jobName: z
        .string()
        .min(1)
        .describe('Jenkins job name (URL-encoded if nested, e.g. folder%2Fjob)'),
      parameters: z
        .record(z.string())
        .default({})
        .describe('Build parameters as key/value pairs; omit for parameterless builds'),
    },
    wrapToolHandler('jenkins_trigger_build', middleware, async ({ jobName, parameters }) => {
      if (!config.exposeJenkins) return errorResponse(JENKINS_DISABLED_MSG);
      const hasParams = Object.keys(parameters).length > 0;
      const endpoint = hasParams ? `/job/${jobName}/buildWithParameters` : `/job/${jobName}/build`;
      const body = hasParams ? new URLSearchParams(parameters).toString() : undefined;
      const headers: Record<string, string> = {};
      if (hasParams) headers['Content-Type'] = 'application/x-www-form-urlencoded';
      const res = await jenkinsFetch(config, endpoint, {
        method: 'POST',
        headers,
        body,
      });
      const err = checkHttpOk(res, 'Jenkins API error');
      if (err) return err;
      return jsonResponse({ triggered: true, jobName, parameters });
    })
  );

  // ── jenkins_get_build ─────────────────────────────────────────────────────
  server.tool(
    'jenkins_get_build',
    'Get details of a specific Jenkins job build (status, result, duration, timestamp)',
    {
      jobName: z.string().min(1).describe('Jenkins job name'),
      buildNumber: z
        .number()
        .int()
        .positive()
        .describe('Build number (use lastBuild=true to get the latest)'),
    },
    wrapToolHandler('jenkins_get_build', middleware, async ({ jobName, buildNumber }) => {
      if (!config.exposeJenkins) return errorResponse(JENKINS_DISABLED_MSG);
      const result = await jenkinsFetch(config, `/job/${jobName}/${buildNumber}/api/json`);
      return checkHttpOk(result, 'Jenkins API error') ?? jsonResponse(result.body);
    })
  );

  // ── jenkins_get_build_log ─────────────────────────────────────────────────
  server.tool(
    'jenkins_get_build_log',
    'Get the console text log for a specific Jenkins job build',
    {
      jobName: z.string().min(1).describe('Jenkins job name'),
      buildNumber: z.number().int().positive().describe('Build number'),
      startByte: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe('Byte offset to start reading from (for streaming large logs)'),
    },
    wrapToolHandler(
      'jenkins_get_build_log',
      middleware,
      async ({ jobName, buildNumber, startByte }) => {
        if (!config.exposeJenkins) return errorResponse(JENKINS_DISABLED_MSG);
        const path =
          startByte > 0
            ? `/job/${jobName}/${buildNumber}/logText/progressiveText?start=${startByte}`
            : `/job/${jobName}/${buildNumber}/consoleText`;
        const result = await jenkinsFetch(config, path);
        const err = checkHttpOk(result, 'Jenkins API error');
        if (err) return err;
        return textResponse(String(result.body));
      }
    )
  );

  // ── jenkins_queue_item ────────────────────────────────────────────────────
  server.tool(
    'jenkins_queue_item',
    'Get the status of a Jenkins queue item (to find the build number after triggering)',
    {
      itemId: z
        .number()
        .int()
        .positive()
        .describe('Queue item ID from the Location header after triggering a build'),
    },
    wrapToolHandler('jenkins_queue_item', middleware, async ({ itemId }) => {
      if (!config.exposeJenkins) return errorResponse(JENKINS_DISABLED_MSG);
      const result = await jenkinsFetch(config, `/queue/item/${itemId}/api/json`);
      return checkHttpOk(result, 'Jenkins API error') ?? jsonResponse(result.body);
    })
  );
}
