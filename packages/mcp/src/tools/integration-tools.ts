/**
 * Integration Tools — list, send, status.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';

export function registerIntegrationTools(
  server: McpServer,
  client: CoreApiClient,
  middleware: ToolMiddleware
): void {
  server.registerTool(
    'integration_list',
    {
      description: 'List all integrations',
      inputSchema: { platform: z.string().optional().describe('Filter by platform') },
    },
    wrapToolHandler('integration_list', middleware, async (args) => {
      const query: Record<string, string> = {};
      if (args.platform) query.platform = args.platform;
      const result = await client.get('/api/v1/integrations', query);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.registerTool(
    'integration_send',
    {
      description: 'Send a message via an integration',
      inputSchema: {
        integrationId: z.string().describe('Integration ID'),
        chatId: z.string().describe('Chat/channel ID'),
        text: z.string().describe('Message text'),
      },
    },
    wrapToolHandler('integration_send', middleware, async (args) => {
      const result = await client.post(`/api/v1/integrations/${args.integrationId}/messages`, {
        chatId: args.chatId,
        text: args.text,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.registerTool(
    'integration_status',
    {
      description: 'Check integration health',
      inputSchema: { id: z.string().describe('Integration ID') },
    },
    wrapToolHandler('integration_status', middleware, async (args) => {
      const result = await client.get(`/api/v1/integrations/${args.id}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );
}
