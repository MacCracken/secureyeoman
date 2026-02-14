/**
 * Personality Resources — friday://personality/active, friday://personality/{id}
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';

export function registerPersonalityResources(server: McpServer, client: CoreApiClient): void {
  server.resource(
    'personality-active',
    'friday://personality/active',
    { description: 'Current personality configuration', mimeType: 'application/json' },
    async () => {
      const result = await client.get('/api/v1/soul/personality');
      return {
        contents: [{
          uri: 'friday://personality/active',
          mimeType: 'application/json',
          text: JSON.stringify(result, null, 2),
        }],
      };
    },
  );

  server.resource(
    'personality-entry',
    'friday://personality/{id}',
    { description: 'A specific personality', mimeType: 'application/json' },
    async (uri: URL) => {
      const id = uri.pathname.split('/').pop() ?? '';
      const result = await client.get(`/api/v1/soul/personalities/${id}`);
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(result, null, 2),
        }],
      };
    },
  );
}
