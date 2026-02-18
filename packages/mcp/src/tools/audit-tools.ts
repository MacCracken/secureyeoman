/**
 * Audit Tools — query, verify, stats.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';

export function registerAuditTools(
  server: McpServer,
  client: CoreApiClient,
  middleware: ToolMiddleware
): void {
  server.registerTool(
    'audit_query',
    {
      description: 'Query the audit log',
      inputSchema: {
        event: z.string().optional().describe('Filter by event type'),
        level: z.string().optional().describe('Filter by level'),
        limit: z.number().int().min(1).max(500).default(50).describe('Max results'),
      },
    },
    wrapToolHandler('audit_query', middleware, async (args) => {
      const query: Record<string, string> = { limit: String(args.limit) };
      if (args.event) query.event = args.event;
      if (args.level) query.level = args.level;
      const result = await client.get('/api/v1/audit', query);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.registerTool(
    'audit_verify',
    {
      description: 'Verify audit chain integrity',
      inputSchema: {},
    },
    wrapToolHandler('audit_verify', middleware, async () => {
      const result = await client.post('/api/v1/audit/verify');
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.registerTool(
    'audit_stats',
    {
      description: 'Get audit statistics',
      inputSchema: {},
    },
    wrapToolHandler('audit_stats', middleware, async () => {
      const result = await client.get('/api/v1/audit/stats');
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );
}
