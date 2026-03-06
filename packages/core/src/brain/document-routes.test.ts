import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import { registerDocumentRoutes } from './document-routes.js';
import type { DocumentManager } from './document-manager.js';
import type { BrainManager } from './manager.js';
import type { BrainStorage } from './storage.js';
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
  sourceQuality: null,
  trustScore: 0.5,
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

const EXCALIDRAW_DOC: KbDocument = {
  ...DOC,
  id: 'doc-excalidraw-1',
  title: 'Architecture Diagram',
  format: 'excalidraw',
  filename: null,
};

const VALID_PROVENANCE = {
  authority: 0.8,
  currency: 0.7,
  objectivity: 0.9,
  accuracy: 0.85,
  methodology: 0.6,
  coverage: 0.7,
  reliability: 0.8,
  provenance: 0.75,
};

// ── Mock factories ────────────────────────────────────────────────

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
    getDocumentProvenance: vi.fn().mockResolvedValue({ sourceQuality: null, trustScore: 0.5 }),
    updateProvenance: vi
      .fn()
      .mockResolvedValue({ ...DOC, sourceQuality: VALID_PROVENANCE, trustScore: 0.8 }),
    ...overrides,
  } as unknown as DocumentManager;
}

function makeMockBrain(): BrainManager {
  return {} as BrainManager;
}

