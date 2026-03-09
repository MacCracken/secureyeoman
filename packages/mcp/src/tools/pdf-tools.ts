/**
 * PDF Analysis Tools — MCP tools for PDF text extraction, analysis, and comparison.
 *
 * Phase 122-A — PDF Analysis (6 tools)
 * Phase 122-B — Advanced PDF Analysis (5 tools)
 *
 * pdf_extract_text  — Extract text from a PDF
 * pdf_upload        — Upload PDF to knowledge base
 * pdf_analyze       — AI-powered PDF analysis
 * pdf_search        — Search within a PDF
 * pdf_compare       — Compare two PDFs
 * pdf_list          — List PDF documents in KB
 * pdf_extract_pages — Page-level text extraction with page range
 * pdf_extract_tables — AI-assisted table extraction prompts
 * pdf_visual_analyze — Text-based structural analysis
 * pdf_summarize     — Hierarchical summarization with page citations
 * pdf_form_fields   — AcroForm field reading
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler, jsonResponse, errorResponse } from './tool-utils.js';

// Response shapes from core PDF extraction endpoints
interface ExtractResult {
  text: string;
  pages: number;
}

interface ExtractPagesResult {
  totalPages: number;
  pages: { pageNumber: number; text: string; wordCount: number }[];
}

const PDF_DISABLED_MSG =
  'PDF tools are disabled. Enable PDF Analysis in MCP config to use pdf_* tools.';
const PDF_ADVANCED_DISABLED_MSG =
  'Advanced PDF tools are disabled. Enable exposePdfAdvanced in MCP config to use these tools.';

function disabled() {
  return errorResponse(PDF_DISABLED_MSG);
}

function disabledAdvanced() {
  return errorResponse(PDF_ADVANCED_DISABLED_MSG);
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
      return jsonResponse(result);
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
    wrapToolHandler(
      'pdf_upload',
      middleware,
      async ({ pdfBase64, filename, personalityId, visibility, title }) => {
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
        return jsonResponse(result);
      }
    )
  );

  // ── pdf_analyze ───────────────────────────────────────────────────────────
  server.tool(
    'pdf_analyze',
    'Analyze a PDF with AI. Supports: summary, key_findings, entities, risks, action_items, or custom analysis with a prompt.',
    {
      pdfBase64: z.string().describe('Base64-encoded PDF file content'),
      analysisType: z
        .enum(['summary', 'key_findings', 'entities', 'risks', 'action_items', 'custom'])
        .describe('Type of analysis to perform'),
      customPrompt: z
        .string()
        .optional()
        .describe('Custom analysis prompt (required when analysisType is "custom")'),
      maxLength: z
        .number()
        .int()
        .min(100)
        .max(100000)
        .optional()
        .describe('Max characters of PDF text to analyze (default: all)'),
    },
    wrapToolHandler(
      'pdf_analyze',
      middleware,
      async ({ pdfBase64, analysisType, customPrompt, maxLength }) => {
        if (!config.exposePdf) return disabled();
        const result = await client.post('/api/v1/brain/documents/analyze', {
          pdfBase64,
          analysisType,
          customPrompt,
          maxLength,
        });
        return jsonResponse(result);
      }
    )
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
      const extracted = await client.post<ExtractResult>('/api/v1/brain/documents/extract', {
        pdfBase64,
      });

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

      return jsonResponse({
        matches,
        totalMatches: matches.length,
        query,
        totalPages: extracted.pages,
      });
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
        client.post<ExtractResult>('/api/v1/brain/documents/extract', { pdfBase64: pdfA_base64 }),
        client.post<ExtractResult>('/api/v1/brain/documents/extract', { pdfBase64: pdfB_base64 }),
      ]);

      const splitMode = mode === 'words' ? /\s+/ : /\n/;
      const linesA = extractA.text.split(splitMode);
      const linesB = extractB.text.split(splitMode);

      // Simple line-level diff
      const changes: {
        type: 'added' | 'removed' | 'unchanged';
        content: string;
        lineA?: number;
        lineB?: number;
      }[] = [];
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

      return jsonResponse({
        additions,
        deletions,
        changes: changes.slice(0, 200), // Cap at 200 change entries
        summary: `${additions} additions, ${deletions} deletions across ${maxLen} lines`,
        pagesA: extractA.pages,
        pagesB: extractB.pages,
      });
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
      return jsonResponse(result);
    })
  );

  // ── Phase 122-B: Advanced PDF tools ──────────────────────────────────

  // ── pdf_extract_pages ───────────────────────────────────────────────
  server.tool(
    'pdf_extract_pages',
    'Extract text from a PDF page by page. Returns text, word count per page. Supports page range (e.g. "1-5", "2,4,6").',
    {
      pdfBase64: z.string().describe('Base64-encoded PDF file content'),
      pageRange: z
        .string()
        .optional()
        .describe('Page range to extract (e.g. "1-5", "2,4,6"). Omit for all pages.'),
    },
    wrapToolHandler('pdf_extract_pages', middleware, async ({ pdfBase64, pageRange }) => {
      if (!config.exposePdf) return disabled();
      if (!config.exposePdfAdvanced) return disabledAdvanced();
      const result = await client.post('/api/v1/brain/documents/extract-pages', {
        pdfBase64,
        pageRange,
      });
      return jsonResponse(result);
    })
  );

  // ── pdf_extract_tables ──────────────────────────────────────────────
  server.tool(
    'pdf_extract_tables',
    'Extract tables from a PDF. Returns AI-ready prompts per page for table extraction. Supports page range filtering.',
    {
      pdfBase64: z.string().describe('Base64-encoded PDF file content'),
      pageRange: z.string().optional().describe('Page range to extract tables from (e.g. "1-3")'),
      outputFormat: z
        .enum(['markdown', 'csv', 'json'])
        .optional()
        .describe('Table output format (default: markdown)'),
    },
    wrapToolHandler(
      'pdf_extract_tables',
      middleware,
      async ({ pdfBase64, pageRange, outputFormat }) => {
        if (!config.exposePdf) return disabled();
        if (!config.exposePdfAdvanced) return disabledAdvanced();
        const result = await client.post('/api/v1/brain/documents/extract-tables', {
          pdfBase64,
          pageRange,
          outputFormat,
        });
        return jsonResponse(result);
      }
    )
  );

  // ── pdf_visual_analyze ──────────────────────────────────────────────
  server.tool(
    'pdf_visual_analyze',
    'Analyze the structure and layout of a PDF: headers, sections, lists, figures, and reading order. Returns a structural analysis prompt for the LLM.',
    {
      pdfBase64: z.string().describe('Base64-encoded PDF file content'),
      pageRange: z.string().optional().describe('Page range to analyze (e.g. "1-5")'),
    },
    wrapToolHandler('pdf_visual_analyze', middleware, async ({ pdfBase64, pageRange }) => {
      if (!config.exposePdf) return disabled();
      if (!config.exposePdfAdvanced) return disabledAdvanced();

      const extracted = await client.post<ExtractPagesResult>(
        '/api/v1/brain/documents/extract-pages',
        { pdfBase64, pageRange }
      );

      const pageAnalysis = extracted.pages
        .map((p) => {
          return `--- Page ${p.pageNumber} (${p.wordCount} words) ---\n${p.text}`;
        })
        .join('\n\n');

      const analysisPrompt = [
        'Analyze the structural layout of this document. For each page identify:',
        '1. Headers and section titles (with hierarchy level H1-H4)',
        '2. Body text paragraphs',
        '3. Lists (bulleted, numbered)',
        '4. Tables (describe dimensions and headers)',
        '5. Figures, images, or diagrams (described by surrounding context)',
        '6. Page numbers, headers, footers',
        '7. Overall reading order and document flow',
        '',
        `Document (${extracted.totalPages} pages):`,
        '',
        pageAnalysis,
      ].join('\n');

      return jsonResponse({
        analysisPrompt,
        totalPages: extracted.totalPages,
        analyzedPages: extracted.pages.length,
      });
    })
  );

  // ── pdf_summarize ────────────────────────────────────────────────────
  server.tool(
    'pdf_summarize',
    'Generate a hierarchical summary of a PDF with page citations. Returns a summarization prompt for the LLM.',
    {
      pdfBase64: z.string().describe('Base64-encoded PDF file content'),
      pageRange: z.string().optional().describe('Page range to summarize (e.g. "1-10")'),
      style: z
        .enum(['executive', 'detailed', 'bullet_points'])
        .optional()
        .describe('Summary style (default: executive)'),
    },
    wrapToolHandler('pdf_summarize', middleware, async ({ pdfBase64, pageRange, style }) => {
      if (!config.exposePdf) return disabled();
      if (!config.exposePdfAdvanced) return disabledAdvanced();

      const extracted = await client.post<ExtractPagesResult>(
        '/api/v1/brain/documents/extract-pages',
        { pdfBase64, pageRange }
      );

      const summaryStyle = style ?? 'executive';
      const styleInstructions: Record<string, string> = {
        executive:
          'Write a concise executive summary (3-5 paragraphs). Focus on key conclusions, decisions needed, and impact.',
        detailed:
          'Write a detailed summary covering all main points, arguments, and evidence. Organize by topic or section.',
        bullet_points:
          'Summarize as a structured bullet-point list. Group related points under section headers.',
      };

      const pageContent = extracted.pages
        .map((p) => {
          return `[Page ${p.pageNumber}]\n${p.text}`;
        })
        .join('\n\n');

      const summaryPrompt = [
        styleInstructions[summaryStyle] ?? styleInstructions.executive!,
        '',
        'IMPORTANT: Cite page numbers for each claim or finding using [p.N] format.',
        '',
        `Document (${extracted.totalPages} pages, ${extracted.pages.length} analyzed):`,
        '',
        pageContent,
      ].join('\n');

      return jsonResponse({
        summaryPrompt,
        style: summaryStyle,
        totalPages: extracted.totalPages,
        analyzedPages: extracted.pages.length,
      });
    })
  );

  // ── pdf_form_fields ──────────────────────────────────────────────────
  server.tool(
    'pdf_form_fields',
    'Read AcroForm fields from a PDF. Returns field names, types (text, checkbox, radio, dropdown, signature), and read-only status.',
    {
      pdfBase64: z.string().describe('Base64-encoded PDF file content'),
    },
    wrapToolHandler('pdf_form_fields', middleware, async ({ pdfBase64 }) => {
      if (!config.exposePdf) return disabled();
      if (!config.exposePdfAdvanced) return disabledAdvanced();
      const result = await client.post('/api/v1/brain/documents/form-fields', {
        pdfBase64,
      });
      return jsonResponse(result);
    })
  );
}
