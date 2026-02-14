/**
 * @friday/mcp — FRIDAY MCP Service Package
 *
 * Exposes FRIDAY capabilities as MCP tools, resources, and prompts.
 */

export { McpServiceServer, createMcpServiceServer } from './server.js';
export { CoreApiClient, CoreApiError } from './core-client.js';
export { ProxyAuth } from './auth/proxy-auth.js';
export { AutoRegistration } from './registration/auto-register.js';
export { loadConfig } from './config/config.js';
export type { AuthResult } from './auth/proxy-auth.js';
export type { McpServiceServerOptions } from './server.js';