function makeMockBrainStorage(overrides?: Partial<BrainStorage>): BrainStorage {
  return {
    getAverageGroundingScore: vi.fn().mockResolvedValue({
      averageScore: 0.75,
      totalMessages: 100,
      lowGroundingCount: 10,
    }),
    getCitationFeedback: vi
      .fn()
      .mockResolvedValue([
        { id: 'fb-1', citationIndex: 0, sourceId: 'src-1', relevant: true, createdAt: 1000 },
      ]),
    addCitationFeedback: vi.fn().mockResolvedValue({ id: 'fb-new' }),
    ...overrides,
  } as unknown as BrainStorage;
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

async function buildApp(
  docManager?: Partial<DocumentManager>,
  opts?: { brainStorage?: BrainStorage; broadcast?: (channel: string, payload: unknown) => void }
) {
  const app = Fastify({ logger: false });
  await app.register(fastifyMultipart);
  registerDocumentRoutes(app, {
    documentManager: makeMockDocManager(docManager),
    brainManager: makeMockBrain(),
    brainStorage: opts?.brainStorage,
    broadcast: opts?.broadcast,
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

    it('passes title field when provided', async () => {
      const ingestBuffer = vi.fn().mockResolvedValue(DOC);
      const app = await buildApp({ ingestBuffer });

      const { body, boundary } = buildMultipartBody('test.txt', 'content', {
        title: 'Custom Title',
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
        'test.txt',
        'txt',
        null,
        'private',
        'Custom Title'
      );
    });

    it('returns 500 when ingestBuffer throws', async () => {
      const ingestBuffer = vi.fn().mockRejectedValue(new Error('Parse error'));
      const app = await buildApp({ ingestBuffer });

      const { body, boundary } = buildMultipartBody('test.txt', 'data');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/upload',
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
        body,
      });

      expect(res.statusCode).toBe(500);
    });

    it('calls generateSourceGuide when doc is ready', async () => {
      const generateSourceGuide = vi.fn();
      const ingestBuffer = vi.fn().mockResolvedValue({ ...DOC, status: 'ready' });
      const app = await buildApp({ ingestBuffer, generateSourceGuide });

      const { body, boundary } = buildMultipartBody('test.txt', 'content');

      await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/upload',
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
        body,
      });

      expect(generateSourceGuide).toHaveBeenCalledWith(null);
    });

    it('does not call generateSourceGuide when doc is not ready', async () => {
      const generateSourceGuide = vi.fn();
      const ingestBuffer = vi.fn().mockResolvedValue({ ...DOC, status: 'processing' });
      const app = await buildApp({ ingestBuffer, generateSourceGuide });

      const { body, boundary } = buildMultipartBody('test.txt', 'content');

      await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/upload',
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
        body,
      });

      expect(generateSourceGuide).not.toHaveBeenCalled();
    });

    it('detects format from extension (html)', async () => {
      const ingestBuffer = vi.fn().mockResolvedValue(DOC);
      const app = await buildApp({ ingestBuffer });

      const { body, boundary } = buildMultipartBody('page.html', '<h1>Hi</h1>');

      await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/upload',
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
        body,
      });

      expect(ingestBuffer).toHaveBeenCalledWith(
        expect.any(Buffer),
        'page.html',
        'html',
        null,
        'private',
        undefined
      );
    });

    it('detects format from extension (pdf)', async () => {
      const ingestBuffer = vi.fn().mockResolvedValue(DOC);
      const app = await buildApp({ ingestBuffer });

      const { body, boundary } = buildMultipartBody('report.pdf', 'pdf-data');

      await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/upload',
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
        body,
      });

      expect(ingestBuffer).toHaveBeenCalledWith(
        expect.any(Buffer),
        'report.pdf',
        'pdf',
        null,
        'private',
        undefined
      );
    });

    it('falls back to txt for unknown extension', async () => {
      const ingestBuffer = vi.fn().mockResolvedValue(DOC);
      const app = await buildApp({ ingestBuffer });

      const { body, boundary } = buildMultipartBody('data.xyz', 'stuff');

      await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/upload',
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
        body,
      });

      expect(ingestBuffer).toHaveBeenCalledWith(
        expect.any(Buffer),
        'data.xyz',
        'txt',
        null,
        'private',
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

    it('passes visibility shared and depth', async () => {
      const ingestUrl = vi.fn().mockResolvedValue(URL_DOC);
      const app = await buildApp({ ingestUrl });

      await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/ingest-url',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: 'https://example.com',
          personalityId: 'p-1',
          visibility: 'shared',
          depth: 3,
        }),
      });

      expect(ingestUrl).toHaveBeenCalledWith('https://example.com', 'p-1', 'shared', 3);
    });

    it('defaults visibility to private and depth to 1', async () => {
      const ingestUrl = vi.fn().mockResolvedValue(URL_DOC);
      const app = await buildApp({ ingestUrl });

      await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/ingest-url',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com' }),
      });

      expect(ingestUrl).toHaveBeenCalledWith('https://example.com', null, 'private', 1);
    });

    it('calls generateSourceGuide when doc is ready', async () => {
      const generateSourceGuide = vi.fn();
      const ingestUrl = vi.fn().mockResolvedValue({ ...URL_DOC, status: 'ready' });
      const app = await buildApp({ ingestUrl, generateSourceGuide });

      await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/ingest-url',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com', personalityId: 'pid-1' }),
      });

      expect(generateSourceGuide).toHaveBeenCalledWith('pid-1');
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

    it('passes shared visibility', async () => {
      const ingestText = vi.fn().mockResolvedValue(DOC);
      const app = await buildApp({ ingestText });

      await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/ingest-text',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'Content',
          title: 'Title',
          personalityId: 'p-1',
          visibility: 'shared',
        }),
      });

      expect(ingestText).toHaveBeenCalledWith('Content', 'Title', 'p-1', 'shared');
    });

    it('defaults visibility to private', async () => {
      const ingestText = vi.fn().mockResolvedValue(DOC);
      const app = await buildApp({ ingestText });

      await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/ingest-text',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'Content', title: 'Title' }),
      });

      expect(ingestText).toHaveBeenCalledWith('Content', 'Title', null, 'private');
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

    it('returns 400 when repo is missing', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/connectors/github-wiki',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ owner: 'myorg' }),
      });
      expect(res.statusCode).toBe(400);
    });

    it('calls generateSourceGuide when any doc is ready', async () => {
      const generateSourceGuide = vi.fn();
      const ingestGithubWiki = vi.fn().mockResolvedValue([
        { ...DOC, status: 'ready' },
        { ...DOC, status: 'processing' },
      ]);
      const app = await buildApp({ ingestGithubWiki, generateSourceGuide });

      await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/connectors/github-wiki',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ owner: 'org', repo: 'repo', personalityId: 'p-1' }),
      });

      expect(generateSourceGuide).toHaveBeenCalledWith('p-1');
    });

    it('does not call generateSourceGuide when no docs are ready', async () => {
      const generateSourceGuide = vi.fn();
      const ingestGithubWiki = vi.fn().mockResolvedValue([{ ...DOC, status: 'processing' }]);
      const app = await buildApp({ ingestGithubWiki, generateSourceGuide });

      await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/connectors/github-wiki',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ owner: 'org', repo: 'repo' }),
      });

      expect(generateSourceGuide).not.toHaveBeenCalled();
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

    it('passes visibility filter', async () => {
      const listDocuments = vi.fn().mockResolvedValue([]);
      const app = await buildApp({ listDocuments });

      await app.inject({
        method: 'GET',
        url: '/api/v1/brain/documents?visibility=shared',
      });

      expect(listDocuments).toHaveBeenCalledWith({
        personalityId: undefined,
        visibility: 'shared',
      });
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

  // ── Phase 110: Provenance endpoints ─────────────────────────────

  describe('GET /api/v1/brain/documents/:id/provenance', () => {
    it('returns provenance for a document', async () => {
      const getDocumentProvenance = vi.fn().mockResolvedValue({
        sourceQuality: VALID_PROVENANCE,
        trustScore: 0.8,
      });
      const app = await buildApp({ getDocumentProvenance });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/brain/documents/doc-1/provenance',
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.trustScore).toBe(0.8);
      expect(data.sourceQuality.authority).toBe(0.8);
    });

    it('returns 404 when provenance is default and document not found', async () => {
      const getDocumentProvenance = vi.fn().mockResolvedValue({
        sourceQuality: null,
        trustScore: 0.5,
      });
      const getDocument = vi.fn().mockResolvedValue(null);
      const app = await buildApp({ getDocumentProvenance, getDocument });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/brain/documents/missing/provenance',
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns default provenance when document exists but has no provenance', async () => {
      const getDocumentProvenance = vi.fn().mockResolvedValue({
        sourceQuality: null,
        trustScore: 0.5,
      });
      const getDocument = vi.fn().mockResolvedValue(DOC);
      const app = await buildApp({ getDocumentProvenance, getDocument });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/brain/documents/doc-1/provenance',
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.sourceQuality).toBeNull();
      expect(data.trustScore).toBe(0.5);
    });
  });

  describe('PUT /api/v1/brain/documents/:id/provenance', () => {
    it('updates provenance and returns document', async () => {
      const updateProvenance = vi.fn().mockResolvedValue({
        ...DOC,
        sourceQuality: VALID_PROVENANCE,
        trustScore: 0.8,
      });
      const app = await buildApp({ updateProvenance });

      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/brain/documents/doc-1/provenance',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scores: VALID_PROVENANCE }),
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.document.trustScore).toBe(0.8);
      expect(updateProvenance).toHaveBeenCalledWith('doc-1', VALID_PROVENANCE);
    });

    it('returns 404 when document not found', async () => {
      const getDocument = vi.fn().mockResolvedValue(null);
      const app = await buildApp({ getDocument });

      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/brain/documents/missing/provenance',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scores: VALID_PROVENANCE }),
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 400 for invalid provenance scores', async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/brain/documents/doc-1/provenance',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scores: { authority: 2.0 } }), // out of range
      });

      expect(res.statusCode).toBe(400);
      const data = res.json();
      expect(data.message).toContain('Invalid provenance scores');
    });
  });

  // ── Phase 110: Grounding stats ────────────────────────────────

  describe('GET /api/v1/brain/grounding/stats', () => {
    it('returns defaults when no personalityId', async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/brain/grounding/stats',
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.averageScore).toBeNull();
      expect(data.totalMessages).toBe(0);
      expect(data.lowGroundingCount).toBe(0);
    });

    it('returns defaults when no brainStorage', async () => {
      const app = await buildApp(undefined, { brainStorage: undefined });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/brain/grounding/stats?personalityId=pid-1',
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.averageScore).toBeNull();
    });

    it('returns stats from brainStorage', async () => {
      const brainStorage = makeMockBrainStorage();
      const app = await buildApp(undefined, { brainStorage });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/brain/grounding/stats?personalityId=pid-1',
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.averageScore).toBe(0.75);
      expect(data.totalMessages).toBe(100);
      expect(data.lowGroundingCount).toBe(10);
    });

    it('passes windowDays as integer', async () => {
      const getAverageGroundingScore = vi.fn().mockResolvedValue({
        averageScore: 0.6,
        totalMessages: 50,
        lowGroundingCount: 5,
      });
      const brainStorage = makeMockBrainStorage({ getAverageGroundingScore });
      const app = await buildApp(undefined, { brainStorage });

      await app.inject({
        method: 'GET',
        url: '/api/v1/brain/grounding/stats?personalityId=pid-1&windowDays=7',
      });

      expect(getAverageGroundingScore).toHaveBeenCalledWith('pid-1', 7);
    });
  });

  // ── Phase 110: Citation endpoints ──────────────────────────────

  describe('GET /api/v1/brain/citations/:messageId', () => {
    it('returns citation feedback', async () => {
      const brainStorage = makeMockBrainStorage();
      const app = await buildApp(undefined, { brainStorage });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/brain/citations/msg-1',
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.messageId).toBe('msg-1');
      expect(data.feedback).toHaveLength(1);
      expect(data.feedback[0].sourceId).toBe('src-1');
    });

    it('returns 503 when brainStorage not available', async () => {
      const app = await buildApp(undefined, { brainStorage: undefined });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/brain/citations/msg-1',
      });

      expect(res.statusCode).toBe(503);
    });
  });

  describe('POST /api/v1/brain/citations/:messageId/feedback', () => {
    it('adds citation feedback and returns 201', async () => {
      const brainStorage = makeMockBrainStorage();
      const app = await buildApp(undefined, { brainStorage });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/citations/msg-1/feedback',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ citationIndex: 0, sourceId: 'src-1', relevant: true }),
      });

      expect(res.statusCode).toBe(201);
      const data = res.json();
      expect(data.id).toBe('fb-new');
    });

    it('returns 503 when brainStorage not available', async () => {
      const app = await buildApp(undefined, { brainStorage: undefined });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/citations/msg-1/feedback',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ citationIndex: 0, sourceId: 'src-1', relevant: true }),
      });

      expect(res.statusCode).toBe(503);
    });

    it('returns 400 when citationIndex is missing', async () => {
      const brainStorage = makeMockBrainStorage();
      const app = await buildApp(undefined, { brainStorage });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/citations/msg-1/feedback',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceId: 'src-1', relevant: true }),
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when sourceId is missing', async () => {
      const brainStorage = makeMockBrainStorage();
      const app = await buildApp(undefined, { brainStorage });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/citations/msg-1/feedback',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ citationIndex: 0, relevant: true }),
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when relevant is missing', async () => {
      const brainStorage = makeMockBrainStorage();
      const app = await buildApp(undefined, { brainStorage });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/citations/msg-1/feedback',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ citationIndex: 0, sourceId: 'src-1' }),
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

    it('calls broadcast when provided', async () => {
      const broadcast = vi.fn();
      const app = await buildApp(undefined, { brainStorage: undefined, broadcast });

      await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/ingest-excalidraw',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scene: { elements: [] },
          title: 'Diagram',
        }),
      });

      expect(broadcast).toHaveBeenCalledWith('excalidraw', {
        documentId: 'doc-excalidraw-1',
        scene: { elements: [] },
        source: 'api',
      });
    });

    it('returns 500 when ingestExcalidraw throws', async () => {
      const ingestExcalidraw = vi.fn().mockRejectedValue(new Error('Scene parse error'));
      const app = await buildApp({ ingestExcalidraw });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/ingest-excalidraw',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scene: { elements: [] },
          title: 'Broken',
        }),
      });

      expect(res.statusCode).toBe(500);
    });

    it('passes shared visibility', async () => {
      const ingestExcalidraw = vi.fn().mockResolvedValue(EXCALIDRAW_DOC);
      const app = await buildApp({ ingestExcalidraw });

      await app.inject({
        method: 'POST',
        url: '/api/v1/brain/documents/ingest-excalidraw',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scene: { elements: [] },
          title: 'Diagram',
          personalityId: 'p-1',
          visibility: 'shared',
        }),
      });

      expect(ingestExcalidraw).toHaveBeenCalledWith({ elements: [] }, 'Diagram', 'p-1', 'shared');
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
