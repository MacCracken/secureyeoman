#!/usr/bin/env node

/**
 * CLI entry point for the SecureYeoman MCP service.
 *
 * The `runMcpServer()` export allows this to be called as a subcommand
 * from the core `secureyeoman mcp-server` CLI (Phase 22 single binary).
 */

import { loadConfig } from './config/config.js';
import { McpServiceServer } from './server.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CoreApiClient } from './core-client.js';
import { mintServiceToken } from './auth/service-token.js';
import { registerAllTools } from './tools/index.js';
import { registerAllResources } from './resources/index.js';
import { registerAllPrompts } from './prompts/index.js';
import { createRateLimiter } from './middleware/rate-limiter.js';
import { createInputValidator } from './middleware/input-validator.js';
import { createAuditLogger } from './middleware/audit-logger.js';
import { createSecretRedactor } from './middleware/secret-redactor.js';

/**
 * Start the MCP server. Returns an exit code (0 = success).
 * Can be called programmatically from the core CLI's `mcp-server` subcommand.
 */
export async function runMcpServer(_argv: string[] = []): Promise<number> {
  const config = loadConfig();

  if (!config.enabled) {
    console.log('[secureyeoman-mcp] MCP service is disabled (MCP_ENABLED=false)');
    return 0;
  }

  // stdio transport mode — no HTTP server needed
  if (config.transport === 'stdio') {
    if (!config.tokenSecret) {
      console.error('[secureyeoman-mcp] SECUREYEOMAN_TOKEN_SECRET is required');
      return 1;
    }

    const coreToken = await mintServiceToken(config.tokenSecret);
    const coreClient = new CoreApiClient({
      coreUrl: config.coreUrl,
      coreToken,
    });

    const mcpServer = new McpServer({
      name: 'secureyeoman-mcp',
      version: '1.5.1',
    });

    const rateLimiter = createRateLimiter(config.rateLimitPerTool);
    const inputValidator = createInputValidator();
    const auditLogger = createAuditLogger(coreClient);
    const secretRedactor = createSecretRedactor();

    registerAllTools(mcpServer, coreClient, config, {
      rateLimiter,
      inputValidator,
      auditLogger,
      secretRedactor,
    });
    registerAllResources(mcpServer, coreClient);
    registerAllPrompts(mcpServer, coreClient);

    const transport = new StdioServerTransport();
    await mcpServer.server.connect(transport);
    console.error('[secureyeoman-mcp] stdio transport started');

    // Block until the transport closes
    await new Promise<void>((resolve) => {
      transport.onclose = resolve;
    });
    return 0;
  }

  // HTTP-based transport modes (streamable-http, sse)
  if (!config.tokenSecret) {
    console.error('[secureyeoman-mcp] SECUREYEOMAN_TOKEN_SECRET is required');
    return 1;
  }

  const coreToken = await mintServiceToken(config.tokenSecret);
  const coreClient = new CoreApiClient({
    coreUrl: config.coreUrl,
    coreToken,
  });
  const server = new McpServiceServer({ config, coreClient });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[secureyeoman-mcp] ${signal} received, shutting down...`);
    await server.stop();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await server.start();
    console.log(
      `[secureyeoman-mcp] MCP service started on ${config.host}:${config.port} (${config.transport})`
    );
  } catch (err) {
    console.error('[secureyeoman-mcp] Failed to start:', err instanceof Error ? err.message : err);
    return 1;
  }

  // Block until SIGINT/SIGTERM
  await new Promise<void>((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
  return 0;
}

// Direct execution entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runMcpServer(process.argv.slice(2)).then((code) => {
    if (code !== 0) process.exitCode = code;
  }).catch((err: unknown) => {
    console.error('[secureyeoman-mcp] Fatal:', err);
    process.exit(1);
  });
}
