/**
 * Todoist Tools — MCP tools for managing Todoist tasks and projects.
 *
 * All tools proxy through the core API's /api/v1/integrations/todoist/* endpoints.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { registerApiProxyTool } from './tool-utils.js';

export function registerTodoistTools(
  server: McpServer,
  client: CoreApiClient,
  middleware: ToolMiddleware
): void {
  // ── todoist_list_tasks ─────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'todoist_list_tasks',
    description:
      'List tasks from Todoist. Optionally filter by project or Todoist filter expression. Returns an array of task objects.',
    inputSchema: {
      projectId: z
        .string()
        .optional()
        .describe('Project ID to filter tasks by'),
      filter: z
        .string()
        .optional()
        .describe('Todoist filter expression (e.g. "today", "overdue", "p1")'),
    },
    buildPath: () => '/api/v1/integrations/todoist/tasks',
    buildQuery: (args) => {
      const q: Record<string, string> = {};
      if (args.projectId) q.projectId = args.projectId as string;
      if (args.filter) q.filter = args.filter as string;
      return q;
    },
  });

  // ── todoist_get_task ───────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'todoist_get_task',
    description:
      'Get a single Todoist task by its ID. Returns the full task object including content, description, due date, and priority.',
    inputSchema: {
      taskId: z.string().describe('Todoist task ID'),
    },
    buildPath: (args) => `/api/v1/integrations/todoist/tasks/${args.taskId}`,
  });

  // ── todoist_create_task ────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'todoist_create_task',
    description:
      'Create a new task in Todoist. Returns the created task object with its ID.',
    inputSchema: {
      content: z.string().describe('Task title / content'),
      description: z
        .string()
        .optional()
        .describe('Detailed task description'),
      projectId: z
        .string()
        .optional()
        .describe('Project ID to add the task to'),
      dueString: z
        .string()
        .optional()
        .describe('Natural language due date (e.g. "tomorrow", "every friday")'),
      priority: z
        .number()
        .int()
        .min(1)
        .max(4)
        .optional()
        .describe('Task priority from 1 (normal) to 4 (urgent)'),
    },
    method: 'post',
    buildPath: () => '/api/v1/integrations/todoist/tasks',
    buildBody: (args) => ({
      content: args.content,
      description: args.description,
      projectId: args.projectId,
      dueString: args.dueString,
      priority: args.priority,
    }),
  });

  // ── todoist_update_task ────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'todoist_update_task',
    description:
      'Update an existing Todoist task. Only provided fields are changed. Returns the updated task object.',
    inputSchema: {
      taskId: z.string().describe('Todoist task ID to update'),
      content: z.string().optional().describe('New task title / content'),
      description: z
        .string()
        .optional()
        .describe('New task description'),
      dueString: z
        .string()
        .optional()
        .describe('New natural language due date'),
      priority: z
        .number()
        .int()
        .min(1)
        .max(4)
        .optional()
        .describe('New priority from 1 (normal) to 4 (urgent)'),
    },
    method: 'put',
    buildPath: (args) => `/api/v1/integrations/todoist/tasks/${args.taskId}`,
    buildBody: (args) => ({
      taskId: args.taskId,
      content: args.content,
      description: args.description,
      dueString: args.dueString,
      priority: args.priority,
    }),
  });

  // ── todoist_complete_task ──────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'todoist_complete_task',
    description:
      'Mark a Todoist task as completed (close it). Returns confirmation of the closure.',
    inputSchema: {
      taskId: z.string().describe('Todoist task ID to complete'),
    },
    method: 'post',
    buildPath: (args) => `/api/v1/integrations/todoist/tasks/${args.taskId}/close`,
    buildBody: () => ({}),
  });

  // ── todoist_list_projects ──────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'todoist_list_projects',
    description:
      'List all projects in the connected Todoist account. Returns an array of project objects with IDs, names, and colors.',
    inputSchema: {},
    buildPath: () => '/api/v1/integrations/todoist/projects',
  });
}
