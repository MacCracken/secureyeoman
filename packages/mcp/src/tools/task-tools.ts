/**
 * Task Tools — task create, list, get, cancel.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';

export function registerTaskTools(
  server: McpServer,
  client: CoreApiClient,
  middleware: ToolMiddleware,
): void {
  server.tool(
    'task_create',
    'Create a new task',
    {
      name: z.string().describe('Task name'),
      type: z.string().describe('Task type'),
      description: z.string().optional().describe('Task description'),
    },
    wrapToolHandler('task_create', middleware, async (args) => {
      const result = await client.post('/api/v1/tasks', args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }),
  );

  server.tool(
    'task_list',
    'List tasks with optional filters',
    {
      status: z.string().optional().describe('Filter by status'),
      type: z.string().optional().describe('Filter by type'),
      limit: z.number().int().min(1).max(100).default(20).describe('Max results'),
    },
    wrapToolHandler('task_list', middleware, async (args) => {
      const query: Record<string, string> = {};
      if (args.status) query['status'] = args.status;
      if (args.type) query['type'] = args.type;
      query['limit'] = String(args.limit);
      const result = await client.get('/api/v1/tasks', query);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }),
  );

  server.tool(
    'task_get',
    'Get task details by ID',
    { id: z.string().describe('Task ID') },
    wrapToolHandler('task_get', middleware, async (args) => {
      const result = await client.get(`/api/v1/tasks/${args.id}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }),
  );

  server.tool(
    'task_cancel',
    'Cancel a running task',
    { id: z.string().describe('Task ID') },
    wrapToolHandler('task_cancel', middleware, async (args) => {
      const result = await client.delete(`/api/v1/tasks/${args.id}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }),
  );
}
