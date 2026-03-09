/**
 * Intent Tools — Phase 48: Machine Readable Organizational Intent
 *
 * Read tools:
 *   intent_signal_read — Read a signal value from the active intent
 *
 * Write tools (require exposeOrgIntentTools):
 *   intent_list           — List all intent documents
 *   intent_get            — Get a specific intent document by ID
 *   intent_get_active     — Get the currently active intent document
 *   intent_create         — Create a new intent document
 *   intent_update         — Update an existing intent document
 *   intent_activate       — Set a specific intent as the active one
 *   intent_delete         — Delete an intent document
 *   intent_enforcement_log — Query the enforcement log
 *
 * Gated by: config.exposeOrgIntentTools
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler, errorResponse } from './tool-utils.js';

const DISABLED_MSG =
  'Organizational intent tools are disabled. Enable Organizational Intent Access in MCP config to use intent_* tools.';

function disabled() {
  return errorResponse(DISABLED_MSG);
}

function textResponse(data: unknown) {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: 'text' as const, text }] };
}

export function registerIntentTools(
  server: McpServer,
  client: CoreApiClient,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
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
      if (!config.exposeOrgIntentTools) return disabled();

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

  // ── intent_list ─────────────────────────────────────────────────────────────
  server.tool(
    'intent_list',
    'List all organizational intent documents (metadata only — doc body omitted for speed).',
    {},
    wrapToolHandler('intent_list', middleware, async () => {
      if (!config.exposeOrgIntentTools) return disabled();
      const result = await client.get('/api/v1/intent');
      return textResponse(result);
    })
  );

  // ── intent_get ──────────────────────────────────────────────────────────────
  server.tool(
    'intent_get',
    'Get a specific organizational intent document by ID, including the full document body with goals, signals, boundaries, and policies.',
    {
      id: z.string().min(1).describe('Intent document ID'),
    },
    wrapToolHandler('intent_get', middleware, async ({ id }) => {
      if (!config.exposeOrgIntentTools) return disabled();
      const result = await client.get(`/api/v1/intent/${encodeURIComponent(id)}`);
      return textResponse(result);
    })
  );

  // ── intent_get_active ───────────────────────────────────────────────────────
  server.tool(
    'intent_get_active',
    'Get the currently active organizational intent document. Returns the full document with goals, signals, authorized actions, boundaries, and policies.',
    {},
    wrapToolHandler('intent_get_active', middleware, async () => {
      if (!config.exposeOrgIntentTools) return disabled();
      const result = await client.get('/api/v1/intent/active');
      return textResponse(result);
    })
  );

  // ── intent_create ───────────────────────────────────────────────────────────
  server.tool(
    'intent_create',
    'Create a new organizational intent document. Provide the full OrgIntentDoc body including goals, signals, authorized actions, hard boundaries, and policies.',
    {
      name: z.string().min(1).describe('Name for the intent document'),
      doc: z
        .record(z.string(), z.unknown())
        .describe(
          'Full OrgIntentDoc body — goals, signals, dataSources, authorizedActions, tradeoffProfiles, hardBoundaries, policies, delegationFramework, context'
        ),
    },
    wrapToolHandler('intent_create', middleware, async ({ name, doc }) => {
      if (!config.exposeOrgIntentTools) return disabled();
      const result = await client.post('/api/v1/intent', { name, ...doc });
      return textResponse(result);
    })
  );

  // ── intent_update ───────────────────────────────────────────────────────────
  server.tool(
    'intent_update',
    'Update an existing organizational intent document. Provide a partial update — only included fields will be changed.',
    {
      id: z.string().min(1).describe('Intent document ID to update'),
      patch: z
        .record(z.string(), z.unknown())
        .describe('Partial OrgIntentDoc update — only included fields are changed'),
    },
    wrapToolHandler('intent_update', middleware, async ({ id, patch }) => {
      if (!config.exposeOrgIntentTools) return disabled();
      const result = await client.put(`/api/v1/intent/${encodeURIComponent(id)}`, patch);
      return textResponse(result);
    })
  );

  // ── intent_activate ─────────────────────────────────────────────────────────
  server.tool(
    'intent_activate',
    'Set a specific intent document as the active one. Only one intent can be active at a time — this deactivates all others.',
    {
      id: z.string().min(1).describe('Intent document ID to activate'),
    },
    wrapToolHandler('intent_activate', middleware, async ({ id }) => {
      if (!config.exposeOrgIntentTools) return disabled();
      const result = await client.post(`/api/v1/intent/${encodeURIComponent(id)}/activate`, {});
      return textResponse(result);
    })
  );

  // ── intent_delete ───────────────────────────────────────────────────────────
  server.tool(
    'intent_delete',
    'Delete an organizational intent document. If the deleted document was active, no document will be active afterward.',
    {
      id: z.string().min(1).describe('Intent document ID to delete'),
    },
    wrapToolHandler('intent_delete', middleware, async ({ id }) => {
      if (!config.exposeOrgIntentTools) return disabled();
      await client.delete(`/api/v1/intent/${encodeURIComponent(id)}`);
      return textResponse({ success: true, deleted: id });
    })
  );

  // ── intent_enforcement_log ──────────────────────────────────────────────────
  server.tool(
    'intent_enforcement_log',
    'Query the intent enforcement log. Returns events like boundary_violated, action_blocked, action_allowed, goal_activated, goal_completed, policy_warn, policy_block.',
    {
      eventType: z
        .string()
        .optional()
        .describe('Filter by event type (e.g. boundary_violated, action_blocked)'),
      agentId: z.string().optional().describe('Filter by agent/personality ID'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .default(100)
        .describe('Maximum number of entries to return'),
    },
    wrapToolHandler('intent_enforcement_log', middleware, async ({ eventType, agentId, limit }) => {
      if (!config.exposeOrgIntentTools) return disabled();
      const params: Record<string, string> = {};
      if (eventType) params.eventType = eventType;
      if (agentId) params.agentId = agentId;
      if (limit) params.limit = String(limit);
      const result = await client.get('/api/v1/intent/enforcement-log', params);
      return textResponse(result);
    })
  );
}
