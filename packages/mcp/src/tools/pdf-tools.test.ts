import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerPdfTools } from './pdf-tools.js';
import type { McpServiceConfig } from '@secureyeoman/shared';

// ─── Mocks ──────────────────────────────────────────────────────────────────

interface RegisteredTool {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
}

function createMockServer() {
  const tools: RegisteredTool[] = [];
  return {
    tool: vi.fn(
      (
        name: string,
        description: string,
        schema: Record<string, unknown>,
        handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>
      ) => {
        tools.push({ name, description, schema, handler });
      }
    ),
    _tools: tools,
  };
}

function createMockClient() {
  return {
    get: vi.fn().mockResolvedValue({ documents: [] }),
    post: vi.fn().mockResolvedValue({
      text: 'Hello World from PDF',
      pages: 2,
      info: { title: 'Test', author: 'Author' },
      wordCount: 4,
    }),
    put: vi.fn(),
    delete: vi.fn(),
  };
}

function createMockMiddleware() {
  return {
    rateLimiter: { check: vi.fn(() => ({ allowed: true })) },
    inputValidator: {
      validate: vi.fn(() => ({ valid: true, sanitized: {} })),
    },
    auditLogger: {
      log: vi.fn(),
      wrap: vi.fn((_name: string, _args: unknown, fn: () => Promise<unknown>) => fn()),
    },
    secretRedactor: { redact: vi.fn((result: unknown) => result) },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('registerPdfTools', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: ReturnType<typeof createMockClient>;
  let mockMiddleware: ReturnType<typeof createMockMiddleware>;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    mockMiddleware = createMockMiddleware();
  });

  function register(configOverrides?: Partial<McpServiceConfig>) {
    const config = { exposePdf: true, ...configOverrides } as McpServiceConfig;
    registerPdfTools(mockServer as never, mockClient as never, config, mockMiddleware as never);
  }

  it('registers exactly 6 tools', () => {
    register();
    expect(mockServer.tool).toHaveBeenCalledTimes(6);
  });

  it('registers pdf_extract_text', () => {
    register();
    const tool = mockServer._tools.find((t) => t.name === 'pdf_extract_text');
    expect(tool).toBeDefined();
    expect(tool!.description).toContain('Extract text');
  });

  it('registers pdf_upload', () => {
    register();
    const tool = mockServer._tools.find((t) => t.name === 'pdf_upload');
    expect(tool).toBeDefined();
    expect(tool!.description).toContain('Upload');
  });

  it('registers pdf_analyze', () => {
    register();
    const tool = mockServer._tools.find((t) => t.name === 'pdf_analyze');
    expect(tool).toBeDefined();
    expect(tool!.description).toContain('Analyze');
  });

  it('registers pdf_search', () => {
    register();
    const tool = mockServer._tools.find((t) => t.name === 'pdf_search');
    expect(tool).toBeDefined();
    expect(tool!.description).toContain('Search');
  });

  it('registers pdf_compare', () => {
    register();
    const tool = mockServer._tools.find((t) => t.name === 'pdf_compare');
    expect(tool).toBeDefined();
    expect(tool!.description).toContain('Compare');
  });

  it('registers pdf_list', () => {
    register();
    const tool = mockServer._tools.find((t) => t.name === 'pdf_list');
    expect(tool).toBeDefined();
    expect(tool!.description).toContain('List');
  });

  // ── Feature gate tests ──────────────────────────────────────────────────

  it('returns disabled error when exposePdf is false', async () => {
    register({ exposePdf: false });
    const tool = mockServer._tools.find((t) => t.name === 'pdf_extract_text')!;
    const result = await tool.handler({ pdfBase64: 'dGVzdA==' });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('disabled');
  });

  // ── Handler tests ───────────────────────────────────────────────────────

  it('pdf_extract_text calls core extract endpoint', async () => {
    register();
    const tool = mockServer._tools.find((t) => t.name === 'pdf_extract_text')!;
    const result = await tool.handler({ pdfBase64: 'dGVzdA==' });
    expect(mockClient.post).toHaveBeenCalledWith('/api/v1/brain/documents/extract', {
      pdfBase64: 'dGVzdA==',
      filename: undefined,
    });
    const data = JSON.parse(result.content[0]!.text);
    expect(data.text).toBe('Hello World from PDF');
    expect(data.pages).toBe(2);
  });

  it('pdf_analyze calls core analyze endpoint', async () => {
    mockClient.post.mockResolvedValueOnce({
      analysis: 'Summary of the document...',
      metadata: { pages: 2, wordCount: 100, processingTimeMs: 50, analysisType: 'summary' },
    });
    register();
    const tool = mockServer._tools.find((t) => t.name === 'pdf_analyze')!;
    const result = await tool.handler({ pdfBase64: 'dGVzdA==', analysisType: 'summary' });
    expect(mockClient.post).toHaveBeenCalledWith('/api/v1/brain/documents/analyze', {
      pdfBase64: 'dGVzdA==',
      analysisType: 'summary',
      customPrompt: undefined,
      maxLength: undefined,
    });
    expect(result.content).toHaveLength(1);
  });

  it('pdf_search finds matches in extracted text', async () => {
    mockClient.post.mockResolvedValueOnce({
      text: 'Hello World from PDF\fSecond page content',
      pages: 2,
    });
    register();
    const tool = mockServer._tools.find((t) => t.name === 'pdf_search')!;
    const result = await tool.handler({ pdfBase64: 'dGVzdA==', query: 'World' });
    const data = JSON.parse(result.content[0]!.text);
    expect(data.totalMatches).toBeGreaterThan(0);
    expect(data.matches[0].page).toBe(1);
    expect(data.matches[0].context).toContain('World');
  });

  it('pdf_search case-insensitive by default', async () => {
    mockClient.post.mockResolvedValueOnce({
      text: 'Hello WORLD test',
      pages: 1,
    });
    register();
    const tool = mockServer._tools.find((t) => t.name === 'pdf_search')!;
    const result = await tool.handler({ pdfBase64: 'dGVzdA==', query: 'world' });
    const data = JSON.parse(result.content[0]!.text);
    expect(data.totalMatches).toBe(1);
  });

  it('pdf_compare detects differences', async () => {
    mockClient.post
      .mockResolvedValueOnce({ text: 'line one\nline two\nline three', pages: 1 })
      .mockResolvedValueOnce({ text: 'line one\nline modified\nline three\nline four', pages: 1 });
    register();
    const tool = mockServer._tools.find((t) => t.name === 'pdf_compare')!;
    const result = await tool.handler({ pdfA_base64: 'YQ==', pdfB_base64: 'Yg==' });
    const data = JSON.parse(result.content[0]!.text);
    expect(data.additions).toBeGreaterThan(0);
    expect(data.deletions).toBeGreaterThan(0);
    expect(data.summary).toContain('additions');
  });

  it('pdf_list calls core documents endpoint with format=pdf', async () => {
    register();
    const tool = mockServer._tools.find((t) => t.name === 'pdf_list')!;
    await tool.handler({});
    expect(mockClient.get).toHaveBeenCalledWith('/api/v1/brain/documents', { format: 'pdf' });
  });
});
