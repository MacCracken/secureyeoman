/**
 * PDF Analysis Tools — MCP tools for PDF text extraction, analysis, and comparison.
 *
 * Phase 122-A — PDF Analysis
 *
 * pdf_extract_text  — Extract text from a PDF
 * pdf_upload        — Upload PDF to knowledge base
 * pdf_analyze       — AI-powered PDF analysis
 * pdf_search        — Search within a PDF
 * pdf_compare       — Compare two PDFs
 * pdf_list          — List PDF documents in KB
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
        text: 'PDF tools are disabled. Enable PDF Analysis in MCP config to use pdf_* tools.',
      },
    ],
    isError: true,
  };
}

export function registerPdfTools(
  server: McpServer,
  client: CoreApiClient,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  // ── pdf_extract_text ──────────────────────────────────────────────────────
  server.tool(
    'pdf_extract_text',
    'Extract text content from a base64-encoded PDF file. Returns text, page count, word count, and document info.',
    {
      pdfBase64: z.string().describe('Base64-encoded PDF file content'),
      filename: z.string().optional().describe('Original filename for reference'),
    },
    wrapToolHandler('pdf_extract_text', middleware, async ({ pdfBase64, filename }) => {
      if (!config.exposePdf) return disabled();
      const result = await client.post('/api/v1/brain/documents/extract', {
        pdfBase64,
        filename,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── pdf_upload ────────────────────────────────────────────────────────────
  server.tool(
    'pdf_upload',
    'Upload a PDF to the knowledge base for indexing and retrieval. The PDF is ingested, chunked, and made searchable.',
    {
      pdfBase64: z.string().describe('Base64-encoded PDF file content'),
      filename: z.string().describe('PDF filename (e.g. "report.pdf")'),
      personalityId: z.string().optional().describe('Scope to a specific personality'),
      visibility: z.enum(['private', 'shared']).optional().describe('Document visibility'),
      title: z.string().optional().describe('Document title (defaults to filename)'),
    },
    wrapToolHandler('pdf_upload', middleware, async ({ pdfBase64, filename, personalityId, visibility, title }) => {
      if (!config.exposePdf) return disabled();
      // The upload endpoint expects multipart, but from MCP we use base64 via ingest-text
      // Actually, we POST a synthetic buffer through the extract → ingest flow
      const result = await client.post('/api/v1/brain/documents/ingest-text', {
        text: `[PDF Upload] ${filename}`,
        title: title ?? filename,
        personalityId: personalityId ?? null,
        visibility: visibility ?? 'private',
        format: 'pdf',
        pdfBase64,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── pdf_analyze ───────────────────────────────────────────────────────────
  server.tool(
    'pdf_analyze',
    'Analyze a PDF with AI. Supports: summary, key_findings, entities, risks, action_items, or custom analysis with a prompt.',
    {
      pdfBase64: z.string().describe('Base64-encoded PDF file content'),
      analysisType: z.enum(['summary', 'key_findings', 'entities', 'risks', 'action_items', 'custom'])
        .describe('Type of analysis to perform'),
      customPrompt: z.string().optional().describe('Custom analysis prompt (required when analysisType is "custom")'),
      maxLength: z.number().int().min(100).max(100000).optional()
        .describe('Max characters of PDF text to analyze (default: all)'),
    },
    wrapToolHandler('pdf_analyze', middleware, async ({ pdfBase64, analysisType, customPrompt, maxLength }) => {
      if (!config.exposePdf) return disabled();
      const result = await client.post('/api/v1/brain/documents/analyze', {
        pdfBase64,
        analysisType,
        customPrompt,
        maxLength,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── pdf_search ────────────────────────────────────────────────────────────
  server.tool(
    'pdf_search',
    'Search within a PDF for text matches. Returns matches with page context and position.',
    {
      pdfBase64: z.string().describe('Base64-encoded PDF file content'),
      query: z.string().min(1).describe('Text to search for'),
      caseSensitive: z.boolean().optional().describe('Case-sensitive search (default: false)'),
    },
    wrapToolHandler('pdf_search', middleware, async ({ pdfBase64, query, caseSensitive }) => {
      if (!config.exposePdf) return disabled();

      // Extract text via core API
      const extracted = await client.post('/api/v1/brain/documents/extract', { pdfBase64 }) as {
        text: string;
        pages: number;
      };

      const text = extracted.text;
      const searchQuery = caseSensitive ? query : query.toLowerCase();
      const searchText = caseSensitive ? text : text.toLowerCase();

      // Split into "pages" by form feed or roughly by line count
      const pageTexts = text.split(/\f/);
      const matches: { page: number; context: string; position: number }[] = [];

      for (let pageIdx = 0; pageIdx < pageTexts.length; pageIdx++) {
        const pageText = pageTexts[pageIdx]!;
        const searchPageText = caseSensitive ? pageText : pageText.toLowerCase();
        let pos = 0;
        while ((pos = searchPageText.indexOf(searchQuery, pos)) !== -1) {
          const contextStart = Math.max(0, pos - 50);
          const contextEnd = Math.min(pageText.length, pos + query.length + 50);
          matches.push({
            page: pageIdx + 1,
            context: pageText.slice(contextStart, contextEnd),
            position: pos,
          });
          pos += query.length;
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            matches,
            totalMatches: matches.length,
            query,
            totalPages: extracted.pages,
          }, null, 2),
        }],
      };
    })
  );

  // ── pdf_compare ───────────────────────────────────────────────────────────
  server.tool(
    'pdf_compare',
    'Compare two PDFs and return a line-level diff. Useful for reviewing changes between document versions.',
    {
      pdfA_base64: z.string().describe('Base64-encoded first PDF'),
      pdfB_base64: z.string().describe('Base64-encoded second PDF'),
      mode: z.enum(['lines', 'words']).optional().describe('Comparison mode (default: lines)'),
    },
    wrapToolHandler('pdf_compare', middleware, async ({ pdfA_base64, pdfB_base64, mode }) => {
      if (!config.exposePdf) return disabled();

      // Extract text from both PDFs
      const [extractA, extractB] = await Promise.all([
        client.post('/api/v1/brain/documents/extract', { pdfBase64: pdfA_base64 }) as Promise<{ text: string; pages: number }>,
        client.post('/api/v1/brain/documents/extract', { pdfBase64: pdfB_base64 }) as Promise<{ text: string; pages: number }>,
      ]);

      const splitMode = mode === 'words' ? /\s+/ : /\n/;
      const linesA = extractA.text.split(splitMode);
      const linesB = extractB.text.split(splitMode);

      // Simple line-level diff
      const changes: { type: 'added' | 'removed' | 'unchanged'; content: string; lineA?: number; lineB?: number }[] = [];
      let additions = 0;
      let deletions = 0;

      const maxLen = Math.max(linesA.length, linesB.length);
      const setA = new Set(linesA);
      const setB = new Set(linesB);

      for (let i = 0; i < linesA.length; i++) {
        if (!setB.has(linesA[i]!)) {
          changes.push({ type: 'removed', content: linesA[i]!, lineA: i + 1 });
          deletions++;
        }
      }
      for (let i = 0; i < linesB.length; i++) {
        if (!setA.has(linesB[i]!)) {
          changes.push({ type: 'added', content: linesB[i]!, lineB: i + 1 });
          additions++;
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            additions,
            deletions,
            changes: changes.slice(0, 200), // Cap at 200 change entries
            summary: `${additions} additions, ${deletions} deletions across ${maxLen} lines`,
            pagesA: extractA.pages,
            pagesB: extractB.pages,
          }, null, 2),
        }],
      };
    })
  );

  // ── pdf_list ──────────────────────────────────────────────────────────────
  server.tool(
    'pdf_list',
    'List PDF documents in the knowledge base. Returns document metadata.',
    {
      personalityId: z.string().optional().describe('Filter by personality ID'),
      status: z.string().optional().describe('Filter by status (ready, processing, error)'),
    },
    wrapToolHandler('pdf_list', middleware, async ({ personalityId, status }) => {
      if (!config.exposePdf) return disabled();
      const params: Record<string, string> = { format: 'pdf' };
      if (personalityId) params.personalityId = personalityId;
      if (status) params.status = status;

      const result = await client.get('/api/v1/brain/documents', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );
}
