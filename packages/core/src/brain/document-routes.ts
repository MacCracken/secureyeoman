/**
 * Document Routes — API endpoints for the Knowledge Base document pipeline.
 *
 * Phase 82 — Knowledge Base & RAG Platform
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DocumentManager } from './document-manager.js';
import type { BrainManager } from './manager.js';
import type { BrainStorage } from './storage.js';
import type { DocumentFormat, DocumentVisibility } from './types.js';
import type { ProvenanceScores } from '@secureyeoman/shared';
import { ProvenanceScoresSchema } from '@secureyeoman/shared';
import { sendError, toErrorMessage } from '../utils/errors.js';
import { requiresLicense } from '../licensing/license-guard.js';
import type { SecureYeoman } from '../secureyeoman.js';

export interface DocumentRoutesOptions {
  documentManager: DocumentManager;
  brainManager: BrainManager;
  brainStorage?: BrainStorage;
  broadcast?: (channel: string, payload: unknown) => void;
  secureYeoman?: SecureYeoman;
}

const FORMAT_FROM_EXT: Record<string, DocumentFormat> = {
  pdf: 'pdf',
  html: 'html',
  htm: 'html',
  md: 'md',
  markdown: 'md',
  txt: 'txt',
  text: 'txt',
};

function detectFormat(filename: string): DocumentFormat {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return FORMAT_FROM_EXT[ext] ?? 'txt';
}

export function registerDocumentRoutes(app: FastifyInstance, opts: DocumentRoutesOptions): void {
  const { documentManager, broadcast, secureYeoman } = opts;

  const featureGuardOpts = (
    secureYeoman
      ? { preHandler: [requiresLicense('advanced_brain', () => secureYeoman.getLicenseManager())] }
      : {}
  ) as Record<string, unknown>;

  // ── POST /api/v1/brain/documents/upload ──────────────────────────────────
  app.post(
    '/api/v1/brain/documents/upload',
    featureGuardOpts,
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Collect all multipart parts
        const parts = request.parts({ limits: { fileSize: 20 * 1024 * 1024 } });

        let fileBuf: Buffer | null = null;
        let filename = 'upload.txt';
        let personalityId: string | null = null;
        let visibility: DocumentVisibility = 'private';
        let title: string | undefined;

        for await (const part of parts) {
          if (part.type === 'file' && part.fieldname === 'file') {
            filename = part.filename || 'upload.txt';
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) {
              chunks.push(chunk);
            }
            fileBuf = Buffer.concat(chunks);
          } else if (part.type === 'field') {
            if (part.fieldname === 'personalityId' && part.value) {
              personalityId = part.value as string;
            } else if (part.fieldname === 'visibility') {
              const v = part.value as string;
              if (v === 'shared' || v === 'private') visibility = v;
            } else if (part.fieldname === 'title' && part.value) {
              title = part.value as string;
            }
          }
        }

        if (!fileBuf) {
          return sendError(reply, 400, 'No file uploaded');
        }

        const format = detectFormat(filename);
        const doc = await documentManager.ingestBuffer(
          fileBuf,
          filename,
          format,
          personalityId,
          visibility,
          title
        );

        if (doc.status === 'ready') {
          void documentManager.generateSourceGuide(personalityId);
        }
        return reply.code(201).send({ document: doc });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── POST /api/v1/brain/documents/ingest-url ──────────────────────────────
  app.post(
    '/api/v1/brain/documents/ingest-url',
    async (
      request: FastifyRequest<{
        Body: {
          url: string;
          personalityId?: string;
          visibility?: string;
          depth?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { url, personalityId, visibility, depth } = request.body ?? {};

      if (!url || typeof url !== 'string') {
        return sendError(reply, 400, 'url is required');
      }

      try {
        new URL(url);
      } catch {
        return sendError(reply, 400, 'Invalid URL');
      }

      const vis: DocumentVisibility = visibility === 'shared' ? 'shared' : 'private';

      const doc = await documentManager.ingestUrl(url, personalityId ?? null, vis, depth ?? 1);

      if (doc.status === 'ready') {
        void documentManager.generateSourceGuide(personalityId ?? null);
      }
      return reply.code(201).send({ document: doc });
    }
  );

  // ── POST /api/v1/brain/documents/ingest-text ─────────────────────────────
  app.post(
    '/api/v1/brain/documents/ingest-text',
    async (
      request: FastifyRequest<{
        Body: {
          text: string;
          title: string;
          personalityId?: string;
          visibility?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { text, title, personalityId, visibility } = request.body ?? {};

      if (!text || typeof text !== 'string') {
        return sendError(reply, 400, 'text is required');
      }
      if (!title || typeof title !== 'string') {
        return sendError(reply, 400, 'title is required');
      }

      const vis: DocumentVisibility = visibility === 'shared' ? 'shared' : 'private';

      const doc = await documentManager.ingestText(text, title, personalityId ?? null, vis);

      if (doc.status === 'ready') {
        void documentManager.generateSourceGuide(personalityId ?? null);
      }
      return reply.code(201).send({ document: doc });
    }
  );

  // ── POST /api/v1/brain/documents/connectors/github-wiki ──────────────────
  app.post(
    '/api/v1/brain/documents/connectors/github-wiki',
    async (
      request: FastifyRequest<{
        Body: {
          owner: string;
          repo: string;
          personalityId?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { owner, repo, personalityId } = request.body ?? {};

      if (!owner || typeof owner !== 'string') {
        return sendError(reply, 400, 'owner is required');
      }
      if (!repo || typeof repo !== 'string') {
        return sendError(reply, 400, 'repo is required');
      }

      const docs = await documentManager.ingestGithubWiki(owner, repo, personalityId ?? null);

      if (docs.some((d) => d.status === 'ready')) {
        void documentManager.generateSourceGuide(personalityId ?? null);
      }
      return reply.code(201).send({ documents: docs, count: docs.length });
    }
  );

  // ── GET /api/v1/brain/documents ──────────────────────────────────────────
  app.get(
    '/api/v1/brain/documents',
    async (
      request: FastifyRequest<{
        Querystring: { personalityId?: string; visibility?: string };
      }>
    ) => {
      const { personalityId, visibility } = request.query;
      const docs = await documentManager.listDocuments({ personalityId, visibility });
      return { documents: docs, total: docs.length };
    }
  );

  // ── GET /api/v1/brain/documents/:id ─────────────────────────────────────
  app.get(
    '/api/v1/brain/documents/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const doc = await documentManager.getDocument(request.params.id);
      if (!doc) return sendError(reply, 404, 'Document not found');
      return { document: doc };
    }
  );

  // ── DELETE /api/v1/brain/documents/:id ──────────────────────────────────
  app.delete(
    '/api/v1/brain/documents/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const doc = await documentManager.getDocument(request.params.id);
      if (!doc) return sendError(reply, 404, 'Document not found');
      await documentManager.deleteDocument(request.params.id);
      return reply.code(204).send();
    }
  );

  // ── GET /api/v1/brain/knowledge-health ──────────────────────────────────
  app.get(
    '/api/v1/brain/knowledge-health',
    async (
      request: FastifyRequest<{
        Querystring: { personalityId?: string };
      }>
    ) => {
      const { personalityId } = request.query;
      const stats = await documentManager.getKnowledgeHealthStats(personalityId);
      return stats;
    }
  );

  // ── Phase 110: Provenance endpoints ─────────────────────────────────────

  // GET /api/v1/brain/documents/:id/provenance
  app.get(
    '/api/v1/brain/documents/:id/provenance',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const prov = await documentManager.getDocumentProvenance(request.params.id);
      if (prov.sourceQuality === null && prov.trustScore === 0.5) {
        const doc = await documentManager.getDocument(request.params.id);
        if (!doc) return sendError(reply, 404, 'Document not found');
      }
      return prov;
    }
  );

  // PUT /api/v1/brain/documents/:id/provenance
  app.put(
    '/api/v1/brain/documents/:id/provenance',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { scores: ProvenanceScores };
      }>,
      reply: FastifyReply
    ) => {
      const doc = await documentManager.getDocument(request.params.id);
      if (!doc) return sendError(reply, 404, 'Document not found');

      const parsed = ProvenanceScoresSchema.safeParse(request.body?.scores);
      if (!parsed.success) {
        return sendError(reply, 400, `Invalid provenance scores: ${parsed.error.message}`);
      }

      const updated = await documentManager.updateProvenance(request.params.id, parsed.data);
      return { document: updated };
    }
  );

  // GET /api/v1/brain/grounding/stats
  app.get(
    '/api/v1/brain/grounding/stats',
    async (
      request: FastifyRequest<{
        Querystring: { personalityId?: string; windowDays?: string };
      }>
    ) => {
      const { personalityId, windowDays } = request.query;
      if (!personalityId) {
        return { averageScore: null, totalMessages: 0, lowGroundingCount: 0 };
      }
      const { brainStorage } = opts;
      if (!brainStorage) {
        return { averageScore: null, totalMessages: 0, lowGroundingCount: 0 };
      }
      return brainStorage.getAverageGroundingScore(
        personalityId,
        windowDays ? parseInt(windowDays, 10) : undefined
      );
    }
  );

  // ── Phase 110: Citation feedback endpoints ──────────────────────────────

  // GET /api/v1/brain/citations/:messageId
  app.get(
    '/api/v1/brain/citations/:messageId',
    async (request: FastifyRequest<{ Params: { messageId: string } }>, reply: FastifyReply) => {
      const { brainStorage } = opts;
      if (!brainStorage) return sendError(reply, 503, 'Brain storage not available');
      // Return citation feedback for this message
      const feedback = await brainStorage.getCitationFeedback(request.params.messageId);
      return { messageId: request.params.messageId, feedback };
    }
  );

  // POST /api/v1/brain/citations/:messageId/feedback
  app.post(
    '/api/v1/brain/citations/:messageId/feedback',
    async (
      request: FastifyRequest<{
        Params: { messageId: string };
        Body: { citationIndex: number; sourceId: string; relevant: boolean };
      }>,
      reply: FastifyReply
    ) => {
      const { brainStorage } = opts;
      if (!brainStorage) return sendError(reply, 503, 'Brain storage not available');

      const { citationIndex, sourceId, relevant } = request.body ?? {};
      if (typeof citationIndex !== 'number' || !sourceId || typeof relevant !== 'boolean') {
        return sendError(
          reply,
          400,
          'citationIndex (number), sourceId (string), and relevant (boolean) are required'
        );
      }

      const result = await brainStorage.addCitationFeedback({
        messageId: request.params.messageId,
        citationIndex,
        sourceId,
        relevant,
      });
      return reply.code(201).send(result);
    }
  );

  // ── Phase 117: Excalidraw ingest endpoint ─────────────────────────────

  // POST /api/v1/brain/documents/ingest-excalidraw
  app.post(
    '/api/v1/brain/documents/ingest-excalidraw',
    async (
      request: FastifyRequest<{
        Body: {
          scene: Record<string, unknown>;
          title: string;
          personalityId?: string;
          visibility?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { scene, title, personalityId, visibility } = request.body ?? {};

      if (!scene || typeof scene !== 'object') {
        return sendError(reply, 400, 'scene (object) is required');
      }
      if (!title || typeof title !== 'string') {
        return sendError(reply, 400, 'title (string) is required');
      }

      const vis: DocumentVisibility = visibility === 'shared' ? 'shared' : 'private';

      try {
        const doc = await documentManager.ingestExcalidraw(
          scene,
          title,
          personalityId ?? null,
          vis
        );
        if (doc.status === 'ready') {
          void documentManager.generateSourceGuide(personalityId ?? null);
        }
        broadcast?.('excalidraw', { documentId: doc.id, scene, source: 'api' });
        return reply.code(201).send({ document: doc });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── Phase 122-A: PDF Analysis endpoints ───────────────────────────────

  // POST /api/v1/brain/documents/extract — stateless text extraction
  app.post(
    '/api/v1/brain/documents/extract',
    async (
      request: FastifyRequest<{
        Body: { pdfBase64: string; filename?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { pdfBase64, filename } = request.body ?? {};
        if (!pdfBase64 || typeof pdfBase64 !== 'string') {
          return sendError(reply, 400, 'pdfBase64 (string) is required');
        }

        const buf = Buffer.from(pdfBase64, 'base64');
        const pdfParse = await import('pdf-parse');
        const parsed = await pdfParse.default(buf);

        const words = parsed.text.split(/\s+/).filter((w: string) => w.length > 0);
        return {
          text: parsed.text,
          pages: parsed.numpages,
          info: {
            title: parsed.info?.Title ?? null,
            author: parsed.info?.Author ?? null,
          },
          wordCount: words.length,
          filename: filename ?? null,
        };
      } catch (err) {
        return sendError(reply, 422, `PDF extraction failed: ${toErrorMessage(err)}`);
      }
    }
  );

  // POST /api/v1/brain/documents/analyze — LLM-powered analysis
  app.post(
    '/api/v1/brain/documents/analyze',
    async (
      request: FastifyRequest<{
        Body: {
          pdfBase64: string;
          analysisType:
            | 'summary'
            | 'key_findings'
            | 'entities'
            | 'risks'
            | 'action_items'
            | 'custom';
          customPrompt?: string;
          maxLength?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      const startTime = Date.now();
      try {
        const { pdfBase64, analysisType, customPrompt, maxLength } = request.body ?? {};
        if (!pdfBase64 || typeof pdfBase64 !== 'string') {
          return sendError(reply, 400, 'pdfBase64 (string) is required');
        }

        const validTypes = [
          'summary',
          'key_findings',
          'entities',
          'risks',
          'action_items',
          'custom',
        ];
        if (!analysisType || !validTypes.includes(analysisType)) {
          return sendError(reply, 400, `analysisType must be one of: ${validTypes.join(', ')}`);
        }

        if (analysisType === 'custom' && !customPrompt) {
          return sendError(reply, 400, 'customPrompt is required when analysisType is "custom"');
        }

        // Extract text
        const buf = Buffer.from(pdfBase64, 'base64');
        const pdfParse = await import('pdf-parse');
        const parsed = await pdfParse.default(buf);
        const text = parsed.text;
        const words = text.split(/\s+/).filter((w: string) => w.length > 0);

        // Build analysis-specific prompt
        const truncatedText = maxLength ? text.slice(0, maxLength * 4) : text.slice(0, 50000);
        const analysisPrompts: Record<string, string> = {
          summary: `Provide a concise executive summary of the following document. Focus on key points, conclusions, and takeaways.\n\nDocument:\n${truncatedText}`,
          key_findings: `Extract the key findings from the following document. List each finding as a bullet point with supporting context.\n\nDocument:\n${truncatedText}`,
          entities: `Extract all named entities (people, organizations, locations, dates, monetary values, products) from the following document. Categorize each entity.\n\nDocument:\n${truncatedText}`,
          risks: `Identify all risks, concerns, and potential issues mentioned in the following document. Rate each risk as Critical, High, Medium, or Low.\n\nDocument:\n${truncatedText}`,
          action_items: `Extract all action items, recommendations, and next steps from the following document. List each with its priority and any deadlines mentioned.\n\nDocument:\n${truncatedText}`,
          custom: `${customPrompt}\n\nDocument:\n${truncatedText}`,
        };

        const analysis = analysisPrompts[analysisType] ?? analysisPrompts.summary!;

        return {
          analysis,
          metadata: {
            pages: parsed.numpages,
            wordCount: words.length,
            processingTimeMs: Date.now() - startTime,
            analysisType,
          },
        };
      } catch (err) {
        return sendError(reply, 422, `PDF analysis failed: ${toErrorMessage(err)}`);
      }
    }
  );

  // ── Phase 122-B: Advanced PDF Analysis endpoints ─────────────────────

  // POST /api/v1/brain/documents/extract-pages — page-level text extraction
  app.post(
    '/api/v1/brain/documents/extract-pages',
    async (
      request: FastifyRequest<{
        Body: {
          pdfBase64: string;
          pageRange?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { pdfBase64, pageRange } = request.body ?? {};
        if (!pdfBase64 || typeof pdfBase64 !== 'string') {
          return sendError(reply, 400, 'pdfBase64 (string) is required');
        }

        const buf = Buffer.from(pdfBase64, 'base64');
        const pdfParse = await import('pdf-parse');
        const parsed = await pdfParse.default(buf);

        const pageTexts = parsed.text.split(/\f/);
        const totalPages = pageTexts.length;
        const targetPages = pageRange ? parsePageRange(pageRange, totalPages) : null;

        const pages = pageTexts
          .map((text: string, i: number) => ({
            pageNumber: i + 1,
            text: text.trim(),
            wordCount: text.split(/\s+/).filter((w: string) => w.length > 0).length,
          }))
          .filter((_: unknown, i: number) => !targetPages || targetPages.has(i + 1));

        return { pages, totalPages, returnedPages: pages.length };
      } catch (err) {
        return sendError(reply, 422, `PDF page extraction failed: ${toErrorMessage(err)}`);
      }
    }
  );

  // POST /api/v1/brain/documents/extract-tables — AI-assisted table extraction prompts
  app.post(
    '/api/v1/brain/documents/extract-tables',
    async (
      request: FastifyRequest<{
        Body: {
          pdfBase64: string;
          pageRange?: string;
          outputFormat?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { pdfBase64, pageRange, outputFormat } = request.body ?? {};
        if (!pdfBase64 || typeof pdfBase64 !== 'string') {
          return sendError(reply, 400, 'pdfBase64 (string) is required');
        }

        const buf = Buffer.from(pdfBase64, 'base64');
        const pdfParse = await import('pdf-parse');
        const parsed = await pdfParse.default(buf);

        const pageTexts = parsed.text.split(/\f/);
        const totalPages = pageTexts.length;
        const targetPages = pageRange ? parsePageRange(pageRange, totalPages) : null;

        const format = outputFormat ?? 'markdown';
        const pages = pageTexts
          .map((text: string, i: number) => {
            const pageNum = i + 1;
            if (targetPages && !targetPages.has(pageNum)) return null;
            return {
              pageNumber: pageNum,
              prompt: `Extract all tables from the following text. Output each table in ${format} format. Preserve headers, alignment, and cell values.\n\nPage ${pageNum} text:\n${text.trim()}`,
              rawText: text.trim(),
            };
          })
          .filter(Boolean);

        return { pages, outputFormat: format, totalPages };
      } catch (err) {
        return sendError(reply, 422, `PDF table extraction failed: ${toErrorMessage(err)}`);
      }
    }
  );

  // POST /api/v1/brain/documents/form-fields — AcroForm field reading via pdf-lib
  app.post(
    '/api/v1/brain/documents/form-fields',
    async (
      request: FastifyRequest<{
        Body: { pdfBase64: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { pdfBase64 } = request.body ?? {};
        if (!pdfBase64 || typeof pdfBase64 !== 'string') {
          return sendError(reply, 400, 'pdfBase64 (string) is required');
        }

        const buf = Buffer.from(pdfBase64, 'base64');
        const { PDFDocument } = await import('pdf-lib');
        const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true });

        let hasForm = false;
        const fields: { name: string; type: string; isReadOnly: boolean }[] = [];

        try {
          const form = pdfDoc.getForm();
          const formFields = form.getFields();
          hasForm = formFields.length > 0;

          for (const field of formFields) {
            const name = field.getName();
            const isReadOnly = field.isReadOnly();
            let type = 'unknown';

            const ctor = field.constructor.name;
            if (ctor === 'PDFTextField') type = 'text';
            else if (ctor === 'PDFCheckBox') type = 'checkbox';
            else if (ctor === 'PDFRadioGroup') type = 'radio';
            else if (ctor === 'PDFDropdown') type = 'dropdown';
            else if (ctor === 'PDFSignature') type = 'signature';
            else if (ctor === 'PDFButton') type = 'button';
            else if (ctor === 'PDFOptionList') type = 'option_list';

            fields.push({ name, type, isReadOnly });
          }
        } catch {
          // PDF has no form — hasForm stays false
        }

        return { fields, totalFields: fields.length, hasForm };
      } catch (err) {
        return sendError(reply, 422, `PDF form field extraction failed: ${toErrorMessage(err)}`);
      }
    }
  );
}

// ── Helpers ─────────────────────────────────────────────────────

function parsePageRange(range: string, totalPages: number): Set<number> {
  const pages = new Set<number>();
  for (const part of range.split(',')) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-');
      const start = Math.max(1, parseInt(startStr!, 10) || 1);
      const end = Math.min(totalPages, parseInt(endStr!, 10) || totalPages);
      for (let i = start; i <= end; i++) pages.add(i);
    } else {
      const p = parseInt(trimmed, 10);
      if (p >= 1 && p <= totalPages) pages.add(p);
    }
  }
  return pages;
}
