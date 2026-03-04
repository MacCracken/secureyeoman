import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import { registerDocumentRoutes } from './document-routes.js';
import type { DocumentManager } from './document-manager.js';
import type { BrainManager } from './manager.js';
import type { KbDocument } from './types.js';

// ── Fixtures ─────────────────────────────────────────────────────

const DOC: KbDocument = {
  id: 'doc-1',
  personalityId: null,
  title: 'Test Document',
  filename: 'test.txt',
  format: 'txt',
  sourceUrl: null,
  visibility: 'private',
  status: 'ready',
  chunkCount: 3,
  errorMessage: null,
  createdAt: 1000,
  updatedAt: 2000,
};

const URL_DOC: KbDocument = {
  ...DOC,
  id: 'doc-url-1',
  title: 'https://example.com',
  format: 'url',
  sourceUrl: 'https://example.com',
};

const HEALTH_STATS = {
  totalDocuments: 5,
  totalChunks: 20,
  byFormat: { txt: 3, md: 2 },
  recentQueryCount: 10,
  avgTopScore: 0.75,
  lowCoverageQueries: 2,
};

// ── Mock factories ────────────────────────────────────────────────

const EXCALIDRAW_DOC: KbDocument = {
  ...DOC,
  id: 'doc-excalidraw-1',
  title: 'Architecture Diagram',
  format: 'excalidraw',
  filename: null,
};

