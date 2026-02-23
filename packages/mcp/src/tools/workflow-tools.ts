/**
 * Workflow Tools — MCP tools for workflow management.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';

export function registerWorkflowTools(
  server: McpServer,
  client: CoreApiClient,
  middleware: ToolMiddleware
): void {
  server.registerTool(
    'workflow_list',
    {
      description: 'List workflow definitions',
      inputSchema: {
        limit: z.number().int().min(1).max(100).default(20).describe('Max results'),
      },
    },
    wrapToolHandler('workflow_list', middleware, async (args) => {
      const result = await client.get('/api/v1/workflows', { limit: String(args.limit) });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.registerTool(
    'workflow_get',
    {
      description: 'Get workflow definition by ID',
      inputSchema: { id: z.string().describe('Workflow definition ID') },
    },
    wrapToolHandler('workflow_get', middleware, async (args) => {
      const result = await client.get(`/api/v1/workflows/${args.id}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.registerTool(
    'workflow_run',
    {
      description: 'Trigger a workflow run',
      inputSchema: {
        id: z.string().describe('Workflow definition ID'),
        input: z.record(z.unknown()).optional().describe('Input data for the workflow'),
        triggeredBy: z.string().optional().describe('Who triggered this run'),
      },
    },
    wrapToolHandler('workflow_run', middleware, async (args) => {
      const result = await client.post(`/api/v1/workflows/${args.id}/run`, {
        input: args.input,
        triggeredBy: args.triggeredBy ?? 'mcp',
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.registerTool(
    'workflow_run_status',
    {
      description: 'Get workflow run status and step details',
      inputSchema: { runId: z.string().describe('Workflow run ID') },
    },
    wrapToolHandler('workflow_run_status', middleware, async (args) => {
      const result = await client.get(`/api/v1/workflows/runs/${args.runId}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.registerTool(
    'workflow_cancel',
    {
      description: 'Cancel a running workflow',
      inputSchema: { runId: z.string().describe('Workflow run ID to cancel') },
    },
    wrapToolHandler('workflow_cancel', middleware, async (args) => {
      const result = await client.delete(`/api/v1/workflows/runs/${args.runId}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );
}
