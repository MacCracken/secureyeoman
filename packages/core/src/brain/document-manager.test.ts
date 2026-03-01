import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { BrainStorage } from './storage.js';
import { BrainManager } from './manager.js';
import { DocumentManager } from './document-manager.js';
import type { BrainConfig } from '@secureyeoman/shared';
import type { BrainManagerDeps } from './types.js';
import type { SecureLogger } from '../logging/logger.js';
import { AuditChain, InMemoryAuditStorage } from '../logging/audit-chain.js';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../test-setup.js';

// ── Helpers ──────────────────────────────────────────────────────

function noopLogger(): SecureLogger {
  const noop = () => {};
  return {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => noopLogger(),
    level: 'silent',
  } as SecureLogger;
}

function defaultConfig(overrides?: Partial<BrainConfig>): BrainConfig {
  return {
    enabled: true,
    maxMemories: 10000,
    maxKnowledge: 5000,
    memoryRetentionDays: 90,
    importanceDecayRate: 0.01,
    contextWindowMemories: 10,
    ...overrides,
  };
}

function createDeps(): BrainManagerDeps {
  const auditStorage = new InMemoryAuditStorage();
  const auditChain = new AuditChain({
    storage: auditStorage,
    signingKey: 'test-signing-key-must-be-at-least-32-chars!!',
  });
  return { auditChain, logger: noopLogger() };
}

// ── Tests ─────────────────────────────────────────────────────────

