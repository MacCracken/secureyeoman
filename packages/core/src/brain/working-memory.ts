/**
 * Working Memory Buffer — Predictive Pre-Fetch (Phase 125-B)
 *
 * Implements Baddeley's working memory model: a capacity-limited buffer
 * that holds the active cognitive context. Tracks recent query embeddings
 * to predict what will be needed next and pre-fetches it.
 *
 * The trajectory centroid (weighted mean of recent embeddings, with recency
 * bias) serves as a predictor for the next likely query topic.
 */

import type { EmbeddingProvider } from '../ai/embeddings/types.js';
import type { VectorStore, VectorResult } from './vector/types.js';
import type { SecureLogger } from '../logging/logger.js';
import { computeCentroid } from './context-retrieval.js';

export interface WorkingMemoryConfig {
  /** Maximum items in the working memory buffer. Default 7 (Miller's 7+-2) */
  capacity: number;
  /** Number of items to pre-fetch on each prediction cycle. Default 5 */
  prefetchLimit: number;
  /** Minimum similarity threshold for pre-fetched items. Default 0.3 */
  prefetchThreshold: number;
  /** Recency weight decay factor (newer items weighted more). Default 0.8 */
  recencyDecay: number;
  /** Minimum queries before trajectory prediction kicks in. Default 2 */
  minQueriesForPrediction: number;
}

export const DEFAULT_WORKING_MEMORY_CONFIG: WorkingMemoryConfig = {
  capacity: 7,
  prefetchLimit: 5,
  prefetchThreshold: 0.3,
  recencyDecay: 0.8,
  minQueriesForPrediction: 2,
};

export interface WorkingMemoryItem {
  id: string;
  content: string;
  score: number;
  source: 'retrieval' | 'prefetch';
  addedAt: number;
}

/**
 * WorkingMemoryBuffer maintains a limited-capacity scratchpad of the most
 * relevant memory items for the current conversation, plus predictive
 * pre-fetching based on embedding trajectory analysis.
 */
export class WorkingMemoryBuffer {
  private readonly config: WorkingMemoryConfig;
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly vectorStore: VectorStore;
  private readonly logger?: SecureLogger;

  /** The buffer of active working memory items. */
  private buffer: WorkingMemoryItem[] = [];

  /** Rolling window of recent query embeddings for trajectory prediction. */
  private queryTrajectory: number[][] = [];

  /** Cache of pre-fetched items ready for immediate retrieval. */
  private prefetchCache = new Map<string, WorkingMemoryItem>();

