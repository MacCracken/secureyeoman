/**
 * Daimon Vector Store — delegates vector operations to the daimon REST API.
 *
 * Provides both raw vector ops (insert/search/delete) and RAG pipeline
 * (chunked text ingestion + retrieval-augmented context).
 */

import type { VectorStore, VectorResult } from './types.js';
import type { DaimonClient } from '../../integrations/daimon/daimon-client.js';

export class DaimonVectorStore implements VectorStore {
  private readonly client: DaimonClient;
  private _count = 0;

  constructor(client: DaimonClient) {
    this.client = client;
  }

  async insert(id: string, vector: number[], metadata?: Record<string, unknown>): Promise<void> {
    await this.client.vectorInsert([
      { id, embedding: vector, content: '', metadata: metadata ?? {} },
    ]);
    this._count++;
  }

  async insertBatch(
    items: { id: string; vector: number[]; metadata?: Record<string, unknown> }[]
  ): Promise<void> {
    if (items.length === 0) return;
    const chunkSize = 100;
    for (let i = 0; i < items.length; i += chunkSize) {
      const batch = items.slice(i, i + chunkSize).map((item) => ({
        id: item.id,
        embedding: item.vector,
        content: '',
        metadata: item.metadata ?? {},
      }));
      await this.client.vectorInsert(batch);
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

  async delete(id: string): Promise<boolean> {
    return this.client.vectorRemove(id);
  }

  async count(): Promise<number> {
    try {
      return await this.client.vectorCount();
    } catch {
      return this._count;
    }
  }

  async close(): Promise<void> {
    // No persistent connection to close
  }

  // ── RAG Methods ──────────────────────────────────────────────────────────

  async ingestText(
    text: string,
    metadata?: Record<string, unknown>
  ): Promise<{ ingested: boolean; chunks?: number }> {
    return this.client.ragIngest(text, metadata);
  }

  async queryRag(
    query: string,
    topK?: number
  ): Promise<{
    chunks: { text: string; score: number; metadata?: Record<string, unknown> }[];
    context: string;
  }> {
    const result = await this.client.ragQuery(query, topK);
    return {
      chunks: result.chunks.map((c) => ({
        text: c.content,
        score: c.score,
        metadata: c.metadata,
      })),
      context: result.formatted_context,
    };
  }
}
