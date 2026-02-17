/**
 * VectorMemoryManager — Orchestrates embedding provider + vector store
 * for semantic memory and knowledge search.
 */

import type { EmbeddingProvider } from '../../ai/embeddings/types.js';
import type { VectorStore, VectorResult } from './types.js';
import type { Memory, KnowledgeEntry } from '../types.js';

export interface VectorMemoryManagerDeps {
  embeddingProvider: EmbeddingProvider;
  vectorStore: VectorStore;
}

export class VectorMemoryManager {
  private readonly embedding: EmbeddingProvider;
  private readonly store: VectorStore;

  constructor(deps: VectorMemoryManagerDeps) {
    this.embedding = deps.embeddingProvider;
    this.store = deps.vectorStore;
  }

  async indexMemory(memory: Memory): Promise<void> {
    const [vector] = await this.embedding.embed([memory.content]);
    await this.store.insert(`memory:${memory.id}`, vector!, {
      type: 'memory',
      memoryType: memory.type,
      source: memory.source,
    });
  }

  async indexKnowledge(entry: KnowledgeEntry): Promise<void> {
    const text = `${entry.topic}: ${entry.content}`;
    const [vector] = await this.embedding.embed([text]);
    await this.store.insert(`knowledge:${entry.id}`, vector!, {
      type: 'knowledge',
      topic: entry.topic,
      source: entry.source,
    });
  }

  async searchMemories(query: string, limit: number, threshold?: number): Promise<VectorResult[]> {
    const [vector] = await this.embedding.embed([query]);
    const results = await this.store.search(vector!, limit * 2, threshold);

    return results
      .filter((r) => r.id.startsWith('memory:'))
      .slice(0, limit)
      .map((r) => ({
        ...r,
        id: r.id.replace('memory:', ''),
      }));
  }

  async searchKnowledge(query: string, limit: number, threshold?: number): Promise<VectorResult[]> {
    const [vector] = await this.embedding.embed([query]);
    const results = await this.store.search(vector!, limit * 2, threshold);

    return results
      .filter((r) => r.id.startsWith('knowledge:'))
      .slice(0, limit)
      .map((r) => ({
        ...r,
        id: r.id.replace('knowledge:', ''),
      }));
  }

  async removeMemory(id: string): Promise<void> {
    await this.store.delete(`memory:${id}`);
  }

  async removeKnowledge(id: string): Promise<void> {
    await this.store.delete(`knowledge:${id}`);
  }

  async reindexAll(memories: Memory[], knowledge: KnowledgeEntry[]): Promise<{ indexed: number }> {
    let indexed = 0;

    // Batch embed memories
    if (memories.length > 0) {
      const texts = memories.map((m) => m.content);
      const batchSize = 64;

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const vectors = await this.embedding.embed(batch);
        const items = vectors.map((vector, idx) => ({
          id: `memory:${memories[i + idx]!.id}`,
          vector,
          metadata: {
            type: 'memory',
            memoryType: memories[i + idx]!.type,
            source: memories[i + idx]!.source,
          },
        }));
        await this.store.insertBatch(items);
        indexed += items.length;
      }
    }

    // Batch embed knowledge
    if (knowledge.length > 0) {
      const texts = knowledge.map((k) => `${k.topic}: ${k.content}`);
      const batchSize = 64;

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const vectors = await this.embedding.embed(batch);
        const items = vectors.map((vector, idx) => ({
          id: `knowledge:${knowledge[i + idx]!.id}`,
          vector,
          metadata: {
            type: 'knowledge',
            topic: knowledge[i + idx]!.topic,
            source: knowledge[i + idx]!.source,
          },
        }));
        await this.store.insertBatch(items);
        indexed += items.length;
      }
    }

    return { indexed };
  }

  async close(): Promise<void> {
    await this.store.close();
  }
}
