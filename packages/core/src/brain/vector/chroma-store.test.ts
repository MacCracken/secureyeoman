/**
 * ChromaVectorStore tests
 *
 * All HTTP calls are intercepted via vi.stubGlobal('fetch') so no real
 * ChromaDB server is required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChromaVectorStore } from './chroma-store.js';

// ── Helpers ────────────────────────────────────────────────────────

const COLLECTION_ID = 'uuid-1234-abcd';
const BASE_URL = 'http://localhost:8000';
const COLLECTION_NAME = 'test_collection';

function makeStore() {
  return new ChromaVectorStore({
    url: BASE_URL,
    collection: COLLECTION_NAME,
    dimensions: 3,
  });
}

/** Build a minimal Response mock. */
function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/**
 * Returns a fetch mock that:
 *   - Answers POST /api/v1/collections (ensureCollection) with the collection UUID
 *   - Delegates all subsequent calls to `handler`
 */
function withCollectionSetup(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>
) {
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url.endsWith('/api/v1/collections') && (init?.method ?? 'GET') === 'POST') {
      return Promise.resolve(mockResponse({ id: COLLECTION_ID }));
    }
    return Promise.resolve(handler(url, init));
  });
}

// ── Setup / Teardown ───────────────────────────────────────────────

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── ensureCollection ───────────────────────────────────────────────

describe('ensureCollection', () => {
  it('calls POST /api/v1/collections with get_or_create=true and cosine metadata', async () => {
    mockFetch = withCollectionSetup(() => mockResponse(null));
    vi.stubGlobal('fetch', mockFetch);

    const store = makeStore();
    await store.count(); // triggers ensureCollection internally

    const collectionCall = mockFetch.mock.calls.find(
      ([url, init]: [string, RequestInit]) =>
        url.endsWith('/api/v1/collections') && init?.method === 'POST'
    );
    expect(collectionCall).toBeDefined();
    const body = JSON.parse(collectionCall![1].body as string);
    expect(body.name).toBe(COLLECTION_NAME);
    expect(body.get_or_create).toBe(true);
    expect(body.metadata['hnsw:space']).toBe('cosine');
  });

  it('reuses the cached collection ID on subsequent calls', async () => {
    mockFetch = withCollectionSetup(() => mockResponse(42));
    vi.stubGlobal('fetch', mockFetch);

    const store = makeStore();
    await store.count();
    await store.count();

    // ensureCollection (POST /api/v1/collections) should be called only once
    const setupCalls = mockFetch.mock.calls.filter(
      ([url, init]: [string, RequestInit]) =>
        url.endsWith('/api/v1/collections') && init?.method === 'POST'
    );
    expect(setupCalls).toHaveLength(1);
  });

  it('throws a descriptive error when the server returns a non-OK status', async () => {
    mockFetch.mockResolvedValue(mockResponse({ error: 'Internal Server Error' }, 500));

    const store = makeStore();
    // search() propagates ensureCollection errors (unlike count/delete which are fault-tolerant)
    await expect(store.search([1, 0, 0], 5)).rejects.toThrow(/ChromaDB.*get\/create collection.*500/);
  });
});

// ── insert / insertBatch ───────────────────────────────────────────

