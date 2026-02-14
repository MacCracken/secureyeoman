/**
 * Soul Tools — personality get/switch, skill list/execute.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';

export function registerSoulTools(
  server: McpServer,
  client: CoreApiClient,
  middleware: ToolMiddleware,
): void {
  server.tool(
    'personality_get',
    'Get the active personality configuration',
    {},
    wrapToolHandler('personality_get', middleware, async () => {
      const result = await client.get('/api/v1/soul/personality');
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }),
  );

  server.tool(
    'personality_switch',
    'Switch the active personality',
    { id: z.string().describe('Personality ID to activate') },
    wrapToolHandler('personality_switch', middleware, async (args) => {
      const result = await client.post(`/api/v1/soul/personalities/${args.id}/activate`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }),
  );

  server.tool(
    'skill_list',
    'List available skills',
    { status: z.string().optional().describe('Filter by status') },
    wrapToolHandler('skill_list', middleware, async (args) => {
      const query: Record<string, string> = {};
      if (args.status) query['status'] = args.status;
      const result = await client.get('/api/v1/soul/skills', query);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }),
  );

  server.tool(
    'skill_execute',
    'Execute a skill by ID',
    {
      skillId: z.string().describe('Skill ID'),
      input: z.record(z.unknown()).optional().describe('Input data for the skill'),
    },
    wrapToolHandler('skill_execute', middleware, async (args) => {
      const result = await client.post(`/api/v1/soul/skills/${args.skillId}/execute`, {
        input: args.input ?? {},
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }),
  );
}
