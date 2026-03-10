/**
 * AGNOS Vector Store — delegates vector operations to the AGNOS runtime
 * for cross-project RAG (SecureYeoman knowledge accessible to other AGNOS agents).
 */

import type { VectorStore, VectorResult } from './types.js';
import type { AgnosClient } from '../../integrations/agnos/agnos-client.js';

export class AgnosVectorStore implements VectorStore {
  private readonly client: AgnosClient;
  private _count = 0;

  constructor(client: AgnosClient) {
    this.client = client;
  }

  async insert(id: string, vector: number[], metadata?: Record<string, unknown>): Promise<void> {
    await this.client.vectorInsert([{ id, vector, metadata }]);
    this._count++;
  }

  async insertBatch(
    items: { id: string; vector: number[]; metadata?: Record<string, unknown> }[]
  ): Promise<void> {
    if (items.length === 0) return;
    // Batch in chunks of 100 to avoid oversized payloads
    const chunkSize = 100;
    for (let i = 0; i < items.length; i += chunkSize) {
      await this.client.vectorInsert(items.slice(i, i + chunkSize));
    }
    this._count += items.length;
  }

  async search(vector: number[], limit: number, threshold?: number): Promise<VectorResult[]> {
    const results = await this.client.vectorSearch(vector, limit, threshold);
    return results.map((r) => ({
      id: r.id,
      score: r.score,
      metadata: r.metadata,
    }));
  }

  async delete(_id: string): Promise<boolean> {
    // AGNOS vector delete is not yet exposed — return false
    return false;
  }

  async count(): Promise<number> {
    return this._count;
  }

  async close(): Promise<void> {
    // No persistent connection to close
  }
}
