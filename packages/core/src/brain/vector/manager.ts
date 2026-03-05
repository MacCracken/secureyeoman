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
      // Store personalityId so searches can filter to the correct scope.
      // null means global/unscoped (accessible to all personalities).
      personalityId: memory.personalityId ?? null,
    });
  }

  async indexKnowledge(entry: KnowledgeEntry): Promise<void> {
    const text = `${entry.topic}: ${entry.content}`;
    const [vector] = await this.embedding.embed([text]);
    await this.store.insert(`knowledge:${entry.id}`, vector!, {
      type: 'knowledge',
      topic: entry.topic,
      source: entry.source,
      personalityId: entry.personalityId ?? null,
    });
  }

  /**
   * Search memories by semantic similarity.
   * When personalityId is provided, only returns memories belonging to that
   * personality or global (null) memories. Pass undefined to search all (omnipresent).
   */
  async searchMemories(
    query: string,
    limit: number,
    threshold?: number,
    personalityId?: string | null
  ): Promise<VectorResult[]> {
    const [vector] = await this.embedding.embed([query]);
    const results = await this.store.search(vector!, limit * 2, threshold);

    return results
      .filter((r) => r.id.startsWith('memory:'))
      .filter((r) => {
        if (personalityId === undefined) return true; // omnipresent — see all
        const storedPid = r.metadata?.personalityId ?? null;
        return storedPid === null || storedPid === personalityId;
      })
      .slice(0, limit)
      .map((r) => ({
        ...r,
        id: r.id.replace('memory:', ''),
      }));
  }

  /**
   * Search knowledge by semantic similarity.
   * When personalityId is provided, only returns entries belonging to that
   * personality or global (null) entries. Pass undefined to search all (omnipresent).
   */
  async searchKnowledge(
    query: string,
    limit: number,
    threshold?: number,
    personalityId?: string | null
  ): Promise<VectorResult[]> {
    const [vector] = await this.embedding.embed([query]);
    const results = await this.store.search(vector!, limit * 2, threshold);

    return results
      .filter((r) => r.id.startsWith('knowledge:'))
      .filter((r) => {
        if (personalityId === undefined) return true; // omnipresent — see all
        const storedPid = r.metadata?.personalityId ?? null;
        return storedPid === null || storedPid === personalityId;
      })
      .slice(0, limit)
      .map((r) => ({
        ...r,
        id: r.id.replace('knowledge:', ''),
      }));
  }

  /**
   * Search memories using a pre-computed vector (for context-fused retrieval).
   */
  async searchMemoriesByVector(
    vector: number[],
    limit: number,
    threshold?: number,
    personalityId?: string | null
  ): Promise<VectorResult[]> {
    const results = await this.store.search(vector, limit * 2, threshold);

    return results
      .filter((r) => r.id.startsWith('memory:'))
      .filter((r) => {
        if (personalityId === undefined) return true;
        const storedPid = r.metadata?.personalityId ?? null;
        return storedPid === null || storedPid === personalityId;
      })
      .slice(0, limit)
      .map((r) => ({
        ...r,
        id: r.id.replace('memory:', ''),
      }));
  }

  /**
   * Search knowledge using a pre-computed vector (for context-fused retrieval).
   */
  async searchKnowledgeByVector(
    vector: number[],
    limit: number,
    threshold?: number,
    personalityId?: string | null
  ): Promise<VectorResult[]> {
    const results = await this.store.search(vector, limit * 2, threshold);

    return results
      .filter((r) => r.id.startsWith('knowledge:'))
      .filter((r) => {
        if (personalityId === undefined) return true;
        const storedPid = r.metadata?.personalityId ?? null;
        return storedPid === null || storedPid === personalityId;
      })
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

    // Adaptive backpressure: start with no delay, increase on 429, decrease on success.
    let delayMs = 0;
    const MIN_DELAY_MS = 0;
    const MAX_DELAY_MS = 10_000;
    const BACKOFF_FACTOR = 2;
    const INITIAL_BACKOFF_MS = 500;

    const embedWithBackpressure = async (batch: string[]): Promise<number[][]> => {
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      try {
        const vectors = await this.embedding.embed(batch);
        // Success — reduce delay (halve it)
        delayMs = Math.max(MIN_DELAY_MS, Math.floor(delayMs / 2));
        return vectors;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('429') || msg.toLowerCase().includes('rate limit')) {
          // Rate limited — back off
          delayMs = Math.min(MAX_DELAY_MS, Math.max(INITIAL_BACKOFF_MS, delayMs * BACKOFF_FACTOR));
          // Retry once after delay
          await new Promise((r) => setTimeout(r, delayMs));
          return this.embedding.embed(batch);
        }
        throw err;
      }
    };

    // Batch embed memories
    if (memories.length > 0) {
      const texts = memories.map((m) => m.content);
      const batchSize = 64;

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const vectors = await embedWithBackpressure(batch);
        const items = vectors.map((vector, idx) => ({
          id: `memory:${memories[i + idx]!.id}`,
          vector,
          metadata: {
            type: 'memory',
            memoryType: memories[i + idx]!.type,
            source: memories[i + idx]!.source,
            personalityId: memories[i + idx]!.personalityId ?? null,
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
        const vectors = await embedWithBackpressure(batch);
        const items = vectors.map((vector, idx) => ({
          id: `knowledge:${knowledge[i + idx]!.id}`,
          vector,
          metadata: {
            type: 'knowledge',
            topic: knowledge[i + idx]!.topic,
            source: knowledge[i + idx]!.source,
            personalityId: knowledge[i + idx]!.personalityId ?? null,
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
