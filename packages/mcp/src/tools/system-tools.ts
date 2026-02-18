/**
 * System Tools — health, metrics, config.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';

export function registerSystemTools(
  server: McpServer,
  client: CoreApiClient,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  server.registerTool(
    'system_health',
    {
      description: 'Get system health status',
      inputSchema: {},
    },
    wrapToolHandler('system_health', middleware, async () => {
      const result = await client.get('/health');
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.registerTool(
    'system_metrics',
    {
      description: 'Get system metrics snapshot',
      inputSchema: {},
    },
    wrapToolHandler('system_metrics', middleware, async () => {
      const result = await client.get('/api/v1/metrics');
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.registerTool(
    'system_config',
    {
      description: 'Get current system configuration (secrets redacted)',
      inputSchema: {},
    },
    wrapToolHandler('system_config', middleware, async () => {
      // Return local MCP config with sensitive fields stripped
      const safeConfig = {
        enabled: config.enabled,
        port: config.port,
        host: config.host,
        transport: config.transport,
        autoRegister: config.autoRegister,
        coreUrl: config.coreUrl,
        tokenSecret: '[REDACTED]',
        exposeFilesystem: config.exposeFilesystem,
        allowedPaths: config.allowedPaths,
        rateLimitPerTool: config.rateLimitPerTool,
        logLevel: config.logLevel,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(safeConfig, null, 2) }] };
    })
  );
}
