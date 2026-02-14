/**
 * Prompt Registry — registers all MCP prompts.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import { registerSoulPrompts } from './soul-prompts.js';
import { registerTaskPrompts } from './task-prompts.js';
import { registerAnalysisPrompts } from './analysis-prompts.js';

export function registerAllPrompts(server: McpServer, client: CoreApiClient): void {
  registerSoulPrompts(server, client);
  registerTaskPrompts(server);
  registerAnalysisPrompts(server);
}
