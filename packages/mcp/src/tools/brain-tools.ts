/**
 * Brain Tools — knowledge search/get/store, memory recall.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';

export function registerBrainTools(
  server: McpServer,
  client: CoreApiClient,
  middleware: ToolMiddleware
): void {
  server.registerTool(
    'knowledge_search',
    {
      description: 'Search brain knowledge by query',
      inputSchema: {
        query: z.string().describe('Search query'),
        limit: z.number().int().min(1).max(100).default(10).describe('Max results'),
      },
    },
    wrapToolHandler('knowledge_search', middleware, async (args) => {
      const query: Record<string, string> = { q: args.query, limit: String(args.limit) };
      const result = await client.get('/api/v1/brain/knowledge', query);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.registerTool(
    'knowledge_get',
    {
      description: 'Get a specific knowledge entry by ID',
      inputSchema: { id: z.string().describe('Knowledge entry ID') },
    },
    wrapToolHandler('knowledge_get', middleware, async (args) => {
      const result = await client.get(`/api/v1/brain/knowledge/${args.id}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.registerTool(
    'knowledge_store',
    {
      description: 'Store new knowledge in the brain',
      inputSchema: {
        content: z.string().describe('Knowledge content'),
        type: z.string().describe('Knowledge type (e.g., fact, procedure, reference)'),
        source: z.string().optional().describe('Source of the knowledge'),
      },
    },
    wrapToolHandler('knowledge_store', middleware, async (args) => {
      const result = await client.post('/api/v1/brain/knowledge', args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.registerTool(
    'memory_recall',
    {
      description: 'Recall relevant memories by query',
      inputSchema: {
        query: z.string().describe('Memory recall query'),
        types: z.array(z.string()).optional().describe('Filter by memory types'),
      },
    },
    wrapToolHandler('memory_recall', middleware, async (args) => {
      const query: Record<string, string> = { q: args.query };
      if (args.types) query.types = args.types.join(',');
      const result = await client.get('/api/v1/brain/memories', query);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );
}
