/**
 * Embedding Provider Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EmbeddingProvider } from './types.js';
import { createEmbeddingProvider } from './index.js';

// Mock local embedding provider
vi.mock('./local.js', () => ({
  LocalEmbeddingProvider: class MockLocalProvider {
    readonly name = 'local';
    dimensions() { return 384; }
    async embed(texts: string[]) {
      return texts.map(() => Array(384).fill(0).map(() => Math.random()));
    }
  },
}));

// Mock API embedding provider
vi.mock('./api.js', () => ({
  ApiEmbeddingProvider: class MockApiProvider {
    readonly name: string;
    constructor(config: any) {
      this.name = `api-${config.provider ?? 'openai'}`;
    }
    dimensions() { return 1536; }
    async embed(texts: string[]) {
      return texts.map(() => Array(1536).fill(0).map(() => Math.random()));
    }
  },
}));

describe('createEmbeddingProvider', () => {
  it('creates local provider by default', () => {
    const config = {
      enabled: true,
      provider: 'local' as const,
      backend: 'faiss' as const,
      similarityThreshold: 0.7,
      maxResults: 10,
      local: { model: 'all-MiniLM-L6-v2' },
      api: { provider: 'openai' as const, model: 'text-embedding-3-small' },
      faiss: { persistDir: '/tmp/test-faiss' },
      qdrant: { url: 'http://localhost:6333', collection: 'test' },
    };

    const provider = createEmbeddingProvider(config);
    expect(provider.name).toBe('local');
    expect(provider.dimensions()).toBe(384);
  });

  it('creates API provider when configured', () => {
    const config = {
      enabled: true,
      provider: 'api' as const,
      backend: 'faiss' as const,
      similarityThreshold: 0.7,
      maxResults: 10,
      local: { model: 'all-MiniLM-L6-v2' },
      api: { provider: 'openai' as const, model: 'text-embedding-3-small' },
      faiss: { persistDir: '/tmp/test-faiss' },
      qdrant: { url: 'http://localhost:6333', collection: 'test' },
    };

    const provider = createEmbeddingProvider(config, 'test-key');
    expect(provider.name).toBe('api-openai');
  });

  it('throws when API provider lacks API key', () => {
    const config = {
      enabled: true,
      provider: 'api' as const,
      backend: 'faiss' as const,
      similarityThreshold: 0.7,
      maxResults: 10,
      local: { model: 'all-MiniLM-L6-v2' },
      api: { provider: 'openai' as const, model: 'text-embedding-3-small' },
      faiss: { persistDir: '/tmp/test-faiss' },
      qdrant: { url: 'http://localhost:6333', collection: 'test' },
    };

    expect(() => createEmbeddingProvider(config)).toThrow('API key required');
  });
});

describe('EmbeddingProvider interface', () => {
  let provider: EmbeddingProvider;

  beforeEach(() => {
    const config = {
      enabled: true,
      provider: 'local' as const,
      backend: 'faiss' as const,
      similarityThreshold: 0.7,
      maxResults: 10,
      local: { model: 'all-MiniLM-L6-v2' },
      api: { provider: 'openai' as const, model: 'text-embedding-3-small' },
      faiss: { persistDir: '/tmp/test-faiss' },
      qdrant: { url: 'http://localhost:6333', collection: 'test' },
    };
    provider = createEmbeddingProvider(config);
  });

  it('generates embeddings for texts', async () => {
    const result = await provider.embed(['hello world']);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(384);
  });

  it('generates embeddings for multiple texts', async () => {
    const result = await provider.embed(['hello', 'world', 'test']);
    expect(result).toHaveLength(3);
  });

  it('reports correct dimensions', () => {
    expect(provider.dimensions()).toBe(384);
  });
});
