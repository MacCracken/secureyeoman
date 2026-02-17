/**
 * Qdrant Vector Store
 *
 * Uses @qdrant/js-client-rest for remote Qdrant vector search.
 * Auto-creates collection on first use.
 */

import type { VectorStore, VectorResult } from './types.js';

export interface QdrantStoreConfig {
  url: string;
  collection: string;
  dimensions: number;
}

export class QdrantVectorStore implements VectorStore {
  private client: any = null;
  private readonly url: string;
  private readonly collection: string;
  private readonly dimensions: number;
  private initialized = false;

  constructor(config: QdrantStoreConfig) {
    this.url = config.url;
    this.collection = config.collection;
    this.dimensions = config.dimensions;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    try {
      const qdrantModule = await import('@qdrant/js-client-rest');
      this.client = new qdrantModule.QdrantClient({ url: this.url });
    } catch {
      throw new Error(
        '@qdrant/js-client-rest not installed. Install with: npm install @qdrant/js-client-rest'
      );
    }

    // Auto-create collection if it doesn't exist
    try {
      await this.client.getCollection(this.collection);
    } catch {
      await this.client.createCollection(this.collection, {
        vectors: {
          size: this.dimensions,
          distance: 'Cosine',
        },
      });
    }

    this.initialized = true;
  }

  async insert(id: string, vector: number[], metadata?: Record<string, unknown>): Promise<void> {
    await this.ensureInitialized();

    await this.client.upsert(this.collection, {
      points: [
        {
          id,
          vector,
          payload: metadata ?? {},
        },
      ],
    });
  }

  async insertBatch(
    items: { id: string; vector: number[]; metadata?: Record<string, unknown> }[]
  ): Promise<void> {
    await this.ensureInitialized();

    await this.client.upsert(this.collection, {
      points: items.map((item) => ({
        id: item.id,
        vector: item.vector,
        payload: item.metadata ?? {},
      })),
    });
  }

  async search(vector: number[], limit: number, threshold?: number): Promise<VectorResult[]> {
    await this.ensureInitialized();

    const results = await this.client.search(this.collection, {
      vector,
      limit,
      score_threshold: threshold,
    });

    return results.map((r: any) => ({
      id: String(r.id),
      score: r.score,
      metadata: r.payload,
    }));
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureInitialized();

    try {
      await this.client.delete(this.collection, {
        points: [id],
      });
      return true;
    } catch {
      return false;
    }
  }

  async count(): Promise<number> {
    await this.ensureInitialized();

    const info = await this.client.getCollection(this.collection);
    return info.points_count ?? 0;
  }

  async close(): Promise<void> {
    this.client = null;
    this.initialized = false;
  }
}
