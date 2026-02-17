/**
 * Personality Resources — secureyeoman://personality/active, secureyeoman://personality/{id}
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';

export function registerPersonalityResources(server: McpServer, client: CoreApiClient): void {
  server.resource(
    'personality-active',
    'secureyeoman://personality/active',
    { description: 'Current personality configuration', mimeType: 'application/json' },
    async () => {
      const result = await client.get('/api/v1/soul/personality');
      return {
        contents: [
          {
            uri: 'secureyeoman://personality/active',
            mimeType: 'application/json',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  server.resource(
    'personality-entry',
    'secureyeoman://personality/{id}',
    { description: 'A specific personality', mimeType: 'application/json' },
    async (uri: URL) => {
      const id = uri.pathname.split('/').pop() ?? '';
      const result = await client.get(`/api/v1/soul/personalities/${id}`);
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
