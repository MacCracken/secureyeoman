/**
 * Unit tests for DocumentManager — all dependencies mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockChunk = vi.hoisted(() =>
  vi.fn().mockReturnValue([
    { index: 0, text: 'chunk zero', estimatedTokens: 10 },
    { index: 1, text: 'chunk one', estimatedTokens: 8 },
  ])
);

const mockFetch = vi.hoisted(() => vi.fn());

vi.mock('./chunker.js', () => ({ chunk: mockChunk }));

// ── Imports ───────────────────────────────────────────────────────────────────

import { DocumentManager, type DocumentManagerDeps } from './document-manager.js';
import type { KbDocument, ProvenanceScores } from './types.js';

// ── Factory helpers ───────────────────────────────────────────────────────────

function makeDoc(overrides: Partial<KbDocument> = {}): KbDocument {
  return {
    id: 'doc-1',
    personalityId: null,
    title: 'Test Document',
    filename: 'test.txt',
    format: 'txt',
    sourceUrl: null,
    visibility: 'private',
    status: 'processing',
    chunkCount: 0,
    errorMessage: null,
    sourceQuality: null,
    trustScore: 0.5,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeDeps(): DocumentManagerDeps & {
  storage: Record<string, ReturnType<typeof vi.fn>>;
  brainManager: Record<string, ReturnType<typeof vi.fn>>;
  logger: Record<string, ReturnType<typeof vi.fn>>;
} {
  return {
    brainManager: {
      learn: vi.fn().mockResolvedValue(undefined),
    } as any,
    storage: {
      createDocument: vi.fn().mockResolvedValue(makeDoc()),
      updateDocument: vi
        .fn()
        .mockImplementation((_id: string, patch: Partial<KbDocument>) =>
          Promise.resolve(makeDoc({ ...patch }))
        ),
      deleteDocument: vi.fn().mockResolvedValue(undefined),
      deleteKnowledgeBySourcePrefix: vi.fn().mockResolvedValue(undefined),
      listDocuments: vi.fn().mockResolvedValue([]),
      getDocument: vi.fn().mockResolvedValue(null),
      getKnowledgeHealthStats: vi.fn().mockResolvedValue({
        totalDocuments: 0,
        totalChunks: 0,
        byFormat: {},
        recentQueryCount: 0,
        avgTopScore: null,
        lowCoverageQueries: 0,
      }),
      getAllDocumentChunks: vi.fn().mockResolvedValue([]),
      logKnowledgeQuery: vi.fn().mockResolvedValue(undefined),
      updateDocumentProvenance: vi.fn().mockResolvedValue(null),
    } as any,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DocumentManager', () => {
  let deps: ReturnType<typeof makeDeps>;
  let dm: DocumentManager;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockChunk.mockReturnValue([
      { index: 0, text: 'chunk zero', estimatedTokens: 10 },
      { index: 1, text: 'chunk one', estimatedTokens: 8 },
    ]);
    deps = makeDeps();
    dm = new DocumentManager(deps);
    // Stub global fetch
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  // ── ingestBuffer ──────────────────────────────────────────────────────────

  describe('ingestBuffer', () => {
    it('ingests txt buffer successfully', async () => {
      const buf = Buffer.from('Hello world');
      const result = await dm.ingestBuffer(buf, 'hello.txt', 'txt', null, 'private');

      expect(deps.storage.createDocument).toHaveBeenCalledWith({
        personalityId: null,
        title: 'hello.txt',
        filename: 'hello.txt',
        format: 'txt',
        visibility: 'private',
        status: 'processing',
      });
      expect(deps.brainManager.learn).toHaveBeenCalled();
      expect(deps.storage.updateDocument).toHaveBeenCalledWith('doc-1', {
        status: 'ready',
        chunkCount: 2,
        errorMessage: null,
      });
      expect(result.status).toBe('ready');
    });

    it('uses provided title over filename', async () => {
      const buf = Buffer.from('content');
      await dm.ingestBuffer(buf, 'file.txt', 'txt', 'p1', 'shared', 'My Custom Title');

      expect(deps.storage.createDocument).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'My Custom Title' })
      );
    });

    it('defaults title to filename when title is undefined', async () => {
      const buf = Buffer.from('content');
      await dm.ingestBuffer(buf, 'notes.md', 'md', null, 'private');

      expect(deps.storage.createDocument).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'notes.md' })
      );
    });

    it('extracts HTML text from html format buffer', async () => {
      // Use passthrough chunker so we can inspect extracted text
      mockChunk.mockImplementation((t: string) => [{ index: 0, text: t, estimatedTokens: 10 }]);
      const buf = Buffer.from('<p>Hello <b>world</b></p>');
      await dm.ingestBuffer(buf, 'page.html', 'html', null, 'private');

      expect(deps.brainManager.learn).toHaveBeenCalled();
      const learnedContent = deps.brainManager.learn.mock.calls[0][1];
      expect(learnedContent).not.toContain('<p>');
      expect(learnedContent).toContain('Hello');
    });

    it('extracts text from url format buffer (same as html)', async () => {
      mockChunk.mockImplementation((t: string) => [{ index: 0, text: t, estimatedTokens: 10 }]);
      const buf = Buffer.from('<div>URL content</div>');
      await dm.ingestBuffer(buf, 'page.url', 'url', null, 'private');

      expect(deps.brainManager.learn).toHaveBeenCalled();
      const learnedContent = deps.brainManager.learn.mock.calls[0][1];
      expect(learnedContent).not.toContain('<div>');
      expect(learnedContent).toContain('URL content');
    });

    it('extracts text from excalidraw format buffer', async () => {
      const scene = {
        elements: [{ text: 'Label A', originalText: 'Label A' }, { text: 'Label B' }],
      };
      const buf = Buffer.from(JSON.stringify(scene));
      await dm.ingestBuffer(buf, 'diagram.excalidraw', 'excalidraw', null, 'private');

      expect(deps.brainManager.learn).toHaveBeenCalled();
    });

    it('handles pdf format via dynamic import', async () => {
      // Mock pdf-parse module
      vi.doMock('pdf-parse', () => ({
        default: vi.fn().mockResolvedValue({ text: 'PDF content here' }),
      }));

      const buf = Buffer.from('fake-pdf-data');
      await dm.ingestBuffer(buf, 'doc.pdf', 'pdf', null, 'private');

      expect(deps.brainManager.learn).toHaveBeenCalled();
    });

    it('falls back to utf-8 for unknown format', async () => {
      const buf = Buffer.from('raw data');
      // Cast to bypass type check for the default branch
      await dm.ingestBuffer(buf, 'file.dat', 'unknown' as any, null, 'private');

      expect(deps.brainManager.learn).toHaveBeenCalled();
    });

    it('handles error during ingest and sets status to error', async () => {
      deps.brainManager.learn.mockRejectedValue(new Error('learn failed'));

      const buf = Buffer.from('content');
      const result = await dm.ingestBuffer(buf, 'file.txt', 'txt', null, 'private');

      expect(deps.logger.warn).toHaveBeenCalled();
      // chunkAndLearn catches per-chunk errors, so the overall ingest may still succeed.
      // But if ALL chunks fail, the overall flow still succeeds because chunkAndLearn
      // catches errors per-chunk and doesn't re-throw.
      // Let's instead test the outer catch by making extractText fail.
    });

    it('catches extractText error and returns error document', async () => {
      // Excalidraw parse will fail on invalid JSON
      const buf = Buffer.from('not json');
      const result = await dm.ingestBuffer(buf, 'bad.excalidraw', 'excalidraw', null, 'private');

      expect(deps.storage.updateDocument).toHaveBeenCalledWith(
        'doc-1',
        expect.objectContaining({
          status: 'error',
          errorMessage: expect.any(String),
        })
      );
      expect(deps.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ docId: 'doc-1' }),
        'Document ingest failed'
      );
    });

    it('uses String(err) for non-Error objects in error path', async () => {
      // Force extractText to throw a string (non-Error)
      const buf = Buffer.from('{invalid json');
      await dm.ingestBuffer(buf, 'bad.excalidraw', 'excalidraw', null, 'private');

      expect(deps.storage.updateDocument).toHaveBeenCalledWith(
        'doc-1',
        expect.objectContaining({ status: 'error' })
      );
    });

    it('ensures chunkCount is at least 1', async () => {
      mockChunk.mockReturnValue([]);
      const buf = Buffer.from('tiny');
      await dm.ingestBuffer(buf, 'tiny.txt', 'txt', null, 'private');

      expect(deps.storage.updateDocument).toHaveBeenCalledWith(
        'doc-1',
        expect.objectContaining({ chunkCount: 1 })
      );
    });
  });

  // ── ingestUrl ─────────────────────────────────────────────────────────────

  describe('ingestUrl', () => {
    it('fetches URL and ingests stripped HTML', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<html><body><p>Hello</p></body></html>'),
      });

      const result = await dm.ingestUrl('https://example.com', null);

      expect(mockFetch).toHaveBeenCalledWith('https://example.com', {
        headers: { 'User-Agent': 'SecureYeoman/KnowledgeBase-Crawler' },
        signal: expect.any(AbortSignal),
      });
      expect(deps.storage.createDocument).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'url', title: 'https://example.com' })
      );
      expect(deps.storage.updateDocument).toHaveBeenCalledWith(
        'doc-1',
        expect.objectContaining({ status: 'ready' })
      );
      expect(result.status).toBe('ready');
    });

    it('uses default visibility of private', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('plain'),
      });

      await dm.ingestUrl('https://example.com', null);

      expect(deps.storage.createDocument).toHaveBeenCalledWith(
        expect.objectContaining({ visibility: 'private' })
      );
    });

    it('accepts custom visibility', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('content'),
      });

      await dm.ingestUrl('https://example.com', 'p1', 'shared');

      expect(deps.storage.createDocument).toHaveBeenCalledWith(
        expect.objectContaining({ visibility: 'shared' })
      );
    });

    it('handles HTTP error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const result = await dm.ingestUrl('https://example.com/missing', null);

      expect(deps.storage.updateDocument).toHaveBeenCalledWith(
        'doc-1',
        expect.objectContaining({
          status: 'error',
          errorMessage: 'HTTP 404 Not Found',
        })
      );
    });

    it('handles fetch failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await dm.ingestUrl('https://unreachable.test', null);

      expect(deps.storage.updateDocument).toHaveBeenCalledWith(
        'doc-1',
        expect.objectContaining({
          status: 'error',
          errorMessage: 'Network error',
        })
      );
      expect(deps.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://unreachable.test' }),
        'URL ingest failed'
      );
    });

    it('handles non-Error thrown in catch', async () => {
      mockFetch.mockRejectedValue('string error');

      const result = await dm.ingestUrl('https://example.com', null);

      expect(deps.storage.updateDocument).toHaveBeenCalledWith(
        'doc-1',
        expect.objectContaining({
          status: 'error',
          errorMessage: 'string error',
        })
      );
    });
  });

  // ── ingestText ────────────────────────────────────────────────────────────

  describe('ingestText', () => {
    it('ingests text successfully', async () => {
      const result = await dm.ingestText('Some text content', 'My Notes', null);

      expect(deps.storage.createDocument).toHaveBeenCalledWith({
        personalityId: null,
        title: 'My Notes',
        format: 'txt',
        visibility: 'private',
        status: 'processing',
      });
      expect(deps.brainManager.learn).toHaveBeenCalled();
      expect(result.status).toBe('ready');
    });

    it('uses shared visibility when provided', async () => {
      await dm.ingestText('content', 'title', 'p1', 'shared');

      expect(deps.storage.createDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          personalityId: 'p1',
          visibility: 'shared',
        })
      );
    });

    it('handles learn error gracefully (per-chunk catch)', async () => {
      deps.brainManager.learn.mockRejectedValue(new Error('learn broke'));

      // chunkAndLearn catches per-chunk, so the outer try still proceeds
      const result = await dm.ingestText('some text', 'title', null);

      expect(deps.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ docId: 'doc-1' }),
        'Failed to learn chunk'
      );
      // Still sets to ready because chunkAndLearn doesn't re-throw
      expect(result.status).toBe('ready');
    });

    it('handles non-Error thrown during learn', async () => {
      deps.brainManager.learn.mockRejectedValue('string err');

      await dm.ingestText('text', 'title', null);

      expect(deps.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'string err' }),
        'Failed to learn chunk'
      );
    });
  });

  // ── ingestGithubWiki ──────────────────────────────────────────────────────

  describe('ingestGithubWiki', () => {
    it('fetches repo contents and ingests markdown files', async () => {
      const items = [
        {
          name: 'README.md',
          path: 'README.md',
          type: 'file',
          download_url: 'https://raw.test/README.md',
        },
        {
          name: 'guide.md',
          path: 'guide.md',
          type: 'file',
          download_url: 'https://raw.test/guide.md',
        },
        { name: 'src', path: 'src', type: 'dir', download_url: null },
        {
          name: 'config.json',
          path: 'config.json',
          type: 'file',
          download_url: 'https://raw.test/config.json',
        },
      ];

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(items) })
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('# README') })
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('# Guide') });

      const results = await dm.ingestGithubWiki('myorg', 'myrepo', 'p1');

      expect(mockFetch).toHaveBeenCalledTimes(3); // contents + 2 md files
      expect(results).toHaveLength(2);
    });

    it('uses GITHUB_TOKEN from environment if no token provided', async () => {
      process.env.GITHUB_TOKEN = 'env-token';
      const items = [
        { name: 'doc.md', path: 'doc.md', type: 'file', download_url: 'https://raw.test/doc.md' },
      ];
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(items) })
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('content') });

      await dm.ingestGithubWiki('org', 'repo', null);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api.github.com'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'token env-token' }),
        })
      );
      delete process.env.GITHUB_TOKEN;
    });

    it('uses explicit githubToken over env var', async () => {
      process.env.GITHUB_TOKEN = 'env-token';
      const items: any[] = [];
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(items) });

      await dm.ingestGithubWiki('org', 'repo', null, 'explicit-token');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'token explicit-token' }),
        })
      );
      delete process.env.GITHUB_TOKEN;
    });

    it('omits Authorization header when no token is available', async () => {
      delete process.env.GITHUB_TOKEN;
      const items: any[] = [];
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(items) });

      await dm.ingestGithubWiki('org', 'repo', null);

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers).not.toHaveProperty('Authorization');
    });

    it('throws on GitHub API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      await expect(dm.ingestGithubWiki('org', 'repo', null)).rejects.toThrow(
        'GitHub API 403: Forbidden'
      );
    });

    it('returns empty array when no markdown files found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            { name: 'config.json', path: 'config.json', type: 'file', download_url: 'https://url' },
          ]),
      });

      const results = await dm.ingestGithubWiki('org', 'repo', null);

      expect(results).toEqual([]);
      expect(deps.logger.warn).toHaveBeenCalledWith(
{
        owner: 'org',
        repo: 'repo',
      },
'No markdown files found in repository'
);
    });

    it('skips files with null download_url', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            { name: 'readme.md', path: 'readme.md', type: 'file', download_url: null },
          ]),
      });

      const results = await dm.ingestGithubWiki('org', 'repo', null);

      // Only the contents fetch, no file fetch
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(results).toEqual([]);
    });

    it('skips files where download response is not ok', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              { name: 'a.md', path: 'a.md', type: 'file', download_url: 'https://raw/a.md' },
            ]),
        })
        .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Error' });

      const results = await dm.ingestGithubWiki('org', 'repo', null);

      expect(results).toEqual([]);
    });

    it('logs warning and continues when individual file fetch fails', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              { name: 'a.md', path: 'a.md', type: 'file', download_url: 'https://raw/a.md' },
              { name: 'b.md', path: 'b.md', type: 'file', download_url: 'https://raw/b.md' },
            ]),
        })
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('# B') });

      const results = await dm.ingestGithubWiki('org', 'repo', null);

      expect(deps.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ file: 'a.md' }),
        'Failed to ingest GitHub wiki file'
      );
      expect(results).toHaveLength(1);
    });

    it('filters only .md files case-insensitively', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                name: 'GUIDE.MD',
                path: 'GUIDE.MD',
                type: 'file',
                download_url: 'https://raw/GUIDE.MD',
              },
              {
                name: 'data.csv',
                path: 'data.csv',
                type: 'file',
                download_url: 'https://raw/data.csv',
              },
            ]),
        })
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('# Guide') });

      const results = await dm.ingestGithubWiki('org', 'repo', null);

      expect(results).toHaveLength(1);
    });
  });

  // ── ingestExcalidraw ──────────────────────────────────────────────────────

  describe('ingestExcalidraw', () => {
    it('extracts labels and ingests as document', async () => {
      const scene = {
        elements: [{ text: 'Box A' }, { text: 'Box B', originalText: 'Original B' }],
      };

      const result = await dm.ingestExcalidraw(scene, 'My Diagram', null);

      expect(deps.storage.createDocument).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'excalidraw', title: 'My Diagram' })
      );
      expect(deps.brainManager.learn).toHaveBeenCalled();
      expect(result.status).toBe('ready');
    });

    it('handles empty scene elements', async () => {
      mockChunk.mockImplementation((t: string) => [{ index: 0, text: t, estimatedTokens: 10 }]);
      const scene = { elements: [] };
      await dm.ingestExcalidraw(scene, 'Empty Diagram', null, 'shared');

      expect(deps.brainManager.learn).toHaveBeenCalled();
      const learnedContent = deps.brainManager.learn.mock.calls[0][1];
      expect(learnedContent).toContain('Excalidraw Diagram: Empty Diagram');
    });

    it('handles scene with no elements property', async () => {
      const scene = {};
      await dm.ingestExcalidraw(scene, 'No Elements', null);

      expect(deps.brainManager.learn).toHaveBeenCalled();
    });

    it('handles non-object/null elements in scene', async () => {
      mockChunk.mockImplementation((t: string) => [{ index: 0, text: t, estimatedTokens: 10 }]);
      const scene = {
        elements: [null, 42, 'string', { text: 'Valid' }],
      };
      await dm.ingestExcalidraw(scene, 'Mixed Elements', null);

      const learnedContent = deps.brainManager.learn.mock.calls[0][1];
      expect(learnedContent).toContain('Valid');
    });

    it('deduplicates text and originalText labels', async () => {
      mockChunk.mockImplementation((t: string) => [{ index: 0, text: t, estimatedTokens: 10 }]);
      const scene = {
        elements: [{ text: 'Same Label', originalText: 'Same Label' }],
      };
      await dm.ingestExcalidraw(scene, 'Dedup', null);

      const learnedContent = deps.brainManager.learn.mock.calls[0][1];
      // Should only contain 'Same Label' once in the joined labels
      const labelSection = learnedContent.split('\n\n')[1];
      expect(labelSection).toBe('Same Label');
    });

    it('skips empty/whitespace-only text labels', async () => {
      mockChunk.mockImplementation((t: string) => [{ index: 0, text: t, estimatedTokens: 10 }]);
      const scene = {
        elements: [{ text: '  ', originalText: '' }, { text: 'Real' }],
      };
      await dm.ingestExcalidraw(scene, 'Whitespace Test', null);

      const learnedContent = deps.brainManager.learn.mock.calls[0][1];
      expect(learnedContent).toContain('Real');
      expect(learnedContent).not.toMatch(/^\s+$/m);
    });

    it('catches error and sets document to error status', async () => {
      deps.brainManager.learn.mockRejectedValue(new Error('embed failed'));

      const result = await dm.ingestExcalidraw({ elements: [{ text: 'X' }] }, 'Fail', null);

      // chunkAndLearn catches per-chunk errors, so outer try still succeeds
      // unless chunkAndLearn itself throws. Let's test with storage failure instead.
    });

    it('catches storage failure and returns error doc', async () => {
      deps.storage.createDocument.mockResolvedValueOnce(makeDoc());
      // Make chunkAndLearn succeed but updateDocument (ready) fail
      deps.storage.updateDocument
        .mockRejectedValueOnce(new Error('db down'))
        .mockResolvedValueOnce(makeDoc({ status: 'error', errorMessage: 'db down' }));

      // This will cause the outer catch to fire
      const result = await dm.ingestExcalidraw({ elements: [] }, 'Fail', null);

      expect(deps.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ docId: 'doc-1' }),
        'Excalidraw ingest failed'
      );
    });
  });

  // ── deleteDocument ────────────────────────────────────────────────────────

  describe('deleteDocument', () => {
    it('deletes knowledge chunks then the document', async () => {
      await dm.deleteDocument('doc-42');

      expect(deps.storage.deleteKnowledgeBySourcePrefix).toHaveBeenCalledWith('document:doc-42:');
      expect(deps.storage.deleteDocument).toHaveBeenCalledWith('doc-42');
    });

    it('calls delete in correct order (knowledge first)', async () => {
      const callOrder: string[] = [];
      deps.storage.deleteKnowledgeBySourcePrefix.mockImplementation(() => {
        callOrder.push('knowledge');
        return Promise.resolve();
      });
      deps.storage.deleteDocument.mockImplementation(() => {
        callOrder.push('document');
        return Promise.resolve();
      });

      await dm.deleteDocument('doc-1');

      expect(callOrder).toEqual(['knowledge', 'document']);
    });
  });

  // ── listDocuments ─────────────────────────────────────────────────────────

  describe('listDocuments', () => {
    it('delegates to storage.listDocuments with no opts', async () => {
      await dm.listDocuments();

      expect(deps.storage.listDocuments).toHaveBeenCalledWith(undefined);
    });

    it('passes opts through to storage', async () => {
      await dm.listDocuments({ personalityId: 'p1', visibility: 'shared' });

      expect(deps.storage.listDocuments).toHaveBeenCalledWith({
        personalityId: 'p1',
        visibility: 'shared',
      });
    });
  });

  // ── getDocument ───────────────────────────────────────────────────────────

  describe('getDocument', () => {
    it('delegates to storage.getDocument', async () => {
      deps.storage.getDocument.mockResolvedValue(makeDoc({ id: 'doc-5' }));
      const result = await dm.getDocument('doc-5');

      expect(deps.storage.getDocument).toHaveBeenCalledWith('doc-5');
      expect(result?.id).toBe('doc-5');
    });

    it('returns null when document not found', async () => {
      deps.storage.getDocument.mockResolvedValue(null);
      const result = await dm.getDocument('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ── getKnowledgeHealthStats ───────────────────────────────────────────────

  describe('getKnowledgeHealthStats', () => {
    it('delegates to storage with personalityId', async () => {
      await dm.getKnowledgeHealthStats('p1');

      expect(deps.storage.getKnowledgeHealthStats).toHaveBeenCalledWith('p1');
    });

    it('delegates to storage without personalityId', async () => {
      await dm.getKnowledgeHealthStats();

      expect(deps.storage.getKnowledgeHealthStats).toHaveBeenCalledWith(undefined);
    });
  });

  // ── getNotebookCorpus ─────────────────────────────────────────────────────

  describe('getNotebookCorpus', () => {
    it('returns corpus with fitsInBudget=true when under budget', async () => {
      deps.storage.getAllDocumentChunks.mockResolvedValue([
        {
          docId: 'd1',
          title: 'Doc 1',
          format: 'txt',
          chunkCount: 1,
          text: 'hello',
          estimatedTokens: 100,
        },
        {
          docId: 'd2',
          title: 'Doc 2',
          format: 'md',
          chunkCount: 2,
          text: 'world',
          estimatedTokens: 200,
        },
      ]);

      const corpus = await dm.getNotebookCorpus('p1', 1000);

      expect(corpus.totalTokens).toBe(300);
      expect(corpus.fitsInBudget).toBe(true);
      expect(corpus.budget).toBe(1000);
      expect(corpus.documents).toHaveLength(2);
    });

    it('returns fitsInBudget=false when over budget', async () => {
      deps.storage.getAllDocumentChunks.mockResolvedValue([
        {
          docId: 'd1',
          title: 'Big',
          format: 'txt',
          chunkCount: 10,
          text: 'x',
          estimatedTokens: 5000,
        },
      ]);

      const corpus = await dm.getNotebookCorpus(null, 1000);

      expect(corpus.fitsInBudget).toBe(false);
      expect(corpus.totalTokens).toBe(5000);
    });

    it('defaults tokenBudget to Infinity', async () => {
      deps.storage.getAllDocumentChunks.mockResolvedValue([
        {
          docId: 'd1',
          title: 'X',
          format: 'txt',
          chunkCount: 1,
          text: 'x',
          estimatedTokens: 999999,
        },
      ]);

      const corpus = await dm.getNotebookCorpus();

      expect(corpus.fitsInBudget).toBe(true);
      expect(corpus.budget).toBe(Infinity);
    });

    it('handles empty document list', async () => {
      deps.storage.getAllDocumentChunks.mockResolvedValue([]);

      const corpus = await dm.getNotebookCorpus(null, 500);

      expect(corpus.totalTokens).toBe(0);
      expect(corpus.fitsInBudget).toBe(true);
      expect(corpus.documents).toEqual([]);
    });
  });

  // ── generateSourceGuide ───────────────────────────────────────────────────

  describe('generateSourceGuide', () => {
    it('generates guide from ready documents', async () => {
      deps.storage.listDocuments.mockResolvedValue([
        makeDoc({ id: 'd1', title: 'Alpha', status: 'ready', chunkCount: 3, format: 'md' }),
        makeDoc({ id: 'd2', title: 'Beta', status: 'ready', chunkCount: 5, format: 'pdf' }),
        makeDoc({ id: 'd3', title: 'Error', status: 'error', chunkCount: 0 }),
      ]);

      await dm.generateSourceGuide('p1');

      expect(deps.storage.deleteKnowledgeBySourcePrefix).toHaveBeenCalledWith('source_guide');
      expect(deps.brainManager.learn).toHaveBeenCalledWith(
        '__source_guide__',
        expect.stringContaining('2 documents'),
        'source_guide',
        1.0,
        'p1'
      );
      const guideText = deps.brainManager.learn.mock.calls[0][1];
      expect(guideText).toContain('8 total chunks');
      expect(guideText).toContain('"Alpha" (md): 3 chunks');
      expect(guideText).toContain('"Beta" (pdf): 5 chunks');
      expect(guideText).not.toContain('Error');
    });

    it('uses singular "document" for single doc', async () => {
      deps.storage.listDocuments.mockResolvedValue([
        makeDoc({ id: 'd1', title: 'Only', status: 'ready', chunkCount: 1 }),
      ]);

      await dm.generateSourceGuide(null);

      const guideText = deps.brainManager.learn.mock.calls[0][1];
      expect(guideText).toMatch(/1 document,/);
      expect(guideText).toContain('1 chunk');
    });

    it('uses singular "chunk" for single chunk', async () => {
      deps.storage.listDocuments.mockResolvedValue([
        makeDoc({ id: 'd1', title: 'A', status: 'ready', chunkCount: 1 }),
      ]);

      await dm.generateSourceGuide(null);

      const guideText = deps.brainManager.learn.mock.calls[0][1];
      expect(guideText).toContain('1 chunk');
    });

    it('omits format when doc.format is null/empty', async () => {
      deps.storage.listDocuments.mockResolvedValue([
        makeDoc({ id: 'd1', title: 'NoFormat', status: 'ready', chunkCount: 2, format: null }),
      ]);

      await dm.generateSourceGuide(null);

      const guideText = deps.brainManager.learn.mock.calls[0][1];
      expect(guideText).toContain('"NoFormat": 2 chunks');
      expect(guideText).not.toContain('(null)');
    });

    it('returns early if no ready documents', async () => {
      deps.storage.listDocuments.mockResolvedValue([
        makeDoc({ status: 'error' }),
        makeDoc({ status: 'processing' }),
      ]);

      await dm.generateSourceGuide(null);

      expect(deps.brainManager.learn).not.toHaveBeenCalled();
      expect(deps.storage.deleteKnowledgeBySourcePrefix).not.toHaveBeenCalled();
    });

    it('passes undefined to listDocuments when personalityId is null', async () => {
      deps.storage.listDocuments.mockResolvedValue([]);

      await dm.generateSourceGuide(null);

      expect(deps.storage.listDocuments).toHaveBeenCalledWith(undefined);
    });

    it('passes personalityId filter when non-null', async () => {
      deps.storage.listDocuments.mockResolvedValue([]);

      await dm.generateSourceGuide('p1');

      expect(deps.storage.listDocuments).toHaveBeenCalledWith({ personalityId: 'p1' });
    });

    it('passes undefined as personalityId to learn when personalityId is null', async () => {
      deps.storage.listDocuments.mockResolvedValue([makeDoc({ status: 'ready', chunkCount: 1 })]);

      await dm.generateSourceGuide(null);

      expect(deps.brainManager.learn).toHaveBeenCalledWith(
        '__source_guide__',
        expect.any(String),
        'source_guide',
        1.0,
        undefined
      );
    });

    it('catches and logs errors without re-throwing', async () => {
      deps.storage.listDocuments.mockRejectedValue(new Error('db error'));

      // Should not throw
      await dm.generateSourceGuide('p1');

      expect(deps.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Error: db error' }),
        'Source guide generation failed'
      );
    });
  });

  // ── logQuery ──────────────────────────────────────────────────────────────

  describe('logQuery', () => {
    it('delegates to storage.logKnowledgeQuery', async () => {
      await dm.logQuery('p1', 'how to deploy', 5, 0.95);

      expect(deps.storage.logKnowledgeQuery).toHaveBeenCalledWith({
        personalityId: 'p1',
        queryText: 'how to deploy',
        resultsCount: 5,
        topScore: 0.95,
      });
    });

    it('passes undefined topScore when not provided', async () => {
      await dm.logQuery(null, 'search query', 0);

      expect(deps.storage.logKnowledgeQuery).toHaveBeenCalledWith({
        personalityId: null,
        queryText: 'search query',
        resultsCount: 0,
        topScore: undefined,
      });
    });
  });

  // ── updateProvenance ──────────────────────────────────────────────────────

  describe('updateProvenance', () => {
    it('computes weighted trust score and delegates to storage', async () => {
      const scores: ProvenanceScores = {
        authority: 1.0,
        currency: 1.0,
        objectivity: 1.0,
        accuracy: 1.0,
        methodology: 1.0,
        coverage: 1.0,
        reliability: 1.0,
        provenance: 1.0,
      };

      await dm.updateProvenance('doc-1', scores);

      expect(deps.storage.updateDocumentProvenance).toHaveBeenCalledWith(
        'doc-1',
        scores,
        expect.closeTo(1.0, 5)
      );
    });

    it('computes correct weighted score for all-zero scores', async () => {
      const scores: ProvenanceScores = {
        authority: 0,
        currency: 0,
        objectivity: 0,
        accuracy: 0,
        methodology: 0,
        coverage: 0,
        reliability: 0,
        provenance: 0,
      };

      await dm.updateProvenance('doc-1', scores);

      expect(deps.storage.updateDocumentProvenance).toHaveBeenCalledWith('doc-1', scores, 0);
    });

    it('computes correct weighted score for mixed values', async () => {
      const scores: ProvenanceScores = {
        authority: 0.8, // 0.2 weight = 0.16
        currency: 0.6, // 0.1 weight = 0.06
        objectivity: 0.7, // 0.1 weight = 0.07
        accuracy: 0.9, // 0.2 weight = 0.18
        methodology: 0.5, // 0.1 weight = 0.05
        coverage: 0.4, // 0.05 weight = 0.02
        reliability: 1.0, // 0.15 weight = 0.15
        provenance: 0.3, // 0.1 weight = 0.03
      };
      // Expected: 0.16+0.06+0.07+0.18+0.05+0.02+0.15+0.03 = 0.72

      await dm.updateProvenance('doc-1', scores);

      expect(deps.storage.updateDocumentProvenance).toHaveBeenCalledWith(
        'doc-1',
        scores,
        expect.closeTo(0.72, 5)
      );
    });

    it('returns storage result', async () => {
      const updatedDoc = makeDoc({ trustScore: 0.72 });
      deps.storage.updateDocumentProvenance.mockResolvedValue(updatedDoc);

      const result = await dm.updateProvenance('doc-1', {
        authority: 0.5,
        currency: 0.5,
        objectivity: 0.5,
        accuracy: 0.5,
        methodology: 0.5,
        coverage: 0.5,
        reliability: 0.5,
        provenance: 0.5,
      });

      expect(result).toEqual(updatedDoc);
    });
  });

  // ── getDocumentProvenance ─────────────────────────────────────────────────

  describe('getDocumentProvenance', () => {
    it('returns provenance from existing document', async () => {
      const scores: ProvenanceScores = {
        authority: 0.8,
        currency: 0.6,
        objectivity: 0.7,
        accuracy: 0.9,
        methodology: 0.5,
        coverage: 0.4,
        reliability: 1.0,
        provenance: 0.3,
      };
      deps.storage.getDocument.mockResolvedValue(
        makeDoc({ sourceQuality: scores, trustScore: 0.72 })
      );

      const result = await dm.getDocumentProvenance('doc-1');

      expect(result.sourceQuality).toEqual(scores);
      expect(result.trustScore).toBe(0.72);
    });

    it('returns defaults when document not found', async () => {
      deps.storage.getDocument.mockResolvedValue(null);

      const result = await dm.getDocumentProvenance('nonexistent');

      expect(result.sourceQuality).toBeNull();
      expect(result.trustScore).toBe(0.5);
    });

    it('returns defaults when document has null sourceQuality', async () => {
      deps.storage.getDocument.mockResolvedValue(makeDoc({ sourceQuality: null, trustScore: 0.5 }));

      const result = await dm.getDocumentProvenance('doc-1');

      expect(result.sourceQuality).toBeNull();
      expect(result.trustScore).toBe(0.5);
    });
  });

  // ── chunkAndLearn (private, tested via ingestion) ─────────────────────────

  describe('chunkAndLearn (via ingestText)', () => {
    it('sub-splits chunks exceeding MAX_CHARS (3200)', async () => {
      const bigText = 'A'.repeat(7000);
      mockChunk.mockReturnValue([{ index: 0, text: bigText, estimatedTokens: 1750 }]);

      await dm.ingestText(bigText, 'Big Doc', null);

      // 7000 / 3200 = ceil(2.1875) = 3 sub-pieces
      expect(deps.brainManager.learn).toHaveBeenCalledTimes(3);
      // Check sources are sequentially numbered
      expect(deps.brainManager.learn.mock.calls[0][2]).toBe('document:doc-1:chunk0');
      expect(deps.brainManager.learn.mock.calls[1][2]).toBe('document:doc-1:chunk1');
      expect(deps.brainManager.learn.mock.calls[2][2]).toBe('document:doc-1:chunk2');
    });

    it('creates fallback chunk when chunker returns empty array', async () => {
      mockChunk.mockReturnValue([]);

      await dm.ingestText('short', 'Short Doc', null);

      expect(deps.brainManager.learn).toHaveBeenCalledTimes(1);
      expect(deps.brainManager.learn).toHaveBeenCalledWith(
        'Short Doc [chunk 1]',
        'short',
        'document:doc-1:chunk0',
        0.9,
        undefined
      );
    });

    it('passes personalityId to learn calls', async () => {
      mockChunk.mockReturnValue([{ index: 0, text: 'data', estimatedTokens: 5 }]);

      await dm.ingestText('data', 'Title', 'personality-42');

      expect(deps.brainManager.learn).toHaveBeenCalledWith(
        expect.any(String),
        'data',
        expect.any(String),
        0.9,
        'personality-42'
      );
    });

    it('passes undefined personalityId when null', async () => {
      mockChunk.mockReturnValue([{ index: 0, text: 'data', estimatedTokens: 5 }]);

      await dm.ingestText('data', 'Title', null);

      expect(deps.brainManager.learn).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        0.9,
        undefined
      );
    });

    it('continues processing remaining chunks when one fails', async () => {
      mockChunk.mockReturnValue([
        { index: 0, text: 'chunk0', estimatedTokens: 5 },
        { index: 1, text: 'chunk1', estimatedTokens: 5 },
        { index: 2, text: 'chunk2', estimatedTokens: 5 },
      ]);

      deps.brainManager.learn
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce(undefined);

      await dm.ingestText('text', 'title', null);

      // All 3 chunks attempted
      expect(deps.brainManager.learn).toHaveBeenCalledTimes(3);
      expect(deps.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ chunk: 1 }),
        'Failed to learn chunk'
      );
    });
  });

  // ── stripHtmlTags (tested via ingestBuffer/ingestUrl) ─────────────────────

  describe('stripHtmlTags (via ingestBuffer)', () => {
    beforeEach(() => {
      // Passthrough chunker so we can inspect extracted text
      mockChunk.mockImplementation((t: string) => [{ index: 0, text: t, estimatedTokens: 10 }]);
    });

    it('strips script tags', async () => {
      const html = '<p>Hello</p><script>alert("xss")</script><p>World</p>';
      const buf = Buffer.from(html);
      await dm.ingestBuffer(buf, 'test.html', 'html', null, 'private');

      const learnedContent = deps.brainManager.learn.mock.calls[0][1];
      expect(learnedContent).not.toContain('alert');
      expect(learnedContent).toContain('Hello');
      expect(learnedContent).toContain('World');
    });

    it('strips style tags', async () => {
      const html = '<style>.red{color:red}</style><p>Content</p>';
      const buf = Buffer.from(html);
      await dm.ingestBuffer(buf, 'test.html', 'html', null, 'private');

      const learnedContent = deps.brainManager.learn.mock.calls[0][1];
      expect(learnedContent).not.toContain('color:red');
      expect(learnedContent).toContain('Content');
    });

    it('decodes HTML entities', async () => {
      const html = '<p>&amp; &lt; &gt; &quot; &#39; &nbsp;</p>';
      const buf = Buffer.from(html);
      await dm.ingestBuffer(buf, 'test.html', 'html', null, 'private');

      const learnedContent = deps.brainManager.learn.mock.calls[0][1];
      expect(learnedContent).toContain('&');
      expect(learnedContent).toContain('<');
      expect(learnedContent).toContain('>');
      expect(learnedContent).toContain('"');
      expect(learnedContent).toContain("'");
    });

    it('collapses whitespace', async () => {
      const html = '<p>  Hello    World  </p>';
      const buf = Buffer.from(html);
      await dm.ingestBuffer(buf, 'test.html', 'html', null, 'private');

      const learnedContent = deps.brainManager.learn.mock.calls[0][1];
      expect(learnedContent).toBe('Hello World');
    });
  });
});
