/**
 * Knowledge Base Tools — MCP tools for the document-oriented knowledge platform.
 *
 * Phase 82 — Knowledge Base & RAG Platform
 *
 * kb_search        — Semantic search across knowledge base (documents + entries)
 * kb_add_document  — Ingest a URL or raw text into the knowledge base
 * kb_list_documents — List all ingested documents
 * kb_delete_document — Delete a document and all its chunks
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';

export function registerKnowledgeBaseTools(
  server: McpServer,
  client: CoreApiClient,
  middleware: ToolMiddleware
): void {
  // ── kb_search ────────────────────────────────────────────────────────────
  server.tool(
    'kb_search',
    'Semantic search across the knowledge base (documents + entries). Returns chunks ranked by relevance.',
    {
      query: z.string().min(1).describe('Search query'),
      personalityId: z.string().optional().describe('Scope search to a specific personality'),
      topK: z.number().int().min(1).max(50).default(5).describe('Number of results to return'),
      minScore: z
        .number()
        .min(0)
        .max(1)
        .default(0.6)
        .describe('Minimum relevance score threshold (0–1)'),
    },
    wrapToolHandler('kb_search', middleware, async ({ query, personalityId, topK, minScore }) => {
      const params: Record<string, string> = {
        query,
        type: 'knowledge',
        limit: String(topK),
        threshold: String(minScore),
      };
      if (personalityId) params.personalityId = personalityId;

      const result = await client.get('/api/v1/brain/search/similar', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── kb_add_document ──────────────────────────────────────────────────────
  server.tool(
    'kb_add_document',
    'Ingest a URL or raw text into the knowledge base. If content starts with http/https, it is fetched as a web page; otherwise it is stored as plain text.',
    {
      content: z
        .string()
        .min(1)
        .describe('URL (http/https) to crawl or raw text to add to the knowledge base'),
      title: z.string().optional().describe('Optional title for the document'),
      personalityId: z
        .string()
        .optional()
        .describe('Scope document to a specific personality (omit for global)'),
      visibility: z
        .enum(['private', 'shared'])
        .default('private')
        .describe("Visibility: 'private' (personality-scoped) or 'shared' (accessible to all)"),
    },
    wrapToolHandler(
      'kb_add_document',
      middleware,
      async ({ content, title, personalityId, visibility }) => {
        let result: unknown;

        if (content.startsWith('http://') || content.startsWith('https://')) {
          result = await client.post('/api/v1/brain/documents/ingest-url', {
            url: content,
            personalityId,
            visibility,
          });
        } else {
          result = await client.post('/api/v1/brain/documents/ingest-text', {
            text: content,
            title: title ?? 'Untitled',
            personalityId,
            visibility,
          });
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      }
    )
  );

  // ── kb_list_documents ────────────────────────────────────────────────────
  server.tool(
    'kb_list_documents',
    'List all documents ingested into the knowledge base.',
    {
      personalityId: z
        .string()
        .optional()
        .describe('Filter by personality (omit for all documents)'),
      visibility: z
        .enum(['private', 'shared'])
        .optional()
        .describe("Filter by visibility: 'private' or 'shared'"),
    },
    wrapToolHandler('kb_list_documents', middleware, async ({ personalityId, visibility }) => {
      const params: Record<string, string> = {};
      if (personalityId) params.personalityId = personalityId;
      if (visibility) params.visibility = visibility;

      const result = await client.get('/api/v1/brain/documents', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── kb_delete_document ───────────────────────────────────────────────────
  server.tool(
    'kb_delete_document',
    'Delete a document from the knowledge base and remove all its indexed chunks.',
    {
      id: z.string().min(1).describe('Document ID to delete'),
    },
    wrapToolHandler('kb_delete_document', middleware, async ({ id }) => {
      await client.delete(`/api/v1/brain/documents/${id}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success: true, deleted: id }, null, 2),
          },
        ],
      };
    })
  );
}
