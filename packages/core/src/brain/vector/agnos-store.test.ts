import { describe, it, expect, vi } from 'vitest';
import { AgnosVectorStore } from './agnos-store.js';
import type { AgnosClient } from '../../integrations/agnos/agnos-client.js';

function makeClient(): AgnosClient {
  return {
    vectorInsert: vi.fn().mockResolvedValue(undefined),
    vectorSearch: vi.fn().mockResolvedValue([
      { id: 'v1', score: 0.95, metadata: { text: 'hello' } },
      { id: 'v2', score: 0.8 },
    ]),
  } as unknown as AgnosClient;
}

describe('AgnosVectorStore', () => {
  it('insert delegates to client', async () => {
    const client = makeClient();
    const store = new AgnosVectorStore(client);
    await store.insert('id1', [0.1, 0.2], { text: 'test' });
    expect(client.vectorInsert).toHaveBeenCalledWith([
      { id: 'id1', vector: [0.1, 0.2], metadata: { text: 'test' } },
    ]);
  });

  it('insertBatch chunks large batches', async () => {
    const client = makeClient();
    const store = new AgnosVectorStore(client);
    const items = Array.from({ length: 150 }, (_, i) => ({
      id: `id-${i}`,
      vector: [0.1],
      metadata: {},
    }));
    await store.insertBatch(items);
    expect(client.vectorInsert).toHaveBeenCalledTimes(2); // 100 + 50
  });

  it('search returns mapped results', async () => {
    const client = makeClient();
    const store = new AgnosVectorStore(client);
    const results = await store.search([0.1, 0.2], 5, 0.7);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('v1');
    expect(results[0].score).toBe(0.95);
    expect(results[0].metadata).toEqual({ text: 'hello' });
  });

  it('count tracks inserts', async () => {
    const client = makeClient();
    const store = new AgnosVectorStore(client);
    expect(await store.count()).toBe(0);
    await store.insert('id1', [0.1]);
    expect(await store.count()).toBe(1);
  });

  it('close is a no-op', async () => {
    const store = new AgnosVectorStore(makeClient());
    await expect(store.close()).resolves.toBeUndefined();
  });

  it('delete returns false (not yet supported)', async () => {
    const store = new AgnosVectorStore(makeClient());
    expect(await store.delete('id1')).toBe(false);
  });

  it('insertBatch with empty array is a no-op', async () => {
    const client = makeClient();
    const store = new AgnosVectorStore(client);
    await store.insertBatch([]);
    expect(client.vectorInsert).not.toHaveBeenCalled();
  });
});
