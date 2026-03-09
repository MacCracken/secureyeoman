/**
 * Constitutional AI MCP Tools.
 *
 * constitutional_principles — List active constitutional principles
 * constitutional_critique   — Critique a response against the constitution
 * constitutional_revise     — Full critique-and-revise loop
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler, jsonResponse, errorResponse } from './tool-utils.js';

const CONSTITUTIONAL_DISABLED_MSG =
  'Constitutional AI tools are disabled. Enable constitutional AI in security config to use these tools.';

export function registerConstitutionalTools(
  server: McpServer,
  client: CoreApiClient,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  // ── constitutional_principles ──────────────────────────────────────────
  server.tool(
    'constitutional_principles',
    'List the active constitutional AI principles used for self-critique and response revision.',
    {},
    wrapToolHandler('constitutional_principles', middleware, async () => {
      if (!(config as any).exposeConstitutional) return errorResponse(CONSTITUTIONAL_DISABLED_MSG);
      const result = await client.get('/security/constitutional/principles');
      return jsonResponse(result);
    })
  );

  // ── constitutional_critique ────────────────────────────────────────────
  server.tool(
    'constitutional_critique',
    'Critique an AI response against the active constitutional principles. Returns per-principle findings with violation status and severity.',
    {
      prompt: z.string().describe('The user prompt that produced the response'),
      response: z.string().describe('The AI response to critique'),
    },
    wrapToolHandler('constitutional_critique', middleware, async ({ prompt, response }) => {
      if (!(config as any).exposeConstitutional) return errorResponse(CONSTITUTIONAL_DISABLED_MSG);
      const result = await client.post('/security/constitutional/critique', { prompt, response });
      return jsonResponse(result);
    })
  );

  // ── constitutional_revise ──────────────────────────────────────────────
  server.tool(
    'constitutional_revise',
    'Critique and revise an AI response against the constitution. Returns the revised response and all critique findings. Records preference pairs for DPO training when configured.',
    {
      prompt: z.string().describe('The user prompt that produced the response'),
      response: z.string().describe('The AI response to revise'),
    },
    wrapToolHandler('constitutional_revise', middleware, async ({ prompt, response }) => {
      if (!(config as any).exposeConstitutional) return errorResponse(CONSTITUTIONAL_DISABLED_MSG);
      const result = await client.post('/security/constitutional/revise', { prompt, response });
      return jsonResponse(result);
    })
  );
}
