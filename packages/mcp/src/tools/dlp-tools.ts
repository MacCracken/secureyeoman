/**
 * DLP MCP Tools — Phase 136-F
 *
 * Content classification, DLP scanning, policy listing,
 * egress monitoring, and watermark operations.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler, jsonResponse, errorResponse } from './tool-utils.js';

const DLP_DISABLED_MSG =
  'DLP tools are disabled. Enable exposeDlp in MCP config to use dlp_* tools.';

function disabled() {
  return errorResponse(DLP_DISABLED_MSG);
}

export function registerDlpTools(
  server: McpServer,
  client: CoreApiClient,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  // ── dlp_classify ────────────────────────────────────────────────────────────
  server.tool(
    'dlp_classify',
    'Classify text content for sensitivity level (public/internal/confidential/restricted) with PII and keyword detection',
    {
      text: z.string().describe('Text content to classify'),
      contentId: z.string().optional().describe('Optional content ID to persist classification'),
      contentType: z
        .enum(['conversation', 'document', 'memory', 'knowledge', 'message'])
        .optional()
        .describe('Content type for persistence'),
    },
    wrapToolHandler('dlp_classify', middleware, async (args) => {
      if (!('exposeDlp' in config) || !config.exposeDlp) return disabled();
      const result = await client.post('/api/v1/security/dlp/classify', args);
      return jsonResponse(result);
    })
  );

  // ── dlp_scan ────────────────────────────────────────────────────────────────
  server.tool(
    'dlp_scan',
    'Scan outbound content against DLP policies. Returns allowed/blocked/warned status and findings.',
    {
      content: z.string().describe('Text content to scan'),
      destination: z.string().describe('Destination type (e.g. email, slack, webhook, api)'),
      contentType: z.string().optional().describe('Content type context'),
    },
    wrapToolHandler('dlp_scan', middleware, async (args) => {
      if (!('exposeDlp' in config) || !config.exposeDlp) return disabled();
      const result = await client.post('/api/v1/security/dlp/scan', args);
      return jsonResponse(result);
    })
  );

  // ── dlp_policies ────────────────────────────────────────────────────────────
  server.tool(
    'dlp_policies',
    'List DLP policies with optional active filter',
    {
      active: z.boolean().optional().describe('Filter by enabled status'),
      limit: z.number().int().optional().describe('Max results (default 50)'),
    },
    wrapToolHandler('dlp_policies', middleware, async (args) => {
      if (!('exposeDlp' in config) || !config.exposeDlp) return disabled();
      const query: Record<string, string> = {};
      if (args.active !== undefined) query.active = String(args.active);
      if (args.limit !== undefined) query.limit = String(args.limit);
      const result = await client.get('/api/v1/security/dlp/policies', query);
      return jsonResponse(result);
    })
  );

  // ── dlp_egress_stats ────────────────────────────────────────────────────────
  server.tool(
    'dlp_egress_stats',
    'Get egress monitoring statistics aggregated by destination, action, and classification level',
    {
      from: z.number().optional().describe('Start timestamp (ms). Default: 24h ago'),
      to: z.number().optional().describe('End timestamp (ms). Default: now'),
    },
    wrapToolHandler('dlp_egress_stats', middleware, async (args) => {
      if (!('exposeDlp' in config) || !config.exposeDlp) return disabled();
      const query: Record<string, string> = {};
      if (args.from !== undefined) query.from = String(args.from);
      if (args.to !== undefined) query.to = String(args.to);
      const result = await client.get('/api/v1/security/dlp/egress/stats', query);
      return jsonResponse(result);
    })
  );

  // ── dlp_watermark_embed ─────────────────────────────────────────────────────
  server.tool(
    'dlp_watermark_embed',
    'Embed an invisible watermark into text for content provenance tracking',
    {
      text: z.string().describe('Text to watermark'),
      contentId: z.string().describe('Content ID for tracking'),
      algorithm: z
        .enum(['unicode-steganography', 'whitespace', 'homoglyph'])
        .optional()
        .describe('Watermark algorithm (default: unicode-steganography)'),
    },
    wrapToolHandler('dlp_watermark_embed', middleware, async (args) => {
      if (!('exposeDlp' in config) || !config.exposeDlp) return disabled();
      const result = await client.post('/api/v1/security/dlp/watermark/embed', args);
      return jsonResponse(result);
    })
  );

  // ── dlp_watermark_extract ───────────────────────────────────────────────────
  server.tool(
    'dlp_watermark_extract',
    'Extract a watermark payload from watermarked text to identify provenance',
    {
      text: z.string().describe('Text to extract watermark from'),
      algorithm: z
        .enum(['unicode-steganography', 'whitespace', 'homoglyph'])
        .optional()
        .describe('Watermark algorithm to use for extraction'),
    },
    wrapToolHandler('dlp_watermark_extract', middleware, async (args) => {
      if (!('exposeDlp' in config) || !config.exposeDlp) return disabled();
      const result = await client.post('/api/v1/security/dlp/watermark/extract', args);
      return jsonResponse(result);
    })
  );
}