describe('insert / insertBatch', () => {
  it('sends a single vector via upsert', async () => {
    mockFetch = withCollectionSetup(() => mockResponse(null));
    vi.stubGlobal('fetch', mockFetch);

    const store = makeStore();
    await store.insert('id-1', [0.1, 0.2, 0.3], { type: 'memory' });

    const upsertCall = mockFetch.mock.calls.find(([url]: [string]) =>
      url.includes('/upsert')
    );
    expect(upsertCall).toBeDefined();
    const body = JSON.parse(upsertCall![1].body as string);
    expect(body.ids).toEqual(['id-1']);
    expect(body.embeddings).toEqual([[0.1, 0.2, 0.3]]);
    expect(body.metadatas).toEqual([{ type: 'memory' }]);
  });

  it('sends multiple vectors in a single upsert call', async () => {
    mockFetch = withCollectionSetup(() => mockResponse(null));
    vi.stubGlobal('fetch', mockFetch);

    const store = makeStore();
    await store.insertBatch([
      { id: 'a', vector: [1, 0, 0] },
      { id: 'b', vector: [0, 1, 0], metadata: { tag: 'x' } },
      { id: 'c', vector: [0, 0, 1] },
    ]);

    const upsertCall = mockFetch.mock.calls.find(([url]: [string]) =>
      url.includes('/upsert')
    );
    const body = JSON.parse(upsertCall![1].body as string);
    expect(body.ids).toEqual(['a', 'b', 'c']);
    expect(body.embeddings).toHaveLength(3);
    expect(body.metadatas[1]).toEqual({ tag: 'x' });
    expect(body.metadatas[0]).toEqual({});
  });

  it('does nothing when insertBatch is called with an empty array', async () => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const store = makeStore();
    await expect(store.insertBatch([])).resolves.toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('uses the collection UUID in the upsert URL', async () => {
    mockFetch = withCollectionSetup(() => mockResponse(null));
    vi.stubGlobal('fetch', mockFetch);

    const store = makeStore();
    await store.insert('id-1', [1, 0, 0]);

    const upsertCall = mockFetch.mock.calls.find(([url]: [string]) =>
      url.includes('/upsert')
    );
    expect(upsertCall![0]).toContain(COLLECTION_ID);
  });

  it('throws when the server returns an error on upsert', async () => {
    mockFetch = withCollectionSetup(() => mockResponse(null, 500));
    vi.stubGlobal('fetch', mockFetch);

    const store = makeStore();
    await expect(store.insert('id-1', [1, 0, 0])).rejects.toThrow(/ChromaDB upsert failed/);
  });
});

// ── search ─────────────────────────────────────────────────────────

describe('search', () => {
  it('converts ChromaDB distances to similarity scores (1 - distance)', async () => {
    mockFetch = withCollectionSetup((url: string) => {
      if (url.includes('/count')) return mockResponse(3);
      if (url.includes('/query')) {
        return mockResponse({
          ids: [['id-a', 'id-b']],
          distances: [[0.1, 0.4]],
          metadatas: [[{ type: 'memory' }, { type: 'knowledge' }]],
        });
      }
      return mockResponse(null);
    });
    vi.stubGlobal('fetch', mockFetch);

    const store = makeStore();
    const results = await store.search([1, 0, 0], 2);

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('id-a');
    expect(results[0].score).toBeCloseTo(0.9, 5);
    expect(results[1].id).toBe('id-b');
    expect(results[1].score).toBeCloseTo(0.6, 5);
  });

  it('filters results below the threshold', async () => {
    mockFetch = withCollectionSetup((url: string) => {
      if (url.includes('/count')) return mockResponse(2);
      if (url.includes('/query')) {
        return mockResponse({
          ids: [['id-a', 'id-b']],
          distances: [[0.05, 0.7]],  // similarities: 0.95, 0.30
          metadatas: [[{}, {}]],
        });
      }
      return mockResponse(null);
    });
    vi.stubGlobal('fetch', mockFetch);

    const store = makeStore();
    const results = await store.search([1, 0, 0], 10, 0.5);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('id-a');
  });

  it('returns an empty array without querying when the collection is empty', async () => {
    mockFetch = withCollectionSetup((url: string) => {
      if (url.includes('/count')) return mockResponse(0);
      return mockResponse(null);
    });
    vi.stubGlobal('fetch', mockFetch);

    const store = makeStore();
    const results = await store.search([1, 0, 0], 5);

    expect(results).toEqual([]);
    // query endpoint should never be called
    const queryCalls = mockFetch.mock.calls.filter(([url]: [string]) =>
      url.includes('/query')
    );
    expect(queryCalls).toHaveLength(0);
  });

  it('clamps n_results to the collection size', async () => {
    mockFetch = withCollectionSetup((url: string) => {
      if (url.includes('/count')) return mockResponse(2);
      if (url.includes('/query')) {
        return mockResponse({ ids: [['id-a', 'id-b']], distances: [[0.1, 0.2]], metadatas: [[{}, {}]] });
      }
      return mockResponse(null);
    });
    vi.stubGlobal('fetch', mockFetch);

    const store = makeStore();
    await store.search([1, 0, 0], 100); // ask for 100 but only 2 exist

    const queryCall = mockFetch.mock.calls.find(([url]: [string]) =>
      url.includes('/query')
    );
    const body = JSON.parse(queryCall![1].body as string);
    expect(body.n_results).toBe(2); // clamped to collection size
  });

  it('includes metadata in results', async () => {
    mockFetch = withCollectionSetup((url: string) => {
      if (url.includes('/count')) return mockResponse(1);
      if (url.includes('/query')) {
        return mockResponse({
          ids: [['id-1']],
          distances: [[0.0]],
          metadatas: [[{ type: 'memory', source: 'chat' }]],
        });
      }
      return mockResponse(null);
    });
    vi.stubGlobal('fetch', mockFetch);

    const store = makeStore();
    const results = await store.search([1, 0, 0], 1);
    expect(results[0].metadata).toEqual({ type: 'memory', source: 'chat' });
  });
});

// ── delete ─────────────────────────────────────────────────────────

describe('delete', () => {
  it('sends DELETE request with the correct id', async () => {
    mockFetch = withCollectionSetup(() => mockResponse(null));
    vi.stubGlobal('fetch', mockFetch);

    const store = makeStore();
    const result = await store.delete('target-id');

    expect(result).toBe(true);
    const deleteCall = mockFetch.mock.calls.find(([url]: [string]) =>
      url.includes('/delete')
    );
    expect(deleteCall).toBeDefined();
    const body = JSON.parse(deleteCall![1].body as string);
    expect(body.ids).toEqual(['target-id']);
  });

  it('returns false when the server returns an error', async () => {
    mockFetch = withCollectionSetup(() => mockResponse(null, 500));
    vi.stubGlobal('fetch', mockFetch);

    const store = makeStore();
    const result = await store.delete('any-id');
    expect(result).toBe(false);
  });

  it('returns false when fetch throws (server unreachable)', async () => {
    mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', mockFetch);

    const store = makeStore();
    const result = await store.delete('any-id');
    expect(result).toBe(false);
  });
});

// ── count ──────────────────────────────────────────────────────────

describe('count', () => {
  it('returns the count from the server', async () => {
    mockFetch = withCollectionSetup((url: string) => {
      if (url.includes('/count')) return mockResponse(42);
      return mockResponse(null);
    });
    vi.stubGlobal('fetch', mockFetch);

    const store = makeStore();
    expect(await store.count()).toBe(42);
  });

  it('returns 0 when the count endpoint fails', async () => {
    mockFetch = withCollectionSetup(() => mockResponse(null, 500));
    vi.stubGlobal('fetch', mockFetch);

    const store = makeStore();
    expect(await store.count()).toBe(0);
  });

  it('returns 0 when fetch throws', async () => {
    mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    const store = makeStore();
    expect(await store.count()).toBe(0);
  });
});

// ── healthCheck ────────────────────────────────────────────────────

describe('healthCheck', () => {
  it('returns true when the heartbeat endpoint responds OK', async () => {
    mockFetch.mockResolvedValue(mockResponse({ nanosecond_heartbeat: 12345 }));

    const store = makeStore();
    expect(await store.healthCheck()).toBe(true);

    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/v1/heartbeat`,
      expect.objectContaining({ headers: expect.any(Object) })
    );
  });

  it('returns false when the heartbeat endpoint returns a non-OK status', async () => {
    mockFetch.mockResolvedValue(mockResponse(null, 503));

    const store = makeStore();
    expect(await store.healthCheck()).toBe(false);
  });

  it('returns false when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const store = makeStore();
    expect(await store.healthCheck()).toBe(false);
  });
});

// ── close ──────────────────────────────────────────────────────────

describe('close', () => {
  it('clears the cached collection ID so next call re-fetches it', async () => {
    mockFetch = withCollectionSetup((url: string) => {
      if (url.includes('/count')) return mockResponse(1);
      return mockResponse(null);
    });
    vi.stubGlobal('fetch', mockFetch);

    const store = makeStore();
    await store.count(); // populates cache

    await store.close();

    await store.count(); // should re-fetch the collection

    const setupCalls = mockFetch.mock.calls.filter(
      ([url, init]: [string, RequestInit]) =>
        url.endsWith('/api/v1/collections') && init?.method === 'POST'
    );
    expect(setupCalls).toHaveLength(2); // once before close, once after
  });
});

// ── reconnect ──────────────────────────────────────────────────────

describe('reconnect on transient failure', () => {
  it('retries the operation once after clearing the cached collection ID', async () => {
    let callCount = 0;

    mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      // Always answer ensureCollection
      if (url.endsWith('/api/v1/collections') && init?.method === 'POST') {
        return Promise.resolve(mockResponse({ id: COLLECTION_ID }));
      }
      // Fail the first upsert, succeed the second
      if (url.includes('/upsert')) {
        callCount++;
        if (callCount === 1) return Promise.resolve(mockResponse(null, 503));
        return Promise.resolve(mockResponse(null, 200));
      }
      return Promise.resolve(mockResponse(null));
    });
    vi.stubGlobal('fetch', mockFetch);

    const store = makeStore();
    // Should not throw — withReconnect retries once
    await expect(store.insert('id-1', [1, 0, 0])).resolves.toBeUndefined();
    expect(callCount).toBe(2);
  });
});
