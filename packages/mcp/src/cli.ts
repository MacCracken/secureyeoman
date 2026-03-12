#!/usr/bin/env node
/* eslint-disable no-console -- CLI entry point uses console for operator-visible logging */

/**
 * CLI entry point for the SecureYeoman MCP service.
 *
 * The `runMcpServer()` export allows this to be called as a subcommand
 * from the core `secureyeoman mcp-server` CLI (Phase 22 single binary).
 */

import { loadConfig, enrichConfigWithSecrets } from './config/config.js';
import { McpServiceServer } from './server.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CoreApiClient } from './core-client.js';
import { registerAllTools } from './tools/index.js';
import { registerAllResources } from './resources/index.js';
import { registerAllPrompts } from './prompts/index.js';
import { createRateLimiter } from './middleware/rate-limiter.js';
import { createInputValidator } from './middleware/input-validator.js';
import { createAuditLogger } from './middleware/audit-logger.js';
import { createSecretRedactor } from './middleware/secret-redactor.js';
import { MCP_VERSION } from './utils/version.js';

/** Maximum number of bootstrap retries before giving up. */
const BOOTSTRAP_MAX_RETRIES = 8;
/** Base delay between bootstrap retries (ms). Doubles each attempt. */
const BOOTSTRAP_BASE_DELAY_MS = 2000;

/**
 * Fetch the auto-provisioned MCP service API key from core's bootstrap endpoint.
 * Retries with exponential backoff until the key is available or max retries exceeded.
 */
async function fetchBootstrapApiKey(coreUrl: string): Promise<string> {
  const baseUrl = coreUrl.replace(/\/+$/, '');
  const url = `${baseUrl}/api/v1/internal/mcp-bootstrap`;

  for (let attempt = 1; attempt <= BOOTSTRAP_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const data = (await res.json()) as { apiKey?: string };
        if (data.apiKey) {
          console.log(`[secureyeoman-mcp] Bootstrap: API key retrieved (attempt ${attempt})`);
          return data.apiKey;
        }
      }

      const status = res.status;
      console.log(
        `[secureyeoman-mcp] Bootstrap: core returned ${status} (attempt ${attempt}/${BOOTSTRAP_MAX_RETRIES})`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(
        `[secureyeoman-mcp] Bootstrap: core unreachable — ${msg} (attempt ${attempt}/${BOOTSTRAP_MAX_RETRIES})`
      );
    }

    if (attempt < BOOTSTRAP_MAX_RETRIES) {
      const delay = BOOTSTRAP_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw new Error(
    `Failed to retrieve MCP service API key after ${BOOTSTRAP_MAX_RETRIES} attempts — core may not be ready`
  );
}

/**
 * Start the MCP server. Returns an exit code (0 = success).
 * Can be called programmatically from the core CLI's `mcp-server` subcommand.
 */
export async function runMcpServer(_argv: string[] = []): Promise<number> {
  let config = loadConfig();

  if (!config.enabled) {
    console.log('[secureyeoman-mcp] MCP service is disabled (MCP_ENABLED=false)');
    return 0;
  }

  // Resolve the API key: env var override OR bootstrap from core
  let apiKey = process.env.MCP_CORE_API_KEY;
  if (!apiKey) {
    try {
      apiKey = await fetchBootstrapApiKey(config.coreUrl);
    } catch (err) {
      console.error(
        `[secureyeoman-mcp] ${err instanceof Error ? err.message : 'Bootstrap failed'}`
      );
      return 1;
    }
  }

  const coreClient = new CoreApiClient({
    coreUrl: config.coreUrl,
    apiKey,
  });

  // Enrich config with secrets from core's SecretsManager (env vars take precedence)
  config = await enrichConfigWithSecrets(config, coreClient);

  // stdio transport mode — no HTTP server needed
  if (config.transport === 'stdio') {
    const mcpServer = new McpServer({
      name: 'secureyeoman-mcp',
      version: MCP_VERSION,
    });

    const rateLimiter = createRateLimiter(config.rateLimitPerTool);
    const inputValidator = createInputValidator();
    const auditLogger = createAuditLogger(coreClient);
    const secretRedactor = createSecretRedactor();

    await registerAllTools(mcpServer, coreClient, config, {
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
  runMcpServer(process.argv.slice(2))
    .then((code) => {
      if (code !== 0) process.exitCode = code;
    })
    .catch((err: unknown) => {
      console.error('[secureyeoman-mcp] Fatal:', err);
      process.exit(1);
    });
}
