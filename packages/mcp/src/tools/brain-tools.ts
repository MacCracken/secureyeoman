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
      description:
        'Search brain knowledge by query. Optionally pass instanceId to search on a federated peer instance.',
      inputSchema: {
        query: z.string().describe('Search query'),
        limit: z.number().int().min(1).max(100).default(10).describe('Max results'),
        instanceId: z
          .string()
          .optional()
          .describe('Federation peer ID to search on a remote instance'),
      },
    },
    wrapToolHandler('knowledge_search', middleware, async (args) => {
      if (args.instanceId) {
        const result = await client.get(
          `/api/v1/federation/peers/${args.instanceId}/knowledge/search`,
          { q: args.query, limit: String(args.limit) }
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      }
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

  // Cognitive Memory tools (Phase 124)

  server.registerTool(
    'memory_activation_stats',
    {
      description:
        'Get cognitive memory activation stats — top activated memories/documents, association count, and 7-day access trend',
      inputSchema: {
        personalityId: z.string().optional().describe('Filter stats by personality ID'),
      },
    },
    wrapToolHandler('memory_activation_stats', middleware, async (args) => {
      const query: Record<string, string> = {};
      if (args.personalityId) query.personalityId = args.personalityId;
      const result = await client.get('/api/v1/brain/cognitive-stats', query);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.registerTool(
    'memory_associations',
    {
      description:
        'Get Hebbian associative links for a memory or document — shows co-retrieved items and their weights',
      inputSchema: {
        itemId: z.string().describe('Memory or document ID to get associations for'),
        limit: z.number().int().min(1).max(100).default(20).describe('Max associations to return'),
        minWeight: z.number().min(0).max(1).optional().describe('Minimum association weight filter'),
      },
    },
    wrapToolHandler('memory_associations', middleware, async (args) => {
      const query: Record<string, string> = { limit: String(args.limit) };
      if (args.minWeight != null) query.minWeight = String(args.minWeight);
      const result = await client.get(`/api/v1/brain/associations/${args.itemId}`, query);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );
}
