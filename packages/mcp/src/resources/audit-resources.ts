/**
 * Audit Resources — friday://audit/recent, friday://audit/stats
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';

export function registerAuditResources(server: McpServer, client: CoreApiClient): void {
  server.resource(
    'audit-recent',
    'friday://audit/recent',
    { description: 'Last 100 audit entries', mimeType: 'application/json' },
    async () => {
      const result = await client.get('/api/v1/audit', { limit: '100' });
      return {
        contents: [{
          uri: 'friday://audit/recent',
          mimeType: 'application/json',
          text: JSON.stringify(result, null, 2),
        }],
      };
    },
  );

  server.resource(
    'audit-stats',
    'friday://audit/stats',
    { description: 'Chain stats and counts', mimeType: 'application/json' },
    async () => {
      try {
        const result = await client.get('/api/v1/audit/stats');
        return {
          contents: [{
            uri: 'friday://audit/stats',
            mimeType: 'application/json',
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch {
        return {
          contents: [{
            uri: 'friday://audit/stats',
            mimeType: 'application/json',
            text: JSON.stringify({ error: 'Audit stats unavailable' }),
          }],
        };
      }
    },
  );
}