function makeMockDocManager(overrides?: Partial<DocumentManager>): DocumentManager {
  return {
    ingestBuffer: vi.fn().mockResolvedValue(DOC),
    ingestUrl: vi.fn().mockResolvedValue(URL_DOC),
    ingestText: vi.fn().mockResolvedValue(DOC),
    ingestExcalidraw: vi.fn().mockResolvedValue(EXCALIDRAW_DOC),
    ingestGithubWiki: vi.fn().mockResolvedValue([DOC]),
    listDocuments: vi.fn().mockResolvedValue([DOC]),
    getDocument: vi.fn().mockResolvedValue(DOC),
    deleteDocument: vi.fn().mockResolvedValue(undefined),
    getKnowledgeHealthStats: vi.fn().mockResolvedValue(HEALTH_STATS),
    logQuery: vi.fn().mockResolvedValue(undefined),
    generateSourceGuide: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as DocumentManager;
}

function makeMockBrain(): BrainManager {
  return {} as BrainManager;
}

// ── Helper to build multipart body ───────────────────────────────

function buildMultipartBody(
  filename: string,
  content: string,
  fields?: Record<string, string>
): { body: Buffer; boundary: string } {
  const boundary = '----TestBoundary123';
  const parts: string[] = [];

  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/plain\r\n\r\n${content}\r\n`
  );

  for (const [key, value] of Object.entries(fields ?? {})) {
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
    );
  }

  parts.push(`--${boundary}--\r\n`);
  return { body: Buffer.from(parts.join('')), boundary };
}

// ── Test setup ───────────────────────────────────────────────────

async function buildApp(docManager?: Partial<DocumentManager>) {
  const app = Fastify({ logger: false });
  await app.register(fastifyMultipart);
  registerDocumentRoutes(app, {
    documentManager: makeMockDocManager(docManager),
    brainManager: makeMockBrain(),
  });
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────

describe('Document Routes', () => {
  describe('POST /api/v1/brain/documents/upload', () => {
    it('uploads a file and returns 201', async () => {
      const app = await buildApp();
      const { body, boundary } = buildMultipartBody('test.txt', 'Hello world');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/upload',
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
        body,
      });

      expect(res.statusCode).toBe(201);
      const data = res.json() as { document: KbDocument };
      expect(data.document.id).toBe('doc-1');
    });

    it('returns 400 when no file is provided', async () => {
      const app = await buildApp();
      const boundary = '----TestBoundary456';
      const body = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nOnly a field\r\n--${boundary}--\r\n`
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/upload',
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
        body,
      });

      expect(res.statusCode).toBe(400);
    });

    it('passes visibility and personalityId fields', async () => {
      const ingestBuffer = vi
        .fn()
        .mockResolvedValue({ ...DOC, visibility: 'shared', personalityId: 'p-1' });
      const app = await buildApp({ ingestBuffer });

      const { body, boundary } = buildMultipartBody('test.md', '# Doc', {
        visibility: 'shared',
        personalityId: 'p-1',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/upload',
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
        body,
      });

      expect(res.statusCode).toBe(201);
      expect(ingestBuffer).toHaveBeenCalledWith(
        expect.any(Buffer),
        'test.md',
        'md',
        'p-1',
        'shared',
        undefined
      );
    });
  });

  describe('POST /api/v1/brain/documents/ingest-url', () => {
    it('ingests a URL and returns 201', async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/ingest-url',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com' }),
      });

      expect(res.statusCode).toBe(201);
      const data = res.json() as { document: KbDocument };
      expect(data.document.format).toBe('url');
    });

    it('returns 400 when url is missing', async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/ingest-url',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for invalid URL', async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/ingest-url',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'not-a-url' }),
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/brain/documents/ingest-text', () => {
    it('ingests text and returns 201', async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/ingest-text',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'Some content', title: 'My Title' }),
      });

      expect(res.statusCode).toBe(201);
      const data = res.json() as { document: KbDocument };
      expect(data.document).toBeDefined();
    });

    it('returns 400 when text is missing', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/ingest-text',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'No text' }),
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when title is missing', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/ingest-text',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'Some text' }),
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/brain/documents/connectors/github-wiki', () => {
    it('syncs wiki and returns 201 with count', async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/connectors/github-wiki',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ owner: 'myorg', repo: 'myrepo' }),
      });

      expect(res.statusCode).toBe(201);
      const data = res.json() as { documents: KbDocument[]; count: number };
      expect(data.count).toBe(1);
      expect(data.documents).toHaveLength(1);
    });

    it('returns 400 when owner is missing', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/connectors/github-wiki',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repo: 'myrepo' }),
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/brain/documents', () => {
    it('lists all documents', async () => {
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v1/brain/documents' });

      expect(res.statusCode).toBe(200);
      const data = res.json() as { documents: KbDocument[]; total: number };
      expect(data.documents).toHaveLength(1);
      expect(data.total).toBe(1);
    });

    it('passes personalityId filter', async () => {
      const listDocuments = vi.fn().mockResolvedValue([]);
      const app = await buildApp({ listDocuments });

      await app.inject({
        method: 'GET',
        url: '/api/v1/brain/documents?personalityId=p-1',
      });

      expect(listDocuments).toHaveBeenCalledWith({ personalityId: 'p-1', visibility: undefined });
    });
  });

  describe('GET /api/v1/brain/documents/:id', () => {
    it('returns a document by id', async () => {
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v1/brain/documents/doc-1' });

      expect(res.statusCode).toBe(200);
      const data = res.json() as { document: KbDocument };
      expect(data.document.id).toBe('doc-1');
    });

    it('returns 404 when not found', async () => {
      const app = await buildApp({ getDocument: vi.fn().mockResolvedValue(null) });

      const res = await app.inject({ method: 'GET', url: '/api/v1/brain/documents/missing' });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v1/brain/documents/:id', () => {
    it('deletes a document and returns 204', async () => {
      const app = await buildApp();

      const res = await app.inject({ method: 'DELETE', url: '/api/v1/brain/documents/doc-1' });

      expect(res.statusCode).toBe(204);
    });

    it('returns 404 when document not found', async () => {
      const app = await buildApp({ getDocument: vi.fn().mockResolvedValue(null) });

      const res = await app.inject({ method: 'DELETE', url: '/api/v1/brain/documents/missing' });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/brain/knowledge-health', () => {
    it('returns health stats', async () => {
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v1/brain/knowledge-health' });

      expect(res.statusCode).toBe(200);
      const data = res.json() as typeof HEALTH_STATS;
      expect(data.totalDocuments).toBe(5);
      expect(data.totalChunks).toBe(20);
      expect(data.recentQueryCount).toBe(10);
    });

    it('passes personalityId query param', async () => {
      const getKnowledgeHealthStats = vi.fn().mockResolvedValue(HEALTH_STATS);
      const app = await buildApp({ getKnowledgeHealthStats });

      await app.inject({
        method: 'GET',
        url: '/api/v1/brain/knowledge-health?personalityId=p-2',
      });

      expect(getKnowledgeHealthStats).toHaveBeenCalledWith('p-2');
    });
  });

  // ── Phase 122-A: PDF Analysis endpoints ──────────────────────────

  describe('POST /api/v1/brain/documents/extract', () => {
    it('returns 400 when pdfBase64 is missing', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/extract',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 422 for invalid PDF data', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/extract',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pdfBase64: 'bm90YXBkZg==' }), // "notapdf"
      });
      // pdf-parse will fail on invalid PDF data
      expect(res.statusCode).toBe(422);
    });
  });

  describe('POST /api/v1/brain/documents/analyze', () => {
    it('returns 400 when pdfBase64 is missing', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/analyze',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ analysisType: 'summary' }),
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for invalid analysisType', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/analyze',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pdfBase64: 'dGVzdA==', analysisType: 'invalid' }),
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when custom type lacks customPrompt', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/analyze',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pdfBase64: 'dGVzdA==', analysisType: 'custom' }),
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Phase 117: Excalidraw ingest endpoint ───────────────────────────

  describe('POST /api/v1/brain/documents/ingest-excalidraw', () => {
    it('ingests an Excalidraw scene and returns 201', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/ingest-excalidraw',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scene: { elements: [{ type: 'text', text: 'Hello' }] },
          title: 'Test Diagram',
        }),
      });
      expect(res.statusCode).toBe(201);
      const data = res.json() as { document: KbDocument };
      expect(data.document.format).toBe('excalidraw');
    });

    it('returns 400 when scene is missing', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/ingest-excalidraw',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'No scene' }),
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when title is missing', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/ingest-excalidraw',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scene: { elements: [] } }),
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Phase 122-B: Advanced PDF endpoints ─────────────────────────────

  describe('POST /api/v1/brain/documents/extract-pages', () => {
    it('returns 400 when pdfBase64 is missing', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/extract-pages',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 422 for invalid PDF data', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/extract-pages',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pdfBase64: 'bm90YXBkZg==' }),
      });
      expect(res.statusCode).toBe(422);
    });
  });

  describe('POST /api/v1/brain/documents/extract-tables', () => {
    it('returns 400 when pdfBase64 is missing', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/extract-tables',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 422 for invalid PDF data', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/extract-tables',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pdfBase64: 'bm90YXBkZg==' }),
      });
      expect(res.statusCode).toBe(422);
    });
  });

  describe('POST /api/v1/brain/documents/form-fields', () => {
    it('returns 400 when pdfBase64 is missing', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/form-fields',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
