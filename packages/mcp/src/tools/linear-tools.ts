/**
 * Linear Tools — MCP tools for managing Linear issues, comments, and teams.
 *
 * All tools proxy through the core API's /api/v1/integrations/linear/* endpoints.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { buildQueryFromArgs, registerApiProxyTool } from './tool-utils.js';

export function registerLinearTools(
  server: McpServer,
  client: CoreApiClient,
  middleware: ToolMiddleware
): void {
  // ── linear_list_issues ──────────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'linear_list_issues',
    description:
      'List Linear issues with optional filters for team, status, and assignee. Returns up to `limit` issue stubs.',
    inputSchema: {
      teamId: z.string().optional().describe('Filter by Linear team ID'),
      status: z.string().optional().describe('Filter by issue status (e.g. "In Progress", "Done")'),
      assigneeId: z.string().optional().describe('Filter by assignee user ID'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(25)
        .describe('Maximum number of issues to return (1-100, default 25)'),
    },
    buildPath: () => '/api/v1/integrations/linear/issues',
    buildQuery: (args) => buildQueryFromArgs(args, ['teamId', 'status', 'assigneeId', 'limit']),
  });

  // ── linear_get_issue ────────────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'linear_get_issue',
    description:
      'Get a single Linear issue by ID. Returns full issue details including title, description, status, priority, assignee, and labels.',
    inputSchema: {
      issueId: z.string().describe('Linear issue ID (e.g. "ABC-123")'),
    },
    buildPath: (args) =>
      `/api/v1/integrations/linear/issues/${encodeURIComponent(args.issueId as string)}`,
  });

  // ── linear_create_issue ─────────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'linear_create_issue',
    description:
      'Create a new Linear issue in the specified team. Returns the created issue with its ID and URL.',
    inputSchema: {
      title: z.string().describe('Issue title'),
      description: z.string().optional().describe('Issue description (supports markdown)'),
      teamId: z.string().describe('Team ID to create the issue in'),
      priority: z
        .number()
        .int()
        .min(0)
        .max(4)
        .optional()
        .describe('Priority level: 0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low'),
      assigneeId: z.string().optional().describe('User ID to assign the issue to'),
      labelIds: z.array(z.string()).optional().describe('Array of label IDs to apply to the issue'),
    },
    method: 'post',
    buildPath: () => '/api/v1/integrations/linear/issues',
    buildBody: (args) => ({
      title: args.title,
      description: args.description,
      teamId: args.teamId,
      priority: args.priority,
      assigneeId: args.assigneeId,
      labelIds: args.labelIds,
    }),
  });

  // ── linear_update_issue ─────────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'linear_update_issue',
    description:
      'Update an existing Linear issue. Only provided fields are changed; omitted fields remain unchanged. Returns the updated issue.',
    inputSchema: {
      issueId: z.string().describe('Linear issue ID to update (e.g. "ABC-123")'),
      title: z.string().optional().describe('New issue title'),
      description: z.string().optional().describe('New issue description (supports markdown)'),
      stateId: z
        .string()
        .optional()
        .describe('New workflow state ID (use linear_list_teams to discover states)'),
      priority: z
        .number()
        .int()
        .min(0)
        .max(4)
        .optional()
        .describe('New priority level: 0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low'),
      assigneeId: z.string().optional().describe('New assignee user ID'),
    },
    method: 'put',
    buildPath: (args) =>
      `/api/v1/integrations/linear/issues/${encodeURIComponent(args.issueId as string)}`,
    buildBody: (args) => {
      const body: Record<string, unknown> = {};
      if (args.title !== undefined) body.title = args.title;
      if (args.description !== undefined) body.description = args.description;
      if (args.stateId !== undefined) body.stateId = args.stateId;
      if (args.priority !== undefined) body.priority = args.priority;
      if (args.assigneeId !== undefined) body.assigneeId = args.assigneeId;
      return body;
    },
  });

  // ── linear_create_comment ───────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'linear_create_comment',
    description:
      'Add a comment to a Linear issue. Supports markdown formatting. Returns the created comment.',
    inputSchema: {
      issueId: z.string().describe('Linear issue ID to comment on (e.g. "ABC-123")'),
      body: z.string().describe('Comment text (supports markdown)'),
    },
    method: 'post',
    buildPath: (args) =>
      `/api/v1/integrations/linear/issues/${encodeURIComponent(args.issueId as string)}/comments`,
    buildBody: (args) => ({
      body: args.body,
    }),
  });

  // ── linear_list_teams ───────────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'linear_list_teams',
    description:
      'List all Linear teams accessible to the connected account. Returns team IDs, names, and keys.',
    inputSchema: {},
    buildPath: () => '/api/v1/integrations/linear/teams',
  });

  // ── linear_search_issues ────────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'linear_search_issues',
    description:
      'Search Linear issues by text query. Searches across titles, descriptions, and comments. Returns matching issue stubs.',
    inputSchema: {
      query: z.string().describe('Search query string'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(25)
        .describe('Maximum number of results to return (1-100, default 25)'),
    },
    buildPath: () => '/api/v1/integrations/linear/issues/search',
    buildQuery: (args) => buildQueryFromArgs(args, ['query', 'limit']),
  });
}
