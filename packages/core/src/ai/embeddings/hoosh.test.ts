import { describe, it, expect, vi, afterEach } from 'vitest';
import { HooshEmbeddingProvider } from './hoosh.js';

describe('HooshEmbeddingProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has name hoosh', () => {
    const provider = new HooshEmbeddingProvider();
    expect(provider.name).toBe('hoosh');
  });

  it('returns default dimensions for text-embedding-3-small', () => {
    const provider = new HooshEmbeddingProvider();
    expect(provider.dimensions()).toBe(1536);
  });

  it('returns configured dimensions', () => {
    const provider = new HooshEmbeddingProvider({ dimensions: 768 });
    expect(provider.dimensions()).toBe(768);
  });

  it('embeds texts via /v1/embeddings', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            { index: 0, embedding: [0.1, 0.2, 0.3] },
            { index: 1, embedding: [0.4, 0.5, 0.6] },
          ],
        }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const provider = new HooshEmbeddingProvider({ baseUrl: 'http://127.0.0.1:8088' });
    const result = await provider.embed(['hello', 'world']);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual([0.1, 0.2, 0.3]);
    expect(result[1]).toEqual([0.4, 0.5, 0.6]);

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:8088/v1/embeddings',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('preserves input order when response indices are out of order', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              { index: 1, embedding: [0.4, 0.5] },
              { index: 0, embedding: [0.1, 0.2] },
            ],
          }),
      })
    );

    const provider = new HooshEmbeddingProvider();
    const result = await provider.embed(['first', 'second']);
    expect(result[0]).toEqual([0.1, 0.2]);
    expect(result[1]).toEqual([0.4, 0.5]);
  });

  it('includes Authorization header when apiKey set', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ index: 0, embedding: [0.1] }] }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const provider = new HooshEmbeddingProvider({ apiKey: 'secret' });
    await provider.embed(['test']);

    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer secret');
  });

  it('throws on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const provider = new HooshEmbeddingProvider();
    await expect(provider.embed(['test'])).rejects.toThrow('HTTP 500');
  });
});
