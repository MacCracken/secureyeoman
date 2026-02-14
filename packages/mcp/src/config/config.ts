/**
 * MCP Service Configuration — loads config from environment variables.
 */

import { McpServiceConfigSchema, type McpServiceConfig } from '@friday/shared';

export function loadConfig(env: Record<string, string | undefined> = process.env): McpServiceConfig {
  const raw = {
    enabled: parseBool(env['MCP_ENABLED'], true),
    port: parseIntSafe(env['MCP_PORT'], 3001),
    host: env['MCP_HOST'] ?? '127.0.0.1',
    transport: env['MCP_TRANSPORT'] ?? 'streamable-http',
    autoRegister: parseBool(env['MCP_AUTO_REGISTER'], true),
    coreUrl: env['MCP_CORE_URL'] ?? 'http://127.0.0.1:18789',
    tokenSecret: env['SECUREYEOMAN_TOKEN_SECRET'],
    exposeFilesystem: parseBool(env['MCP_EXPOSE_FILESYSTEM'], false),
    allowedPaths: env['MCP_ALLOWED_PATHS']
      ? env['MCP_ALLOWED_PATHS'].split(',').map((p) => p.trim()).filter(Boolean)
      : [],
    rateLimitPerTool: parseIntSafe(env['MCP_RATE_LIMIT_PER_TOOL'], 30),
    logLevel: env['MCP_LOG_LEVEL'] ?? 'info',
  };

  return McpServiceConfigSchema.parse(raw);
}

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value === 'true' || value === '1';
}

function parseIntSafe(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}