  constructor(
    embeddingProvider: EmbeddingProvider,
    vectorStore: VectorStore,
    config?: Partial<WorkingMemoryConfig>,
    logger?: SecureLogger
  ) {
    this.embeddingProvider = embeddingProvider;
    this.vectorStore = vectorStore;
    this.config = { ...DEFAULT_WORKING_MEMORY_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Record a query and update the trajectory. Returns any pre-fetched items
   * that scored above prefetchThreshold (relevant cache hits).
   */
  async recordQuery(queryText: string): Promise<WorkingMemoryItem[]> {
    const [queryEmbedding] = await this.embeddingProvider.embed([queryText]);
    if (!queryEmbedding) return [];

    this.queryTrajectory.push(queryEmbedding);

    // Keep trajectory bounded
    const maxTrajectory = this.config.minQueriesForPrediction * 3;
    while (this.queryTrajectory.length > maxTrajectory) {
      this.queryTrajectory.shift();
    }

    // Return pre-fetched items that scored above threshold (already filtered at fetch time)
    // Drain the cache — items not consumed here expire
    // Snapshot entries before iterating to prevent concurrent Map mutation corruption
    const hits: WorkingMemoryItem[] = [];
    const entries = Array.from(this.prefetchCache.entries());
    this.prefetchCache.clear();
    for (const [, item] of entries) {
      if (item.score >= this.config.prefetchThreshold) {
        hits.push(item);
      }
    }

    return hits;
  }

  /**
   * Add retrieved items to the working memory buffer.
   * Evicts lowest-score items when capacity is exceeded.
   */
  addItems(items: { id: string; content: string; score: number }[]): void {
    const now = Date.now();

    for (const item of items) {
      // Skip duplicates
      if (this.buffer.some((b) => b.id === item.id)) continue;

      this.buffer.push({
        id: item.id,
        content: item.content,
        score: item.score,
        source: 'retrieval',
        addedAt: now,
      });
    }

    // Evict excess items (keep highest scoring)
    if (this.buffer.length > this.config.capacity) {
      this.buffer.sort((a, b) => b.score - a.score);
      this.buffer = this.buffer.slice(0, this.config.capacity);
    }
  }

  /**
   * Run predictive pre-fetch based on the embedding trajectory.
   * Computes a recency-weighted centroid of recent queries and fetches
   * likely-needed vectors from the store.
   */
  async predictAndPrefetch(): Promise<number> {
    if (this.queryTrajectory.length < this.config.minQueriesForPrediction) {
      return 0;
    }

    const predictedEmbedding = this.computeTrajectoryPrediction();
    if (!predictedEmbedding) return 0;

    try {
      const results = await this.vectorStore.search(
        predictedEmbedding,
        this.config.prefetchLimit,
        this.config.prefetchThreshold
      );

      // Only cache items not already in the buffer
      const bufferIds = new Set(this.buffer.map((b) => b.id));
      let cached = 0;

      const maxPrefetch = this.config.prefetchLimit * 2;
      for (const result of results) {
        const cleanId = result.id.replace(/^(memory|knowledge):/, '');
        if (bufferIds.has(cleanId) || this.prefetchCache.has(cleanId)) continue;
        if (this.prefetchCache.size >= maxPrefetch) break;

        this.prefetchCache.set(cleanId, {
          id: cleanId,
          content: '',
          score: result.score,
          source: 'prefetch',
          addedAt: Date.now(),
        });
        cached++;
      }

      this.logger?.debug({
        trajectorySize: this.queryTrajectory.length,
        fetched: results.length,
        cached,
      }, 'Predictive pre-fetch completed');

      return cached;
    } catch (err) {
      this.logger?.warn({ error: String(err) }, 'Predictive pre-fetch failed');
      return 0;
    }
  }

  /**
   * Compute a recency-weighted centroid for trajectory prediction.
   * More recent embeddings get higher weights via exponential decay.
   */
  private computeTrajectoryPrediction(): number[] | null {
    if (this.queryTrajectory.length === 0) return null;

    const dim = this.queryTrajectory[0]!.length;
    const weighted = new Array<number>(dim).fill(0);
    let totalWeight = 0;

    const n = this.queryTrajectory.length;
    for (let i = 0; i < n; i++) {
      // Weight increases with recency: decay^(n-1-i)
      const weight = Math.pow(this.config.recencyDecay, n - 1 - i);
      totalWeight += weight;

      const emb = this.queryTrajectory[i]!;
      for (let d = 0; d < dim; d++) {
        weighted[d]! += emb[d]! * weight;
      }
    }

    if (totalWeight === 0) return null;

    // Normalize by total weight
    for (let d = 0; d < dim; d++) {
      weighted[d] = weighted[d]! / totalWeight;
    }

    // L2 normalize
    let norm = 0;
    for (let d = 0; d < dim; d++) {
      norm += weighted[d]! * weighted[d]!;
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let d = 0; d < dim; d++) {
        weighted[d] = weighted[d]! / norm;
      }
    }

    return weighted;
  }

  /** Get all items currently in working memory. */
  getItems(): WorkingMemoryItem[] {
    return [...this.buffer];
  }

  /** Get IDs of items in working memory for boosting in retrieval. */
  getActiveIds(): string[] {
    return this.buffer.map((b) => b.id);
  }

  /** Check if an item is in working memory (instant access). */
  has(id: string): boolean {
    return this.buffer.some((b) => b.id === id);
  }

  /** Manually promote a pre-fetched item to the buffer. */
  promote(id: string): boolean {
    const item = this.prefetchCache.get(id);
    if (!item) return false;
    this.prefetchCache.delete(id);
    this.addItems([{ id: item.id, content: item.content, score: item.score }]);
    return true;
  }

  /** Clear the buffer and caches. */
  clear(): void {
    this.buffer = [];
    this.queryTrajectory = [];
    this.prefetchCache.clear();
  }

  /** Current buffer utilization. */
  get size(): number {
    return this.buffer.length;
  }

  get prefetchSize(): number {
    return this.prefetchCache.size;
  }

  get trajectorySize(): number {
    return this.queryTrajectory.length;
  }
}
