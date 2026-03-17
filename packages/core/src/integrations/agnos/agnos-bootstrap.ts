/**
 * AGNOS Bootstrap — auto-detect AGNOS capabilities and configure defaults.
 *
 * On startup, calls GET /v1/discover to probe AGNOS. If reachable:
 * - Auto-enables AGNOS as a provider
 * - Sets MCP_EXPOSE_AGNOS_TOOLS=true
 * - Logs discovered capabilities
 *
 * Also queries sandbox profiles and registers MCP tools.
 */

import type { AgnosClient, AgnosDiscoverResponse, AgnosSandboxProfile } from './agnos-client.js';
import type { SecureLogger } from '../../logging/logger.js';

export interface AgnosBootstrapResult {
  discovered: boolean;
  capabilities: string[];
  endpoints: Record<string, string>;
  sandboxProfiles: AgnosSandboxProfile[];
  mcpToolsRegistered: number;
  bridgeProfile: string;
  error?: string;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema?: unknown;
}

/**
 * Bootstrap AGNOS integration — runs once at startup.
 * Non-fatal: returns partial results on failure.
 */
export async function bootstrapAgnos(
  client: AgnosClient,
  logger: SecureLogger,
  mcpTools?: McpToolDefinition[],
  bridgeProfile?: string
): Promise<AgnosBootstrapResult> {
  const result: AgnosBootstrapResult = {
    discovered: false,
    capabilities: [],
    endpoints: {},
    sandboxProfiles: [],
    mcpToolsRegistered: 0,
    bridgeProfile: bridgeProfile ?? 'full',
  };

  // ── 1. Service discovery ───────────────────────────────────
  let discovery: AgnosDiscoverResponse | null;
  try {
    discovery = await client.discover();
    result.discovered = true;
    result.capabilities = discovery.capabilities ?? [];
    result.endpoints = discovery.endpoints ?? {};

    logger.info(
      {
        name: discovery.service,
        version: discovery.version,
        capabilities: discovery.capabilities,
      },
      'AGNOS service discovered'
    );

    // Auto-configure: set env vars for downstream consumers
    if (!process.env.MCP_EXPOSE_AGNOS_TOOLS) {
      process.env.MCP_EXPOSE_AGNOS_TOOLS = 'true';
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.error = msg;
    logger.debug({ error: msg }, 'AGNOS not reachable — skipping bootstrap');
    return result;
  }

  // ── 2. Sandbox profiles ────────────────────────────────────
  try {
    result.sandboxProfiles = await client.listSandboxProfiles();
    logger.info({ count: result.sandboxProfiles.length }, 'AGNOS sandbox profiles loaded');
  } catch (err) {
    logger.debug(
      { error: err instanceof Error ? err.message : String(err) },
      'Failed to load AGNOS sandbox profiles'
    );
  }

  // ── 3. MCP tool registration (profile-aware) ────────────────
  if (mcpTools && mcpTools.length > 0) {
    const profile = bridgeProfile ?? 'full';
    try {
      const res = await client.registerMcpToolsByProfile(mcpTools, profile);
      result.mcpToolsRegistered = res.registered;
      logger.info(
        { registered: res.registered, total: mcpTools.length, profile },
        'MCP tools registered with AGNOS daimon (profile-filtered)'
      );
    } catch (err) {
      // Fallback to unfiltered registration
      try {
        const res = await client.registerMcpTools(mcpTools);
        result.mcpToolsRegistered = res.registered;
        logger.info(
          { registered: res.registered, total: mcpTools.length },
          'MCP tools registered with AGNOS daimon (unfiltered fallback)'
        );
      } catch (fallbackErr) {
        logger.debug(
          { error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr) },
          'Failed to register MCP tools with AGNOS'
        );
      }
    }
  }

  return result;
}
