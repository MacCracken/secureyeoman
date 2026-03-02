import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaEmbeddingProvider } from './ollama.js';

// ─── Mock fetch ──────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function okResponse(embeddings: number[][]) {
  return Promise.resolve({
    ok: true,
    json: async () => ({ embeddings }),
    text: async () => '',
  });
}

function errorResponse(status: number, text: string) {
  return Promise.resolve({
    ok: false,
    status,
    json: async () => ({}),
    text: async () => text,
  });
}

describe('OllamaEmbeddingProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor + name', () => {
    it('uses default model and baseUrl', () => {
      const p = new OllamaEmbeddingProvider();
      expect(p.name).toBe('ollama-embed:nomic-embed-text');
    });

    it('uses custom model in name', () => {
      const p = new OllamaEmbeddingProvider({ model: 'mxbai-embed-large' });
      expect(p.name).toBe('ollama-embed:mxbai-embed-large');
    });
  });

  describe('dimensions()', () => {
    it('returns 768 for nomic-embed-text', () => {
      expect(new OllamaEmbeddingProvider({ model: 'nomic-embed-text' }).dimensions()).toBe(768);
    });

    it('returns 768 for nomic-embed-text:latest', () => {
      expect(new OllamaEmbeddingProvider({ model: 'nomic-embed-text:latest' }).dimensions()).toBe(
        768
      );
    });

    it('returns 1024 for mxbai-embed-large', () => {
      expect(new OllamaEmbeddingProvider({ model: 'mxbai-embed-large' }).dimensions()).toBe(1024);
    });

    it('returns 384 for all-minilm', () => {
      expect(new OllamaEmbeddingProvider({ model: 'all-minilm' }).dimensions()).toBe(384);
    });

    it('returns 1024 for snowflake-arctic-embed', () => {
      expect(new OllamaEmbeddingProvider({ model: 'snowflake-arctic-embed' }).dimensions()).toBe(
        1024
      );
    });

    it('returns 1024 for bge-m3', () => {
      expect(new OllamaEmbeddingProvider({ model: 'bge-m3' }).dimensions()).toBe(1024);
    });

    it('returns default 768 for unknown model', () => {
      expect(new OllamaEmbeddingProvider({ model: 'unknown-model' }).dimensions()).toBe(768);
    });
  });

  describe('embed() via doEmbed()', () => {
    it('returns embeddings from Ollama API', async () => {
      const embeddings = [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ];
      mockFetch.mockResolvedValueOnce(okResponse(embeddings));

      const provider = new OllamaEmbeddingProvider();
      const result = await provider.embed(['hello', 'world']);

      expect(result).toEqual(embeddings);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/embed',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('uses custom baseUrl', async () => {
      mockFetch.mockResolvedValueOnce(okResponse([[0.1]]));
      const provider = new OllamaEmbeddingProvider({ baseUrl: 'http://my-ollama:11434' });
      await provider.embed(['test']);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://my-ollama:11434/api/embed',
        expect.any(Object)
      );
    });

    it('sends model and texts in request body', async () => {
      mockFetch.mockResolvedValueOnce(okResponse([[0.1]]));
      const provider = new OllamaEmbeddingProvider({ model: 'all-minilm' });
      await provider.embed(['test text']);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.model).toBe('all-minilm');
      expect(body.input).toEqual(['test text']);
    });

    it('throws on non-ok HTTP response', async () => {
      // Use maxRetries:0 to avoid retry logic consuming extra mocks
      mockFetch.mockResolvedValueOnce(errorResponse(503, 'Service Unavailable'));
      const provider = new OllamaEmbeddingProvider({ retryConfig: { maxRetries: 0 } });
      await expect(provider.embed(['test'])).rejects.toThrow('Ollama embedding error 503');
    });

    it('throws when embeddings array is missing from response', async () => {
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({ ok: true, json: async () => ({ wrong: 'shape' }), text: async () => '' })
      );
      const provider = new OllamaEmbeddingProvider({ retryConfig: { maxRetries: 0 } });
      await expect(provider.embed(['test'])).rejects.toThrow('missing embeddings array');
    });

    it('calls API even for empty texts array', async () => {
      // BaseEmbeddingProvider has no short-circuit — it calls doEmbed() regardless
      mockFetch.mockResolvedValueOnce(okResponse([]));
      const provider = new OllamaEmbeddingProvider({ retryConfig: { maxRetries: 0 } });
      const result = await provider.embed([]);
      expect(result).toEqual([]);
      expect(mockFetch).toHaveBeenCalled();
    });
  });
});
