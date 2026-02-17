/**
 * Knowledge Resources — friday://knowledge/all, friday://knowledge/{id}
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';

export function registerKnowledgeResources(server: McpServer, client: CoreApiClient): void {
  server.resource(
    'knowledge-all',
    'friday://knowledge/all',
    { description: 'All knowledge entries', mimeType: 'application/json' },
    async () => {
      const result = await client.get('/api/v1/brain/knowledge');
      return {
        contents: [
          {
            uri: 'friday://knowledge/all',
            mimeType: 'application/json',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  server.resource(
    'knowledge-entry',
    'friday://knowledge/{id}',
    { description: 'A specific knowledge entry', mimeType: 'application/json' },
    async (uri: URL) => {
      const id = uri.pathname.split('/').pop() ?? '';
      const result = await client.get(`/api/v1/brain/knowledge/${id}`);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );
}
