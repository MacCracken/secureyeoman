/**
 * Document Routes — API endpoints for the Knowledge Base document pipeline.
 *
 * Phase 82 — Knowledge Base & RAG Platform
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DocumentManager } from './document-manager.js';
import type { BrainManager } from './manager.js';
import type { DocumentFormat, DocumentVisibility } from './types.js';
import { sendError } from '../utils/errors.js';

export interface DocumentRoutesOptions {
  documentManager: DocumentManager;
  brainManager: BrainManager;
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

export function registerDocumentRoutes(
  app: FastifyInstance,
  opts: DocumentRoutesOptions
): void {
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

        return reply.code(201).send({ document: doc });
      } catch (err) {
        return sendError(reply, 500, err instanceof Error ? err.message : 'Upload failed');
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

      const vis: DocumentVisibility =
        visibility === 'shared' ? 'shared' : 'private';

      const doc = await documentManager.ingestUrl(
        url,
        personalityId ?? null,
        vis,
        depth ?? 1
      );

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

      const vis: DocumentVisibility =
        visibility === 'shared' ? 'shared' : 'private';

      const doc = await documentManager.ingestText(
        text,
        title,
        personalityId ?? null,
        vis
      );

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

      const docs = await documentManager.ingestGithubWiki(
        owner,
        repo,
        personalityId ?? null
      );

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
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const doc = await documentManager.getDocument(request.params.id);
      if (!doc) return sendError(reply, 404, 'Document not found');
      return { document: doc };
    }
  );

  // ── DELETE /api/v1/brain/documents/:id ──────────────────────────────────
  app.delete(
    '/api/v1/brain/documents/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
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
}
