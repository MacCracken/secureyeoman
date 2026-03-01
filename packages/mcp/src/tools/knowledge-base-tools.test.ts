/**
 * Knowledge Base MCP Tools — unit tests
 *
 * Phase 82 — Knowledge Base & RAG Platform
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerKnowledgeBaseTools } from './knowledge-base-tools.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

// ─── Mock factories ───────────────────────────────────────────────────────────

function makeMockClient(overrides: Partial<CoreApiClient> = {}): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ results: [] }),
    post: vi.fn().mockResolvedValue({ document: { id: 'doc-1', status: 'processing' } }),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as CoreApiClient;
}

function noopMiddleware(): ToolMiddleware {
  return {
    rateLimiter: { check: () => ({ allowed: true }), reset: vi.fn(), wrap: vi.fn() },
    inputValidator: {
      validate: () => ({ valid: true, blocked: false, warnings: [], injectionScore: 0 }),
    },
    auditLogger: { log: vi.fn(), wrap: (_t: string, _a: unknown, fn: () => unknown) => fn() },
    secretRedactor: { redact: (v: unknown) => v },
  } as unknown as ToolMiddleware;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('knowledge-base-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers all 4 kb_* tools without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() =>
      registerKnowledgeBaseTools(server, makeMockClient(), noopMiddleware())
    ).not.toThrow();
  });

  describe('kb_search', () => {
    it('calls GET /api/v1/brain/search/similar', async () => {
      const client = makeMockClient({
        get: vi.fn().mockResolvedValue({ results: [{ id: 'k1', score: 0.9 }] }),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerKnowledgeBaseTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('kb_search');
      expect(handler).toBeDefined();

      const result = await handler!({ query: 'machine learning', topK: 5, minScore: 0.6 });
      expect(result.isError).toBeUndefined();
      expect(client.get).toHaveBeenCalledWith(
        '/api/v1/brain/search/similar',
        expect.objectContaining({ query: 'machine learning', type: 'knowledge', limit: '5' })
      );
    });

    it('includes personalityId when provided', async () => {
      const client = makeMockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerKnowledgeBaseTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('kb_search');
      await handler!({ query: 'test', personalityId: 'p-1', topK: 5, minScore: 0.6 });

      expect(client.get).toHaveBeenCalledWith(
        '/api/v1/brain/search/similar',
        expect.objectContaining({ personalityId: 'p-1' })
      );
    });
  });

  describe('kb_add_document', () => {
    it('calls ingest-url when content starts with https://', async () => {
      const client = makeMockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerKnowledgeBaseTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('kb_add_document');
      await handler!({ content: 'https://example.com/page', visibility: 'private' });

      expect(client.post).toHaveBeenCalledWith(
        '/api/v1/brain/documents/ingest-url',
        expect.objectContaining({ url: 'https://example.com/page' })
      );
    });

    it('calls ingest-text when content does not start with http', async () => {
      const client = makeMockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerKnowledgeBaseTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('kb_add_document');
      await handler!({ content: 'This is raw text', title: 'My Doc', visibility: 'shared' });

      expect(client.post).toHaveBeenCalledWith(
        '/api/v1/brain/documents/ingest-text',
        expect.objectContaining({ text: 'This is raw text', title: 'My Doc' })
      );
    });

    it('defaults title to Untitled when not provided for text', async () => {
      const client = makeMockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerKnowledgeBaseTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('kb_add_document');
      await handler!({ content: 'text without title', visibility: 'private' });

      expect(client.post).toHaveBeenCalledWith(
        '/api/v1/brain/documents/ingest-text',
        expect.objectContaining({ title: 'Untitled' })
      );
    });
  });

  describe('kb_list_documents', () => {
    it('calls GET /api/v1/brain/documents', async () => {
      const client = makeMockClient({
        get: vi.fn().mockResolvedValue({ documents: [], total: 0 }),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerKnowledgeBaseTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('kb_list_documents');
      await handler!({});

      expect(client.get).toHaveBeenCalledWith('/api/v1/brain/documents', {});
    });

    it('passes visibility filter', async () => {
      const client = makeMockClient({
        get: vi.fn().mockResolvedValue({ documents: [], total: 0 }),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerKnowledgeBaseTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('kb_list_documents');
      await handler!({ visibility: 'shared' });

      expect(client.get).toHaveBeenCalledWith(
        '/api/v1/brain/documents',
        expect.objectContaining({ visibility: 'shared' })
      );
    });
  });

  describe('kb_delete_document', () => {
    it('calls DELETE /api/v1/brain/documents/:id', async () => {
      const client = makeMockClient({ delete: vi.fn().mockResolvedValue(undefined) });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerKnowledgeBaseTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('kb_delete_document');
      const result = await handler!({ id: 'doc-abc' });

      expect(client.delete).toHaveBeenCalledWith('/api/v1/brain/documents/doc-abc');
      const text = (result.content[0] as { text: string }).text;
      expect(JSON.parse(text)).toMatchObject({ success: true, deleted: 'doc-abc' });
    });

    it('returns error result on client failure', async () => {
      const client = makeMockClient({
        delete: vi.fn().mockRejectedValue(new Error('Server error')),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerKnowledgeBaseTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('kb_delete_document');
      const result = await handler!({ id: 'doc-xyz' });

      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('Server error');
    });
  });
});
