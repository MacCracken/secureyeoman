/**
 * TEE (Confidential Computing) MCP tools — Phase 129-D.
 *
 * tee_providers   — List TEE-capable providers, hardware detection, cache stats
 * tee_status      — Get attestation status for a specific provider
 * tee_verify      — Force re-verify TEE attestation for a provider
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';

function disabled(): { content: { type: 'text'; text: string }[]; isError: boolean } {
  return {
    content: [
      {
        type: 'text',
        text: 'TEE tools are disabled. Enable exposeTee in MCP config to use tee_* tools.',
      },
    ],
    isError: true,
  };
}

export function registerTeeTools(
  server: McpServer,
  client: CoreApiClient,
  config: McpServiceConfig,
  middleware: ToolMiddleware,
): void {
  // ── tee_providers ──────────────────────────────────────────────────────────
  server.tool(
    'tee_providers',
    'List TEE-capable providers, hardware detection status, and attestation cache stats',
    {},
    wrapToolHandler('tee_providers', middleware, async () => {
      if (!(config as any).exposeTee) return disabled();
      const result = await client.get('/api/v1/security/tee/providers');
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }),
  );

  // ── tee_status ─────────────────────────────────────────────────────────────
  server.tool(
    'tee_status',
    'Get attestation status and history for a specific TEE provider',
    {
      provider: z.string().min(1).describe('Provider name (e.g. anthropic, openai, gemini)'),
    },
    wrapToolHandler('tee_status', middleware, async ({ provider }) => {
      if (!(config as any).exposeTee) return disabled();
      const result = await client.get(
        `/api/v1/security/tee/attestation/${encodeURIComponent(provider)}`,
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }),
  );

  // ── tee_verify ─────────────────────────────────────────────────────────────
  server.tool(
    'tee_verify',
    'Force re-verify TEE attestation for a provider (clears cache and runs fresh check)',
    {
      provider: z.string().min(1).describe('Provider name to verify'),
    },
    wrapToolHandler('tee_verify', middleware, async ({ provider }) => {
      if (!(config as any).exposeTee) return disabled();
      const result = await client.post(
        `/api/v1/security/tee/verify/${encodeURIComponent(provider)}`,
        {},
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }),
  );
}
