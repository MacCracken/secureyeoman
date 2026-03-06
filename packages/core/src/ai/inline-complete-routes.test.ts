import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import {
  registerInlineCompleteRoutes,
  type InlineCompleteOptions,
} from './inline-complete-routes.js';

vi.mock('../logging/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
  }),
}));

describe('inline-complete-routes', () => {
  let app: ReturnType<typeof Fastify>;
  const mockComplete = vi.fn();
  const mockGetById = vi.fn();

  const opts: InlineCompleteOptions = {
    aiClient: { complete: mockComplete },
    personalityManager: { getById: mockGetById },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    registerInlineCompleteRoutes(app, opts);
    await app.ready();
  });

  it('returns 400 for missing prefix', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/inline-complete',
      payload: { suffix: 'world', language: 'typescript' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('prefix');
  });

  it('returns 400 for missing suffix', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/inline-complete',
      payload: { prefix: 'hello', language: 'typescript' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('suffix');
  });

  it('returns completion from AI client', async () => {
    mockComplete.mockResolvedValue('  return x + y;');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/inline-complete',
      payload: {
        prefix: 'function add(x, y) {\n',
        suffix: '\n}',
        language: 'javascript',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().completion).toBe('return x + y;');
    expect(mockComplete).toHaveBeenCalledWith(
      expect.stringContaining('function add'),
      expect.objectContaining({ maxTokens: 256, temperature: 0.2 })
    );
  });

  it('includes personality context when personalityId is provided', async () => {
    mockComplete.mockResolvedValue('completion');
    mockGetById.mockResolvedValue({ systemPrompt: 'You are a Python expert.' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/inline-complete',
      payload: {
        prefix: 'def hello',
        suffix: '',
        language: 'python',
        personalityId: 'p-123',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(mockGetById).toHaveBeenCalledWith('p-123');
    const prompt = mockComplete.mock.calls[0][0];
    expect(prompt).toContain('Python expert');
  });

  it('works without personality manager', async () => {
    const simpleApp = Fastify();
    registerInlineCompleteRoutes(simpleApp, {
      aiClient: { complete: mockComplete },
    });
    await simpleApp.ready();

    mockComplete.mockResolvedValue('ok');
    const res = await simpleApp.inject({
      method: 'POST',
      url: '/api/v1/ai/inline-complete',
      payload: {
        prefix: 'const x = ',
        suffix: ';',
        language: 'typescript',
        personalityId: 'p-123',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().completion).toBe('ok');
  });

  it('returns 500 when AI client throws', async () => {
    mockComplete.mockRejectedValue(new Error('API error'));

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/inline-complete',
      payload: {
        prefix: 'const x = ',
        suffix: ';',
        language: 'typescript',
      },
    });

    expect(res.statusCode).toBe(500);
  });

  it('trims long prefix/suffix to maxContextChars', async () => {
    mockComplete.mockResolvedValue('done');
    const longPrefix = 'a'.repeat(10000);
    const longSuffix = 'b'.repeat(10000);

    await app.inject({
      method: 'POST',
      url: '/api/v1/ai/inline-complete',
      payload: {
        prefix: longPrefix,
        suffix: longSuffix,
        language: 'typescript',
      },
    });

    const prompt = mockComplete.mock.calls[0][0];
    // Should not contain the full 10k characters
    expect(prompt.length).toBeLessThan(15000);
  });
});