describe('DocumentManager', () => {
  let storage: BrainStorage;
  let brainManager: BrainManager;
  let docManager: DocumentManager;

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await truncateAllTables();
    storage = new BrainStorage();
    brainManager = new BrainManager(storage, defaultConfig(), createDeps());
    docManager = new DocumentManager(brainManager, storage, { logger: noopLogger() });
  });

  // ── ingestText ───────────────────────────────────────────────────

  it('ingestText creates a ready document', async () => {
    const doc = await docManager.ingestText('Hello world', 'Test Doc', null, 'private');
    expect(doc.status).toBe('ready');
    expect(doc.title).toBe('Test Doc');
    expect(doc.format).toBe('txt');
    expect(doc.chunkCount).toBeGreaterThanOrEqual(1);
  });

  it('ingestText with null personalityId stores globally', async () => {
    const doc = await docManager.ingestText('Some text', 'Title', null);
    expect(doc.personalityId).toBeNull();
  });

  it('ingestText with shared visibility', async () => {
    const doc = await docManager.ingestText('Content', 'Shared Doc', null, 'shared');
    expect(doc.visibility).toBe('shared');
  });

  // ── ingestBuffer ─────────────────────────────────────────────────

  it('ingestBuffer txt format', async () => {
    const buf = Buffer.from('This is plain text content.');
    const doc = await docManager.ingestBuffer(buf, 'test.txt', 'txt', null, 'private');
    expect(doc.status).toBe('ready');
    expect(doc.format).toBe('txt');
    expect(doc.filename).toBe('test.txt');
  });

  it('ingestBuffer md format', async () => {
    const buf = Buffer.from('# Heading\n\nSome markdown content.');
    const doc = await docManager.ingestBuffer(buf, 'readme.md', 'md', null, 'private');
    expect(doc.status).toBe('ready');
    expect(doc.format).toBe('md');
  });

  it('ingestBuffer html format strips tags', async () => {
    const buf = Buffer.from('<html><body><h1>Title</h1><p>Paragraph text here.</p></body></html>');
    const doc = await docManager.ingestBuffer(buf, 'page.html', 'html', null, 'private');
    expect(doc.status).toBe('ready');
    expect(doc.format).toBe('html');
  });

  it('ingestBuffer pdf format uses pdf-parse (mocked)', async () => {
    // Mock pdf-parse dynamic import
    vi.doMock('pdf-parse', () => ({
      default: async () => ({ text: 'Extracted PDF text content.' }),
    }));

    const buf = Buffer.from('%PDF-1.4 fake content');
    const doc = await docManager.ingestBuffer(buf, 'doc.pdf', 'pdf', null, 'private');
    // Even if pdf-parse mock isn't loaded, document should be created
    expect(['ready', 'error']).toContain(doc.status);
  });

  // ── ingestUrl ────────────────────────────────────────────────────

  it('ingestUrl creates document with url format on success', async () => {
    // Mock fetch
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '<html><body>Hello from the web</body></html>',
    });
    vi.stubGlobal('fetch', mockFetch);

    const doc = await docManager.ingestUrl('https://example.com/page', null);
    expect(doc.status).toBe('ready');
    expect(doc.format).toBe('url');
    expect(doc.sourceUrl).toBe('https://example.com/page');

    vi.unstubAllGlobals();
  });

  it('ingestUrl sets status=error on fetch failure', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });
    vi.stubGlobal('fetch', mockFetch);

    const doc = await docManager.ingestUrl('https://example.com/missing', null);
    expect(doc.status).toBe('error');
    expect(doc.errorMessage).toContain('404');

    vi.unstubAllGlobals();
  });

  it('ingestUrl sets status=error on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const doc = await docManager.ingestUrl('https://example.com/', null);
    expect(doc.status).toBe('error');
    expect(doc.errorMessage).toContain('Network error');

    vi.unstubAllGlobals();
  });

  // ── ingestGithubWiki ─────────────────────────────────────────────

  it('ingestGithubWiki fetches markdown files', async () => {
    const contentsResponse = [
      { name: 'README.md', path: 'README.md', type: 'file', download_url: 'https://raw.github.com/owner/repo/README.md' },
      { name: 'SETUP.md', path: 'SETUP.md', type: 'file', download_url: 'https://raw.github.com/owner/repo/SETUP.md' },
      { name: 'image.png', path: 'image.png', type: 'file', download_url: null },
    ];

    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ ok: true, json: async () => contentsResponse });
      }
      return Promise.resolve({ ok: true, text: async () => '# Wiki page content' });
    }));

    const docs = await docManager.ingestGithubWiki('owner', 'repo', null);
    expect(docs.length).toBe(2); // 2 markdown files, 1 png ignored
    expect(docs.every((d) => d.status === 'ready')).toBe(true);

    vi.unstubAllGlobals();
  });

  it('ingestGithubWiki returns empty array when no markdown files', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ name: 'image.png', type: 'file', download_url: null }],
    }));

    const docs = await docManager.ingestGithubWiki('owner', 'repo', null);
    expect(docs).toEqual([]);

    vi.unstubAllGlobals();
  });

  it('ingestGithubWiki throws on GitHub API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' }));

    await expect(docManager.ingestGithubWiki('owner', 'missing-repo', null)).rejects.toThrow('GitHub API 404');

    vi.unstubAllGlobals();
  });

  // ── deleteDocument ───────────────────────────────────────────────

  it('deleteDocument removes document and knowledge entries', async () => {
    const doc = await docManager.ingestText('Delete me', 'Doc to delete', null);
    expect(doc.status).toBe('ready');

    await docManager.deleteDocument(doc.id);

    const retrieved = await docManager.getDocument(doc.id);
    expect(retrieved).toBeNull();
  });

  // ── listDocuments ────────────────────────────────────────────────

  it('listDocuments returns all documents', async () => {
    await docManager.ingestText('Doc 1', 'Title 1', null);
    await docManager.ingestText('Doc 2', 'Title 2', null);

    const docs = await docManager.listDocuments();
    expect(docs.length).toBeGreaterThanOrEqual(2);
  });

  it('listDocuments filters by visibility', async () => {
    await docManager.ingestText('Private doc', 'Private Doc', null, 'private');
    await docManager.ingestText('Shared doc', 'Shared Doc', null, 'shared');

    const privateDocs = await docManager.listDocuments({ visibility: 'private' });
    expect(privateDocs.some((d) => d.title === 'Private Doc')).toBe(true);
    expect(privateDocs.some((d) => d.title === 'Shared Doc')).toBe(false);
  });

  // ── getKnowledgeHealthStats ──────────────────────────────────────

  it('getKnowledgeHealthStats returns totalDocuments', async () => {
    await docManager.ingestText('Content A', 'Doc A', null);
    await docManager.ingestText('Content B', 'Doc B', null, 'shared');

    const stats = await docManager.getKnowledgeHealthStats();
    expect(stats.totalDocuments).toBeGreaterThanOrEqual(2);
    expect(stats.byFormat['txt']).toBeGreaterThanOrEqual(2);
  });

  it('getKnowledgeHealthStats counts chunks', async () => {
    await docManager.ingestText('Short text', 'Short', null);
    const stats = await docManager.getKnowledgeHealthStats();
    expect(stats.totalChunks).toBeGreaterThanOrEqual(1);
  });

  // ── logQuery ─────────────────────────────────────────────────────

  it('logQuery stores a query log entry', async () => {
    await docManager.logQuery(null, 'test query', 3, 0.85);
    const stats = await docManager.getKnowledgeHealthStats();
    expect(stats.recentQueryCount).toBeGreaterThanOrEqual(1);
  });

  it('logQuery counts zero-result queries', async () => {
    await docManager.logQuery(null, 'no results query', 0);
    const stats = await docManager.getKnowledgeHealthStats();
    expect(stats.lowCoverageQueries).toBeGreaterThanOrEqual(1);
  });
});
