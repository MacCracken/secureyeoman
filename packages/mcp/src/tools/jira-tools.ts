/**
 * Jira Tools — MCP tools for interacting with Jira issues and projects.
 *
 * All tools proxy through the core API's /api/v1/integrations/jira/* endpoints.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { registerApiProxyTool } from './tool-utils.js';

export function registerJiraTools(
  server: McpServer,
  client: CoreApiClient,
  middleware: ToolMiddleware
): void {
  // ── jira_search_issues ─────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'jira_search_issues',
    description:
      'Search for Jira issues using JQL (Jira Query Language). Returns matching issues with key, summary, status, and assignee.',
    inputSchema: {
      jql: z.string().describe('JQL query string (e.g. "project = PROJ AND status = Open")'),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Maximum number of results to return (default 25)'),
    },
    buildPath: () => '/api/v1/integrations/jira/issues/search',
    buildQuery: (args) => {
      const q: Record<string, string> = {};
      q.jql = args.jql as string;
      if (args.maxResults) q.maxResults = String(args.maxResults);
      return q;
    },
  });

  // ── jira_get_issue ─────────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'jira_get_issue',
    description:
      'Get a single Jira issue by its key (e.g. "PROJ-123"). Returns the full issue including summary, description, status, assignee, priority, and comments.',
    inputSchema: {
      issueKey: z.string().describe('Jira issue key (e.g. "PROJ-123")'),
    },
    buildPath: (args) => `/api/v1/integrations/jira/issues/${args.issueKey}`,
  });

  // ── jira_create_issue ──────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'jira_create_issue',
    description: 'Create a new Jira issue. Returns the created issue key and ID.',
    inputSchema: {
      projectKey: z.string().describe('Project key (e.g. "PROJ")'),
      summary: z.string().describe('Issue summary / title'),
      issueType: z
        .string()
        .optional()
        .describe('Issue type name (default "Task"). Common values: Task, Bug, Story, Epic'),
      description: z
        .string()
        .optional()
        .describe('Issue description (plain text or Atlassian Document Format)'),
      assignee: z.string().optional().describe('Assignee account ID or email'),
      priority: z.string().optional().describe('Priority name (e.g. "High", "Medium", "Low")'),
    },
    method: 'post',
    buildPath: () => '/api/v1/integrations/jira/issues',
    buildBody: (args) => ({
      projectKey: args.projectKey,
      summary: args.summary,
      issueType: args.issueType ?? 'Task',
      description: args.description,
      assignee: args.assignee,
      priority: args.priority,
    }),
  });

  // ── jira_update_issue ──────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'jira_update_issue',
    description:
      'Update an existing Jira issue. Only provided fields are changed. Returns the updated issue.',
    inputSchema: {
      issueKey: z.string().describe('Jira issue key (e.g. "PROJ-123")'),
      summary: z.string().optional().describe('New issue summary'),
      description: z.string().optional().describe('New issue description'),
      assignee: z.string().optional().describe('New assignee account ID or email'),
      priority: z.string().optional().describe('New priority name (e.g. "High", "Medium", "Low")'),
    },
    method: 'put',
    buildPath: (args) => `/api/v1/integrations/jira/issues/${args.issueKey}`,
    buildBody: (args) => ({
      issueKey: args.issueKey,
      summary: args.summary,
      description: args.description,
      assignee: args.assignee,
      priority: args.priority,
    }),
  });

  // ── jira_create_comment ────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'jira_create_comment',
    description: 'Add a comment to a Jira issue. Returns the created comment with its ID.',
    inputSchema: {
      issueKey: z.string().describe('Jira issue key (e.g. "PROJ-123")'),
      body: z.string().describe('Comment text'),
    },
    method: 'post',
    buildPath: (args) => `/api/v1/integrations/jira/issues/${args.issueKey}/comments`,
    buildBody: (args) => ({
      issueKey: args.issueKey,
      body: args.body,
    }),
  });

  // ── jira_list_projects ─────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'jira_list_projects',
    description:
      'List all accessible Jira projects. Returns an array of project objects with keys, names, and lead information.',
    inputSchema: {},
    buildPath: () => '/api/v1/integrations/jira/projects',
  });

  // ── jira_get_transitions ───────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'jira_get_transitions',
    description:
      'Get the available workflow transitions for a Jira issue. Returns transition IDs and names that can be used with jira_transition_issue.',
    inputSchema: {
      issueKey: z.string().describe('Jira issue key (e.g. "PROJ-123")'),
    },
    buildPath: (args) => `/api/v1/integrations/jira/issues/${args.issueKey}/transitions`,
  });

  // ── jira_transition_issue ──────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'jira_transition_issue',
    description:
      'Transition a Jira issue to a new status by providing a transition ID (from jira_get_transitions). Returns confirmation of the transition.',
    inputSchema: {
      issueKey: z.string().describe('Jira issue key (e.g. "PROJ-123")'),
      transitionId: z.string().describe('Transition ID (from jira_get_transitions)'),
    },
    method: 'post',
    buildPath: (args) => `/api/v1/integrations/jira/issues/${args.issueKey}/transitions`,
    buildBody: (args) => ({
      issueKey: args.issueKey,
      transitionId: args.transitionId,
    }),
  });
}
