/**
 * Intent Tools — Phase 48: Machine Readable Organizational Intent
 *
 * Provides the `intent_signal_read` MCP tool for reading live signal values
 * from the active OrgIntent document.
 *
 * Gated by: config.security?.allowOrgIntent
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';

const DISABLED_MSG =
  'Organizational intent tools are disabled. Enable allowOrgIntent in Security Settings first.';

function textResponse(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function registerIntentTools(
  server: McpServer,
  client: CoreApiClient,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  const enabled = config.exposeOrgIntentTools;

  // ── intent_signal_read ──────────────────────────────────────────────────────
  server.tool(
    'intent_signal_read',
    'Read the current value of a named signal from the active organizational intent document. Returns the signal value, threshold, direction, status (healthy/warning/critical), and a human-readable message.',
    {
      signalId: z
        .string()
        .describe('The ID of the signal to read, as defined in the OrgIntent doc'),
    },
    wrapToolHandler('intent_signal_read', middleware, async ({ signalId }) => {
      if (!enabled) return textResponse({ error: DISABLED_MSG });

      try {
        const result = await client.get(
          `/api/v1/intent/signals/${encodeURIComponent(signalId)}/value`
        );
        return textResponse(result);
      } catch (err) {
        return textResponse({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })
  );
}
