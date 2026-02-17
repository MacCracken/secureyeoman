/**
 * Config Resources — secureyeoman://config/current (secrets redacted)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';

export function registerConfigResources(server: McpServer, client: CoreApiClient): void {
  server.resource(
    'config-current',
    'secureyeoman://config/current',
    { description: 'Current config (secrets redacted)', mimeType: 'application/json' },
    async () => {
      try {
        const result = await client.get('/api/v1/soul/config');
        return {
          contents: [
            {
              uri: 'secureyeoman://config/current',
              mimeType: 'application/json',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch {
        return {
          contents: [
            {
              uri: 'secureyeoman://config/current',
              mimeType: 'application/json',
              text: JSON.stringify({ error: 'Config unavailable' }),
            },
          ],
        };
      }
    }
  );
}
