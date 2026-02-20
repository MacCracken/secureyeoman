import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiEmbeddingProvider } from './api.js';
import { BaseEmbeddingProvider } from './base.js';

// ── BaseEmbeddingProvider (via concrete subclass) ─────────────────────

class TestEmbeddingProvider extends BaseEmbeddingProvider {
  readonly name = 'test';
  dimensions() { return 128; }
  protected async doEmbed(texts: string[]): Promise<number[][]> {
    return texts.map(() => Array(128).fill(0.5));
  }
}

describe('BaseEmbeddingProvider', () => {
  it('has correct name and dimensions via subclass', () => {
    const provider = new TestEmbeddingProvider();
    expect(provider.name).toBe('test');
    expect(provider.dimensions()).toBe(128);
  });

  it('embed() calls doEmbed via retryManager', async () => {
    const provider = new TestEmbeddingProvider();
    const result = await provider.embed(['hello', 'world']);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(128);
  });

  it('embed() propagates doEmbed errors', async () => {
    class FailingProvider extends BaseEmbeddingProvider {
      readonly name = 'failing';
      dimensions() { return 128; }
      protected async doEmbed(): Promise<number[][]> {
        throw new Error('embed failed');
      }
    }
    const provider = new FailingProvider({ retryConfig: { maxRetries: 0 } });
    await expect(provider.embed(['text'])).rejects.toThrow('embed failed');
  });
});

// ── ApiEmbeddingProvider ─────────────────────────────────────────────

const OPENAI_RESPONSE = {
  data: [
    { embedding: Array(1536).fill(0.1), index: 0 },
    { embedding: Array(1536).fill(0.2), index: 1 },
  ],
};

const GEMINI_RESPONSE = {
  embeddings: [
    { values: Array(768).fill(0.1) },
    { values: Array(768).fill(0.2) },
  ],
};

function mockFetch(response: object, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
  });
}

describe('ApiEmbeddingProvider — OpenAI', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch(OPENAI_RESPONSE));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('has correct name for openai provider', () => {
    const provider = new ApiEmbeddingProvider({ apiKey: 'sk-test', provider: 'openai' });
    expect(provider.name).toBe('api-openai');
  });

  it('defaults to openai when provider not specified', () => {
    const provider = new ApiEmbeddingProvider({ apiKey: 'sk-test' });
    expect(provider.name).toBe('api-openai');
  });

  it('returns correct dimensions for text-embedding-3-small', () => {
    const provider = new ApiEmbeddingProvider({ apiKey: 'sk-test', model: 'text-embedding-3-small' });
    expect(provider.dimensions()).toBe(1536);
  });

  it('returns correct dimensions for text-embedding-3-large', () => {
    const provider = new ApiEmbeddingProvider({ apiKey: 'sk-test', model: 'text-embedding-3-large' });
    expect(provider.dimensions()).toBe(3072);
  });

  it('returns correct dimensions for text-embedding-ada-002', () => {
    const provider = new ApiEmbeddingProvider({ apiKey: 'sk-test', model: 'text-embedding-ada-002' });
    expect(provider.dimensions()).toBe(1536);
  });

  it('returns 1536 for unknown model', () => {
    const provider = new ApiEmbeddingProvider({ apiKey: 'sk-test', model: 'unknown-model' });
    expect(provider.dimensions()).toBe(1536);
  });

  it('embeds texts via OpenAI API', async () => {
    const provider = new ApiEmbeddingProvider({ apiKey: 'sk-test', provider: 'openai' });
    const result = await provider.embed(['hello', 'world']);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(1536);
  });

  it('sorts OpenAI results by index', async () => {
    const shuffled = {
      data: [
        { embedding: Array(1536).fill(0.9), index: 1 },
        { embedding: Array(1536).fill(0.1), index: 0 },
      ],
    };
    vi.stubGlobal('fetch', mockFetch(shuffled));
    const provider = new ApiEmbeddingProvider({ apiKey: 'sk-test' });
    const result = await provider.embed(['first', 'second']);
    expect(result[0]![0]).toBeCloseTo(0.1);
    expect(result[1]![0]).toBeCloseTo(0.9);
  });

  it('throws on non-ok OpenAI response', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'unauthorized' }, false, 401));
    const provider = new ApiEmbeddingProvider({ apiKey: 'bad-key', provider: 'openai', retryConfig: { maxRetries: 0 } });
    await expect(provider.embed(['text'])).rejects.toThrow('OpenAI embedding API error 401');
  });

  it('uses custom baseUrl when provided', async () => {
    const fetchMock = mockFetch(OPENAI_RESPONSE);
    vi.stubGlobal('fetch', fetchMock);
    const provider = new ApiEmbeddingProvider({ apiKey: 'sk-test', baseUrl: 'https://custom.api.com/v1' });
    await provider.embed(['text']);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://custom.api.com/v1/embeddings',
      expect.any(Object)
    );
  });
});

describe('ApiEmbeddingProvider — Gemini', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch(GEMINI_RESPONSE));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('has correct name for gemini provider', () => {
    const provider = new ApiEmbeddingProvider({ apiKey: 'gk-test', provider: 'gemini' });
    expect(provider.name).toBe('api-gemini');
  });

  it('returns 768 dimensions for gemini embedding model', () => {
    const provider = new ApiEmbeddingProvider({
      apiKey: 'gk-test',
      provider: 'gemini',
      model: 'models/text-embedding-004',
    });
    expect(provider.dimensions()).toBe(768);
  });

  it('embeds texts via Gemini API', async () => {
    const provider = new ApiEmbeddingProvider({ apiKey: 'gk-test', provider: 'gemini' });
    const result = await provider.embed(['hello', 'world']);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(768);
  });

  it('throws on non-ok Gemini response', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'quota exceeded' }, false, 429));
    const provider = new ApiEmbeddingProvider({ apiKey: 'gk-test', provider: 'gemini', retryConfig: { maxRetries: 0 } });
    await expect(provider.embed(['text'])).rejects.toThrow('Gemini embedding API error 429');
  });
});
