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

export interface DocumentRoutesOptions {
  documentManager: DocumentManager;
  brainManager: BrainManager;
  brainStorage?: BrainStorage;
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
  const { documentManager } = opts;

  // ── POST /api/v1/brain/documents/upload ──────────────────────────────────
  app.post(
    '/api/v1/brain/documents/upload',
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
    async (
      request: FastifyRequest<{ Params: { messageId: string } }>,
      reply: FastifyReply
    ) => {
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
        return sendError(reply, 400, 'citationIndex (number), sourceId (string), and relevant (boolean) are required');
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
}
