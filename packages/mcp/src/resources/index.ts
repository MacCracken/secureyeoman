/**
 * Resource Registry — registers all MCP resources.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import { registerKnowledgeResources } from './knowledge-resources.js';
import { registerPersonalityResources } from './personality-resources.js';
import { registerConfigResources } from './config-resources.js';
import { registerAuditResources } from './audit-resources.js';

export function registerAllResources(server: McpServer, client: CoreApiClient): void {
  registerKnowledgeResources(server, client);
  registerPersonalityResources(server, client);
  registerConfigResources(server, client);
  registerAuditResources(server, client);
}
